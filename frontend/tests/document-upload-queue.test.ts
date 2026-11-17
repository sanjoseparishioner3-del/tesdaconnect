import { beforeEach, describe, expect, it } from 'vitest';
import { TesdaConnectOfflineDb } from '@/lib/db/dexie';
import { DocumentValidationError } from '@/lib/documents/prepareDocumentFile';
import {
  cancelDocumentUpload,
  type DocumentUploadTransport,
  processDocumentUploadQueue,
  removeUnsubmittedDocument,
  requeueDocumentUpload,
  saveDocumentForUpload,
  UploadHttpError,
} from '@/lib/documents/uploadQueue';

const INST = '11111111-1111-4111-8111-111111111111';
const USER = 'uid-scholar';

function pdf(name = 'psa.pdf', body = 'pdf-bytes') {
  return new File([body], name, { type: 'application/pdf' });
}

function fakeTransport(overrides: Partial<DocumentUploadTransport> = {}) {
  const calls = { uploads: [] as string[], inserts: [] as string[], progress: [] as number[] };
  const serverRows = new Map<string, string>();
  const transport: DocumentUploadTransport = {
    getAccessToken: () => Promise.resolve('token'),
    uploadObject: ({ path, onProgress, blob }) => {
      calls.uploads.push(path);
      onProgress(blob.size / 2, blob.size);
      onProgress(blob.size, blob.size);
      calls.progress.push(blob.size);
      return Promise.resolve();
    },
    findDocumentIdByPath: (path) => Promise.resolve(serverRows.get(path) ?? null),
    insertDocument: (row) => {
      calls.inserts.push(row.storage_path);
      const id = `server-${serverRows.size + 1}`;
      serverRows.set(row.storage_path, id);
      return Promise.resolve(id);
    },
    ...overrides,
  };
  return { transport, calls, serverRows };
}

describe('Local-first document upload queue', () => {
  let db: TesdaConnectOfflineDb;

  beforeEach(async () => {
    db = new TesdaConnectOfflineDb(`upload-${Math.random().toString(36).slice(2)}`);
    await db.open();
  });

  it('saves the actual file on the device immediately and queues it, without any network call', async () => {
    const record = await saveDocumentForUpload({ userId: USER, institutionId: INST, documentType: 'psa_birth_certificate', file: pdf() }, db);
    const stored = await db.cachedDocuments.get(record.id);
    // fake-indexeddb returns stored Blobs as plain objects; real browsers keep the Blob.
    expect(stored?.blob).toBeDefined();
    expect(stored?.queuedUpload).toBe(true);
    expect(stored?.uploadState).toBe('pending');
    expect(stored?.storagePath).toBe(`${INST}/${USER}/${record.id}_psa.pdf`);
    expect(stored?.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects unsupported types and the same file added twice for a requirement', async () => {
    await expect(
      saveDocumentForUpload({ userId: USER, institutionId: INST, documentType: 'government_id', file: new File(['x'], 'a.exe', { type: 'application/x-msdownload' }) }, db),
    ).rejects.toBeInstanceOf(DocumentValidationError);
    await saveDocumentForUpload({ userId: USER, institutionId: INST, documentType: 'government_id', file: pdf('id.pdf', 'same') }, db);
    await expect(
      saveDocumentForUpload({ userId: USER, institutionId: INST, documentType: 'government_id', file: pdf('id-copy.pdf', 'same') }, db),
    ).rejects.toThrow(/already been added/);
  });

  it('uploads queued files, then marks them Submitted under the server id', async () => {
    const { transport, calls } = fakeTransport();
    const a = await saveDocumentForUpload({ userId: USER, institutionId: INST, documentType: 'psa_birth_certificate', file: pdf('a.pdf', 'a') }, db);
    await saveDocumentForUpload({ userId: USER, institutionId: INST, documentType: 'government_id', file: pdf('b.pdf', 'b') }, db);

    expect(await processDocumentUploadQueue(USER, { transport, db })).toBe(2);
    expect(calls.uploads).toHaveLength(2);
    expect(await db.cachedDocuments.get(a.id)).toBeUndefined();
    const docs = await db.cachedDocuments.toArray();
    expect(docs.every((d) => d.uploadState === 'submitted' && !d.queuedUpload && d.id.startsWith('server-'))).toBe(true);
    expect(docs.every((d) => d.blob !== undefined)).toBe(true);
  });

  it('never creates a duplicate record when an interrupted upload is retried', async () => {
    const { transport, calls, serverRows } = fakeTransport();
    const rec = await saveDocumentForUpload({ userId: USER, institutionId: INST, documentType: 'id_pictures', file: pdf('id.pdf', 'x') }, db);
    // Earlier attempt stored the object and the row, then the connection dropped.
    serverRows.set(rec.storagePath!, 'server-existing');
    const conflictTransport: DocumentUploadTransport = {
      ...transport,
      uploadObject: () => Promise.reject(new UploadHttpError('The resource already exists', 409)),
    };
    expect(await processDocumentUploadQueue(USER, { transport: conflictTransport, db })).toBe(1);
    expect(calls.inserts).toHaveLength(0);
    expect((await db.cachedDocuments.get('server-existing'))?.uploadState).toBe('submitted');
  });

  it('keeps the file and schedules a retry when the network fails', async () => {
    const { transport } = fakeTransport({
      uploadObject: () => Promise.reject(new UploadHttpError('Upload stalled: the connection stopped responding.', 0)),
    });
    const rec = await saveDocumentForUpload({ userId: USER, institutionId: INST, documentType: 'medical_certificate', file: pdf() }, db);
    expect(await processDocumentUploadQueue(USER, { transport, db })).toBe(0);
    const stored = await db.cachedDocuments.get(rec.id);
    expect(stored?.uploadState).toBe('failed');
    // fake-indexeddb returns stored Blobs as plain objects; real browsers keep the Blob.
    expect(stored?.blob).toBeDefined();
    expect(stored?.retryCount).toBe(1);
    expect(stored?.nextAttemptAt && stored.nextAttemptAt > new Date().toISOString()).toBe(true);

    // Not retried before the backoff, unless forced (Retry button / Sync now).
    const ok = fakeTransport();
    expect(await processDocumentUploadQueue(USER, { transport: ok.transport, db })).toBe(0);
    await requeueDocumentUpload(rec.id, db);
    expect(await processDocumentUploadQueue(USER, { transport: ok.transport, db })).toBe(1);
  });

  it('asks for sign-in instead of failing when there is no session', async () => {
    const { transport } = fakeTransport({ getAccessToken: () => Promise.resolve(null) });
    const rec = await saveDocumentForUpload({ userId: USER, institutionId: INST, documentType: 'psa_birth_certificate', file: pdf() }, db);
    await processDocumentUploadQueue(USER, { transport, db });
    expect((await db.cachedDocuments.get(rec.id))?.uploadState).toBe('auth_required');
  });

  it('lets the scholar cancel and remove unsent files, but never removes submitted ones', async () => {
    const rec = await saveDocumentForUpload({ userId: USER, institutionId: INST, documentType: 'psa_birth_certificate', file: pdf() }, db);
    await cancelDocumentUpload(rec.id, db);
    expect((await db.cachedDocuments.get(rec.id))?.uploadState).toBe('saved_offline');

    // Cancelled files are not sent automatically.
    const { transport, calls } = fakeTransport();
    await processDocumentUploadQueue(USER, { transport, db });
    expect(calls.uploads).toHaveLength(0);

    expect(await removeUnsubmittedDocument(rec.id, db)).toBe(true);
    expect(await db.cachedDocuments.get(rec.id)).toBeUndefined();

    const other = await saveDocumentForUpload({ userId: USER, institutionId: INST, documentType: 'government_id', file: pdf('g.pdf', 'g') }, db);
    await processDocumentUploadQueue(USER, { transport, db });
    const submitted = (await db.cachedDocuments.toArray()).find((d) => d.uploadState === 'submitted');
    expect(submitted).toBeDefined();
    expect(await removeUnsubmittedDocument(submitted!.id, db)).toBe(false);
    expect(other.id).not.toBe(submitted!.id);
  });

  it('uses the profile campus when the file was saved before a campus was known', async () => {
    const { transport, calls } = fakeTransport();
    await saveDocumentForUpload({ userId: USER, institutionId: null, documentType: 'psa_birth_certificate', file: pdf() }, db);
    expect(await processDocumentUploadQueue(USER, { transport, db, fallbackInstitutionId: INST })).toBe(1);
    expect(calls.uploads[0]?.startsWith(`${INST}/${USER}/`)).toBe(true);
  });
});
