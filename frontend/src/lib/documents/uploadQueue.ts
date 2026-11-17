import { create } from 'zustand';
import { offlineDb, type CachedDocumentRecord, type TesdaConnectOfflineDb } from '@/lib/db/dexie';
import { env } from '@/lib/env';
import { getSupabaseClient } from '@/lib/supabase';
import { computeBackoffDelayMs, generateStableId } from '@/lib/sync/syncEngine';
import { DocumentValidationError, prepareDocumentFile } from '@/lib/documents/prepareDocumentFile';

/*
 * Local-first learner document submission.
 *
 *   select file -> validate / compress -> save the binary to IndexedDB (UI is done here)
 *   -> queued -> uploaded in the background with progress -> server row created
 *   -> shown as "Submitted" only after the server confirms.
 *
 * The UI never waits for the network. Uploads are single-flight (also across tabs via
 * the Web Locks API), resumable after restarts, retried with backoff, cancellable, and
 * idempotent: each file has a fixed storage path and the database row is looked up by
 * that path before inserting, so a retried or interrupted upload never creates a
 * duplicate.
 */

const BUCKET = 'learner-documents';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Abort an upload that has made no progress for this long (stalled mobile data). */
const STALL_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// Progress (in-memory; resets on reload, the persisted state lives in Dexie)
// ---------------------------------------------------------------------------

interface UploadProgressState {
  progress: Record<string, { loaded: number; total: number }>;
  setProgress: (id: string, loaded: number, total: number) => void;
  clearProgress: (id: string) => void;
}

export const useUploadProgressStore = create<UploadProgressState>((set) => ({
  progress: {},
  setProgress: (id, loaded, total) => set((s) => ({ progress: { ...s.progress, [id]: { loaded, total } } })),
  clearProgress: (id) =>
    set((s) => {
      const next = { ...s.progress };
      delete next[id];
      return { progress: next };
    }),
}));

const activeControllers = new Map<string, AbortController>();

// ---------------------------------------------------------------------------
// Transport (network side), injectable for tests
// ---------------------------------------------------------------------------

export class UploadHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface DocumentUploadTransport {
  getAccessToken(): Promise<string | null>;
  uploadObject(params: {
    path: string;
    blob: Blob;
    mime: string;
    accessToken: string;
    signal: AbortSignal;
    onProgress: (loaded: number, total: number) => void;
  }): Promise<void>;
  findDocumentIdByPath(path: string): Promise<string | null>;
  insertDocument(row: {
    user_id: string;
    document_type: string;
    original_name: string;
    storage_path: string;
    mime_type: string;
    size_bytes: number;
  }): Promise<string>;
}

function xhrUpload(params: Parameters<DocumentUploadTransport['uploadObject']>[0]): Promise<void> {
  const base = (env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
  const encodedPath = params.path.split('/').map(encodeURIComponent).join('/');
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    const armStallTimer = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => xhr.abort(), STALL_TIMEOUT_MS);
    };
    const cleanup = () => {
      clearTimeout(stallTimer);
      params.signal.removeEventListener('abort', onAbort);
    };
    const onAbort = () => xhr.abort();

    xhr.open('POST', `${base}/storage/v1/object/${BUCKET}/${encodedPath}`);
    xhr.setRequestHeader('Authorization', `Bearer ${params.accessToken}`);
    xhr.setRequestHeader('apikey', env.VITE_SUPABASE_ANON_KEY ?? '');
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('cache-control', 'max-age=3600');
    xhr.setRequestHeader('Content-Type', params.mime);
    xhr.upload.onprogress = (e) => {
      armStallTimer();
      if (e.lengthComputable) params.onProgress(e.loaded, e.total);
    };
    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = xhr.responseText || `Upload failed (${xhr.status}).`;
      try {
        const body = JSON.parse(xhr.responseText) as { message?: string; error?: string; statusCode?: string };
        message = body.message ?? body.error ?? message;
        // Storage reports "already exists" as 400/409 with statusCode "409".
        if (body.statusCode === '409') return reject(new UploadHttpError(message, 409));
      } catch {
        // non-JSON body
      }
      reject(new UploadHttpError(message, xhr.status));
    };
    xhr.onerror = () => {
      cleanup();
      reject(new UploadHttpError('Network error while uploading.', 0));
    };
    xhr.onabort = () => {
      cleanup();
      reject(
        params.signal.aborted
          ? new UploadHttpError('Upload cancelled.', -1)
          : new UploadHttpError('Upload stalled: the connection stopped responding.', 0),
      );
    };
    params.signal.addEventListener('abort', onAbort, { once: true });
    armStallTimer();
    xhr.send(params.blob);
  });
}

export const supabaseDocumentTransport: DocumentUploadTransport = {
  async getAccessToken() {
    const client = getSupabaseClient();
    if (!client) return null;
    const { data } = await client.auth.getSession();
    return data.session?.access_token ?? null;
  },
  uploadObject: xhrUpload,
  async findDocumentIdByPath(path) {
    const client = getSupabaseClient();
    if (!client) throw new UploadHttpError('Supabase is not configured.', 0);
    const { data, error } = await client.from('learner_documents').select('id').eq('storage_path', path).limit(1);
    if (error) throw new UploadHttpError(error.message, 0);
    return (data as Array<{ id: string }> | null)?.[0]?.id ?? null;
  },
  async insertDocument(row) {
    const client = getSupabaseClient();
    if (!client) throw new UploadHttpError('Supabase is not configured.', 0);
    const { data, error } = await client
      .from('learner_documents')
      .insert(row)
      .select('id')
      .returns<Array<{ id: string }>>();
    if (error) throw new UploadHttpError(error.message, Number(error.code) || 400);
    const id = data?.[0]?.id;
    if (!id) throw new UploadHttpError('The server did not confirm the document record.', 500);
    return id;
  },
};

// ---------------------------------------------------------------------------
// Local save
// ---------------------------------------------------------------------------

export function buildDocumentStoragePath(institutionId: string, userId: string, localId: string, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  return `${institutionId}/${userId}/${localId}_${safeName}`;
}

export interface SaveDocumentParams {
  userId: string;
  institutionId: string | null;
  documentType: string;
  file: File;
}

/**
 * Saves the actual file in IndexedDB and queues it. Resolves as soon as the file is
 * stored on the device; it never waits for the network.
 */
export async function saveDocumentForUpload(
  params: SaveDocumentParams,
  db: TesdaConnectOfflineDb = offlineDb,
): Promise<CachedDocumentRecord> {
  const prepared = await prepareDocumentFile(params.file);

  if (prepared.hash) {
    const duplicate = await db.cachedDocuments
      .where('ownerUserId')
      .equals(params.userId)
      .filter(
        (d) =>
          d.documentType === params.documentType &&
          d.contentHash === prepared.hash &&
          d.uploadState !== 'failed' &&
          d.status !== 'rejected',
      )
      .first();
    if (duplicate) {
      throw new DocumentValidationError('This exact file has already been added for this requirement.');
    }
  }

  const id = generateStableId();
  const nowIso = new Date().toISOString();
  const institutionId = params.institutionId && UUID_PATTERN.test(params.institutionId) ? params.institutionId : 'global';
  const record: CachedDocumentRecord = {
    id,
    ownerUserId: params.userId,
    targetUserId: params.userId,
    institutionId,
    documentType: params.documentType,
    originalName: prepared.name,
    mimeType: prepared.mime,
    sizeBytes: prepared.blob.size,
    status: 'pending',
    remarks: null,
    storagePath: institutionId === 'global' ? null : buildDocumentStoragePath(institutionId, params.userId, id, prepared.name),
    blob: prepared.blob,
    queuedUpload: true,
    syncedAt: nowIso,
    uploadState: 'pending',
    uploadError: null,
    retryCount: 0,
    nextAttemptAt: nowIso,
    contentHash: prepared.hash,
    createdAt: nowIso,
  };
  await db.cachedDocuments.put(record);
  return record;
}

// ---------------------------------------------------------------------------
// Background upload
// ---------------------------------------------------------------------------

function isQueuedForUpload(doc: CachedDocumentRecord, nowIso: string, force: boolean): boolean {
  if (!doc.queuedUpload || !doc.blob) return false;
  const state = doc.uploadState ?? 'pending'; // records saved by older builds
  if (state === 'submitted' || state === 'saved_offline' || state === 'uploading') {
    // 'uploading' left behind by a closed tab is recovered below.
    return state === 'uploading' && !activeControllers.has(doc.id);
  }
  if (force) return true;
  return !doc.nextAttemptAt || doc.nextAttemptAt <= nowIso;
}

let runningQueue: Promise<number> | null = null;

/**
 * Uploads every queued document for the user. Single-flight within the tab and, where the
 * Web Locks API exists, across tabs. Returns how many documents the server confirmed.
 */
export function processDocumentUploadQueue(
  userId: string,
  options: {
    transport?: DocumentUploadTransport;
    db?: TesdaConnectOfflineDb;
    force?: boolean;
    fallbackInstitutionId?: string | null;
  } = {},
): Promise<number> {
  if (runningQueue) return runningQueue;
  const run = async (): Promise<number> => {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (locks?.request) {
      let confirmed = 0;
      await locks.request('tesda-document-upload-queue', async () => {
        confirmed = await runQueue(userId, options);
      });
      return confirmed;
    }
    return runQueue(userId, options);
  };
  runningQueue = run().finally(() => {
    runningQueue = null;
  });
  return runningQueue;
}

async function runQueue(
  userId: string,
  options: { transport?: DocumentUploadTransport; db?: TesdaConnectOfflineDb; force?: boolean; fallbackInstitutionId?: string | null },
): Promise<number> {
  const db = options.db ?? offlineDb;
  const transport = options.transport ?? supabaseDocumentTransport;
  const nowIso = new Date().toISOString();
  const queued = (await db.cachedDocuments.where('ownerUserId').equals(userId).toArray())
    .filter((d) => isQueuedForUpload(d, nowIso, options.force ?? false))
    .sort((a, b) => (a.createdAt ?? a.syncedAt).localeCompare(b.createdAt ?? b.syncedAt));
  if (queued.length === 0) return 0;

  const accessToken = await transport.getAccessToken().catch(() => null);
  if (!accessToken) {
    await Promise.all(
      queued.map((d) =>
        db.cachedDocuments.update(d.id, {
          uploadState: 'auth_required',
          uploadError: 'Sign in while online to send this document.',
        }),
      ),
    );
    return 0;
  }

  let confirmed = 0;
  for (const doc of queued) {
    if (await uploadOne(doc, accessToken, transport, db, options.fallbackInstitutionId ?? null)) confirmed += 1;
  }
  return confirmed;
}

async function uploadOne(
  doc: CachedDocumentRecord,
  accessToken: string,
  transport: DocumentUploadTransport,
  db: TesdaConnectOfflineDb,
  fallbackInstitutionId: string | null,
): Promise<boolean> {
  let storagePath = doc.storagePath;
  let institutionId = doc.institutionId;
  if (!storagePath) {
    if (!UUID_PATTERN.test(institutionId) && fallbackInstitutionId && UUID_PATTERN.test(fallbackInstitutionId)) {
      institutionId = fallbackInstitutionId;
    }
    if (!UUID_PATTERN.test(institutionId)) {
      await db.cachedDocuments.update(doc.id, {
        uploadState: 'failed',
        uploadError: 'Your account has no campus assigned yet. Contact the registrar.',
        nextAttemptAt: new Date(Date.now() + 3600_000).toISOString(),
      });
      return false;
    }
    storagePath = buildDocumentStoragePath(institutionId, doc.targetUserId, doc.id, doc.originalName);
    await db.cachedDocuments.update(doc.id, { storagePath, institutionId });
  }

  const controller = new AbortController();
  activeControllers.set(doc.id, controller);
  await db.cachedDocuments.update(doc.id, { uploadState: 'uploading', uploadError: null });
  const progress = useUploadProgressStore.getState();
  progress.setProgress(doc.id, 0, doc.sizeBytes);

  try {
    try {
      await transport.uploadObject({
        path: storagePath,
        blob: doc.blob!,
        mime: doc.mimeType,
        accessToken,
        signal: controller.signal,
        onProgress: (loaded, total) => progress.setProgress(doc.id, loaded, total),
      });
    } catch (err) {
      // Same fixed path already stored by an earlier, interrupted attempt: continue.
      if (!(err instanceof UploadHttpError && err.status === 409)) throw err;
    }

    const serverId =
      (await transport.findDocumentIdByPath(storagePath)) ??
      (await transport.insertDocument({
        user_id: doc.targetUserId,
        document_type: doc.documentType,
        original_name: doc.originalName,
        storage_path: storagePath,
        mime_type: doc.mimeType,
        size_bytes: doc.sizeBytes,
      }));

    const submittedAt = new Date().toISOString();
    await db.transaction('rw', db.cachedDocuments, async () => {
      const latest = await db.cachedDocuments.get(doc.id);
      await db.cachedDocuments.delete(doc.id);
      await db.cachedDocuments.put({
        ...(latest ?? doc),
        id: serverId,
        institutionId,
        storagePath,
        status: 'pending',
        queuedUpload: false,
        uploadState: 'submitted',
        uploadError: null,
        nextAttemptAt: null,
        syncedAt: submittedAt,
      });
    });
    return true;
  } catch (err) {
    const status = err instanceof UploadHttpError ? err.status : 0;
    const message = err instanceof Error ? err.message : 'Upload failed.';
    if (status === -1) {
      await db.cachedDocuments.update(doc.id, { uploadState: 'saved_offline', uploadError: null });
    } else if (status === 401) {
      await db.cachedDocuments.update(doc.id, {
        uploadState: 'auth_required',
        uploadError: 'Your session expired. Sign in while online to send this document.',
      });
    } else {
      const retryCount = (doc.retryCount ?? 0) + 1;
      const permanent = status === 403 || status === 413 || status === 415;
      await db.cachedDocuments.update(doc.id, {
        uploadState: 'failed',
        uploadError: message,
        retryCount,
        nextAttemptAt: new Date(Date.now() + (permanent ? 3600_000 : computeBackoffDelayMs(retryCount))).toISOString(),
      });
    }
    return false;
  } finally {
    activeControllers.delete(doc.id);
    useUploadProgressStore.getState().clearProgress(doc.id);
  }
}

// ---------------------------------------------------------------------------
// User actions
// ---------------------------------------------------------------------------

/** Stops an upload in progress; the file stays on the device as "Saved offline". */
export async function cancelDocumentUpload(docId: string, db: TesdaConnectOfflineDb = offlineDb): Promise<void> {
  const controller = activeControllers.get(docId);
  if (controller) {
    controller.abort();
    return;
  }
  await db.cachedDocuments.update(docId, { uploadState: 'saved_offline', uploadError: null });
}

/** Re-queues a cancelled, failed or sign-in-blocked document for an immediate attempt. */
export async function requeueDocumentUpload(docId: string, db: TesdaConnectOfflineDb = offlineDb): Promise<void> {
  await db.cachedDocuments.update(docId, {
    uploadState: 'pending',
    uploadError: null,
    nextAttemptAt: new Date().toISOString(),
  });
}

/** Deletes a document that has not been submitted yet. Submitted documents are never deleted here. */
export async function removeUnsubmittedDocument(docId: string, db: TesdaConnectOfflineDb = offlineDb): Promise<boolean> {
  const doc = await db.cachedDocuments.get(docId);
  if (!doc || !doc.queuedUpload || doc.uploadState === 'submitted') return false;
  activeControllers.get(docId)?.abort();
  await db.cachedDocuments.delete(docId);
  return true;
}
