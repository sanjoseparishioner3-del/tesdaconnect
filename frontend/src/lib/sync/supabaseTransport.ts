import { refreshOfflineCachesForUser } from '@/lib/authProfile';
import { offlineDb, safeDexieWrite } from '@/lib/db/dexie';
import { processDocumentUploadQueue } from '@/lib/documents/uploadQueue';
import { offlineExpiryIsoForRole } from '@/lib/offline/offlinePolicy';
import { getSupabaseClient } from '@/lib/supabase';
import {
  refreshReactiveQueueCounts,
  verifyServerReachability,
} from '@/lib/sync/connectivityMonitor';
import {
  runOutboxSync,
  type MutationSyncResult,
  type SyncTransportHandler,
} from '@/lib/sync/syncEngine';
import { useAuthStore } from '@/stores/authStore';
import { useConnectivityStore } from '@/stores/connectivityStore';

interface EdgeSyncResponseBody {
  status?: 'synced' | 'conflict' | 'failed';
  message?: string;
  error?: string;
  retryable?: boolean;
  serverData?: Record<string, unknown>;
  serverModifiedAt?: string | null;
  record?: Record<string, unknown>;
}

interface EdgeInvokeErrorContext {
  status?: number;
  json?: () => Promise<EdgeSyncResponseBody>;
}

const PERMANENT_PERMISSION_PREFIX = '[PERMISSION_REVOKED]';
const PERMANENT_VALIDATION_PREFIX = '[VALIDATION_REJECTED]';
const REAUTH_REQUIRED_PREFIX = '[REAUTH_REQUIRED]';

let inFlightSyncPromise: Promise<{ synced: number; conflicts: number; failed: number }> | null =
  null;
let inFlightSyncUserId: string | null = null;

function buildTaggedFailureError(
  message: string,
  status?: number,
  retryable?: boolean,
): string {
  if (status === 401 || /jwt|invalid session|token expired|not authenticated/i.test(message)) {
    return `${REAUTH_REQUIRED_PREFIX} ${message}`;
  }
  if (
    status === 403 ||
    (retryable === false && /permission|role|forbidden|unauthorized|institution|only/i.test(message))
  ) {
    return `${PERMANENT_PERMISSION_PREFIX} ${message}`;
  }
  if (status === 400 || status === 422 || retryable === false) {
    return `${PERMANENT_VALIDATION_PREFIX} ${message}`;
  }
  return message;
}

export const supabaseSyncTransport: SyncTransportHandler = async (mutation) => {
  const client = getSupabaseClient();
  if (!client) {
    return { status: 'failed', message: 'Supabase client is not configured.' };
  }

  const { data: sessionRes } = await client.auth.getSession();
  if (!sessionRes.session?.access_token) {
    return {
      status: 'failed',
      message: `${REAUTH_REQUIRED_PREFIX} Cloud session required before syncing pending local mutations.`,
    };
  }

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (mutation.entityType === 'trainee_intake') {
    let instId = typeof mutation.payload?.institution_id === 'string' ? mutation.payload.institution_id.trim() : '';

    if (!uuidPattern.test(instId)) {
      const userProfile = useAuthStore.getState().profile;
      const matchedProfileInst = userProfile?.institutions?.find(
        (i) => i.code.toUpperCase() === (instId || 'BST').toUpperCase() || i.institutionId === instId,
      );
      if (matchedProfileInst?.institutionId && uuidPattern.test(matchedProfileInst.institutionId)) {
        instId = matchedProfileInst.institutionId;
      } else {
        try {
          const lookupCode = instId ? instId.toUpperCase() : 'BST';
          const { data: instRow } = await client
            .from('institutions')
            .select('id')
            .ilike('code', lookupCode)
            .returns<Array<{ id: string }>>()
            .maybeSingle();

          const candidateId = typeof instRow?.id === 'string' ? instRow.id : '';
          if (candidateId && uuidPattern.test(candidateId)) {
            instId = candidateId;
          }
        } catch {
          // ignore lookup error
        }
      }

      if (uuidPattern.test(instId)) {
        mutation.payload.institution_id = instId;
        await offlineDb.syncOutbox.update(mutation.mutationId, {
          payload: mutation.payload,
        }).catch(() => undefined);
      } else {
        return {
          status: 'failed',
          message: `${PERMANENT_VALIDATION_PREFIX} Valid institution_id UUID required.`,
        };
      }
    }
  }

  const invokeRes = (await client.functions.invoke<EdgeSyncResponseBody>('offline-sync', {
    body: {
      mutationId: mutation.mutationId,
      entityType: mutation.entityType,
      entityId: mutation.entityId,
      operation: mutation.operation,
      baseVersion: mutation.baseVersion,
      payload: mutation.payload,
      clientTimestamp: mutation.createdAt,
    },
  })) as {
    data: EdgeSyncResponseBody | null;
    error: { message?: string; context?: EdgeInvokeErrorContext } | null;
  };
  const { data, error } = invokeRes;

  if (error) {
    const errCtx = error.context;
    const status = typeof errCtx?.status === 'number' ? errCtx.status : undefined;
    let bodyMessage = error.message ?? 'Sync Edge Function request failed.';

    if (errCtx && typeof errCtx.json === 'function') {
      const parsed = await errCtx.json().catch(() => null);
      if (parsed?.status === 'conflict') {
        return {
          status: 'conflict',
          message: parsed.message ?? 'Server version changed after your offline edit.',
          serverData: parsed.serverData ?? {},
          serverModifiedAt: parsed.serverModifiedAt ?? null,
        };
      }
      if (parsed?.message || parsed?.error) {
        bodyMessage = parsed.message ?? parsed.error ?? bodyMessage;
      }
      if (parsed?.retryable === false) {
        return {
          status: 'failed',
          message: buildTaggedFailureError(bodyMessage, status, false),
        };
      }
    }

    console.warn(`[OfflineSync] Edge function responded with status ${status ?? 'unknown'}: ${bodyMessage}`);

    return {
      status: 'failed',
      message: buildTaggedFailureError(bodyMessage, status),
    };
  }

  if (!data) {
    return { status: 'failed', message: 'Sync Edge Function returned an empty response.' };
  }

  if (data.status === 'conflict') {
    return {
      status: 'conflict',
      message: data.message ?? 'Concurrent update conflict detected.',
      serverData: data.serverData ?? {},
      serverModifiedAt: data.serverModifiedAt ?? null,
    };
  }

  if (data.status === 'failed') {
    return {
      status: 'failed',
      message: buildTaggedFailureError(
        data.message ?? data.error ?? 'Backend rejected mutation.',
        undefined,
        data.retryable,
      ),
    };
  }

  const mapped: MutationSyncResult = {
    status: 'synced',
    message: data.message ?? 'Synchronized cleanly with server.',
    serverData: data.record,
  };
  return mapped;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Builds the storage object path `<institution_id>/<user_id>/<timestamp>_<name>` that the
 * learner-documents storage RLS policies expect. Returns null when no valid institution
 * UUID is known yet (the document then stays queued until one is available).
 */
export function buildLearnerDocumentStoragePath(
  institutionId: string | null | undefined,
  userId: string,
  originalName: string,
  timestampMs: number = Date.now(),
): string | null {
  if (!institutionId || !UUID_PATTERN.test(institutionId)) return null;
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${institutionId}/${userId}/${timestampMs}_${safeName}`;
}

/**
 * Sends documents saved on this device through the local-first upload queue
 * (lib/documents/uploadQueue): single-flight, resumable, idempotent, with progress.
 */
export async function flushQueuedOfflineDocuments(userId: string): Promise<number> {
  const fallbackInstitutionId = useAuthStore
    .getState()
    .profile?.institutions?.find((inst) => UUID_PATTERN.test(inst.institutionId))?.institutionId;
  const uploaded = await processDocumentUploadQueue(userId, { fallbackInstitutionId });
  await refreshReactiveQueueCounts(userId);
  return uploaded;
}

export async function triggerForegroundSync(
  userId: string,
  options?: { forceRetryFailed?: boolean },
): Promise<{
  synced: number;
  conflicts: number;
  failed: number;
}> {
  if (inFlightSyncPromise && inFlightSyncUserId === userId) {
    return inFlightSyncPromise;
  }

  const execute = async (): Promise<{ synced: number; conflicts: number; failed: number }> => {
    const store = useConnectivityStore.getState();
    const client = getSupabaseClient();

    if (!client || typeof client.auth?.getSession !== 'function') {
      await refreshReactiveQueueCounts(userId);
      return { synced: 0, conflicts: 0, failed: 0 };
    }

    const isOfflineSession = useAuthStore.getState().isOfflineSession;
    if (isOfflineSession) {
      await refreshReactiveQueueCounts(userId);
      store.setSyncStatus('idle');
      return { synced: 0, conflicts: 0, failed: 0 };
    }

    const reachable = await verifyServerReachability();
    if (!reachable) {
      await refreshReactiveQueueCounts(userId);
      return { synced: 0, conflicts: 0, failed: 0 };
    }

    const { data: sessionRes } = await client.auth.getSession();
    if (!sessionRes.session?.access_token) {
      const counts = await refreshReactiveQueueCounts(userId);
      if (counts.pendingCount > 0 || counts.failedCount > 0) {
        store.setSyncStatus(
          'reauth_required',
          'Internet restored. Sign in online once to authorize syncing your pending local edits.',
        );
      } else {
        store.setSyncStatus('idle');
      }
      return { synced: 0, conflicts: 0, failed: 0 };
    }

    store.setSyncStatus('syncing');
    try {
      const docsUploaded = await flushQueuedOfflineDocuments(userId);
      const result = await runOutboxSync(userId, supabaseSyncTransport, {
        db: offlineDb,
        forceRetryFailed: options?.forceRetryFailed ?? false,
      });

      const userOutbox = await offlineDb.syncOutbox.where('userId').equals(userId).toArray();
      let encounteredReauth = false;
      for (const row of userOutbox) {
        if (row.status === 'failed' && row.lastError?.startsWith(REAUTH_REQUIRED_PREFIX)) {
          encounteredReauth = true;
          await offlineDb.syncOutbox.update(row.mutationId, {
            status: 'pending',
            retryCount: Math.max(0, row.retryCount - 1),
            nextAttemptAt: new Date().toISOString(),
            lastError: 'Awaiting fresh online authentication to sync.',
          });
        } else if (
          row.status === 'failed' &&
          (row.lastError?.startsWith(PERMANENT_PERMISSION_PREFIX) ||
            row.lastError?.startsWith(PERMANENT_VALIDATION_PREFIX))
        ) {
          await offlineDb.syncOutbox.update(row.mutationId, {
            nextAttemptAt: '9999-12-31T23:59:59.000Z',
          });
        }
      }

      const activeRole = useAuthStore.getState().profile?.role;
      const refreshedAt = await refreshOfflineCachesForUser(client, userId, activeRole).catch(
        () => null,
      );

      if (refreshedAt) {
        await safeDexieWrite(() =>
          offlineDb.syncMeta.put({
            key: `user:${userId}`,
            userId,
            lastSyncedAt: refreshedAt,
            offlineEnabledForUser: true,
            offlineExpiresAt: offlineExpiryIsoForRole(activeRole),
            deviceId: 'browser-client',
          }),
        );
      }

      const counts = await refreshReactiveQueueCounts(userId);

      if (encounteredReauth) {
        store.setSyncStatus(
          'reauth_required',
          'Session expired — sign in online to continue syncing pending records.',
        );
      } else if (counts.conflictCount > 0) {
        store.setSyncStatus('error', `${counts.conflictCount} sync conflict(s) require manual review.`);
      } else if (counts.failedCount > 0 || result.failed > 0) {
        store.setSyncStatus(
          'error',
          `${counts.failedCount} offline change(s) failed validation or permission check.`,
        );
      } else {
        store.markSynced(refreshedAt ?? new Date().toISOString());
      }

      return {
        synced: result.synced + docsUploaded,
        conflicts: result.conflicts,
        failed: result.failed,
      };
    } catch (err) {
      await refreshReactiveQueueCounts(userId);
      store.setSyncStatus('error', err instanceof Error ? err.message : 'Foreground sync failed.');
      return { synced: 0, conflicts: 0, failed: 0 };
    }
  };

  inFlightSyncUserId = userId;
  inFlightSyncPromise = execute();
  try {
    return await inFlightSyncPromise;
  } finally {
    inFlightSyncPromise = null;
    inFlightSyncUserId = null;
  }
}
