import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ProtectedRoute, RoleRoute } from '@/app/AuthGuards';
import { STAFF_DASHBOARD_ROLES } from '@/lib/rbac';
import { AppLayoutFixed } from '@/components/layout/AppLayoutFixed';
import { AdminUsersPage, InstitutionsAdminPage, SecurityAuditLogsPage } from '@/features/admin/AdminOversightPages';
import { AnnouncementsPage } from '@/features/announcements/AnnouncementsPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { PasswordChangePage } from '@/features/auth/PasswordChangePage';
import { CompetencyAndAttendancePage } from '@/features/competency/CompetencyAndAttendancePage';
import { CoursesAndMaterialsPage } from '@/features/courses/CoursesAndMaterialsPage';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { OperationalDocsAndFormsPage } from '@/features/focal/OperationalDocsAndFormsPage';
import { UserGuidePage } from '@/features/help/UserGuidePage';
import { TraineeIntakePage } from '@/features/intake/TraineeIntakePage';
import { LandingPage } from '@/features/landing/LandingPage';
import { LearnerPortalPage } from '@/features/learner/LearnerPortalPage';
import { EnrollmentReviewPage, TraineeRecordsPage } from '@/features/records/EnrollmentAndRecordsPages';
import { ReportsPage } from '@/features/reports/ReportsPage';
import { TrainingSchedulesPage } from '@/features/schedules/TrainingSchedulesPage';
import { OfflineSyncPage } from '@/features/sync/OfflineSyncPage';
import { fetchAuthenticatedProfile, refreshOfflineCachesForUser } from '@/lib/authProfile';
import { offlineDb, pruneExpiredOfflineData, purgeOtherUsersCachedData } from '@/lib/db/dexie';
import { getUnexpiredOfflineProfileByUserId, seedDemoOfflineAccounts } from '@/lib/offline/offlineAuth';
import { getSupabaseClient } from '@/lib/supabase';
import { installOfflineQueueObservers, refreshReactiveQueueCounts, verifyServerReachability } from '@/lib/sync/connectivityMonitor';
import { triggerForegroundSync } from '@/lib/sync/supabaseTransport';
import { sanitizeLegacySyncOutbox } from '@/lib/sync/syncEngine';
import { useAuthStore } from '@/stores/authStore';
import { useConnectivityStore } from '@/stores/connectivityStore';

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
    void seedDemoOfflineAccounts().catch(() => undefined);
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
          await offlineDb.syncMeta.put({
            key: `user:${profile.id}`,
            userId: profile.id,
            lastSyncedAt: new Date().toISOString(),
            offlineEnabledForUser: true,
            offlineExpiresAt: new Date(Date.now() + 12 * 3600 * 1000).toISOString(),
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
      client.auth
        .getSession()
        .then(async ({ data }) => {
          if (data.session?.user) {
            await hydrateUser(data.session.user.id);
          } else {
            const currentOffline = useAuthStore.getState();
            if (!currentOffline.isOfflineSession) {
              clearAuth();
            }
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
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />

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
        </ConnectivityAndSessionEffects>
        <Toaster richColors position="top-right" />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
