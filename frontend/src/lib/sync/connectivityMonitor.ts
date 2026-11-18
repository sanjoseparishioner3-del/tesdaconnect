import { offlineDb } from '@/lib/db/dexie';
import { env, isSupabaseConfigured } from '@/lib/env';
import { useConnectivityStore } from '@/stores/connectivityStore';

let activeReachabilityProbe: Promise<boolean> | null = null;

/**
 * Verifies real server reachability instead of relying only on `navigator.onLine`.
 * Any HTTP response < 500 from Supabase REST/health endpoint confirms TLS & backend
 * reachability; network throws, timeouts, or 502/503/504 treat the client as offline.
 */
export async function verifyServerReachability(options?: {
  timeoutMs?: number;
  respectBrowserOffline?: boolean;
}): Promise<boolean> {
  if (activeReachabilityProbe) {
    return activeReachabilityProbe;
  }

  const probe = (async (): Promise<boolean> => {
    const browserOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    const respectOffline = options?.respectBrowserOffline ?? true;

    if (respectOffline && !browserOnline) {
      useConnectivityStore.getState().setReachability(false, false);
      return false;
    }

    if (!isSupabaseConfigured || !env.VITE_SUPABASE_URL) {
      useConnectivityStore.getState().setReachability(browserOnline, browserOnline);
      return browserOnline;
    }

    const controller = new AbortController();
    const timeoutMs = options?.timeoutMs ?? 4500;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const endpoint = `${env.VITE_SUPABASE_URL.replace(/\/$/, '')}/auth/v1/health`;
      const response = await fetch(endpoint, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          apikey: env.VITE_SUPABASE_ANON_KEY ?? '',
        },
      });

      const reachable = response.status < 500;
      useConnectivityStore.getState().setReachability(browserOnline || (!respectOffline && reachable), reachable);
      return reachable;
    } catch {
      useConnectivityStore.getState().setReachability(browserOnline, false);
      return false;
    } finally {
      clearTimeout(timer);
    }
  })();

  activeReachabilityProbe = probe;
  try {
    return await probe;
  } finally {
    activeReachabilityProbe = null;
  }
}

/**
 * Recomputes user-isolated pending mutations, failed submissions, queued offline
 * document uploads, and open conflicts directly from IndexedDB.
 */
export async function refreshReactiveQueueCounts(userId?: string): Promise<{
  pendingCount: number;
  failedCount: number;
  conflictCount: number;
}> {
  if (!userId) {
    useConnectivityStore.getState().setQueueCounts({
      pendingCount: 0,
      failedCount: 0,
      conflictCount: 0,
    });
    return { pendingCount: 0, failedCount: 0, conflictCount: 0 };
  }

  try {
    const [outboxRows, queuedDocs, staffUploads, conflictCount] = await Promise.all([
      offlineDb.syncOutbox.where('userId').equals(userId).toArray(),
      offlineDb.cachedDocuments
        .where('ownerUserId')
        .equals(userId)
        .filter((doc) => doc.queuedUpload === true)
        .toArray(),
      offlineDb.queuedUploads.where('userId').equals(userId).toArray(),
      offlineDb.conflicts
        .where('userId')
        .equals(userId)
        .filter((conflict) => conflict.status === 'open')
        .count(),
    ]);

    const pendingOutbox = outboxRows.filter(
      (row) => row.status === 'pending' || row.status === 'syncing',
    ).length;
    // Documents kept on the device: failed ones need attention, the rest are waiting to send.
    const failedDocCount = queuedDocs.filter((doc) => doc.uploadState === 'failed').length;
    const queuedDocCount = queuedDocs.length - failedDocCount;
    const failedStaffUploads = staffUploads.filter((u) => u.state === 'failed').length;
    const failedCount =
      outboxRows.filter((row) => row.status === 'failed').length + failedDocCount + failedStaffUploads;
    const pendingCount = pendingOutbox + queuedDocCount + (staffUploads.length - failedStaffUploads);

    useConnectivityStore.getState().setQueueCounts({
      pendingCount,
      failedCount,
      conflictCount,
    });

    return { pendingCount, failedCount, conflictCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to inspect offline queue.';
    useConnectivityStore.getState().setStorageWarning(message);
    return { pendingCount: 0, failedCount: 0, conflictCount: 0 };
  }
}

/**
 * Attaches Dexie transaction-complete hooks so any queued mutation, conflict,
 * or offline document upload reactively updates connectivity badges without polling.
 */
export function installOfflineQueueObservers(getUserId: () => string | undefined): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleRefresh = () => {
    const uid = getUserId();
    if (!uid) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void refreshReactiveQueueCounts(uid);
    }, 25);
  };

  const onCreate = (_primKey: unknown, _obj: unknown, transaction: { on: (eventName: 'complete', subscriber: () => void) => void }) => {
    transaction.on('complete', scheduleRefresh);
  };
  const onUpdate = (_mods: unknown, _primKey: unknown, _obj: unknown, transaction: { on: (eventName: 'complete', subscriber: () => void) => void }) => {
    transaction.on('complete', scheduleRefresh);
  };
  const onDelete = (_primKey: unknown, _obj: unknown, transaction: { on: (eventName: 'complete', subscriber: () => void) => void }) => {
    transaction.on('complete', scheduleRefresh);
  };

  offlineDb.syncOutbox.hook('creating', onCreate);
  offlineDb.syncOutbox.hook('updating', onUpdate);
  offlineDb.syncOutbox.hook('deleting', onDelete);
  offlineDb.conflicts.hook('creating', onCreate);
  offlineDb.conflicts.hook('updating', onUpdate);
  offlineDb.conflicts.hook('deleting', onDelete);
  offlineDb.cachedDocuments.hook('creating', onCreate);
  offlineDb.cachedDocuments.hook('updating', onUpdate);
  offlineDb.cachedDocuments.hook('deleting', onDelete);
  offlineDb.queuedUploads.hook('creating', onCreate);
  offlineDb.queuedUploads.hook('updating', onUpdate);
  offlineDb.queuedUploads.hook('deleting', onDelete);

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    offlineDb.syncOutbox.hook('creating').unsubscribe(onCreate);
    offlineDb.syncOutbox.hook('updating').unsubscribe(onUpdate);
    offlineDb.syncOutbox.hook('deleting').unsubscribe(onDelete);
    offlineDb.conflicts.hook('creating').unsubscribe(onCreate);
    offlineDb.conflicts.hook('updating').unsubscribe(onUpdate);
    offlineDb.conflicts.hook('deleting').unsubscribe(onDelete);
    offlineDb.cachedDocuments.hook('creating').unsubscribe(onCreate);
    offlineDb.cachedDocuments.hook('updating').unsubscribe(onUpdate);
    offlineDb.cachedDocuments.hook('deleting').unsubscribe(onDelete);
    offlineDb.queuedUploads.hook('creating').unsubscribe(onCreate);
    offlineDb.queuedUploads.hook('updating').unsubscribe(onUpdate);
    offlineDb.queuedUploads.hook('deleting').unsubscribe(onDelete);
  };
}
