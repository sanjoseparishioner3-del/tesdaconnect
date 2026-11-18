import { beforeEach, describe, expect, it, vi } from 'vitest';
import { offlineDb } from '@/lib/db/dexie';
import { triggerForegroundSync } from '@/lib/sync/supabaseTransport';
import { useAuthStore } from '@/stores/authStore';
import { useConnectivityStore } from '@/stores/connectivityStore';

const { getSession, reachability, refreshCaches } = vi.hoisted(() => ({
  getSession: vi.fn(), reachability: vi.fn(), refreshCaches: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({ getSupabaseClient: () => ({ auth: { getSession } }) }));
vi.mock('@/lib/sync/connectivityMonitor', () => ({
  verifyServerReachability: reachability,
  refreshReactiveQueueCounts: vi.fn().mockResolvedValue({ pendingCount: 1, failedCount: 0, conflictCount: 0 }),
}));
vi.mock('@/lib/authProfile', () => ({ refreshOfflineCachesForUser: refreshCaches }));
vi.mock('@/lib/documents/uploadQueue', () => ({ processDocumentUploadQueue: vi.fn().mockResolvedValue(0) }));
vi.mock('@/lib/documents/staffUploadQueue', () => ({ processStaffUploadQueue: vi.fn().mockResolvedValue(0) }));

describe('cloud session recovery after offline unlock', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await offlineDb.syncOutbox.clear();
    useAuthStore.setState({ isOfflineSession: true });
    useConnectivityStore.getState().setOnline(true);
    reachability.mockResolvedValue(true);
    refreshCaches.mockResolvedValue(null);
  });
  it('resumes sync when the cached unlock has a matching cloud session', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 'token', user: { id: 'learner-1' } } } });
    await triggerForegroundSync('learner-1');
    expect(getSession).toHaveBeenCalled();
    expect(useAuthStore.getState().isOfflineSession).toBe(false);
    expect(refreshCaches).toHaveBeenCalled();
  });
  it.each([null, { access_token: 'other-token', user: { id: 'another-account' } }])(
    'requires sign-in when cloud session is missing or belongs to another account', async (session) => {
      getSession.mockResolvedValue({ data: { session } });
      await triggerForegroundSync('learner-1');
      expect(useConnectivityStore.getState().syncStatus).toBe('reauth_required');
      expect(refreshCaches).not.toHaveBeenCalled();
      expect(useAuthStore.getState().isOfflineSession).toBe(true);
    },
  );
});
