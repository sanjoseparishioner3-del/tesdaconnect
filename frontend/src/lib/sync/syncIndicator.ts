export type SyncIndicatorState = 'offline' | 'syncing' | 'action_required' | 'pending' | 'up_to_date';

/**
 * Single source of truth for the header status. Never reports "Up to date" while any
 * transaction is pending, failed or in conflict.
 */
export function deriveSyncIndicator(s: {
  isOnline: boolean;
  syncStatus: string;
  pendingCount: number;
  failedCount: number;
  conflictCount: number;
}): { state: SyncIndicatorState; label: string } {
  if (s.failedCount > 0 || s.conflictCount > 0 || s.syncStatus === 'reauth_required') {
    return { state: 'action_required', label: 'Action required' };
  }
  if (!s.isOnline) {
    return { state: 'offline', label: s.pendingCount > 0 ? `Offline · ${s.pendingCount} pending` : 'Offline' };
  }
  if (s.syncStatus === 'syncing') return { state: 'syncing', label: 'Syncing' };
  if (s.pendingCount > 0) return { state: 'pending', label: `${s.pendingCount} pending` };
  return { state: 'up_to_date', label: 'Up to date' };
}
