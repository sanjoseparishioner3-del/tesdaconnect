import { create } from 'zustand';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error' | 'offline' | 'reauth_required';

interface ConnectivityState {
  browserOnline: boolean;
  serverReachable: boolean;
  isOnline: boolean;
  syncStatus: SyncStatus;
  pendingCount: number;
  failedCount: number;
  conflictCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  storageWarning: string | null;
  setOnline: (isOnline: boolean) => void;
  setReachability: (browserOnline: boolean, serverReachable: boolean) => void;
  setSyncStatus: (syncStatus: SyncStatus, lastError?: string | null) => void;
  setQueueCounts: (counts: {
    pendingCount: number;
    conflictCount: number;
    failedCount?: number;
  }) => void;
  setStorageWarning: (message: string | null) => void;
  markSynced: (timestampIso: string) => void;
}

const initialBrowserOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

export const useConnectivityStore = create<ConnectivityState>((set) => ({
  browserOnline: initialBrowserOnline,
  serverReachable: initialBrowserOnline,
  isOnline: initialBrowserOnline,
  syncStatus: initialBrowserOnline ? 'idle' : 'offline',
  pendingCount: 0,
  failedCount: 0,
  conflictCount: 0,
  lastSyncedAt: null,
  lastError: null,
  storageWarning: null,
  setOnline: (isOnline) =>
    set((state) => ({
      browserOnline: isOnline,
      serverReachable: isOnline,
      isOnline,
      syncStatus: !isOnline ? 'offline' : state.syncStatus === 'offline' ? 'idle' : state.syncStatus,
    })),
  setReachability: (browserOnline, serverReachable) =>
    set((state) => {
      const effectiveOnline = browserOnline && serverReachable;
      let nextStatus = state.syncStatus;
      if (!effectiveOnline) {
        nextStatus = 'offline';
      } else if (state.syncStatus === 'offline') {
        nextStatus = 'idle';
      }
      return {
        browserOnline,
        serverReachable,
        isOnline: effectiveOnline,
        syncStatus: nextStatus,
      };
    }),
  setSyncStatus: (syncStatus, lastError = null) => set({ syncStatus, lastError }),
  setQueueCounts: ({ pendingCount, conflictCount, failedCount }) =>
    set((state) => ({
      pendingCount,
      conflictCount,
      failedCount: failedCount ?? state.failedCount,
    })),
  setStorageWarning: (storageWarning) => set({ storageWarning }),
  markSynced: (timestampIso) =>
    set((state) => ({
      lastSyncedAt: timestampIso,
      syncStatus:
        state.isOnline
          ? state.failedCount > 0 || state.conflictCount > 0
            ? 'error'
            : 'synced'
          : 'offline',
      lastError: null,
    })),
}));
