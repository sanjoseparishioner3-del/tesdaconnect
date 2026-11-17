import { offlineDb, type TesdaConnectOfflineDb } from '@/lib/db/dexie';
import { enqueueMutation } from '@/lib/sync/syncEngine';

export interface OfflineAnnouncementPayload {
  institution_id: string | null;
  title: string;
  body: string;
  audience: string;
  target_roles: string[];
  announcement_type: string;
  event_date: string | null;
  event_time: string | null;
}

/**
 * Queues an announcement written while offline so it is PUBLISHED (not left as a draft)
 * as soon as the device reconnects. The offline-sync edge function publishes
 * `operation: 'submit'` with `is_draft: false` for roles allowed to publish, and upserts on
 * `client_draft_id`, so a retried sync never creates a duplicate announcement.
 */
export async function enqueueAnnouncementForPublish(
  params: { userId: string; draftId: string; payload: OfflineAnnouncementPayload },
  db: TesdaConnectOfflineDb = offlineDb,
) {
  return enqueueMutation(
    {
      userId: params.userId,
      entityType: 'announcement_draft',
      entityId: params.draftId,
      operation: 'submit',
      payload: {
        client_draft_id: params.draftId,
        ...params.payload,
        is_draft: false,
      },
      baseVersion: null,
    },
    db,
  );
}

export interface PendingAnnouncementPublish {
  mutationId: string;
  title: string;
  state: 'pending' | 'failed' | 'conflict';
  lastError: string | null;
  createdAt: string;
}

/** Announcements still waiting in this user's sync outbox (oldest first). */
export async function listPendingAnnouncementPublishes(
  userId: string,
  db: TesdaConnectOfflineDb = offlineDb,
): Promise<PendingAnnouncementPublish[]> {
  const rows = await db.syncOutbox
    .where('userId')
    .equals(userId)
    .filter((row) => row.entityType === 'announcement_draft')
    .sortBy('createdAt');

  return rows.map((row) => ({
    mutationId: row.mutationId,
    title: typeof row.payload.title === 'string' && row.payload.title ? row.payload.title : 'Untitled announcement',
    state: row.status === 'failed' ? 'failed' : row.status === 'conflict' ? 'conflict' : 'pending',
    lastError: row.lastError,
    createdAt: row.createdAt,
  }));
}
