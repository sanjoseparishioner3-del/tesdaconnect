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
} from 'lucide-react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { purgeOfflineUserData } from '@/lib/db/dexie';
import { FLAT_SIDEBAR_ITEMS, type NavItemConfig, type NavSection } from '@/lib/rbac';
import { getSupabaseClient } from '@/lib/supabase';
import { cn, formatShortDateTime } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { DeviceLockOverlay } from '@/features/auth/components/DeviceLockOverlay';
import { DEFAULT_IDLE_LOCK_MS } from '@/lib/offline/offlineAuth';
import { useDeviceLockStore } from '@/stores/deviceLockStore';
import { Lock } from 'lucide-react';
import { useConnectivityStore } from '@/stores/connectivityStore';
import { ROLE_LABELS } from '@/types/auth';

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
  overview: 'Workspace & Sync',
  operations: 'Training Operations',
  records: 'Records & Reporting',
  learner: 'Learner Portal',
  administration: 'System Oversight',
};

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const activeInstitutionId = useAuthStore((s) => s.activeInstitutionId);
  const setActiveInstitution = useAuthStore((s) => s.setActiveInstitution);
  const isOfflineSession = useAuthStore((s) => s.isOfflineSession);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const { isOnline, syncStatus, pendingCount, failedCount, conflictCount, lastSyncedAt, storageWarning, setStorageWarning } =
    useConnectivityStore();
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
    <div className="flex h-full flex-col bg-[#0f295c] text-slate-100">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white font-bold text-[#0f295c] shadow-xs">
            TC
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold tracking-tight">
              <span className="text-white">TESDA</span>
              <span className="text-amber-400">Connect</span>
            </p>
            <p className="truncate text-[11px] text-slate-300">Training Operations</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 lg:hidden"
          aria-label="Close navigation"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Flat non-collapsible navigation */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Primary navigation">
        {sections.map((group) => (
          <div key={group.section}>
            <p className="mb-1.5 px-2.5 text-[11px] font-semibold tracking-wider text-teal-300/90 uppercase">
              {group.label}
            </p>
            <ul className="space-y-1">
              {group.items.map((item) => {
                const Icon = ICONS[item.icon];
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-teal-600 text-white shadow-xs'
                            : 'text-slate-200 hover:bg-white/10 hover:text-white',
                        )
                      }
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </span>
                      {item.to === '/sync' && (pendingCount > 0 || conflictCount > 0) && (
                        <Badge
                          variant={conflictCount > 0 ? 'warning' : 'info'}
                          className="px-1.5 py-0 text-[10px]"
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

      {/* Connectivity + Offline Status Footer */}
      <div className="space-y-3 border-t border-white/10 p-3">
        <div className="rounded-xl border border-white/15 bg-white/5 p-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 font-semibold text-teal-200">
              {isOnline ? <Wifi className="h-3.5 w-3.5 text-emerald-400" /> : <WifiOff className="h-3.5 w-3.5 text-amber-400" />}
              {isOnline ? 'Online' : 'Offline Mode'}
            </span>
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase text-slate-200">
              {syncStatus}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-slate-300">
            Last sync: {lastSyncedAt ? formatShortDateTime(lastSyncedAt) : 'Not yet synced'}
          </p>
          {(pendingCount > 0 || conflictCount > 0) && (
            <p className="mt-1 text-[11px] font-medium text-amber-300">
              {pendingCount} pending · {conflictCount} conflict(s)
            </p>
          )}
        </div>

        {profile && (
          <div className="flex items-center gap-2.5 rounded-xl bg-white/10 p-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-400 font-bold text-slate-950">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-white">{profile.fullName}</p>
              <p className="truncate text-[11px] text-slate-300">{ROLE_LABELS[profile.role]}</p>
            </div>
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSignOut}
          className="w-full justify-center border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Sign out & wipe device cache
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="no-print hidden w-68 shrink-0 lg:block">{sidebarContent}</aside>

      {mobileOpen && (
        <div className="no-print fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-slate-950/50" onClick={() => setMobileOpen(false)} />
          <div className="relative z-10 w-72">{sidebarContent}</div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-sm lg:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg border border-slate-200 p-1.5 text-slate-700 hover:bg-slate-100 lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <p className="text-xs font-medium text-slate-500">TESDA Training Operations Support</p>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-slate-900">
                  {profile?.institutions?.find((i) => i.institutionId === activeInstitutionId)?.name ??
                    profile?.institutions?.[0]?.name ??
                    'BST & MIF Unified Operations'}
                </p>
                {profile && profile.institutions.length > 1 && (
                  <select
                    aria-label="Switch authorized campus workspace"
                    value={activeInstitutionId ?? '__all__'}
                    onChange={(e) =>
                      setActiveInstitution(e.target.value === '__all__' ? null : e.target.value)
                    }
                    className="h-7 rounded-md border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-700"
                  >
                    {profile.role === 'system_administrator' && (
                      <option value="__all__">All Campuses</option>
                    )}
                    {profile.institutions.map((inst) => (
                      <option key={inst.institutionId} value={inst.institutionId}>
                        {inst.code} — {inst.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isOfflineSession && (
              <Badge variant="warning">Cached Offline Session</Badge>
            )}
            <Badge
              variant={
                !isOnline || syncStatus === 'reauth_required' || conflictCount > 0 || failedCount > 0 || pendingCount > 0
                  ? 'warning'
                  : 'success'
              }
            >
              {!isOnline
                ? pendingCount > 0
                  ? `Offline — ${pendingCount} Pending Sync`
                  : 'Offline — Local Cache Ready'
                : syncStatus === 'syncing'
                  ? 'Syncing...'
                  : syncStatus === 'reauth_required'
                    ? 'Re-auth Required to Sync'
                    : conflictCount > 0
                      ? `${conflictCount} Conflict(s) — Review`
                      : failedCount > 0
                        ? `${failedCount} Failed Sync — Review`
                        : pendingCount > 0
                          ? `Pending Sync (${pendingCount})`
                          : syncStatus === 'synced'
                            ? 'Online — Synced'
                            : 'Connected'}
            </Badge>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => lockDevice('Locked manually for shared computer protection.')}
              title="Lock session on shared computer while keeping pending offline work"
            >
              <Lock className="h-3.5 w-3.5" /> Lock
            </Button>
            <Button asChild type="button" size="sm" variant="outline">
              <Link to="/settings/password">
                <KeyRound className="h-3.5 w-3.5" /> Account &amp; Security
              </Link>
            </Button>
          </div>
        </header>

        {storageWarning && (
          <div className="mx-4 mt-3 flex items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs text-amber-900 lg:mx-6">
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

        <main className="flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
        <DeviceLockOverlay />
      </div>
    </div>
  );
}
