import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { canAccessRoute, isPasswordUpdateRequired } from '@/lib/rbac';
import { useAuthStore } from '@/stores/authStore';
import type { AppRole } from '@/types/auth';

export function ProtectedRoute() {
  const profile = useAuthStore((s) => s.profile);
  const isLoading = useAuthStore((s) => s.isLoading);
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600">
        Verifying session state...
      </div>
    );
  }

  if (!profile || profile.accountStatus !== 'active') {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (isPasswordUpdateRequired(profile) && location.pathname !== '/settings/password') {
    return <Navigate to="/settings/password" replace />;
  }

  return <Outlet />;
}

export function RoleRoute({ allowedRoles }: { allowedRoles: AppRole[] }) {
  const profile = useAuthStore((s) => s.profile);
  const location = useLocation();

  if (!canAccessRoute(profile, allowedRoles)) {
    if (profile && (profile.role === 'scholar' || profile.role === 'applicant') && location.pathname === '/dashboard') {
      return <Navigate to="/learner" replace />;
    }
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-900">
        <h2 className="font-semibold">Access Restricted</h2>
        <p className="mt-1">
          Your current role does not permit access to this workspace. Note that server-side PostgreSQL RLS enforces the same boundary.
        </p>
      </div>
    );
  }

  return <Outlet />;
}
