import { beforeEach, describe, expect, it } from 'vitest';
import { purgeOfflineUserData, TesdaConnectOfflineDb } from '@/lib/db/dexie';
import {
  diffRecordFields,
  enqueueMutation,
  resolveConflictManually,
  runOutboxSync,
  sanitizeLegacySyncOutbox,
} from '@/lib/sync/syncEngine';

describe('Dexie Offline Sync Engine & Conflict Resolution', () => {
  let db: TesdaConnectOfflineDb;

  beforeEach(async () => {
    db = new TesdaConnectOfflineDb(`test-db-${Math.random().toString(36).slice(2)}`);
    await db.open();
  });

  it('computes deterministic field diffs ignoring metadata timestamps/versions', () => {
    const changed = diffRecordFields(
      { first_name: 'Juan', contact_number: '09170001111', version: 1, updated_at: 't1' },
      { first_name: 'Juan', contact_number: '09179998888', version: 2, updated_at: 't2' },
    );
    expect(changed).toEqual(['contact_number']);
  });

  it('creates an open conflict record rather than silently overwriting mismatched server records', async () => {
    await enqueueMutation(
      {
        userId: 'user-1',
        entityType: 'trainee_profile',
        entityId: 'profile-42',
        operation: 'upsert',
        payload: { first_name: 'Ana', barangay: 'Poblacion 1' },
        baseVersion: 1,
      },
      db,
    );

    const summary = await runOutboxSync(
      'user-1',
      () =>
        Promise.resolve({
          status: 'conflict',
          entityLabel: 'Trainee Profile: Ana',
          serverData: { first_name: 'Ana', barangay: 'San Jose' },
          serverModifiedAt: '2026-11-16T00:10:00Z',
          serverModifiedBy: 'Registrar BST',
        }),
      { db },
    );

    expect(summary).toEqual({ processed: 1, synced: 0, conflicts: 1, failed: 0 });
    const openConflicts = await db.conflicts.where('userId').equals('user-1').toArray();
    expect(openConflicts).toHaveLength(1);
    expect(openConflicts[0]?.changedFields).toEqual(['barangay']);
    expect(openConflicts[0]?.status).toBe('open');

    // Manual resolution (accept_server) cleans pending mutation & marks resolved
    await resolveConflictManually({ conflictId: openConflicts[0]!.conflictId, action: 'accept_server' }, db);
    expect(await db.syncOutbox.count()).toBe(0);
    expect((await db.conflicts.get(openConflicts[0]!.conflictId))?.status).toBe('resolved');
  });

  it('purges user offline PII cleanly on shared-device logout', async () => {
    await db.cachedAnnouncements.put({
      id: 'ann-1',
      userId: 'user-a',
      institutionId: 'inst-1',
      institutionCode: 'BST',
      title: 'Orientation',
      body: 'Schedule updated',
      audience: 'scholar',
      publishedAt: '2026-11-15T00:00:00Z',
      expiresAt: null,
      deadlineAt: null,
      isRead: false,
      syncedAt: '2026-11-15T01:00:00Z',
    });

    await purgeOfflineUserData(db, 'user-a');
    expect(await db.cachedAnnouncements.count()).toBe(0);
  });

  it('sanitizes legacy stuck trainee_intake mutations with non-UUID institution_id or validation rejection', async () => {
    // Bad mutation 1: legacy hardcoded 'BST'
    await enqueueMutation(
      {
        userId: 'user-legacy',
        entityType: 'trainee_intake',
        entityId: 'draft-bad-1',
        operation: 'submit',
        payload: { first_name: 'Test', institution_id: 'BST' },
        baseVersion: null,
      },
      db,
    );

    // Bad mutation 2: failed with validation rejection
    const bad2 = await enqueueMutation(
      {
        userId: 'user-legacy',
        entityType: 'trainee_intake',
        entityId: 'draft-bad-2',
        operation: 'submit',
        payload: { first_name: 'Test 2', institution_id: '' },
        baseVersion: null,
      },
      db,
    );
    await db.syncOutbox.update(bad2.mutationId, {
      status: 'failed',
      lastError: '[VALIDATION_REJECTED] Valid institution_id UUID required.',
    });

    // Valid mutation: valid UUID
    const validUuid = '11111111-2222-3333-4444-555555555555';
    await enqueueMutation(
      {
        userId: 'user-legacy',
        entityType: 'trainee_intake',
        entityId: 'draft-valid',
        operation: 'submit',
        payload: { first_name: 'Valid Learner', institution_id: validUuid },
        baseVersion: null,
      },
      db,
    );

    expect(await db.syncOutbox.count()).toBe(3);

    const cleanedCount = await sanitizeLegacySyncOutbox(db);
    expect(cleanedCount).toBe(2);

    const remaining = await db.syncOutbox.toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.entityId).toBe('draft-valid');
    expect(remaining[0]?.payload.institution_id).toBe(validUuid);
  });
});
