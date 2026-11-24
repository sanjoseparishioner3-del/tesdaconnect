import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CloudOff, Plus, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isSupabaseConfigured } from '@/lib/env';
import { getSupabaseClient } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useConnectivityStore } from '@/stores/connectivityStore';
import { nextNumber, tasksForUnit, validateChartName, type ChartKind } from './chartModel';

interface ChartRow {
  id: string;
  name: string;
  kind: ChartKind;
}

interface UnitRow {
  id: string;
  chart_id: string | null;
  unit_number: number;
  name: string;
}

interface TaskRow {
  id: string;
  competency_unit_id: string;
  chart_type: string;
  task_number: number;
  name: string;
}

/**
 * Focal Person setup: pick a course chart (or create a new one), pick or create a unit inside it,
 * then create tasks for that chart and unit.
 */
export function ChartSetupPanel({ courseId, courseLabel }: { courseId: string | null; courseLabel: string }) {
  const profile = useAuthStore((s) => s.profile);
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const queryClient = useQueryClient();
  const enabled = isSupabaseConfigured && isOnline && Boolean(courseId) && Boolean(profile?.id);

  const [chartId, setChartId] = React.useState('');
  const [unitId, setUnitId] = React.useState('');
  const [newChart, setNewChart] = React.useState('');
  const [unitName, setUnitName] = React.useState('');
  const [taskName, setTaskName] = React.useState('');

  const chartsQuery = useQuery<ChartRow[]>({
    queryKey: ['setup-charts', courseId],
    enabled,
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client || !courseId) return [];
      const { data, error } = await client
        .from('competency_charts')
        .select('id, name, kind')
        .eq('course_id', courseId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
        .returns<ChartRow[]>();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const unitsQuery = useQuery<UnitRow[]>({
    queryKey: ['setup-units', courseId],
    enabled,
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client || !courseId) return [];
      const { data, error } = await client
        .from('competency_units')
        .select('id, chart_id, unit_number, name')
        .eq('course_id', courseId)
        .eq('is_archived', false)
        .order('unit_number', { ascending: true })
        .returns<UnitRow[]>();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const tasksQuery = useQuery<TaskRow[]>({
    queryKey: ['setup-tasks', courseId, unitsQuery.data?.length ?? 0],
    enabled: enabled && (unitsQuery.data?.length ?? 0) > 0,
    queryFn: async () => {
      const client = getSupabaseClient();
      const ids = (unitsQuery.data ?? []).map((u) => u.id);
      if (!client || ids.length === 0) return [];
      const { data, error } = await client
        .from('competency_tasks')
        .select('id, competency_unit_id, chart_type, task_number, name')
        .in('competency_unit_id', ids)
        .order('task_number', { ascending: true })
        .returns<TaskRow[]>();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const charts = React.useMemo(() => chartsQuery.data ?? [], [chartsQuery.data]);
  const activeChart = charts.find((c) => c.id === chartId) ?? charts[0] ?? null;
  const chartUnits = React.useMemo(() => (unitsQuery.data ?? []).filter((u) => u.chart_id === activeChart?.id), [unitsQuery.data, activeChart?.id]);
  const activeUnit = chartUnits.find((u) => u.id === unitId) ?? chartUnits[0] ?? null;
  const unitTasks = tasksForUnit(tasksQuery.data ?? [], activeUnit?.id ?? '');

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['setup-charts'] }),
      queryClient.invalidateQueries({ queryKey: ['setup-units'] }),
      queryClient.invalidateQueries({ queryKey: ['setup-tasks'] }),
      queryClient.invalidateQueries({ queryKey: ['course-units'] }),
      queryClient.invalidateQueries({ queryKey: ['course-tasks'] }),
      queryClient.invalidateQueries({ queryKey: ['course-charts'] }),
    ]);
  };

  const createChartMutation = useMutation({
    mutationFn: async () => {
      const client = getSupabaseClient();
      if (!client || !courseId || !profile) throw new Error('Select a training batch first.');
      const problem = validateChartName(newChart, charts.map((c) => c.name));
      if (problem) throw new Error(problem);
      const { data, error } = await client
        .from('competency_charts')
        .insert({ course_id: courseId, name: newChart.trim(), kind: 'custom', sort_order: charts.length + 1, created_by_user_id: profile.id })
        .select('id')
        .single<{ id: string }>();
      if (error) throw new Error(error.message);
      return data.id;
    },
    onSuccess: async (id) => {
      toast.success('Chart created.');
      setNewChart('');
      setChartId(id);
      setUnitId('');
      await refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createUnitMutation = useMutation({
    mutationFn: async () => {
      const client = getSupabaseClient();
      if (!client || !courseId || !activeChart) throw new Error('Choose a chart first.');
      if (unitName.trim().length < 2) throw new Error('Enter the unit title.');
      const num = nextNumber(chartUnits.map((u) => u.unit_number));
      const { data, error } = await client
        .from('competency_units')
        .insert({ course_id: courseId, chart_id: activeChart.id, unit_number: num, name: unitName.trim(), sort_order: num })
        .select('id')
        .single<{ id: string }>();
      if (error) throw new Error(error.message);
      return data.id;
    },
    onSuccess: async (id) => {
      toast.success('Unit added.');
      setUnitName('');
      setUnitId(id);
      await refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createTaskMutation = useMutation({
    mutationFn: async () => {
      const client = getSupabaseClient();
      if (!client || !activeChart || !activeUnit) throw new Error('Choose a chart and a unit first.');
      if (taskName.trim().length < 2) throw new Error('Describe the task.');
      const num = nextNumber(unitTasks.map((t) => t.task_number));
      const { error } = await client
        .from('competency_tasks')
        .insert({ competency_unit_id: activeUnit.id, chart_type: activeChart.kind, task_number: num, name: taskName.trim(), sort_order: num });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success('Task added.');
      setTaskName('');
      await refresh();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (!courseId) {
    return <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Choose a training batch above to set up its course charts.</p>;
  }

  if (!isOnline) {
    return (
      <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
        <CloudOff className="mt-0.5 h-4 w-4 shrink-0" /> Charts, units and tasks can only be set up while online.
      </p>
    );
  }

  const selectClass = 'h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base sm:h-10 sm:text-sm';
  const inputClass = 'h-11 text-base sm:h-10 sm:text-sm';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Settings2 className="h-4 w-4 text-teal-700" /> Charts, Units &amp; Tasks
        </CardTitle>
        <CardDescription>
          Course: {courseLabel}. Choose a chart, then a unit inside it, then add tasks. You can also create a new chart.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2 rounded-xl border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-900">1. Chart</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="setup_chart">Choose a chart</Label>
              <select
                id="setup_chart"
                value={activeChart?.id ?? ''}
                onChange={(e) => {
                  setChartId(e.target.value);
                  setUnitId('');
                }}
                className={selectClass}
              >
                {charts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="setup_new_chart">Or create a new chart</Label>
              <div className="flex gap-2">
                <Input id="setup_new_chart" value={newChart} onChange={(e) => setNewChart(e.target.value)} placeholder="Practical Skills Chart" className={inputClass} />
                <Button type="button" variant="secondary" disabled={createChartMutation.isPending} onClick={() => createChartMutation.mutate()}>
                  <Plus className="h-4 w-4" /> Create
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-900">2. Unit inside {activeChart?.name ?? 'the chart'}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="setup_unit">Choose a unit</Label>
              <select id="setup_unit" value={activeUnit?.id ?? ''} onChange={(e) => setUnitId(e.target.value)} className={selectClass} disabled={chartUnits.length === 0}>
                {chartUnits.length === 0 && <option value="">No units yet</option>}
                {chartUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    Unit {u.unit_number}: {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="setup_new_unit">Or add a new unit (Unit {nextNumber(chartUnits.map((u) => u.unit_number))})</Label>
              <div className="flex gap-2">
                <Input id="setup_new_unit" value={unitName} onChange={(e) => setUnitName(e.target.value)} placeholder="Participate in workplace communication" className={inputClass} />
                <Button type="button" variant="secondary" disabled={createUnitMutation.isPending || !activeChart} onClick={() => createUnitMutation.mutate()}>
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-900">
            3. Tasks for {activeChart?.name ?? 'the chart'}
            {activeUnit ? `, Unit ${activeUnit.unit_number}` : ''}
          </p>
          <div className="space-y-1">
            <Label htmlFor="setup_task">Add task {nextNumber(unitTasks.map((t) => t.task_number))}</Label>
            <div className="flex gap-2">
              <Input id="setup_task" value={taskName} onChange={(e) => setTaskName(e.target.value)} placeholder="Task or learning outcome" className={inputClass} disabled={!activeUnit} />
              <Button type="button" variant="secondary" disabled={createTaskMutation.isPending || !activeUnit} onClick={() => createTaskMutation.mutate()}>
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
            {!activeUnit && <p className="text-xs text-slate-500">Add a unit first, then you can add its tasks.</p>}
          </div>
          {unitTasks.length > 0 && (
            <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-100 text-sm">
              {unitTasks.map((t) => (
                <li key={t.id} className="flex gap-2 px-3 py-2">
                  <span className="font-semibold text-teal-800">T{t.task_number}</span>
                  <span className="min-w-0 text-slate-800">{t.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
