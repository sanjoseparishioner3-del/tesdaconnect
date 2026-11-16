import {
  offlineDb,
  type ConflictResolutionAction,
  type SyncConflictRecord,
  type SyncOutboxItem,
  type TesdaConnectOfflineDb,
} from '@/lib/db/dexie';

export interface MutationSyncResult {
  status: 'synced' | 'conflict' | 'failed';
  message?: string;
  serverData?: Record<string, unknown>;
  serverModifiedAt?: string | null;
  serverModifiedBy?: string | null;
  entityLabel?: string;
}

export type SyncTransportHandler = (item: SyncOutboxItem) => Promise<MutationSyncResult>;

export function generateStableId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function computeBackoffDelayMs(retryCount: number, baseMs = 2000, maxMs = 300_000): number {
  const exponential = Math.min(maxMs, baseMs * 2 ** Math.max(0, retryCount));
  const jitter = Math.floor(Math.random() * 500);
  return Math.min(maxMs, exponential + jitter);
}

export function diffRecordFields(
  localData: Record<string, unknown>,
  serverData: Record<string, unknown>,
  ignoredKeys: readonly string[] = ['updated_at', 'version', 'synced_at'],
): string[] {
  const keys = new Set([...Object.keys(localData), ...Object.keys(serverData)]);
  const changed: string[] = [];

  for (const key of keys) {
    if (ignoredKeys.includes(key)) continue;
    const localVal = JSON.stringify(localData[key] ?? null);
    const serverVal = JSON.stringify(serverData[key] ?? null);
    if (localVal !== serverVal) {
      changed.push(key);
    }
  }

  return changed.sort();
}

export async function enqueueMutation(
  params: {
    userId: string;
    entityType: SyncOutboxItem['entityType'];
    entityId: string;
    operation: SyncOutboxItem['operation'];
    payload: Record<string, unknown>;
    baseVersion: number | null;
  },
  db: TesdaConnectOfflineDb = offlineDb,
): Promise<SyncOutboxItem> {
  const nowIso = new Date().toISOString();
  const item: SyncOutboxItem = {
    mutationId: generateStableId(),
    userId: params.userId,
    entityType: params.entityType,
    entityId: params.entityId,
    operation: params.operation,
    payload: params.payload,
    baseVersion: params.baseVersion,
    status: 'pending',
    retryCount: 0,
    nextAttemptAt: nowIso,
    lastError: null,
    createdAt: nowIso,
  };

  await db.syncOutbox.put(item);
  return item;
}

export interface SyncRunSummary {
  processed: number;
  synced: number;
  conflicts: number;
  failed: number;
}

export async function runOutboxSync(
  userId: string,
  transport: SyncTransportHandler,
  options?: { db?: TesdaConnectOfflineDb; forceRetryFailed?: boolean },
): Promise<SyncRunSummary> {
  const db = options?.db ?? offlineDb;
  const nowIso = new Date().toISOString();

  const candidates = await db.syncOutbox
    .where('userId')
    .equals(userId)
    .filter((item) => {
      if (item.status === 'conflict') return false;
      if (options?.forceRetryFailed && item.status === 'failed') return true;
      return (item.status === 'pending' || item.status === 'failed') && item.nextAttemptAt <= nowIso;
    })
    .sortBy('createdAt');

  const summary: SyncRunSummary = {
    processed: candidates.length,
    synced: 0,
    conflicts: 0,
    failed: 0,
  };

  for (const item of candidates) {
    await db.syncOutbox.update(item.mutationId, { status: 'syncing' });

    try {
      const result = await transport(item);

      if (result.status === 'synced') {
        await db.transaction('rw', [db.syncOutbox, db.syncHistory], async () => {
          await db.syncOutbox.delete(item.mutationId);
          await db.syncHistory.add({
            userId,
            mutationId: item.mutationId,
            entityType: item.entityType,
            operation: item.operation,
            outcome: 'synced',
            message: result.message ?? 'Synchronized cleanly with server.',
            timestamp: new Date().toISOString(),
          });
        });
        summary.synced += 1;
        continue;
      }

      if (result.status === 'conflict') {
        const serverData = result.serverData ?? {};
        const changedFields = diffRecordFields(item.payload, serverData);
        const conflict: SyncConflictRecord = {
          conflictId: generateStableId(),
          userId,
          mutationId: item.mutationId,
          entityType: item.entityType,
          entityId: item.entityId,
          entityLabel: result.entityLabel ?? `${item.entityType} (${item.entityId})`,
          localData: item.payload,
          serverData,
          changedFields,
          localModifiedAt: item.createdAt,
          serverModifiedAt: result.serverModifiedAt ?? null,
          serverModifiedBy: result.serverModifiedBy ?? null,
          status: 'open',
          resolutionAction: null,
          resolvedAt: null,
        };

        await db.transaction('rw', [db.syncOutbox, db.conflicts, db.syncHistory], async () => {
          await db.syncOutbox.update(item.mutationId, {
            status: 'conflict',
            lastError: result.message ?? 'Server version changed before sync.',
          });
          await db.conflicts.put(conflict);
          await db.syncHistory.add({
            userId,
            mutationId: item.mutationId,
            entityType: item.entityType,
            operation: item.operation,
            outcome: 'conflict',
            message: result.message ?? 'Version conflict detected; awaiting manual review.',
            timestamp: new Date().toISOString(),
          });
        });
        summary.conflicts += 1;
        continue;
      }

      throw new Error(result.message ?? 'Synchronization failed.');
    } catch (err) {
      const nextRetry = item.retryCount + 1;
      const delayMs = computeBackoffDelayMs(nextRetry);
      const message = err instanceof Error ? err.message : 'Network or server error during sync.';
      const isPermanent =
        message.includes('[VALIDATION_REJECTED]') ||
        message.includes('[PERMISSION_REVOKED]') ||
        /400|422|validation|forbidden|permission/i.test(message);
      const nextAttemptAt = isPermanent
        ? '9999-12-31T23:59:59.000Z'
        : new Date(Date.now() + delayMs).toISOString();

      await db.transaction('rw', [db.syncOutbox, db.syncHistory], async () => {
        await db.syncOutbox.update(item.mutationId, {
          status: 'failed',
          retryCount: nextRetry,
          nextAttemptAt,
          lastError: message,
        });
        await db.syncHistory.add({
          userId,
          mutationId: item.mutationId,
          entityType: item.entityType,
          operation: item.operation,
          outcome: 'failed',
          message,
          timestamp: new Date().toISOString(),
        });
      });
      summary.failed += 1;
    }
  }

  return summary;
}

export async function resolveConflictManually(
  params: {
    conflictId: string;
    action: ConflictResolutionAction;
    mergedPayload?: Record<string, unknown>;
    serverVersion?: number | null;
  },
  db: TesdaConnectOfflineDb = offlineDb,
): Promise<void> {
  const conflict = await db.conflicts.get(params.conflictId);
  if (!conflict || conflict.status === 'resolved') {
    return;
  }

  await db.transaction('rw', [db.conflicts, db.syncOutbox, db.syncHistory], async () => {
    const nowIso = new Date().toISOString();

    if (params.action === 'accept_server') {
      await db.syncOutbox.delete(conflict.mutationId);
      await db.conflicts.update(conflict.conflictId, {
        status: 'resolved',
        resolutionAction: 'accept_server',
        resolvedAt: nowIso,
      });
      await db.syncHistory.add({
        userId: conflict.userId,
        mutationId: conflict.mutationId,
        entityType: conflict.entityType,
        operation: 'resolve_conflict',
        outcome: 'synced',
        message: `Conflict resolved: kept server version for ${conflict.entityLabel}.`,
        timestamp: nowIso,
      });
      return;
    }

    const updatedPayload =
      params.action === 'merge' && params.mergedPayload ? params.mergedPayload : conflict.localData;

    await db.syncOutbox.update(conflict.mutationId, {
      status: 'pending',
      payload: updatedPayload,
      baseVersion: params.serverVersion ?? null,
      retryCount: 0,
      nextAttemptAt: nowIso,
      lastError: null,
    });
    await db.conflicts.update(conflict.conflictId, {
      status: 'resolved',
      resolutionAction: params.action,
      resolvedAt: nowIso,
    });
    await db.syncHistory.add({
      userId: conflict.userId,
      mutationId: conflict.mutationId,
      entityType: conflict.entityType,
      operation: 'resolve_conflict',
      outcome: 'synced',
      message: `Conflict queued for sync using ${params.action} resolution.`,
      timestamp: nowIso,
    });
  });
}

export async function sanitizeLegacySyncOutbox(db: TesdaConnectOfflineDb = offlineDb): Promise<number> {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const allMutations = await db.syncOutbox.toArray();
  let cleanedCount = 0;

  for (const m of allMutations) {
    if (m.entityType === 'trainee_intake') {
      const instId = typeof m.payload?.institution_id === 'string' ? m.payload.institution_id.trim() : '';
      const isInvalidInst = !instId || instId === 'BST' || !uuidPattern.test(instId);
      const isFailedValidation =
        m.status === 'failed' &&
        typeof m.lastError === 'string' &&
        (m.lastError.includes('institution_id') ||
          m.lastError.includes('VALIDATION_REJECTED') ||
          m.lastError.includes('400'));

      if (isInvalidInst || isFailedValidation) {
        await db.syncOutbox.delete(m.mutationId);
        cleanedCount += 1;
      }
    }
  }

  return cleanedCount;
}
