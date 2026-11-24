import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Download, ShieldAlert, UserCog } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Pagination, usePagination } from '@/components/ui/pagination';
import { offlineDb } from '@/lib/db/dexie';
import { isSupabaseConfigured } from '@/lib/env';
import { getSupabaseClient } from '@/lib/supabase';
import { formatShortDateTime, sanitizeCsvCell } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useConnectivityStore } from '@/stores/connectivityStore';
import { APP_ROLES, ROLE_LABELS, type AppRole } from '@/types/auth';

interface AdminUserRow {
  id: string;
  email: string;
  full_name: string;
  role: string;
  account_status: 'active' | 'inactive' | 'pending_approval';
  last_login_at: string | null;
}

interface AuditLogRow {
  id: string;
  event: string;
  description: string;
  created_at: string;
  actor_user_id: string | null;
}

export function AdminUsersPage() {
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'pending_approval' | 'active' | 'inactive'>('all');

  const usersQuery = useQuery<AdminUserRow[]>({
    queryKey: ['admin-users'],
    enabled: isSupabaseConfigured && Boolean(profile?.id),
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return [];
      const { data, error } = await client
        .from('profiles')
        .select('id, email, full_name, role, account_status, last_login_at')
        .order('created_at', { ascending: false })
        .limit(100)
        .returns<AdminUserRow[]>();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async (params: {
      targetUserId: string;
      role?: AppRole;
      accountStatus?: 'active' | 'inactive' | 'pending_approval';
    }) => {
      const client = getSupabaseClient();
      if (!client) throw new Error('Supabase client unavailable.');
      if (params.targetUserId === profile?.id) {
        throw new Error('Self-role or self-deactivation modifications are blocked by policy.');
      }

      const invokeRes = (await client.functions.invoke<{ ok?: boolean; error?: string }>('admin-user-management', {
        body: {
          action: 'update_role_or_status',
          targetUserId: params.targetUserId,
          role: params.role,
          accountStatus: params.accountStatus,
        },
      })) as { data: { ok?: boolean; error?: string } | null; error: { message?: string } | null };
      if (invokeRes.error) throw new Error(invokeRes.error.message ?? 'Edge Function invocation failed.');
      if (invokeRes.data?.error) throw new Error(invokeRes.data.error);
    },
    onSuccess: async () => {
      toast.success('Updated user access and recorded security audit trail.');
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const allUsers = usersQuery.data ?? [];
  const pendingCount = allUsers.filter((u) => u.account_status === 'pending_approval').length;
  const filteredUsers = allUsers.filter((u) => statusFilter === 'all' || u.account_status === statusFilter);
  const usersPagination = usePagination({
    totalRecords: filteredUsers.length,
    initialPageSize: 10,
  });
  const pagedUsers = filteredUsers.slice(usersPagination.startIndex, usersPagination.endIndex);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <UserCog className="h-6 w-6 text-teal-700" /> Users, Account Requests &amp; Role Access
          </h1>
          <p className="text-sm text-slate-500">
            Registration approval queue, activation/deactivation via <code className="rounded bg-slate-100 px-1">admin-user-management</code>, and self-privilege escalation prevention.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant={statusFilter === 'all' ? 'secondary' : 'outline'} onClick={() => setStatusFilter('all')}>
            All Users ({allUsers.length})
          </Button>
          <Button type="button" size="sm" variant={statusFilter === 'pending_approval' ? 'secondary' : 'outline'} onClick={() => setStatusFilter('pending_approval')}>
            Account Requests ({pendingCount})
          </Button>
          <Button type="button" size="sm" variant={statusFilter === 'inactive' ? 'secondary' : 'outline'} onClick={() => setStatusFilter('inactive')}>
            Inactive
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Authorization Guardrails Active</CardTitle>
          <CardDescription>
            PostgreSQL trigger <code className="rounded bg-slate-100 px-1">prevent_self_privilege_escalation</code> guarantees no user can elevate or alter their own role even via direct API calls.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredUsers.length === 0 ? (
            <p className="text-sm text-slate-600">
              {isSupabaseConfigured
                ? 'No users match the selected account status filter.'
                : 'Deactivating a staff or learner account immediately revokes active Supabase refresh sessions via ban_duration and logs an immutable audit entry.'}
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="py-2 pr-4">User</th>
                    <th className="py-2 pr-4">Role</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Last Login</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedUsers.map((u) => {
                    const isSelf = u.id === profile?.id;
                    return (
                      <tr key={u.id}>
                        <td className="py-2.5 pr-4">
                          <p className="font-medium text-slate-900">{u.full_name}</p>
                          <p className="text-xs text-slate-500">{u.email}</p>
                        </td>
                        <td className="py-2.5 pr-4">
                          <select
                            aria-label={`Role for ${u.email}`}
                            disabled={isSelf || updateUserMutation.isPending}
                            value={u.role}
                            onChange={(e) =>
                              updateUserMutation.mutate({
                                targetUserId: u.id,
                                role: e.target.value as AppRole,
                              })
                            }
                            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                          >
                            {APP_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-2.5 pr-4">
                          <Badge variant={u.account_status === 'active' ? 'success' : 'warning'}>{u.account_status}</Badge>
                        </td>
                        <td className="py-2.5 pr-4 text-xs text-slate-500">{formatShortDateTime(u.last_login_at)}</td>
                        <td className="py-2.5">
                          {isSelf ? (
                            <span className="text-xs text-slate-400">Current Session (Protected)</span>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant={u.account_status === 'active' ? 'outline' : 'secondary'}
                              disabled={updateUserMutation.isPending}
                              onClick={() =>
                                updateUserMutation.mutate({
                                  targetUserId: u.id,
                                  accountStatus: u.account_status === 'active' ? 'inactive' : 'active',
                                })
                              }
                            >
                              {u.account_status === 'active' ? 'Deactivate' : u.account_status === 'pending_approval' ? 'Approve' : 'Activate'}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 border-t border-slate-100 pt-4">
              <Pagination
                currentPage={usersPagination.currentPage}
                totalPages={usersPagination.totalPages}
                totalRecords={filteredUsers.length}
                pageSize={usersPagination.pageSize}
                onPageChange={usersPagination.goToPage}
                onPageSizeChange={usersPagination.setPageSize}
              />
            </div>
          </>
        )}
        </CardContent>
      </Card>
    </div>
  );
}

export { InstitutionsAdminPage } from './InstitutionsAdminPage';

export function SecurityAuditLogsPage() {
  const profile = useAuthStore((s) => s.profile);
  const { isOnline, pendingCount, conflictCount, lastSyncedAt } = useConnectivityStore();
  const [tab, setTab] = React.useState<'audit' | 'health'>('audit');

  const logsQuery = useQuery<AuditLogRow[]>({
    queryKey: ['security-audit-logs'],
    enabled: isSupabaseConfigured && Boolean(profile?.id) && tab === 'audit',
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return [];
      const { data, error } = await client
        .from('security_audit_logs')
        .select('id, event, description, created_at, actor_user_id')
        .order('created_at', { ascending: false })
        .limit(100)
        .returns<AuditLogRow[]>();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const localCountsQuery = useQuery({
    queryKey: ['dexie-health-stats', profile?.id],
    enabled: tab === 'health',
    queryFn: async () => {
      const [drafts, outbox, conflicts, schedules, bulletins] = await Promise.all([
        offlineDb.localDrafts.count(),
        offlineDb.syncOutbox.count(),
        offlineDb.conflicts.count(),
        offlineDb.cachedSchedules.count(),
        offlineDb.cachedAnnouncements.count(),
      ]);
      return { drafts, outbox, conflicts, schedules, bulletins };
    },
  });

  const logs = logsQuery.data ?? [];
  const logsPagination = usePagination({
    totalRecords: logs.length,
    initialPageSize: 10,
  });
  const pagedLogs = logs.slice(logsPagination.startIndex, logsPagination.endIndex);

  function handleExportAuditCsv() {
    const rows = logs;
    const header = ['Timestamp', 'Event', 'Actor ID', 'Description'].map((c) => sanitizeCsvCell(c)).join(',');
    const body = rows.map((r) =>
      [r.created_at, r.event, r.actor_user_id ?? 'system', r.description].map((c) => sanitizeCsvCell(c)).join(','),
    );
    const csv = `${[header, ...body].join('\n')}\n`;
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `security-audit-logs-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} immutable audit log row(s).`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <ShieldAlert className="h-6 w-6 text-teal-700" /> Security, Audit Logs &amp; System Health
          </h1>
          <p className="text-sm text-slate-500">
            Tamper-protected audit trail and PostgreSQL / offline sync engine health diagnostics.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant={tab === 'audit' ? 'secondary' : 'outline'} onClick={() => setTab('audit')}>
            Audit Logs
          </Button>
          <Button type="button" size="sm" variant={tab === 'health' ? 'secondary' : 'outline'} onClick={() => setTab('health')}>
            <Activity className="h-3.5 w-3.5" /> System &amp; Sync Health
          </Button>
          {tab === 'audit' && (
            <Button type="button" size="sm" variant="outline" onClick={handleExportAuditCsv}>
              <Download className="h-4 w-4" /> Export Audit CSV
            </Button>
          )}
        </div>
      </div>

      {tab === 'audit' && (
        <Card>
          <CardHeader>
            <CardTitle>Append-Only Audit Enforcement</CardTitle>
            <CardDescription>PostgreSQL trigger blocks UPDATE and DELETE statements on <code className="rounded bg-slate-100 px-1">security_audit_logs</code>.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">
            {logs.length === 0 ? (
              <p>CSV/Excel audit exports use formula-injection neutralization across every logged metadata cell.</p>
            ) : (
              <>
                <div className="space-y-2">
                  {pagedLogs.map((log) => (
                    <div key={log.id} className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
                      <div className="flex items-center justify-between font-medium text-slate-900">
                        <span>{log.event}</span>
                        <span className="text-slate-400">{formatShortDateTime(log.created_at)}</span>
                      </div>
                      <p className="mt-1 text-slate-600">{log.description}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4 border-t border-slate-100 pt-4">
                  <Pagination
                    currentPage={logsPagination.currentPage}
                    totalPages={logsPagination.totalPages}
                    totalRecords={logs.length}
                    pageSize={logsPagination.pageSize}
                    onPageChange={logsPagination.goToPage}
                    onPageSizeChange={logsPagination.setPageSize}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'health' && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Managed PostgreSQL &amp; Auth Health</CardTitle>
              <CardDescription>Replaces legacy SQLite backup health check with managed Supabase readiness.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-700">
              <p>Supabase Env Configured: <strong>{isSupabaseConfigured ? 'Yes' : 'Pending (.env.local)'}</strong></p>
              <p>Network Status: <strong>{isOnline ? 'Online' : 'Offline'}</strong></p>
              <p>90-Day Staff Inactivity Auto-Lock RPC: <code className="rounded bg-slate-100 px-1">lock_inactive_staff_accounts()</code></p>
              <p>Last Successful Cache Sync: {formatShortDateTime(lastSyncedAt)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Client IndexedDB (Dexie) Store Health</CardTitle>
              <CardDescription>Live browser persistence counters cleared automatically upon sign-out.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm text-slate-700">
              <p>Pending Sync Mutations: <strong>{pendingCount}</strong> (Outbox records: {localCountsQuery.data?.outbox ?? 0})</p>
              <p>Open Merge Conflicts: <strong>{conflictCount}</strong> (Conflict table: {localCountsQuery.data?.conflicts ?? 0})</p>
              <p>Local Drafts: <strong>{localCountsQuery.data?.drafts ?? 0}</strong></p>
              <p>Cached Schedules / Bulletins: <strong>{localCountsQuery.data?.schedules ?? 0}</strong> / <strong>{localCountsQuery.data?.bulletins ?? 0}</strong></p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
