import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckSquare, Eye, FileCheck2, Lock, Plus, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pagination, usePagination } from '@/components/ui/pagination';
import { offlineDb, safeDexieWrite } from '@/lib/db/dexie';
import { isSupabaseConfigured } from '@/lib/env';
import { getSupabaseClient } from '@/lib/supabase';
import { enqueueMutation } from '@/lib/sync/syncEngine';
import { asText } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useConnectivityStore } from '@/stores/connectivityStore';

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
}

interface CompetencyTaskRow {
  id: string;
  competency_unit_id: string;
  chart_type: 'progress' | 'achievement';
  task_number: number;
  name: string;
}

interface ProgressRow {
  enrollment_application_id: string;
  competency_task_id: string;
  status: 'competent' | 'not_yet_competent' | 'not_assessed';
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
  const [chartFilter, setChartFilter] = React.useState<'all' | 'progress' | 'achievement'>('all');
  const [selectedBatchId, setSelectedBatchId] = React.useState('');
  const [selectedScholarKey, setSelectedScholarKey] = React.useState('');

  const [unitNumber, setUnitNumber] = React.useState('1');
  const [unitName, setUnitName] = React.useState('');
  const [selectedUnitId, setSelectedUnitId] = React.useState('');
  const [taskChartType, setTaskChartType] = React.useState<'progress' | 'achievement'>('progress');
  const [taskNumber, setTaskNumber] = React.useState('1');
  const [taskName, setTaskName] = React.useState('');

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
      const { data, error } = await client
        .from('training_batches')
        .select('id, code, name, course_id')
        .is('archived_at', null)
        .order('starts_at', { ascending: false })
        .limit(30)
        .returns<BatchOption[]>();
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
          }))
          .sort((a, b) => a.unit_number - b.unit_number);
      }
      const { data, error } = await client
        .from('competency_units')
        .select('id, course_id, unit_number, name, sort_order, is_archived')
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
            chart_type: (r.payload.chart_type as 'progress' | 'achievement') ?? 'progress',
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

  const createUnitMutation = useMutation({
    mutationFn: async () => {
      if (!canManageCharts) throw new Error('Only Focal Person may configure competency units.');
      const client = getSupabaseClient();
      if (!client || !activeBatch?.course_id) throw new Error('Select a training batch first.');
      if (unitName.trim().length < 2) throw new Error('Provide a competency unit name.');
      const num = Math.max(1, Number.parseInt(unitNumber, 10) || 1);
      const { error } = await client.from('competency_units').insert({
        course_id: activeBatch.course_id,
        unit_number: num,
        name: unitName.trim(),
        sort_order: num,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success('Added competency unit.');
      setUnitName('');
      await queryClient.invalidateQueries({ queryKey: ['course-units'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      if (!canManageCharts) throw new Error('Only Focal Person may add Progress/Achievement chart tasks.');
      const client = getSupabaseClient();
      const targetUnitId = selectedUnitId || unitsQuery.data?.[0]?.id;
      if (!client || !targetUnitId) throw new Error('Select a competency unit first.');
      if (taskName.trim().length < 2) throw new Error('Provide a task description.');
      const num = Math.max(1, Number.parseInt(taskNumber, 10) || 1);
      const { error } = await client.from('competency_tasks').insert({
        competency_unit_id: targetUnitId,
        chart_type: taskChartType,
        task_number: num,
        name: taskName.trim(),
        sort_order: num,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success('Added Progress / Achievement task.');
      setTaskName('');
      await queryClient.invalidateQueries({ queryKey: ['course-tasks'] });
    },
    onError: (err: Error) => toast.error(err.message),
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
      status: 'competent' | 'not_yet_competent' | 'not_assessed';
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
  const units = unitsQuery.data ?? [];
  const visibleTasks = (tasksQuery.data ?? []).filter(
    (t) => chartFilter === 'all' || t.chart_type === chartFilter,
  );
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
            <div className="flex gap-1.5">
              {(['all', 'progress', 'achievement'] as const).map((f) => (
                <Button
                  key={f}
                  type="button"
                  size="sm"
                  variant={chartFilter === f ? 'secondary' : 'outline'}
                  onClick={() => setChartFilter(f)}
                  className="capitalize"
                >
                  {f === 'all' ? 'All Tasks' : `${f} Chart`}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'competency' && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>Scholar Progress &amp; Achievement Tasks</CardTitle>
                <CardDescription>
                  Click tasks to mark <strong>Competent</strong> vs <strong>Not Yet Competent</strong> (PostgreSQL trigger prevents edits after unit lock).
                </CardDescription>
              </div>
              <Badge variant="info">
                <Lock className="h-3 w-3" /> Lock-Enforced
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-600">
            {scholars.length === 0 || visibleTasks.length === 0 ? (
              <p>
                Select an active batch with confirmed scholars and configured competency tasks. Focal Persons add tasks under <strong>Configure Tasks &amp; Units</strong>.
              </p>
            ) : (
              <>
                <div className="space-y-3">
                {pagedScholars.map((scholar) => {
                  const totalTasks = visibleTasks.length;
                  const competentCount = visibleTasks.filter(
                    (t) => progressMap.get(`${scholar.id}:${t.id}`) === 'competent',
                  ).length;

                  return (
                    <div key={scholar.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-900">
                            {scholar.learner_name}{' '}
                            <span className="font-mono text-xs text-slate-500">
                              ({scholar.scholar_id ?? scholar.reference_no})
                            </span>
                          </p>
                          <p className="text-xs text-slate-500">
                            Completed Tasks: {competentCount} / {totalTasks}
                          </p>
                        </div>

                        {canManageCharts && units[0] && (
                          <div className="flex flex-wrap gap-1.5">
                            {units.map((u) => (
                              <Button
                                key={u.id}
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => lockUnitReviewMutation.mutate({ enrollmentId: scholar.id, unitId: u.id })}
                              >
                                <Lock className="h-3 w-3" /> Lock Unit {u.unit_number}
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {visibleTasks.map((task) => {
                          const currentStatus = progressMap.get(`${scholar.id}:${task.id}`) ?? 'not_assessed';
                          const nextStatus =
                            currentStatus === 'not_assessed'
                              ? 'competent'
                              : currentStatus === 'competent'
                                ? 'not_yet_competent'
                                : 'not_assessed';

                          return (
                            <div
                              key={task.id}
                              className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs"
                            >
                              <div className="min-w-0">
                                <span className="font-semibold uppercase text-teal-800">
                                  [{task.chart_type}] T{task.task_number}
                                </span>
                                <p className="truncate font-medium text-slate-900" title={task.name}>
                                  {task.name}
                                </p>
                              </div>
                              {canManageCharts ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={
                                    currentStatus === 'competent'
                                      ? 'secondary'
                                      : currentStatus === 'not_yet_competent'
                                        ? 'destructive'
                                        : 'outline'
                                  }
                                  onClick={() =>
                                    markCompetencyMutation.mutate({
                                      enrollmentId: scholar.id,
                                      taskId: task.id,
                                      status: nextStatus,
                                    })
                                  }
                                >
                                  {currentStatus === 'competent'
                                    ? 'Competent'
                                    : currentStatus === 'not_yet_competent'
                                      ? 'NYC'
                                      : 'Assess'}
                                </Button>
                              ) : (
                                <Badge
                                  variant={
                                    currentStatus === 'competent'
                                      ? 'success'
                                      : currentStatus === 'not_yet_competent'
                                        ? 'warning'
                                        : 'outline'
                                  }
                                >
                                  {currentStatus.replace(/_/g, ' ')}
                                </Badge>
                              )}
                            </div>
                          );
                        })}
                      </div>
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

      {activeTab === 'setup' && canManageCharts && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings2 className="h-4 w-4 text-teal-700" /> Configure Units &amp; Tasks (Focal Person Only)
              </CardTitle>
              <CardDescription>
                Define competency units and structured Progress / Achievement chart tasks for this qualification.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 rounded-xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">Add Competency Unit</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="unit_num">Unit No.</Label>
                    <Input id="unit_num" type="number" min={1} value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label htmlFor="unit_name">Unit Title</Label>
                    <Input id="unit_name" value={unitName} onChange={(e) => setUnitName(e.target.value)} placeholder="Participate in workplace communication" />
                  </div>
                </div>
                <Button type="button" size="sm" variant="secondary" disabled={createUnitMutation.isPending || !activeBatch} onClick={() => createUnitMutation.mutate()}>
                  <Plus className="h-3.5 w-3.5" /> Add Unit
                </Button>
              </div>

              <div className="space-y-2 rounded-xl border border-slate-200 p-4">
                <p className="text-sm font-semibold text-slate-900">Add Progress / Achievement Task</p>
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={selectedUnitId || units[0]?.id || ''}
                    onChange={(e) => setSelectedUnitId(e.target.value)}
                    className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
                  >
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        Unit {u.unit_number}
                      </option>
                    ))}
                  </select>
                  <select
                    value={taskChartType}
                    onChange={(e) => setTaskChartType(e.target.value as 'progress' | 'achievement')}
                    className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-xs"
                  >
                    <option value="progress">Progress Chart Task</option>
                    <option value="achievement">Achievement Chart Task</option>
                  </select>
                  <Input type="number" min={1} value={taskNumber} onChange={(e) => setTaskNumber(e.target.value)} placeholder="Task No." />
                </div>
                <Input value={taskName} onChange={(e) => setTaskName(e.target.value)} placeholder="Task / learning outcome description" />
                <Button type="button" size="sm" variant="secondary" disabled={createTaskMutation.isPending || units.length === 0} onClick={() => createTaskMutation.mutate()}>
                  <Plus className="h-3.5 w-3.5" /> Add Task
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Course Units ({units.length}) &amp; Tasks ({(tasksQuery.data ?? []).length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {units.length === 0 ? (
                <p className="text-slate-500">No competency units configured for the selected batch course yet.</p>
              ) : (
                units.map((u) => (
                  <div key={u.id} className="rounded-lg border border-slate-200 p-3">
                    <p className="font-semibold text-slate-900">
                      Unit {u.unit_number}: {u.name}
                    </p>
                    <ul className="mt-1 list-disc pl-5 text-xs text-slate-600">
                      {(tasksQuery.data ?? [])
                        .filter((t) => t.competency_unit_id === u.id)
                        .map((t) => (
                          <li key={t.id}>
                            [{t.chart_type.toUpperCase()}] Task {t.task_number}: {t.name}
                          </li>
                        ))}
                    </ul>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
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
