import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertCircle, Building2, CalendarDays, ClipboardCheck, GraduationCap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { isSupabaseConfigured } from '@/lib/env';
import { getSupabaseClient } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useConnectivityStore } from '@/stores/connectivityStore';
import { ROLE_LABELS } from '@/types/auth';

interface BatchCapacityRow {
  id: string;
  code: string;
  capacity: number;
}

interface InstitutionMetricRow {
  code: string;
  name: string;
  confirmedCount: number;
  pendingCount: number;
}

interface DashboardMetricsData {
  institutionCount: number;
  pendingCount: number;
  activeBatchCount: number;
  certifiedCount: number;
  confirmedUnscheduledCount: number;
  batchMetrics: Array<{ batch: string; enrolled: number; capacity: number }>;
  campusComparison: InstitutionMetricRow[];
}

export function DashboardPage() {
  const profile = useAuthStore((s) => s.profile);
  const isOnline = useConnectivityStore((s) => s.isOnline);

  const metricsQuery = useQuery<DashboardMetricsData>({
    queryKey: ['dashboard-metrics', profile?.id],
    enabled: isSupabaseConfigured && isOnline && Boolean(profile?.id),
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) {
        return {
          institutionCount: 0,
          pendingCount: 0,
          activeBatchCount: 0,
          certifiedCount: 0,
          confirmedUnscheduledCount: 0,
          batchMetrics: [],
          campusComparison: [],
        };
      }

      const [instRes, pendingRes, batchesRes, certRes, appsRes] = await Promise.all([
        client.from('institutions').select('id, code, name').eq('is_active', true).order('code', { ascending: true }),
        client
          .from('enrollment_applications')
          .select('id', { count: 'exact', head: true })
          .is('archived_at', null)
          .in('application_status', ['submitted', 'verified']),
        client
          .from('training_batches')
          .select('id, code, capacity')
          .is('archived_at', null)
          .in('status', ['upcoming', 'in_training'])
          .order('starts_at', { ascending: true })
          .limit(8),
        client.from('competency_progress').select('id', { count: 'exact', head: true }).eq('status', 'competent'),
        client
          .from('enrollment_applications')
          .select('institution_id, application_status, training_batch_id')
          .is('archived_at', null)
          .in('application_status', ['submitted', 'verified', 'confirmed'])
          .limit(500),
      ]);

      const countByBatch = new Map<string, number>();
      const instStats = new Map<string, { confirmed: number; pending: number }>();
      let unscheduled = 0;

      for (const app of (appsRes.data ?? []) as Array<{
        institution_id: string;
        application_status: string;
        training_batch_id: string | null;
      }>) {
        if (app.training_batch_id) {
          countByBatch.set(app.training_batch_id, (countByBatch.get(app.training_batch_id) ?? 0) + 1);
        } else if (app.application_status === 'confirmed') {
          unscheduled += 1;
        }
        const curr = instStats.get(app.institution_id) ?? { confirmed: 0, pending: 0 };
        if (app.application_status === 'confirmed') curr.confirmed += 1;
        else curr.pending += 1;
        instStats.set(app.institution_id, curr);
      }

      const batches = (batchesRes.data ?? []) as BatchCapacityRow[];
      const batchMetrics = batches.map((b) => ({
        batch: b.code,
        enrolled: countByBatch.get(b.id) ?? 0,
        capacity: b.capacity,
      }));

      const institutions = (instRes.data ?? []) as Array<{ id: string; code: string; name: string }>;
      const campusComparison: InstitutionMetricRow[] = institutions.map((inst) => {
        const s = instStats.get(inst.id) ?? { confirmed: 0, pending: 0 };
        return {
          code: inst.code,
          name: inst.name,
          confirmedCount: s.confirmed,
          pendingCount: s.pending,
        };
      });

      return {
        institutionCount: institutions.length,
        pendingCount: pendingRes.count ?? 0,
        activeBatchCount: batches.length,
        certifiedCount: certRes.count ?? 0,
        confirmedUnscheduledCount: unscheduled,
        batchMetrics,
        campusComparison,
      };
    },
  });

  const stats = metricsQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Operations Dashboard</h1>
          <p className="text-sm text-slate-500">
            Role workspace: {profile ? ROLE_LABELS[profile.role] : 'Authenticated User'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="secondary">
            <Link to="/intake">Registration Intake</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/sync">View Sync Queue</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/user-guide">Role Handbook</Link>
          </Button>
        </div>
      </div>

      {!isSupabaseConfigured && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div>
            <p className="font-semibold">Supabase Backend Environment Pending Connection</p>
            <p className="mt-0.5 text-xs">
              Configure <code className="rounded bg-amber-100 px-1 py-0.5">VITE_SUPABASE_URL</code> and{' '}
              <code className="rounded bg-amber-100 px-1 py-0.5">VITE_SUPABASE_ANON_KEY</code> in{' '}
              <code className="rounded bg-amber-100 px-1 py-0.5">frontend/.env.local</code> to load live institutional records. No synthetic mock numbers are displayed.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Active Institutions</CardDescription>
            <Building2 className="h-4 w-4 text-teal-700" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats ? stats.institutionCount : '—'}</p>
            <p className="text-xs text-slate-500">BST &amp; MIF scoped records</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Pending Verification</CardDescription>
            <ClipboardCheck className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats ? stats.pendingCount : '—'}</p>
            <p className="text-xs text-slate-500">100% completeness gate</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Active Batches</CardDescription>
            <CalendarDays className="h-4 w-4 text-indigo-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats ? stats.activeBatchCount : '—'}</p>
            <p className="text-xs text-slate-500">Ready to schedule: {stats ? stats.confirmedUnscheduledCount : '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Competent Chart Tasks</CardDescription>
            <GraduationCap className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats ? stats.certifiedCount : '—'}</p>
            <p className="text-xs text-slate-500">Progress &amp; Achievement charts</p>
          </CardContent>
        </Card>
      </div>

      {stats && stats.campusComparison.length > 0 && (
        <Card id="bst-mif-comparison">
          <CardHeader>
            <CardTitle>Campus Side-by-Side Comparison (BST &lt;-&gt; MIF)</CardTitle>
            <CardDescription>Live non-archived confirmed vs. pending review counts per institution.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {stats.campusComparison.map((campus) => (
              <div key={campus.code} className="flex items-center justify-between rounded-xl border border-slate-200 p-3 text-sm">
                <div>
                  <p className="font-semibold text-slate-900">{campus.code} — {campus.name}</p>
                  <p className="text-xs text-slate-500">Pending submissions: {campus.pendingCount}</p>
                </div>
                <Badge variant="info">{campus.confirmedCount} Confirmed</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Batch Capacity Utilization (Recharts)</CardTitle>
            <CardDescription>Real database enrollment counts vs. batch capacity limits.</CardDescription>
          </div>
          <Badge variant={metricsQuery.isFetching ? 'info' : 'secondary'}>
            {metricsQuery.isFetching ? 'Refreshing Query' : isSupabaseConfigured ? 'Live PostgreSQL Query' : 'Awaiting Supabase Env'}
          </Badge>
        </CardHeader>
        <CardContent className="h-72">
          {!stats || stats.batchMetrics.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
              {!isSupabaseConfigured
                ? 'Connect Supabase PostgreSQL schema in .env.local to stream live batch capacity metrics.'
                : !isOnline
                  ? 'Offline mode active — analytics resume automatically once online connectivity returns.'
                  : 'No active upcoming or in-training batches found for your institutional scope.'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.batchMetrics}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="batch" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="enrolled" name="Enrolled" fill="#0f766e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="capacity" name="Capacity" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
