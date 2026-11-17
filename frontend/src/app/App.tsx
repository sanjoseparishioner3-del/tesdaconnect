import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { LaunchRedirect, ProtectedRoute, RoleRoute } from '@/app/AuthGuards';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { STAFF_DASHBOARD_ROLES } from '@/lib/rbac';
import { AppLayoutFixed } from '@/components/layout/AppLayoutFixed';
import { LoginPage } from '@/features/auth/LoginPage';
import { fetchAuthenticatedProfile, refreshOfflineCachesForUser } from '@/lib/authProfile';
import { offlineDb, pruneExpiredOfflineData, purgeOtherUsersCachedData } from '@/lib/db/dexie';
import {
  extendOfflineUnlockWindow,
  getUnexpiredOfflineProfileByUserId,
  revokeOfflineUnlockCredentialsForUser,
} from '@/lib/offline/offlineAuth';
import { offlineExpiryIsoForRole } from '@/lib/offline/offlinePolicy';
import { requestPersistentStorage } from '@/lib/pwa/offlineReadiness';
import { PwaInstallBanner } from '@/components/pwa/PwaInstallBanner';
import { getSupabaseClient, readPersistedSessionUserId } from '@/lib/supabase';
import { installOfflineQueueObservers, refreshReactiveQueueCounts, verifyServerReachability } from '@/lib/sync/connectivityMonitor';
import { triggerForegroundSync } from '@/lib/sync/supabaseTransport';
import { sanitizeLegacySyncOutbox } from '@/lib/sync/syncEngine';
import { useAuthStore } from '@/stores/authStore';
import { useConnectivityStore } from '@/stores/connectivityStore';

/**
 * Route-level code splitting: each workspace page is its own chunk, so a scholar's phone
 * does not parse every staff page on startup. All chunks are still precached by the
 * service worker, so lazy pages keep working offline.
 */
function lazyPage<M extends Record<string, unknown>, K extends keyof M & string>(
  load: () => Promise<M>,
  exportName: K,
): React.LazyExoticComponent<React.ComponentType> {
  return React.lazy(async () => {
    const mod = await load();
    return { default: mod[exportName] as React.ComponentType };
  });
}

const AnnouncementsPage = lazyPage(() => import('@/features/announcements/AnnouncementsPage'), 'AnnouncementsPage');
const PasswordChangePage = lazyPage(() => import('@/features/auth/PasswordChangePage'), 'PasswordChangePage');
const CompetencyAndAttendancePage = lazyPage(() => import('@/features/competency/CompetencyAndAttendancePage'), 'CompetencyAndAttendancePage');
const CoursesAndMaterialsPage = lazyPage(() => import('@/features/courses/CoursesAndMaterialsPage'), 'CoursesAndMaterialsPage');
const DashboardPage = lazyPage(() => import('@/features/dashboard/DashboardPage'), 'DashboardPage');
const OperationalDocsAndFormsPage = lazyPage(() => import('@/features/focal/OperationalDocsAndFormsPage'), 'OperationalDocsAndFormsPage');
const UserGuidePage = lazyPage(() => import('@/features/help/UserGuidePage'), 'UserGuidePage');
const TraineeIntakePage = lazyPage(() => import('@/features/intake/TraineeIntakePage'), 'TraineeIntakePage');
const LandingPage = lazyPage(() => import('@/features/landing/LandingPage'), 'LandingPage');
const LearnerPortalPage = lazyPage(() => import('@/features/learner/LearnerPortalPage'), 'LearnerPortalPage');
const ReportsPage = lazyPage(() => import('@/features/reports/ReportsPage'), 'ReportsPage');
const TrainingSchedulesPage = lazyPage(() => import('@/features/schedules/TrainingSchedulesPage'), 'TrainingSchedulesPage');
const OfflineSyncPage = lazyPage(() => import('@/features/sync/OfflineSyncPage'), 'OfflineSyncPage');
const AdminUsersPage = lazyPage(() => import('@/features/admin/AdminOversightPages'), 'AdminUsersPage');
const InstitutionsAdminPage = lazyPage(() => import('@/features/admin/AdminOversightPages'), 'InstitutionsAdminPage');
const SecurityAuditLogsPage = lazyPage(() => import('@/features/admin/AdminOversightPages'), 'SecurityAuditLogsPage');
const EnrollmentReviewPage = lazyPage(() => import('@/features/records/EnrollmentAndRecordsPages'), 'EnrollmentReviewPage');
const TraineeRecordsPage = lazyPage(() => import('@/features/records/EnrollmentAndRecordsPages'), 'TraineeRecordsPage');

function PageLoading() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500" role="status">
      Loading...
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ConnectivityAndSessionEffects({ children }: { children: React.ReactNode }) {
  const setOnline = useConnectivityStore((s) => s.setOnline);
  const markSynced = useConnectivityStore((s) => s.markSynced);
  const setLoading = useAuthStore((s) => s.setLoading);
  const setProfile = useAuthStore((s) => s.setProfile);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  React.useEffect(() => {
    let isMounted = true;
    const client = getSupabaseClient();

    const cleanupObservers = installOfflineQueueObservers(() => useAuthStore.getState().profile?.id);
    void pruneExpiredOfflineData().catch(() => undefined);
    void sanitizeLegacySyncOutbox()
      .then(async (count) => {
        if (count > 0) {
          const curUser = useAuthStore.getState().profile;
          if (curUser) {
            await refreshReactiveQueueCounts(curUser.id);
          }
          useConnectivityStore.getState().setSyncStatus('idle');
        }
      })
      .catch(() => undefined);

    const runAutomaticConnectivityCheck = async (alwaysSyncIfPending: boolean) => {
      const currentProfile = useAuthStore.getState().profile;
      const reachable = await verifyServerReachability();
      if (currentProfile) {
        const counts = await refreshReactiveQueueCounts(currentProfile.id);
        if (reachable && (!alwaysSyncIfPending || counts.pendingCount > 0)) {
          void triggerForegroundSync(currentProfile.id);
        }
      }
    };

    const onOnline = () => {
      void runAutomaticConnectivityCheck(false);
    };

    const onOffline = () => {
      useConnectivityStore.getState().setReachability(false, false);
    };

    const onVisibilityOrFocus = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void runAutomaticConnectivityCheck(true);
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('focus', onVisibilityOrFocus);
    document.addEventListener('visibilitychange', onVisibilityOrFocus);

    const recoveryHeartbeat = setInterval(() => {
      const conn = useConnectivityStore.getState();
      const currentProfile = useAuthStore.getState().profile;
      if (currentProfile && (!conn.isOnline || conn.pendingCount > 0)) {
        void runAutomaticConnectivityCheck(false);
      }
    }, 30_000);

    void runAutomaticConnectivityCheck(false);

    const detachListeners = () => {
      cleanupObservers();
      clearInterval(recoveryHeartbeat);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('focus', onVisibilityOrFocus);
      document.removeEventListener('visibilitychange', onVisibilityOrFocus);
    };

    async function hydrateUser(userId: string) {
      await pruneExpiredOfflineData().catch(() => undefined);
      const reachable = await verifyServerReachability();
      if (!reachable || !client) {
        const offlineProfile = await getUnexpiredOfflineProfileByUserId(userId);
        if (!isMounted) return;
        if (offlineProfile) {
          useAuthStore.getState().setOfflineOptIn(true);
          setProfile(offlineProfile, { isOfflineSession: true });
          await refreshReactiveQueueCounts(offlineProfile.id);
        } else {
          setLoading(false);
        }
        return;
      }

      try {
        const { profile } = await fetchAuthenticatedProfile(client, userId);
        if (!isMounted) return;
        if (profile) {
          await purgeOtherUsersCachedData(profile.id).catch(() => undefined);
          setProfile(profile, { isOfflineSession: false });
          useAuthStore.getState().setOfflineOptIn(true);
          // Keep the offline copy (app, records, queued uploads) from being evicted on low storage.
          void requestPersistentStorage();
          // Server just re-verified this session: slide the offline unlock window forward.
          const vaultExpiresAt = await extendOfflineUnlockWindow(profile).catch(() => null);
          await offlineDb.syncMeta.put({
            key: `user:${profile.id}`,
            userId: profile.id,
            lastSyncedAt: new Date().toISOString(),
            offlineEnabledForUser: true,
            offlineExpiresAt: vaultExpiresAt ?? offlineExpiryIsoForRole(profile.role),
            deviceId: 'browser-client',
          }).catch(() => undefined);

          const counts = await refreshReactiveQueueCounts(profile.id);
          if (counts.pendingCount > 0) {
            void triggerForegroundSync(profile.id).then(async () => {
              const latest = await offlineDb.syncMeta.get(`user:${profile.id}`).catch(() => undefined);
              if (latest?.lastSyncedAt && isMounted) {
                markSynced(latest.lastSyncedAt);
              }
            });
          } else {
            const syncedAt = await refreshOfflineCachesForUser(client, profile.id, profile.role).catch(
              () => null,
            );
            if (syncedAt && isMounted) markSynced(syncedAt);
          }
        } else {
          // Account is inactive or no longer resolvable on the server: drop its offline access too.
          await revokeOfflineUnlockCredentialsForUser(userId);
          clearAuth();
        }
      } catch {
        const offlineProfile = await getUnexpiredOfflineProfileByUserId(userId);
        if (!isMounted) return;
        if (offlineProfile) {
          setProfile(offlineProfile, { isOfflineSession: true });
          await refreshReactiveQueueCounts(offlineProfile.id);
        } else {
          clearAuth();
        }
      }
    }

    if (!client) {
      setLoading(false);
    } else {
      // Offline fast path. With an expired access token and no network, getSession() keeps
      // retrying the token refresh for ~25 s before giving up, leaving the user on a loading
      // screen. When the server is unreachable we resolve the start-up state ourselves: the
      // never-signed-out user gets their cached offline workspace (bounded by the vault TTL),
      // everyone else gets the login screen right away. getSession() still finishes later.
      let startupResolvedOffline = false;
      void verifyServerReachability().then(async (reachable) => {
        if (reachable || !isMounted || !useAuthStore.getState().isLoading) return;
        startupResolvedOffline = true;
        const persistedUserId = readPersistedSessionUserId();
        if (persistedUserId) {
          await hydrateUser(persistedUserId);
        }
        if (isMounted) setLoading(false);
      });

      client.auth
        .getSession()
        .then(async ({ data }) => {
          if (data.session?.user) {
            await hydrateUser(data.session.user.id);
            return;
          }

          // Opened offline with an expired access token: supabase-js cannot refresh it, but
          // the user never signed out, so reopen their cached offline workspace if allowed.
          const persistedUserId = readPersistedSessionUserId();
          if (persistedUserId && !(await verifyServerReachability())) {
            if (!startupResolvedOffline) await hydrateUser(persistedUserId);
            return;
          }

          if (!useAuthStore.getState().isOfflineSession) {
            clearAuth();
          }
        })
        .catch(() => {
          if (isMounted) setLoading(false);
        })
        .finally(() => {
          if (isMounted) setLoading(false);
        });

      const {
        data: { subscription },
      } = client.auth.onAuthStateChange((event, session) => {
        // The initial session is resolved by getSession() above; reacting here too would
        // race the offline restore and bounce the user to /login before it finishes.
        if (event === 'INITIAL_SESSION') return;
        if (event === 'SIGNED_OUT') {
          clearAuth();
          return;
        }
        if (!session?.user) {
          if (!useAuthStore.getState().isOfflineSession) {
            clearAuth();
          }
          return;
        }
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          void hydrateUser(session.user.id);
        }
      });

      return () => {
        isMounted = false;
        subscription.unsubscribe();
        detachListeners();
      };
    }

    return () => {
      isMounted = false;
      detachListeners();
    };
  }, [setOnline, markSynced, setLoading, setProfile, clearAuth]);

  return <>{children}</>;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ConnectivityAndSessionEffects>
          <PwaInstallBanner />
          <AppErrorBoundary>
          <React.Suspense fallback={<PageLoading />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/app" element={<LaunchRedirect />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayoutFixed />}>
                <Route element={<RoleRoute allowedRoles={[...STAFF_DASHBOARD_ROLES]} />}>
                  <Route path="/dashboard" element={<DashboardPage />} />
                </Route>
                <Route path="/sync" element={<OfflineSyncPage />} />
                <Route path="/user-guide" element={<UserGuidePage />} />
                <Route path="/announcements" element={<AnnouncementsPage />} />

                <Route element={<RoleRoute allowedRoles={['system_administrator', 'institutional_administrator', 'registrar', 'applicant', 'scholar']} />}>
                  <Route path="/intake" element={<TraineeIntakePage />} />
                </Route>

                <Route element={<RoleRoute allowedRoles={['system_administrator', 'institutional_administrator', 'registrar', 'focal_person', 'trainer', 'scholar', 'applicant']} />}>
                  <Route path="/schedules" element={<TrainingSchedulesPage />} />
                </Route>

                <Route element={<RoleRoute allowedRoles={['system_administrator', 'institutional_administrator', 'registrar']} />}>
                  <Route path="/enrollments" element={<EnrollmentReviewPage />} />
                  <Route path="/trainees" element={<TraineeRecordsPage />} />
                </Route>

                <Route element={<RoleRoute allowedRoles={['system_administrator', 'institutional_administrator', 'registrar', 'focal_person', 'trainer']} />}>
                  <Route path="/competency" element={<CompetencyAndAttendancePage />} />
                </Route>

                <Route element={<RoleRoute allowedRoles={['system_administrator', 'institutional_administrator', 'focal_person', 'trainer']} />}>
                  <Route path="/focal-operations" element={<OperationalDocsAndFormsPage />} />
                </Route>

                <Route element={<RoleRoute allowedRoles={['system_administrator', 'institutional_administrator', 'focal_person', 'trainer', 'scholar']} />}>
                  <Route path="/courses" element={<CoursesAndMaterialsPage />} />
                </Route>

                <Route element={<RoleRoute allowedRoles={['system_administrator', 'institutional_administrator', 'registrar', 'focal_person']} />}>
                  <Route path="/reports" element={<ReportsPage />} />
                </Route>

                <Route element={<RoleRoute allowedRoles={['applicant', 'scholar']} />}>
                  <Route path="/learner" element={<LearnerPortalPage />} />
                </Route>

                <Route element={<RoleRoute allowedRoles={['system_administrator', 'institutional_administrator', 'registrar']} />}>
                  <Route path="/admin/institutions" element={<InstitutionsAdminPage />} />
                </Route>

                <Route element={<RoleRoute allowedRoles={['system_administrator', 'institutional_administrator']} />}>
                  <Route path="/admin/users" element={<AdminUsersPage />} />
                  <Route path="/admin/audit" element={<SecurityAuditLogsPage />} />
                </Route>

                <Route path="/settings/password" element={<PasswordChangePage />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </React.Suspense>
          </AppErrorBoundary>
        </ConnectivityAndSessionEffects>
        <Toaster richColors position="top-right" />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
