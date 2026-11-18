import {
  offlineDb,
  type QueuedUploadKind,
  type QueuedUploadRecord,
  type TesdaConnectOfflineDb,
} from '@/lib/db/dexie';
import { prepareDocumentFile, DocumentValidationError } from '@/lib/documents/prepareDocumentFile';
import { UploadHttpError, useUploadProgressStore, xhrUpload } from '@/lib/documents/uploadQueue';
import { getSupabaseClient } from '@/lib/supabase';
import { computeBackoffDelayMs, generateStableId } from '@/lib/sync/syncEngine';

/*
 * Local-first queue for staff file uploads (operational documents, announcement attachments,
 * documents a registrar adds for a learner). Same guarantees as the learner queue: the file
 * is stored on the device first, uploaded in the background with progress, retried with
 * backoff, and the database row is inserted only after the file is in Storage. A lookup on
 * the storage path makes retries idempotent.
 */

export interface StaffUploadTransport {
  getAccessToken(): Promise<string | null>;
  uploadObject(params: {
    bucket: string;
    path: string;
    blob: Blob;
    mime: string;
    accessToken: string;
    signal: AbortSignal;
    onProgress: (loaded: number, total: number) => void;
  }): Promise<void>;
  rowExists(table: string, column: string, value: string): Promise<boolean>;
  insertRow(table: string, row: Record<string, unknown>): Promise<void>;
}

export const supabaseStaffTransport: StaffUploadTransport = {
  async getAccessToken() {
    const client = getSupabaseClient();
    if (!client) return null;
    const { data } = await client.auth.getSession();
    return data.session?.access_token ?? null;
  },
  uploadObject: xhrUpload,
  async rowExists(table, column, value) {
    const client = getSupabaseClient();
    if (!client) throw new UploadHttpError('Supabase is not configured.', 0);
    const { data, error } = await client.from(table).select('id').eq(column, value).limit(1);
    if (error) throw new UploadHttpError(error.message, 0);
    return Array.isArray(data) && data.length > 0;
  },
  async insertRow(table, row) {
    const client = getSupabaseClient();
    if (!client) throw new UploadHttpError('Supabase is not configured.', 0);
    const { error } = await client.from(table).insert(row);
    if (error) {
      const forbidden = /row-level security|forbidden|permission/i.test(error.message);
      throw new UploadHttpError(error.message, forbidden ? 403 : 400);
    }
  },
};

export interface SaveStaffUploadParams {
  userId: string;
  kind: QueuedUploadKind;
  label: string;
  bucket: string;
  /** Builds the storage path from the generated id and the sanitized file name. */
  buildPath: (id: string, safeName: string) => string;
  file: File;
  /** Size limit; defaults to 10 MB. */
  maxBytes?: number;
  table: string;
  /** Row to insert after the upload. `{ storage_path }` is added; '$now' values resolve at send time. */
  buildRow: (info: { storagePath: string; name: string; mime: string; size: number }) => Record<string, unknown>;
  /** Column used to detect an already inserted row; defaults to storage_path. */
  lookup?: { column: string; value: string };
}

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
}

/** Stores the file on the device and queues it. Resolves as soon as it is saved; no network. */
export async function saveStaffUpload(
  params: SaveStaffUploadParams,
  db: TesdaConnectOfflineDb = offlineDb,
): Promise<QueuedUploadRecord> {
  const isImage = params.file.type.startsWith('image/');
  let blob: Blob = params.file;
  let mime = params.file.type || 'application/octet-stream';
  let name = params.file.name;
  if (isImage) {
    // Photos are downscaled like learner documents; other file types are stored untouched.
    const prepared = await prepareDocumentFile(params.file);
    blob = prepared.blob;
    mime = prepared.mime;
    name = prepared.name;
  }
  const limit = params.maxBytes ?? 10 * 1024 * 1024;
  if (blob.size <= 0) throw new DocumentValidationError('The selected file is empty.');
  if (blob.size > limit) throw new DocumentValidationError(`The file is larger than ${Math.round(limit / 1024 / 1024)} MB.`);

  const id = generateStableId();
  const storagePath = params.buildPath(id, safeFileName(name));
  const nowIso = new Date().toISOString();
  const record: QueuedUploadRecord = {
    id,
    userId: params.userId,
    kind: params.kind,
    label: params.label,
    bucket: params.bucket,
    storagePath,
    blob,
    mimeType: mime,
    originalName: name,
    sizeBytes: blob.size,
    table: params.table,
    row: params.buildRow({ storagePath, name, mime, size: blob.size }),
    lookup: params.lookup ?? { column: 'storage_path', value: storagePath },
    state: 'pending',
    error: null,
    retryCount: 0,
    nextAttemptAt: nowIso,
    createdAt: nowIso,
  };
  await db.queuedUploads.put(record);
  return record;
}

const controllers = new Map<string, AbortController>();
let running: Promise<number> | null = null;

function resolveRow(row: Record<string, unknown>): Record<string, unknown> {
  const nowIso = new Date().toISOString();
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v === '$now' ? nowIso : v]));
}

/** Sends every due queued staff upload. Returns how many the server confirmed. */
export function processStaffUploadQueue(
  userId: string,
  options: { transport?: StaffUploadTransport; db?: TesdaConnectOfflineDb; force?: boolean } = {},
): Promise<number> {
  if (running) return running;
  running = runStaffQueue(userId, options).finally(() => {
    running = null;
  });
  return running;
}

async function runStaffQueue(
  userId: string,
  options: { transport?: StaffUploadTransport; db?: TesdaConnectOfflineDb; force?: boolean },
): Promise<number> {
  const db = options.db ?? offlineDb;
  const transport = options.transport ?? supabaseStaffTransport;
  const nowIso = new Date().toISOString();
  const due = (await db.queuedUploads.where('userId').equals(userId).toArray())
    .filter((u) => {
      if (u.state === 'saved_offline') return false;
      if (u.state === 'uploading') return !controllers.has(u.id); // left over from a closed tab
      return options.force ? true : u.nextAttemptAt <= nowIso;
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (due.length === 0) return 0;

  const accessToken = await transport.getAccessToken().catch(() => null);
  if (!accessToken) {
    await Promise.all(
      due.map((u) => db.queuedUploads.update(u.id, { state: 'auth_required', error: 'Sign in while online to send this file.' })),
    );
    return 0;
  }

  let confirmed = 0;
  for (const item of due) {
    if (await sendOne(item, accessToken, transport, db)) confirmed += 1;
  }
  return confirmed;
}

async function sendOne(
  item: QueuedUploadRecord,
  accessToken: string,
  transport: StaffUploadTransport,
  db: TesdaConnectOfflineDb,
): Promise<boolean> {
  const controller = new AbortController();
  controllers.set(item.id, controller);
  await db.queuedUploads.update(item.id, { state: 'uploading', error: null });
  const progress = useUploadProgressStore.getState();
  progress.setProgress(item.id, 0, item.sizeBytes);
  try {
    try {
      await transport.uploadObject({
        bucket: item.bucket,
        path: item.storagePath,
        blob: item.blob,
        mime: item.mimeType,
        accessToken,
        signal: controller.signal,
        onProgress: (loaded, total) => progress.setProgress(item.id, loaded, total),
      });
    } catch (err) {
      // The same fixed path was stored by an earlier, interrupted attempt: carry on.
      if (!(err instanceof UploadHttpError && err.status === 409)) throw err;
    }
    if (!(await transport.rowExists(item.table, item.lookup.column, item.lookup.value))) {
      await transport.insertRow(item.table, resolveRow(item.row));
    }
    await db.queuedUploads.delete(item.id);
    return true;
  } catch (err) {
    const status = err instanceof UploadHttpError ? err.status : 0;
    const message = err instanceof Error ? err.message : 'Upload failed.';
    if (status === -1) {
      await db.queuedUploads.update(item.id, { state: 'saved_offline', error: null });
    } else if (status === 401) {
      await db.queuedUploads.update(item.id, { state: 'auth_required', error: 'Your session expired. Sign in while online to send this file.' });
    } else {
      const retryCount = item.retryCount + 1;
      const permanent = status === 403 || status === 413 || status === 415;
      await db.queuedUploads.update(item.id, {
        state: 'failed',
        error: message,
        retryCount,
        nextAttemptAt: new Date(Date.now() + (permanent ? 3600_000 : computeBackoffDelayMs(retryCount))).toISOString(),
      });
    }
    return false;
  } finally {
    controllers.delete(item.id);
    useUploadProgressStore.getState().clearProgress(item.id);
  }
}

export async function requeueStaffUpload(id: string, db: TesdaConnectOfflineDb = offlineDb): Promise<void> {
  await db.queuedUploads.update(id, { state: 'pending', error: null, nextAttemptAt: new Date().toISOString() });
}

export async function cancelStaffUpload(id: string, db: TesdaConnectOfflineDb = offlineDb): Promise<void> {
  const controller = controllers.get(id);
  if (controller) {
    controller.abort();
    return;
  }
  await db.queuedUploads.update(id, { state: 'saved_offline', error: null });
}

/** Removes a file that has not been sent yet. */
export async function removeStaffUpload(id: string, db: TesdaConnectOfflineDb = offlineDb): Promise<void> {
  controllers.get(id)?.abort();
  await db.queuedUploads.delete(id);
}
