import { beforeEach, describe, expect, it } from 'vitest';
import {
  enqueueAnnouncementForPublish,
  listPendingAnnouncementPublishes,
} from '@/lib/announcements/offlinePublish';
import { TesdaConnectOfflineDb } from '@/lib/db/dexie';
import { runOutboxSync, type SyncTransportHandler } from '@/lib/sync/syncEngine';

const payload = {
  institution_id: '11111111-1111-4111-8111-111111111111',
  title: 'Walang pasok bukas',
  body: 'Suspended ang klase dahil sa bagyo.',
  audience: 'scholar',
  target_roles: ['scholar', 'applicant'],
  announcement_type: 'general',
  event_date: null,
  event_time: null,
};

describe('Offline announcements publish automatically on reconnect', () => {
  let db: TesdaConnectOfflineDb;

  beforeEach(async () => {
    db = new TesdaConnectOfflineDb(`ann-test-${Math.random().toString(36).slice(2)}`);
    await db.open();
  });

  it('queues the announcement as a publish (submit, not draft) keyed by its client draft id', async () => {
    const item = await enqueueAnnouncementForPublish({ userId: 'admin-1', draftId: 'draft-1', payload }, db);

    expect(item.entityType).toBe('announcement_draft');
    expect(item.operation).toBe('submit');
    expect(item.payload).toMatchObject({ client_draft_id: 'draft-1', is_draft: false, title: payload.title });

    const pending = await listPendingAnnouncementPublishes('admin-1', db);
    expect(pending).toEqual([
      expect.objectContaining({ title: payload.title, state: 'pending', lastError: null }),
    ]);
  });

  it('sends the queued announcement once online and clears it from the pending list', async () => {
    await enqueueAnnouncementForPublish({ userId: 'admin-1', draftId: 'draft-2', payload }, db);

    const sent: Array<{ operation: string; payload: Record<string, unknown> }> = [];
    const transport: SyncTransportHandler = (mutation) => {
      sent.push({ operation: mutation.operation, payload: mutation.payload });
      return Promise.resolve({ status: 'synced' });
    };

    const summary = await runOutboxSync('admin-1', transport, { db });

    expect(summary.synced).toBe(1);
    expect(sent[0]).toMatchObject({ operation: 'submit', payload: { is_draft: false } });
    expect(await listPendingAnnouncementPublishes('admin-1', db)).toEqual([]);
  });

  it('keeps a failed send visible with its error so it is retried, and isolates users', async () => {
    await enqueueAnnouncementForPublish({ userId: 'admin-1', draftId: 'draft-3', payload }, db);
    await enqueueAnnouncementForPublish({ userId: 'registrar-2', draftId: 'draft-4', payload }, db);

    await runOutboxSync('admin-1', () => Promise.resolve({ status: 'failed', message: 'Network request failed' }), { db });

    const pending = await listPendingAnnouncementPublishes('admin-1', db);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ state: 'failed', lastError: 'Network request failed' });
    expect(await listPendingAnnouncementPublishes('registrar-2', db)).toHaveLength(1);
  });
});
