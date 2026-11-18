import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileUp,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Pagination, usePagination } from '@/components/ui/pagination';
import { offlineDb, purgeOfflineUserData, type SyncConflictRecord } from '@/lib/db/dexie';
import { refreshReactiveQueueCounts, verifyServerReachability } from '@/lib/sync/connectivityMonitor';
import { triggerForegroundSync } from '@/lib/sync/supabaseTransport';
import { DeviceStatusCard } from '@/components/sync/DeviceStatusCard';
import { QueuedUploadsCard } from '@/components/sync/QueuedUploadsCard';
import { resolveConflictManually, sanitizeLegacySyncOutbox } from '@/lib/sync/syncEngine';
import { formatShortDateTime } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useConnectivityStore } from '@/stores/connectivityStore';

function formatOutboxStatusLabel(status: string, lastError: string | null): string {
  if (status === 'syncing') return 'Syncing';
  if (status === 'conflict') return 'Conflict';
  if (status === 'failed') {
    if (lastError?.startsWith('[PERMISSION_REVOKED]')) return 'Permission Revoked';
    if (lastError?.startsWith('[VALIDATION_REJECTED]')) return 'Validation Rejected';
    return 'Failed — Will Retry';
  }
  return 'Pending Sync';
}

export function OfflineSyncPage() {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();
  const {
    isOnline,
    serverReachable,
    syncStatus,
    pendingCount,
    failedCount,
    conflictCount,
    lastSyncedAt,
    lastError,
    storageWarning,
  } = useConnectivityStore();
  const userId = profile?.id ?? '';

  const outboxQuery = useQuery({
    queryKey: ['sync-outbox', userId],
    enabled: Boolean(userId),
    queryFn: () => (userId ? offlineDb.syncOutbox.where('userId').equals(userId).toArray() : []),
  });

  const queuedDocsQuery = useQuery({
    queryKey: ['sync-queued-docs', userId],
    enabled: Boolean(userId),
    queryFn: () =>
      userId
        ? offlineDb.cachedDocuments
            .where('ownerUserId')
            .equals(userId)
            .filter((d) => d.queuedUpload === true)
            .toArray()
        : [],
  });

  const conflictsQuery = useQuery({
    queryKey: ['sync-conflicts', userId],
    enabled: Boolean(userId),
    queryFn: () =>
      userId
        ? offlineDb.conflicts
            .where('userId')
            .equals(userId)
            .filter((c) => c.status === 'open')
            .toArray()
        : [],
  });

  const historyQuery = useQuery({
    queryKey: ['sync-history', userId],
    enabled: Boolean(userId),
    queryFn: () =>
      userId
        ? offlineDb.syncHistory.where('userId').equals(userId).reverse().limit(20).toArray()
        : [],
  });

  const refreshAllViews = React.useCallback(async () => {
    if (userId) {
      await refreshReactiveQueueCounts(userId);
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['sync-outbox'] }),
      queryClient.invalidateQueries({ queryKey: ['sync-queued-docs'] }),
      queryClient.invalidateQueries({ queryKey: ['sync-conflicts'] }),
      queryClient.invalidateQueries({ queryKey: ['sync-history'] }),
    ]);
  }, [queryClient, userId]);

  React.useEffect(() => {
    void sanitizeLegacySyncOutbox(offlineDb).then((cleaned) => {
      if (cleaned > 0) {
        useConnectivityStore.getState().setSyncStatus('idle');
        void refreshAllViews();
      }
    });
  }, [refreshAllViews]);

  async function handleResolve(conflict: SyncConflictRecord, decision: 'keep_local' | 'accept_server') {
    await resolveConflictManually(
      {
        conflictId: conflict.conflictId,
        action: decision,
        serverVersion:
          typeof conflict.serverData?.version === 'number' ? conflict.serverData.version : null,
      },
      offlineDb,
    );
    toast.success(
      decision === 'keep_local'
        ? 'Local version re-queued for server submission.'
        : 'Server record preserved and conflict marked resolved.',
    );
    await refreshAllViews();
  }

  async function handleDiscardFailed(mutationId: string) {
    await offlineDb.syncOutbox.delete(mutationId);
    useConnectivityStore.getState().setSyncStatus('idle');
    toast.info('Removed rejected offline change from local queue.');
    await refreshAllViews();
  }

  async function handleDiscardAllFailed() {
    await sanitizeLegacySyncOutbox(offlineDb);
    const failed = outboxItems.filter((i) => i.status === 'failed');
    for (const f of failed) {
      await offlineDb.syncOutbox.delete(f.mutationId);
    }
    useConnectivityStore.getState().setSyncStatus('idle');
    toast.info(`Removed ${failed.length} rejected offline change(s).`);
    await refreshAllViews();
  }

  async function handlePurgeDeviceCache() {
    await purgeOfflineUserData(offlineDb, userId || undefined);
    toast.success('Cleared offline cache, queued mutations, and conflict records on this device.');
    await refreshAllViews();
  }

  async function handleSyncNow(forceRetryFailed = true) {
    if (!userId) return;
    const reachable = await verifyServerReachability({ respectBrowserOffline: false });
    if (!reachable) {
      toast.error('Supabase server is unreachable right now. Pending changes stay queued locally.');
      return;
    }

    const summary = await triggerForegroundSync(userId, { forceRetryFailed });
    await refreshAllViews();
    if (useConnectivityStore.getState().syncStatus === 'reauth_required') {
      toast.warning('Re-authentication required before queued mutations can sync.');
      return;
    }
    if (!useConnectivityStore.getState().isOnline) {
      toast.warning('Connection unavailable. Your changes remain saved on this device.');
      return;
    }
    const counts = await refreshReactiveQueueCounts(userId);
    if (counts.failedCount || counts.conflictCount || counts.pendingCount) {
      toast.warning('Some changes still need to upload. Review the queue below.');
      return;
    }
    toast.success(
      `Sync finished: ${summary.synced} synced, ${summary.conflicts} conflict(s), ${summary.failed} failed.`,
    );
  }

  const outboxItems = outboxQuery.data ?? [];
  const queuedDocs = queuedDocsQuery.data ?? [];
  const openConflicts = conflictsQuery.data ?? [];
  const history = historyQuery.data ?? [];
  const historyPagination = usePagination({
    totalRecords: history.length,
    initialPageSize: 10,
  });
  const pagedHistory = history.slice(historyPagination.startIndex, historyPagination.endIndex);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sync Center</h1>
          <p className="text-sm text-slate-500">
            Review pending uploads, retry failed changes, and check your connection.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={syncStatus === 'syncing'}
            onClick={() => void handleSyncNow(true)}
          >
            <RefreshCw className={`h-4 w-4 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
            {syncStatus === 'syncing' ? 'Synchronizing...' : 'Sync / Retry Now'}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void handlePurgeDeviceCache()}>
            <Trash2 className="h-4 w-4" /> Purge Device Cache
          </Button>
        </div>
      </div>

      {syncStatus === 'reauth_required' && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-amber-950">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div>
                <p className="font-semibold">Online Re-authentication Needed to Sync</p>
                <p className="text-xs">
                  This session was unlocked offline or its cloud token expired. Your pending local changes are safely preserved; sign in once with internet to flush them.
                </p>
              </div>
            </div>
            <Button type="button" size="sm" onClick={() => void navigate('/login')}>
              Re-authenticate Online
            </Button>
          </CardContent>
        </Card>
      )}

      {userId && <DeviceStatusCard userId={userId} />}
      {userId && <QueuedUploadsCard userId={userId} />}

      {storageWarning && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="flex items-center gap-2.5 p-4 text-xs text-amber-950">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
            <span>{storageWarning}</span>
          </CardContent>
        </Card>
      )}

      {lastError && syncStatus === 'error' && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-center gap-2.5 p-4 text-xs text-red-900">
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-700" />
            <span>{lastError}</span>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Server Reachability</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg">
              {isOnline && serverReachable ? (
                <>
                  <Wifi className="h-4 w-4 text-emerald-600" /> Online Verified
                </>
              ) : (
                <>
                  <WifiOff className="h-4 w-4 text-amber-600" /> Offline Mode
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge
              variant={
                !isOnline
                  ? 'warning'
                  : syncStatus === 'synced' || syncStatus === 'idle'
                    ? 'success'
                    : 'warning'
              }
            >
              Status: {syncStatus.replace(/_/g, ' ')}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending Sync Queue</CardDescription>
            <CardTitle className="text-2xl">{pendingCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">
            {queuedDocs.length} document upload(s), {outboxItems.filter((i) => i.status === 'pending' || i.status === 'syncing').length} data mutation(s)
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Failed / Conflicts</CardDescription>
            <CardTitle className="text-2xl">
              {failedCount} failed • {conflictCount} conflict
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">
            Rejected or conflicting edits stay preserved locally for manual review
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Last Completed Sync</CardDescription>
            <CardTitle className="text-sm font-semibold">{formatShortDateTime(lastSyncedAt)}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-500">
            Isolated strictly to active account ({profile?.role ?? 'user'})
          </CardContent>
        </Card>
      </div>

      {/* Pending / Failed Outbox Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-teal-700" />
              Queued &amp; Failed Offline Mutations ({outboxItems.length})
            </CardTitle>
            <CardDescription>
              Your changes stay on this device until the server confirms receipt.
            </CardDescription>
          </div>
          {outboxItems.some((i) => i.status === 'failed') && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-xs text-rose-700 hover:bg-rose-50 hover:text-rose-800"
              onClick={() => void handleDiscardAllFailed()}
            >
              Clear All Failed
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {outboxItems.length === 0 && queuedDocs.length === 0 ? (
            <p className="text-sm text-slate-500">All local changes are synchronized with the server.</p>
          ) : (
            <div className="space-y-2.5">
              {outboxItems.map((item) => {
                const label = formatOutboxStatusLabel(item.status, item.lastError);
                const isPermanent = Boolean(
                  item.lastError?.startsWith('[PERMISSION_REVOKED]') ||
                    item.lastError?.startsWith('[VALIDATION_REJECTED]'),
                );
                return (
                  <div
                    key={item.mutationId}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">
                        {item.entityType} ({item.operation}) •{' '}
                        <span className="font-mono text-xs text-slate-500">{item.entityId}</span>
                      </p>
                      <p className="text-xs text-slate-500">
                        Queued {formatShortDateTime(item.createdAt)} • Key{' '}
                        <span className="font-mono">{item.mutationId.slice(0, 8)}</span> • Retries:{' '}
                        {item.retryCount}
                      </p>
                      {item.lastError && (
                        <p className="mt-1 text-xs font-medium text-red-700">
                          {item.lastError
                            .replace('[PERMISSION_REVOKED] ', '')
                            .replace('[VALIDATION_REJECTED] ', '')}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          item.status === 'failed'
                            ? 'destructive'
                            : item.status === 'conflict'
                              ? 'warning'
                              : 'info'
                        }
                      >
                        {label}
                      </Badge>
                      {(item.status === 'failed' || isPermanent) && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => void handleDiscardFailed(item.mutationId)}
                        >
                          Discard
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}

              {queuedDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-teal-200 bg-teal-50/40 px-3.5 py-2.5 text-sm"
                >
                  <div className="flex items-center gap-2.5">
                    <FileUp className="h-4 w-4 text-teal-700" />
                    <div>
                      <p className="font-medium text-slate-900">{doc.originalName}</p>
                      <p className="text-xs text-slate-500">
                        Requirement: {doc.documentType} • Saved offline {formatShortDateTime(doc.syncedAt)}
                      </p>
                    </div>
                  </div>
                  <Badge variant="warning">Document Upload Pending Sync</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Conflicts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Sync Conflicts Requiring Manual Review ({openConflicts.length})
          </CardTitle>
          <CardDescription>
            TCTESDAConnect never silently overwrites newer server records. Choose which fields to retain.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {openConflicts.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> Zero unresolved record conflicts.
            </p>
          ) : (
            openConflicts.map((c) => (
              <div key={c.conflictId} className="space-y-3 rounded-xl border border-amber-300 bg-amber-50/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {c.entityType} • <span className="font-mono text-xs">{c.entityId}</span>
                  </p>
                  <Badge variant="warning">Conflicting Fields: {c.changedFields.join(', ') || 'multiple'}</Badge>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <pre className="max-h-40 overflow-auto rounded border border-slate-200 bg-white p-2 text-xs">
                    Local:\n{JSON.stringify(c.localData, null, 2)}
                  </pre>
                  <pre className="max-h-40 overflow-auto rounded border border-slate-200 bg-white p-2 text-xs">
                    Server:\n{JSON.stringify(c.serverData, null, 2)}
                  </pre>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={() => void handleResolve(c, 'keep_local')}>
                    Keep My Local Changes &amp; Retry
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => void handleResolve(c, 'accept_server')}>
                    Accept Server Record
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Synchronization History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          {history.length === 0 ? (
            <p className="text-slate-500">No synchronization log entries yet for this user.</p>
          ) : (
            <>
              <div className="space-y-1">
                {pagedHistory.map((h) => (
                  <div key={h.id ?? `${h.mutationId}-${h.timestamp}`} className="flex flex-wrap items-center justify-between border-b border-slate-100 py-1.5">
                    <span className="font-medium text-slate-800">{h.message}</span>
                    <span className="text-slate-500">
                      {h.outcome.toUpperCase()} • {formatShortDateTime(h.timestamp)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-3 border-t border-slate-100 pt-3">
                <Pagination
                  currentPage={historyPagination.currentPage}
                  totalPages={historyPagination.totalPages}
                  totalRecords={history.length}
                  pageSize={historyPagination.pageSize}
                  onPageChange={historyPagination.goToPage}
                  onPageSizeChange={historyPagination.setPageSize}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
