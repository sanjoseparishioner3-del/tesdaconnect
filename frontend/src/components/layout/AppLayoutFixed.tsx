import React from 'react';
import {
  BookOpen,
  Building2,
  CalendarDays,
  CheckSquare,
  ClipboardCheck,
  FilePlus2,
  FileSpreadsheet,
  FolderKanban,
  GraduationCap,
  HelpCircle,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  RefreshCw,
  ShieldAlert,
  UserCog,
  Users,
  Wifi,
  WifiOff,
  X,
  Lock,
} from 'lucide-react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InstallAppButton } from '@/components/pwa/PwaInstallBanner';
import { SyncStatusIndicator } from '@/components/sync/SyncStatusIndicator';
import { purgeOfflineUserData } from '@/lib/db/dexie';
import { FLAT_SIDEBAR_ITEMS, type NavItemConfig, type NavSection } from '@/lib/rbac';
import { ROLE_LABELS } from '@/types/auth';
import { getSupabaseClient } from '@/lib/supabase';
import { cn, formatShortDateTime } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { DeviceLockOverlay } from '@/features/auth/components/DeviceLockOverlay';
import { DEFAULT_IDLE_LOCK_MS } from '@/lib/offline/offlineAuth';
import { useDeviceLockStore } from '@/stores/deviceLockStore';
import { useConnectivityStore } from '@/stores/connectivityStore';
import { TesdaLogo } from '@/components/branding/TesdaLogo';
import { LearnerBottomNav } from '@/components/layout/LearnerBottomNav';

const ICONS: Record<NavItemConfig['icon'], React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  FilePlus2,
  ClipboardCheck,
  Users,
  CalendarDays,
  CheckSquare,
  BookOpen,
  FolderKanban,
  Megaphone,
  FileSpreadsheet,
  RefreshCw,
  Building2,
  ShieldAlert,
  GraduationCap,
  UserCog,
  HelpCircle,
};

const SECTION_LABELS: Record<NavSection, string> = {
  overview: 'Overview',
  operations: 'Training Operations',
  records: 'Records & Reports',
  learner: 'Learner Portal',
  administration: 'Administration',
};

export function AppLayoutFixed() {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const activeInstitutionId = useAuthStore((s) => s.activeInstitutionId);
  const setActiveInstitution = useAuthStore((s) => s.setActiveInstitution);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const {
    isOnline,
    syncStatus,
    pendingCount,
    failedCount,
    conflictCount,
    lastSyncedAt,
    storageWarning,
    setStorageWarning,
  } = useConnectivityStore();
  const lockDevice = useDeviceLockStore((s) => s.lockDevice);
  const touchActivity = useDeviceLockStore((s) => s.touchActivity);

  React.useEffect(() => {
    const onActivity = () => touchActivity();
    window.addEventListener('pointerdown', onActivity, { passive: true });
    window.addEventListener('keydown', onActivity, { passive: true });

    const idleInterval = setInterval(() => {
      const lockState = useDeviceLockStore.getState();
      if (!lockState.isLocked && Date.now() - lockState.lastActivityAt >= DEFAULT_IDLE_LOCK_MS) {
        lockState.lockDevice('Locked automatically after inactivity on institutional device.');
      }
    }, 30_000);

    return () => {
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('keydown', onActivity);
      clearInterval(idleInterval);
    };
  }, [touchActivity]);

  const visibleItems = React.useMemo(() => {
    if (!profile) return [];
    return FLAT_SIDEBAR_ITEMS.filter((item) => item.roles.includes(profile.role));
  }, [profile]);

  const sections = React.useMemo(() => {
    const order: NavSection[] = ['overview', 'operations', 'records', 'learner', 'administration'];
    return order
      .map((section) => ({
        section,
        label: SECTION_LABELS[section],
        items: visibleItems.filter((item) => item.section === section),
      }))
      .filter((group) => group.items.length > 0);
  }, [visibleItems]);

  async function handleSignOut() {
    const currentUserId = profile?.id;
    // Signing out wipes this device's offline data, including changes not yet uploaded.
    const unsyncedCount = pendingCount + failedCount + conflictCount;
    if (unsyncedCount > 0) {
      const proceed = window.confirm(
        `You have ${unsyncedCount} change(s) or file(s) that have not been uploaded yet.\n\n` +
          'Signing out will permanently delete them from this device. ' +
          'Connect to the internet and wait for "Synced" first if you want to keep them.\n\n' +
          'Sign out anyway?',
      );
      if (!proceed) return;
    }
    try {
      const client = getSupabaseClient();
      if (client && isOnline) {
        await client.auth.signOut();
      }
      await purgeOfflineUserData(undefined, currentUserId);
      clearAuth();
      toast.success('Signed out and cleared device offline PII cache.');
      void navigate('/login');
    } catch {
      await purgeOfflineUserData(undefined, currentUserId);
      clearAuth();
      void navigate('/login');
    }
  }

  const initials = React.useMemo(() => {
    if (!profile?.fullName) return 'TC';
    return profile.fullName
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }, [profile?.fullName]);

  const sidebarContent = (
    <div className="flex h-full flex-col bg-gradient-to-b from-emerald-900 via-emerald-800 to-emerald-950 text-slate-50">
      {/* HEADER */}
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-3 py-3">
        <Link
          to={profile?.role === 'scholar' || profile?.role === 'applicant' ? '/learner' : '/dashboard'}
          className="flex items-center gap-2.5"
          onClick={() => setMobileOpen(false)}
        >
          {sidebarCollapsed ? (
            <TesdaLogo size="sm" variant="icon-only" />
          ) : (
            <TesdaLogo size="md" variant="white" showSubtitle />
          )}
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="rounded-md p-1 text-slate-200 hover:bg-white/10 lg:hidden"
          aria-label="Close navigation"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* NAVIGATION - Independent scrolling */}
      <nav
        className="flex-1 space-y-3 overflow-y-auto overflow-x-hidden px-2.5 py-3"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(16, 185, 129, 0.3) transparent',
        }}
        aria-label="Primary navigation"
      >
        {sections.map((group) => (
          <div key={group.section} className="space-y-1">
            <p className="px-2 text-[10px] font-extrabold uppercase tracking-wider text-emerald-300">
              {group.label}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = ICONS[item.icon];
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all',
                          isActive
                            ? 'bg-white text-emerald-900 shadow-sm'
                            : 'text-emerald-50 hover:bg-white/10 hover:text-white',
                        )
                      }
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <Icon className="h-4 w-4 shrink-0" />
                        {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                      </span>
                      {item.to === '/sync' && !sidebarCollapsed && (pendingCount > 0 || conflictCount > 0) && (
                        <Badge
                          variant={conflictCount > 0 ? 'warning' : 'info'}
                          className="h-5 px-1.5 text-[10px]"
                        >
                          {conflictCount > 0 ? `${conflictCount}!` : pendingCount}
                        </Badge>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* FOOTER - Connection Status + User Profile */}
      <div className="shrink-0 space-y-2 border-t border-white/10 bg-emerald-950/50 p-2.5">
        {/* Connection Status */}
        <Link
          to="/sync"
          className="block rounded-lg border border-emerald-700/30 bg-emerald-900/30 p-2 text-xs transition hover:bg-emerald-900/50"
          title="Buksan ang Offline & Sync Queue"
        >
          <div className="flex items-center justify-between gap-1.5">
            <span className="flex items-center gap-1.5 font-semibold text-emerald-200">
              {isOnline ? (
                <Wifi className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <WifiOff className="h-3.5 w-3.5 text-amber-400" />
              )}
              {!sidebarCollapsed && (isOnline ? 'Online' : 'Offline')}
            </span>
            {!sidebarCollapsed && (
              <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                syncStatus === 'error'
                  ? 'bg-rose-900/80 text-rose-200'
                  : syncStatus === 'syncing'
                    ? 'bg-blue-900/80 text-blue-200 animate-pulse'
                    : 'bg-emerald-800/50 text-emerald-100'
              }`}>
                {syncStatus}
              </span>
            )}
          </div>
          {!sidebarCollapsed && (
            <>
              <p className="mt-1 text-[10px] text-emerald-200">
                Last: {lastSyncedAt ? formatShortDateTime(lastSyncedAt) : 'Not synced'}
              </p>
              {(pendingCount > 0 || conflictCount > 0) && (
                <p className="mt-0.5 text-[10px] font-medium text-amber-300">
                  {pendingCount} pending · {conflictCount} conflict(s)
                </p>
              )}
            </>
          )}
        </Link>

        {/* User Profile */}
        {profile && (
          <div className="flex items-center gap-2 rounded-lg bg-white/5 p-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-400 text-xs font-black text-emerald-950">
              {initials}
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-white">{profile.fullName}</p>
                <p className="truncate text-[10px] text-emerald-200">{ROLE_LABELS[profile.role]}</p>
              </div>
            )}
          </div>
        )}

        {/* Install App Shortcut */}
        {!sidebarCollapsed && (
          <InstallAppButton className="w-full justify-center border-emerald-600/40 bg-emerald-800/40 text-emerald-100 hover:bg-emerald-800/70 hover:text-white" />
        )}

        {/* Sign Out Button */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSignOut}
          className={cn(
            'w-full border-emerald-700/50 bg-transparent text-emerald-100 hover:bg-white/10 hover:text-white',
            sidebarCollapsed && 'justify-center px-2',
          )}
        >
          <LogOut className="h-3.5 w-3.5" />
          {!sidebarCollapsed && <span className="ml-2">Sign out</span>}
        </Button>
      </div>
    </div>
  );

  return (
    <>
      {/* FIXED VIEWPORT LAYOUT - NO SCROLLING SIDEBAR */}
      <div className="fixed inset-0 flex overflow-hidden bg-slate-50">
        {/* SIDEBAR - Desktop (hidden on mobile) */}
        <aside
          className={cn(
            'no-print hidden shrink-0 transition-all duration-300 lg:block',
            sidebarCollapsed ? 'w-16' : 'w-64',
          )}
        >
          {sidebarContent}
        </aside>

        {/* MOBILE SIDEBAR OVERLAY */}
        {mobileOpen && (
          <div className="no-print fixed inset-0 z-50 flex lg:hidden">
            <div className="absolute inset-0 bg-slate-950/60" onClick={() => setMobileOpen(false)} />
            <div className="relative z-10 w-72 shadow-2xl">{sidebarContent}</div>
          </div>
        )}

        {/* MAIN CONTENT AREA - Independent scrolling */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* STICKY HEADER */}
          <header className="no-print sticky top-0 z-30 flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur-sm sm:px-4 sm:py-2.5 lg:px-5">
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-2.5">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="shrink-0 rounded-lg border border-slate-300 p-2 text-slate-700 hover:bg-slate-100 lg:hidden"
                aria-label="Open navigation"
              >
                <Menu className="h-5 w-5" />
              </button>
              
              {/* Desktop Sidebar Toggle */}
              <button
                type="button"
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="hidden rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 lg:block"
                aria-label="Toggle sidebar"
                title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                <Menu className="h-4 w-4" />
              </button>

              <div className="min-w-0">
                <p className="hidden text-[11px] font-medium text-slate-500 sm:block">TESDA Training Operations</p>
                <div className="flex min-w-0 items-center gap-2">
                  <p className="truncate text-[13px] font-semibold text-slate-900 sm:text-sm">
                    {profile?.institutions?.find((i) => i.institutionId === activeInstitutionId)?.name ??
                      profile?.institutions?.[0]?.name ??
                      'Unified Workspace'}
                  </p>
                  {profile && profile.institutions.length > 1 && (
                    <select
                      aria-label="Switch campus"
                      value={activeInstitutionId ?? '__all__'}
                      onChange={(e) =>
                        setActiveInstitution(e.target.value === '__all__' ? null : e.target.value)
                      }
                      className="h-6 rounded-md border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-700"
                    >
                      {profile.role === 'system_administrator' && <option value="__all__">All Campuses</option>}
                      {profile.institutions.map((inst) => (
                        <option key={inst.institutionId} value={inst.institutionId}>
                          {inst.code}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
              <InstallAppButton className="hidden md:inline-flex" />
              {/* One status indicator: Offline / Syncing / Pending / Action required / Up to date. */}
              <SyncStatusIndicator />
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => lockDevice('Locked manually.')}
                title="Lock session"
                className="h-7 px-2"
              >
                <Lock className="h-3.5 w-3.5" />
              </Button>
              <Button asChild type="button" size="sm" variant="ghost" className="hidden h-7 px-2 sm:inline-flex">
                <Link to="/settings/password">
                  <KeyRound className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </header>

          {/* Storage Warning */}
          {storageWarning && (
            <div className="mx-4 mt-2 flex items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 lg:mx-5">
              <span>{storageWarning}</span>
              <button
                type="button"
                onClick={() => setStorageWarning(null)}
                className="font-semibold underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* MAIN WORKSPACE - Independently scrollable */}
          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            <div className="p-3 sm:p-4 lg:p-6">
              {/* Keeps the header, sidebar and bottom bar on screen while a page chunk loads. */}
              <React.Suspense
                fallback={
                  <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500" role="status">
                    Loading...
                  </div>
                }
              >
                <Outlet />
              </React.Suspense>
            </div>
          </main>

          {(profile?.role === 'scholar' || profile?.role === 'applicant') && <LearnerBottomNav />}
        </div>
      </div>

      <DeviceLockOverlay />
    </>
  );
}
