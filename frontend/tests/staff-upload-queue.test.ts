import { beforeEach, describe, expect, it } from 'vitest';
import { TesdaConnectOfflineDb } from '@/lib/db/dexie';
import {
  processStaffUploadQueue,
  removeStaffUpload,
  requeueStaffUpload,
  saveStaffUpload,
  type StaffUploadTransport,
} from '@/lib/documents/staffUploadQueue';
import { UploadHttpError } from '@/lib/documents/uploadQueue';

const INST = '11111111-1111-4111-8111-111111111111';
const USER = 'uid-registrar';

function file(name = 'report.pdf', body = 'pdf') {
  return new File([body], name, { type: 'application/pdf' });
}

function transport(overrides: Partial<StaffUploadTransport> = {}) {
  const calls = { uploads: [] as Array<{ bucket: string; path: string }>, inserts: [] as Array<{ table: string; row: Record<string, unknown> }> };
  const existing = new Set<string>();
  const t: StaffUploadTransport = {
    getAccessToken: () => Promise.resolve('token'),
    uploadObject: ({ bucket, path }) => {
      calls.uploads.push({ bucket, path });
      return Promise.resolve();
    },
    rowExists: (_table, _column, value) => Promise.resolve(existing.has(value)),
    insertRow: (table, row) => {
      calls.inserts.push({ table, row });
      return Promise.resolve();
    },
    ...overrides,
  };
  return { t, calls, existing };
}

describe('Staff upload queue (operational documents, announcement attachments, learner files)', () => {
  let db: TesdaConnectOfflineDb;

  beforeEach(async () => {
    db = new TesdaConnectOfflineDb(`staff-${Math.random().toString(36).slice(2)}`);
    await db.open();
  });

  const save = (f = file(), extra: Record<string, unknown> = {}) =>
    saveStaffUpload(
      {
        userId: USER,
        kind: 'operational_document',
        label: 'Folder',
        bucket: 'operational-documents',
        buildPath: (id, name) => `${INST}/${USER}/${id}_${name}`,
        file: f,
        table: 'operational_documents',
        buildRow: ({ storagePath, name, size }) => ({ institution_id: INST, storage_path: storagePath, original_name: name, size_bytes: size, reviewed_at: '$now' }),
        ...extra,
      },
      db,
    );

  it('saves the file on the device first, with no network involved', async () => {
    const rec = await save();
    const stored = await db.queuedUploads.get(rec.id);
    expect(stored?.state).toBe('pending');
    expect(stored?.blob).toBeDefined();
    expect(stored?.storagePath).toBe(`${INST}/${USER}/${rec.id}_report.pdf`);
    expect(stored?.lookup).toEqual({ column: 'storage_path', value: stored?.storagePath });
  });

  it('uploads, inserts the row once with a real timestamp, then clears the queue', async () => {
    const { t, calls } = transport();
    await save();
    expect(await processStaffUploadQueue(USER, { transport: t, db })).toBe(1);
    expect(calls.uploads[0]?.bucket).toBe('operational-documents');
    expect(calls.inserts).toHaveLength(1);
    expect(calls.inserts[0]?.row.reviewed_at).not.toBe('$now');
    expect(typeof calls.inserts[0]?.row.reviewed_at).toBe('string');
    expect(await db.queuedUploads.count()).toBe(0);
  });

  it('skips the insert when an earlier interrupted attempt already created the row', async () => {
    const { t, calls, existing } = transport({
      uploadObject: () => Promise.reject(new UploadHttpError('The resource already exists', 409)),
    });
    const rec = await save();
    existing.add(rec.storagePath);
    expect(await processStaffUploadQueue(USER, { transport: t, db })).toBe(1);
    expect(calls.inserts).toHaveLength(0);
  });

  it('keeps the file and retries later when the connection fails; Retry forces an immediate attempt', async () => {
    const bad = transport({ uploadObject: () => Promise.reject(new UploadHttpError('Network error while uploading.', 0)) });
    const rec = await save();
    expect(await processStaffUploadQueue(USER, { transport: bad.t, db })).toBe(0);
    const failed = await db.queuedUploads.get(rec.id);
    expect(failed?.state).toBe('failed');
    expect(failed?.blob).toBeDefined();

    const good = transport();
    expect(await processStaffUploadQueue(USER, { transport: good.t, db })).toBe(0); // backoff not due yet
    await requeueStaffUpload(rec.id, db);
    expect(await processStaffUploadQueue(USER, { transport: good.t, db })).toBe(1);
  });

  it('asks for sign-in when there is no session, and supports a custom lookup for announcements', async () => {
    const none = transport({ getAccessToken: () => Promise.resolve(null) });
    const rec = await save(file('a.pdf', 'x'), { lookup: { column: 'client_draft_id', value: 'draft-1' } });
    await processStaffUploadQueue(USER, { transport: none.t, db });
    const stored = await db.queuedUploads.get(rec.id);
    expect(stored?.state).toBe('auth_required');
    expect(stored?.lookup).toEqual({ column: 'client_draft_id', value: 'draft-1' });
  });

  it('rejects files over the limit and lets the user remove an unsent file', async () => {
    await expect(save(file('big.pdf', 'x'.repeat(50)), { maxBytes: 10 })).rejects.toThrow(/larger than/);
    const rec = await save(file('keep.pdf', 'k'));
    await removeStaffUpload(rec.id, db);
    expect(await db.queuedUploads.get(rec.id)).toBeUndefined();
  });

  it('keeps each user\'s queue separate', async () => {
    const { t, calls } = transport();
    await save();
    await saveStaffUpload(
      { userId: 'someone-else', kind: 'operational_document', label: 'x', bucket: 'operational-documents', buildPath: (id, n) => `p/${id}_${n}`, file: file('o.pdf', 'o'), table: 'operational_documents', buildRow: () => ({}) },
      db,
    );
    expect(await processStaffUploadQueue(USER, { transport: t, db })).toBe(1);
    expect(calls.uploads).toHaveLength(1);
    expect(await db.queuedUploads.count()).toBe(1);
  });
});
