import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckSquare, ChevronDown, Eye, FileCheck2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Pagination, usePagination } from '@/components/ui/pagination';
import { offlineDb, safeDexieWrite } from '@/lib/db/dexie';
import { isSupabaseConfigured } from '@/lib/env';
import { getSupabaseClient } from '@/lib/supabase';
import { enqueueMutation } from '@/lib/sync/syncEngine';
import { asText } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useConnectivityStore } from '@/stores/connectivityStore';
import { ChartSetupPanel } from './ChartSetupPanel';
import {
  chartProgress,
  FALLBACK_CHARTS,
  TASK_STATUS_LABEL,
  tasksForUnit,
  unitsForChart,
  type ChartLite,
  type TaskStatus,
} from './chartModel';

interface BatchOption {
  id: string;
  code: string;
  name: string;
  course_id: string;
}

interface BatchScholar {
  id: string;
  reference_no: string;
  learner_name: string;
  scholar_id: string | null;
}

interface CompetencyUnitRow {
  id: string;
  course_id: string;
  unit_number: number;
  name: string;
  sort_order: number;
  is_archived: boolean;
  chart_id?: string | null;
}

interface CompetencyTaskRow {
  id: string;
  competency_unit_id: string;
  chart_type: string;
  task_number: number;
  name: string;
}

interface ProgressRow {
  enrollment_application_id: string;
  competency_task_id: string;
  status: TaskStatus;
}

interface ReportSubmissionRow {
  id: string;
  enrollment_application_id: string;
  status: 'draft' | 'reviewed' | 'finalized' | 'submitted';
  submission_reference: string | null;
  remarks: string | null;
}

export function CompetencyAndAttendancePage() {
  const profile = useAuthStore((s) => s.profile);
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const queryClient = useQueryClient();

  // Strictly managed by Focal Person per TESDA workflow rules; Admins and Registrars oversee read-only
  const canManageCharts = profile?.role === 'focal_person';

  const [activeTab, setActiveTab] = React.useState<'competency' | 'setup' | 'workflow'>('competency');
  const [selectedBatchId, setSelectedBatchId] = React.useState('');
  const [selectedScholarKey, setSelectedScholarKey] = React.useState('');
  const [chartKey, setChartKey] = React.useState('');
  const [openScholarId, setOpenScholarId] = React.useState('');

  const batchesQuery = useQuery<BatchOption[]>({
    queryKey: ['ops-batches', profile?.id, isOnline],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!isOnline || !isSupabaseConfigured || !client) {
        if (!profile?.id) return [];
        const cached = await offlineDb.cachedFocalData
          .where('userId')
          .equals(profile.id)
          .filter((r) => r.kind === 'batch')
          .toArray();
        return cached.map((r) => ({
          id: asText(r.payload.id, r.entityId),
          code: asText(r.payload.code),
          name: asText(r.payload.name),
          course_id: asText(r.payload.course_id),
        }));
      }
      let query = client
        .from('training_batches')
        .select('id, code, name, course_id')
        .is('archived_at', null)
        .in('status', ['upcoming', 'in_training']);
      const campusIds = (profile?.institutions ?? []).map((i) => i.institutionId);
      if (profile?.role !== 'system_administrator' && campusIds.length > 0) {
        query = query.in('institution_id', campusIds);
      }
      const { data, error } = await query.order('starts_at', { ascending: false }).limit(30).returns<BatchOption[]>();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const activeBatchId = selectedBatchId || batchesQuery.data?.[0]?.id || '';
  const activeBatch = (batchesQuery.data ?? []).find((b) => b.id === activeBatchId) ?? null;

  const scholarsQuery = useQuery<BatchScholar[]>({
    queryKey: ['batch-scholars', activeBatchId, isOnline],
    enabled: Boolean(activeBatchId) && Boolean(profile?.id),
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!isOnline || !isSupabaseConfigured || !client) {
        if (!profile?.id) return [];
        const cached = await offlineDb.cachedFocalData
          .where('userId')
          .equals(profile.id)
          .filter((r) => r.kind === 'scholar' && r.batchId === activeBatchId)
          .toArray();
        return cached.map((r) => ({
          id: asText(r.payload.id, r.entityId),
          reference_no: asText(r.payload.reference_no),
          learner_name: asText(r.payload.learner_name),
          scholar_id: typeof r.payload.scholar_id === 'string' ? r.payload.scholar_id : null,
        }));
      }
      const { data, error } = await client
        .from('enrollment_applications')
        .select('id, reference_no, learner_name, scholar_id')
        .eq('training_batch_id', activeBatchId)
        .eq('application_status', 'confirmed')
        .is('archived_at', null)
        .order('learner_name', { ascending: true })
        .returns<BatchScholar[]>();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const unitsQuery = useQuery<CompetencyUnitRow[]>({
    queryKey: ['course-units', activeBatch?.course_id, isOnline],
    enabled: Boolean(activeBatch?.course_id) && Boolean(profile?.id),
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!activeBatch?.course_id) return [];
      if (!isOnline || !isSupabaseConfigured || !client) {
        if (!profile?.id) return [];
        const cached = await offlineDb.cachedFocalData
          .where('userId')
          .equals(profile.id)
          .filter((r) => r.kind === 'unit' && r.payload.course_id === activeBatch.course_id)
          .toArray();
        return cached
          .map((r) => ({
            id: asText(r.payload.id, r.entityId),
            course_id: asText(r.payload.course_id),
            unit_number: Number(r.payload.unit_number ?? 1),
            name: asText(r.payload.name),
            sort_order: Number(r.payload.sort_order ?? 1),
            is_archived: Boolean(r.payload.is_archived),
            chart_id: typeof r.payload.chart_id === 'string' ? r.payload.chart_id : null,
          }))
          .sort((a, b) => a.unit_number - b.unit_number);
      }
      const { data, error } = await client
        .from('competency_units')
        .select('id, course_id, unit_number, name, sort_order, is_archived, chart_id')
        .eq('course_id', activeBatch.course_id)
        .eq('is_archived', false)
        .order('unit_number', { ascending: true })
        .returns<CompetencyUnitRow[]>();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const tasksQuery = useQuery<CompetencyTaskRow[]>({
    queryKey: ['course-tasks', activeBatch?.course_id, isOnline],
    enabled: Boolean(unitsQuery.data && unitsQuery.data.length > 0) && Boolean(profile?.id),
    queryFn: async () => {
      const client = getSupabaseClient();
      const unitIds = (unitsQuery.data ?? []).map((u) => u.id);
      if (unitIds.length === 0) return [];
      if (!isOnline || !isSupabaseConfigured || !client) {
        if (!profile?.id) return [];
        const unitSet = new Set(unitIds);
        const cached = await offlineDb.cachedFocalData
          .where('userId')
          .equals(profile.id)
          .filter((r) => r.kind === 'task' && unitSet.has(asText(r.payload.competency_unit_id)))
          .toArray();
        return cached
          .map((r) => ({
            id: asText(r.payload.id, r.entityId),
            competency_unit_id: asText(r.payload.competency_unit_id),
            chart_type: typeof r.payload.chart_type === 'string' ? r.payload.chart_type : 'progress',
            task_number: Number(r.payload.task_number ?? 1),
            name: asText(r.payload.name),
          }))
          .sort((a, b) => a.task_number - b.task_number);
      }
      const { data, error } = await client
        .from('competency_tasks')
        .select('id, competency_unit_id, chart_type, task_number, name')
        .in('competency_unit_id', unitIds)
        .order('task_number', { ascending: true })
        .limit(100)
        .returns<CompetencyTaskRow[]>();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const chartsQuery = useQuery<ChartLite[]>({
    queryKey: ['course-charts', activeBatch?.course_id, isOnline],
    enabled: Boolean(activeBatch?.course_id) && isOnline && isSupabaseConfigured,
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client || !activeBatch?.course_id) return [];
      const { data, error } = await client
        .from('competency_charts')
        .select('id, name, kind')
        .eq('course_id', activeBatch.course_id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
        .returns<ChartLite[]>();
      if (error) return [];
      return data ?? [];
    },
  });

  const progressMatrixQuery = useQuery<ProgressRow[]>({
    queryKey: ['batch-competency-progress', activeBatchId, isOnline],
    enabled: Boolean(scholarsQuery.data && scholarsQuery.data.length > 0) && Boolean(profile?.id),
    queryFn: async () => {
      const client = getSupabaseClient();
      const ids = (scholarsQuery.data ?? []).map((s) => s.id);
      if (ids.length === 0) return [];
      if (!isOnline || !isSupabaseConfigured || !client) {
        if (!profile?.id) return [];
        const idSet = new Set(ids);
        const cached = await offlineDb.cachedFocalData
          .where('userId')
          .equals(profile.id)
          .filter((r) => r.kind === 'progress' && idSet.has(asText(r.payload.enrollment_application_id)))
          .toArray();
        return cached.map((r) => ({
          enrollment_application_id: asText(r.payload.enrollment_application_id),
          competency_task_id: asText(r.payload.competency_task_id),
          status: (r.payload.status as ProgressRow['status']) ?? 'not_assessed',
        }));
      }
      const { data, error } = await client
        .from('competency_progress')
        .select('enrollment_application_id, competency_task_id, status')
        .in('enrollment_application_id', ids)
        .returns<ProgressRow[]>();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const reportWorkflowQuery = useQuery<ReportSubmissionRow[]>({
    queryKey: ['competency-report-workflow', activeBatchId, isOnline],
    enabled: Boolean(scholarsQuery.data && scholarsQuery.data.length > 0) && activeTab === 'workflow' && Boolean(profile?.id),
    queryFn: async () => {
      const client = getSupabaseClient();
      const ids = (scholarsQuery.data ?? []).map((s) => s.id);
      if (ids.length === 0) return [];
      if (!isOnline || !isSupabaseConfigured || !client) {
        if (!profile?.id) return [];
        const idSet = new Set(ids);
        const cached = await offlineDb.cachedFocalData
          .where('userId')
          .equals(profile.id)
          .filter((r) => r.kind === 'submission' && idSet.has(asText(r.payload.enrollment_application_id)))
          .toArray();
        return cached.map((r) => ({
          id: asText(r.payload.id, r.entityId),
          enrollment_application_id: asText(r.payload.enrollment_application_id),
          status: (r.payload.status as ReportSubmissionRow['status']) ?? 'draft',
          submission_reference: typeof r.payload.submission_reference === 'string' ? r.payload.submission_reference : null,
          remarks: typeof r.payload.remarks === 'string' ? r.payload.remarks : null,
        }));
      }
      const { data, error } = await client
        .from('competency_report_submissions')
        .select('id, enrollment_application_id, status, submission_reference, remarks')
        .in('enrollment_application_id', ids)
        .returns<ReportSubmissionRow[]>();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const lockUnitReviewMutation = useMutation({
    mutationFn: async ({ enrollmentId, unitId }: { enrollmentId: string; unitId: string }) => {
      if (!canManageCharts) throw new Error('Only Focal Person may verify and lock competency units.');
      const client = getSupabaseClient();
      if (!client || !profile) throw new Error('Authenticated session required.');
      const { error } = await client.from('competency_unit_reviews').upsert(
        {
          enrollment_application_id: enrollmentId,
          competency_unit_id: unitId,
          status: 'verified',
          verified_by: profile.id,
          verified_at: new Date().toISOString(),
          is_locked: true,
        },
        { onConflict: 'enrollment_application_id,competency_unit_id' },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => toast.success('Unit verified and locked by PostgreSQL policy.'),
    onError: (err: Error) => toast.error(err.message),
  });

  const advanceWorkflowMutation = useMutation({
    mutationFn: async ({ enrollmentId, nextStatus }: { enrollmentId: string; nextStatus: ReportSubmissionRow['status'] }) => {
      if (!canManageCharts) throw new Error('Only Focal Person may advance competency report workflow.');
      const client = getSupabaseClient();
      if (!client || !profile) throw new Error('Authenticated session required.');
      const nowIso = new Date().toISOString();
      const patch: Record<string, unknown> = {
        enrollment_application_id: enrollmentId,
        status: nextStatus,
      };
      if (nextStatus === 'reviewed') {
        patch.reviewed_by = profile.id;
        patch.reviewed_at = nowIso;
      } else if (nextStatus === 'finalized') {
        patch.finalized_by = profile.id;
        patch.finalized_at = nowIso;
      } else if (nextStatus === 'submitted') {
        patch.submitted_by = profile.id;
        patch.submitted_at = nowIso;
        patch.submission_reference = `SUB-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
      }
      const { error } = await client
        .from('competency_report_submissions')
        .upsert(patch, { onConflict: 'enrollment_application_id' });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success('Updated Progress & Achievement report workflow status.');
      await queryClient.invalidateQueries({ queryKey: ['competency-report-workflow', activeBatchId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const markCompetencyMutation = useMutation({
    mutationFn: async ({
      enrollmentId,
      taskId,
      status,
    }: {
      enrollmentId: string;
      taskId: string;
      status: TaskStatus;
    }) => {
      if (!canManageCharts) throw new Error('Only Focal Person may score scholar Progress & Achievement tasks.');
      if (!profile) throw new Error('Authenticated user required.');
      const client = getSupabaseClient();

      if (!isOnline || !isSupabaseConfigured || !client) {
        const existingProgress = await offlineDb.cachedFocalData
          .where('userId')
          .equals(profile.id)
          .filter(
            (r) =>
              r.kind === 'progress' &&
              r.payload.enrollment_application_id === enrollmentId &&
              r.payload.competency_task_id === taskId,
          )
          .first();

        const entityId = existingProgress?.entityId ?? `${enrollmentId}:${taskId}`;
        const baseVersion =
          typeof existingProgress?.payload.version === 'number'
            ? existingProgress.payload.version
            : null;

        await enqueueMutation({
          userId: profile.id,
          entityType: 'competency_progress',
          entityId,
          operation: 'upsert',
          baseVersion,
          payload: {
            enrollment_application_id: enrollmentId,
            competency_task_id: taskId,
            status,
            assessed_at: new Date().toISOString(),
          },
        });

        await safeDexieWrite(() =>
          offlineDb.cachedFocalData.put({
            id: `${profile.id}:progress:${entityId}`,
            userId: profile.id,
            institutionId: profile.institutions[0]?.institutionId ?? 'INST',
            batchId: enrollmentId,
            kind: 'progress',
            entityId,
            payload: {
              id: entityId,
              enrollment_application_id: enrollmentId,
              competency_task_id: taskId,
              status,
              version: baseVersion ?? 1,
            },
            syncedAt: new Date().toISOString(),
          }),
        );
        return;
      }

      const { error } = await client.from('competency_progress').upsert(
        {
          enrollment_application_id: enrollmentId,
          competency_task_id: taskId,
          status,
          assessed_by: profile.id,
          assessed_at: new Date().toISOString(),
        },
        { onConflict: 'enrollment_application_id,competency_task_id' },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success(
        isOnline
          ? 'Saved task competency assessment.'
          : 'Task assessment saved offline and queued for Pending Sync.',
      );
      await queryClient.invalidateQueries({ queryKey: ['batch-competency-progress', activeBatchId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const allScholars = React.useMemo(() => scholarsQuery.data ?? [], [scholarsQuery.data]);
  // Class record: pick one scholar ID to see only that scholar (blank = the whole class).
  const scholars = React.useMemo(
    () => (selectedScholarKey ? allScholars.filter((s) => s.id === selectedScholarKey) : allScholars),
    [allScholars, selectedScholarKey],
  );
  const scholarsPagination = usePagination({
    totalRecords: scholars.length,
    initialPageSize: 10,
  });
  const pagedScholars = scholars.slice(scholarsPagination.startIndex, scholarsPagination.endIndex);
  const units = React.useMemo(() => unitsQuery.data ?? [], [unitsQuery.data]);
  const allTasks = React.useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const charts: ChartLite[] = (chartsQuery.data ?? []).length > 0 ? (chartsQuery.data ?? []) : FALLBACK_CHARTS;
  const activeChart = charts.find((c) => c.id === chartKey) ?? charts[0] ?? null;
  const chartUnits = unitsForChart(units, allTasks, activeChart);
  const progressMap = React.useMemo(() => {
    const map = new Map<string, ProgressRow['status']>();
    for (const r of progressMatrixQuery.data ?? []) {
      map.set(`${r.enrollment_application_id}:${r.competency_task_id}`, r.status);
    }
    return map;
  }, [progressMatrixQuery.data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <CheckSquare className="h-6 w-6 text-teal-700" />
            Progress &amp; Achievement Charts
          </h1>
          <p className="text-sm text-slate-500">
            Task-based competency tracking across Progress Charts and Achievement Charts managed exclusively by the Focal Person.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant={activeTab === 'competency' ? 'secondary' : 'outline'} onClick={() => setActiveTab('competency')}>
            Charts &amp; Task Scoring
          </Button>
          {canManageCharts && (
            <Button type="button" size="sm" variant={activeTab === 'setup' ? 'secondary' : 'outline'} onClick={() => setActiveTab('setup')}>
              Configure Tasks &amp; Units
            </Button>
          )}
          <Button type="button" size="sm" variant={activeTab === 'workflow' ? 'secondary' : 'outline'} onClick={() => setActiveTab('workflow')}>
            Submission Workflow
          </Button>
        </div>
      </div>

      {!canManageCharts && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          <Eye className="h-4 w-4 text-slate-600" />
          Read-only oversight view: Only the assigned <strong>Focal Person</strong> creates tasks, scores competencies, and locks Progress &amp; Achievement Chart reviews.
        </div>
      )}

      {batchesQuery.data && batchesQuery.data.length > 0 && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-[260px] max-w-md flex-1 space-y-1">
            <Label htmlFor="batch_select">Training Batch</Label>
            <select
              id="batch_select"
              value={activeBatchId}
              onChange={(e) => {
                setSelectedBatchId(e.target.value);
                setSelectedScholarKey('');
              }}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              {batchesQuery.data.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.code} — {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[220px] max-w-sm flex-1 space-y-1">
            <Label htmlFor="scholar_select">Class record (scholar ID)</Label>
            <select
              id="scholar_select"
              value={allScholars.some((s) => s.id === selectedScholarKey) ? selectedScholarKey : ''}
              onChange={(e) => setSelectedScholarKey(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="">Whole class ({allScholars.length} enrolled)</option>
              {allScholars.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.scholar_id ?? s.reference_no} - {s.learner_name}
                </option>
              ))}
            </select>
          </div>
          {activeTab === 'competency' && (
            <div className="min-w-[200px] max-w-xs flex-1 space-y-1">
              <Label htmlFor="chart_select">Chart</Label>
              <select
                id="chart_select"
                value={activeChart?.id ?? ''}
                onChange={(e) => setChartKey(e.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
              >
                {charts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {activeTab === 'competency' && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Class List &amp; Task Scoring</CardTitle>
                <CardDescription>
                  Tap a scholar to see their units and tasks right below their name, then mark each task. Marks cannot be changed after a unit is locked.
                </CardDescription>
              </div>
              <Badge variant="info">
                <Lock className="h-3 w-3" /> Lock-Enforced
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            {scholars.length === 0 ? (
              <p>No confirmed scholars in this batch yet. Scholars are placed in a batch when the Registrar confirms them.</p>
            ) : chartUnits.length === 0 ? (
              <p>
                {activeChart?.name ?? 'This chart'} has no units and tasks yet. The Focal Person adds them under <strong>Configure Tasks &amp; Units</strong>.
              </p>
            ) : (
              <ul className="space-y-2" aria-label="Scholars in this batch">
                {scholars.map((scholar) => {
                  const isOpen = openScholarId === scholar.id;
                  const statusOf = (taskId: string): TaskStatus => progressMap.get(`${scholar.id}:${taskId}`) ?? 'not_assessed';
                  const chartTasks = chartUnits.flatMap((u) => tasksForUnit(allTasks, u.id));
                  const { done, total } = chartProgress(chartTasks, statusOf);
                  return (
                    <li key={scholar.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => setOpenScholarId(isOpen ? '' : scholar.id)}
                        className="flex min-h-14 w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-slate-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-slate-900">{scholar.learner_name}</span>
                          <span className="block font-mono text-xs text-slate-500">{scholar.scholar_id ?? scholar.reference_no}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2 text-xs text-slate-600">
                          <span>
                            {done} / {total} tasks
                          </span>
                          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                        </span>
                      </button>

                      {isOpen && (
                        <div className="space-y-4 border-t border-slate-100 bg-slate-50/60 p-3.5">
                          {chartUnits.map((unit) => {
                            const unitTasks = tasksForUnit(allTasks, unit.id);
                            return (
                              <section key={unit.id} aria-label={`Unit ${unit.unit_number}`} className="space-y-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <h4 className="text-sm font-semibold text-slate-900">
                                    Unit {unit.unit_number}: {unit.name}
                                  </h4>
                                  {canManageCharts && (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={() => lockUnitReviewMutation.mutate({ enrollmentId: scholar.id, unitId: unit.id })}
                                    >
                                      <Lock className="h-3 w-3" /> Lock unit
                                    </Button>
                                  )}
                                </div>
                                {unitTasks.length === 0 ? (
                                  <p className="text-xs text-slate-500">No tasks in this unit yet.</p>
                                ) : (
                                  <ul className="space-y-2">
                                    {unitTasks.map((task) => {
                                      const current = statusOf(task.id);
                                      return (
                                        <li key={task.id} className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                                          <p className="text-sm text-slate-900">
                                            <span className="mr-1.5 font-semibold text-teal-800">T{task.task_number}</span>
                                            {task.name}
                                          </p>
                                          {canManageCharts ? (
                                            <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Result for task ${task.task_number}`}>
                                              {(['output_correct', 'competent', 'not_yet_competent'] as const).map((status) => (
                                                <Button
                                                  key={status}
                                                  type="button"
                                                  size="sm"
                                                  aria-pressed={current === status}
                                                  variant={current === status ? (status === 'not_yet_competent' ? 'destructive' : 'secondary') : 'outline'}
                                                  onClick={() =>
                                                    markCompetencyMutation.mutate({
                                                      enrollmentId: scholar.id,
                                                      taskId: task.id,
                                                      status: current === status ? 'not_assessed' : status,
                                                    })
                                                  }
                                                >
                                                  {TASK_STATUS_LABEL[status]}
                                                </Button>
                                              ))}
                                            </div>
                                          ) : (
                                            <Badge variant={current === 'not_yet_competent' ? 'warning' : current === 'not_assessed' ? 'outline' : 'success'}>
                                              {TASK_STATUS_LABEL[current]}
                                            </Badge>
                                          )}
                                        </li>
                                      );
                                    })}
                                  </ul>
                                )}
                              </section>
                            );
                          })}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'setup' && canManageCharts && (
        <ChartSetupPanel courseId={activeBatch?.course_id ?? null} courseLabel={activeBatch ? `${activeBatch.code} - ${activeBatch.name}` : 'No batch selected'} />
      )}

      {activeTab === 'workflow' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCheck2 className="h-5 w-5 text-teal-700" /> Progress &amp; Achievement Submission Pipeline
            </CardTitle>
            <CardDescription>Tracks report review status (`draft -&gt; reviewed -&gt; finalized -&gt; submitted`) with reference codes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {scholars.length === 0 ? (
              <p className="text-slate-500">Select a batch with confirmed scholars to review and advance competency report submissions.</p>
            ) : (
              <>
                <div className="space-y-2">
                  {pagedScholars.map((s) => {
                    const sub = (reportWorkflowQuery.data ?? []).find((r) => r.enrollment_application_id === s.id);
                    const status = sub?.status ?? 'draft';
                    return (
                      <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3">
                        <div>
                          <p className="font-medium text-slate-900">{s.learner_name}</p>
                          <p className="text-xs text-slate-500">
                            Status: <strong>{status}</strong> {sub?.submission_reference ? `• Ref: ${sub.submission_reference}` : ''}
                          </p>
                        </div>
                        {canManageCharts && (
                          <div className="flex gap-1.5">
                            {(['reviewed', 'finalized', 'submitted'] as const).map((nextStatus) => (
                              <Button
                                key={nextStatus}
                                type="button"
                                size="sm"
                                variant={status === nextStatus ? 'secondary' : 'outline'}
                                onClick={() => advanceWorkflowMutation.mutate({ enrollmentId: s.id, nextStatus })}
                              >
                                {nextStatus}
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 border-t border-slate-100 pt-4">
                  <Pagination
                    currentPage={scholarsPagination.currentPage}
                    totalPages={scholarsPagination.totalPages}
                    totalRecords={scholars.length}
                    pageSize={scholarsPagination.pageSize}
                    onPageChange={scholarsPagination.goToPage}
                    onPageSizeChange={scholarsPagination.setPageSize}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
