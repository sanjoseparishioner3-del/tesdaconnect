export type ChartKind = 'progress' | 'achievement' | 'custom';

export interface ChartLite {
  id: string;
  name: string;
  kind: ChartKind;
}

export interface UnitLite {
  id: string;
  chart_id?: string | null;
  unit_number: number;
}

export interface TaskLite {
  id: string;
  competency_unit_id: string;
  chart_type: string;
  task_number: number;
}

export type TaskStatus = 'not_assessed' | 'output_correct' | 'competent' | 'not_yet_competent';

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  not_assessed: 'Not assessed',
  output_correct: 'Submitted Output Correct',
  competent: 'Competent',
  not_yet_competent: 'Not Yet Competent',
};

/** Used when the charts cannot be loaded (offline) so the two standard charts still work. */
export const FALLBACK_CHARTS: ChartLite[] = [
  { id: 'kind:progress', name: 'Progress Chart', kind: 'progress' },
  { id: 'kind:achievement', name: 'Achievement Chart', kind: 'achievement' },
];

/** Units that belong to a chart. Units saved before charts existed are matched by the kind of their tasks. */
export function unitsForChart<U extends UnitLite>(units: U[], tasks: TaskLite[], chart: ChartLite | null): U[] {
  if (!chart) return [];
  return units
    .filter((u) => {
      if (u.chart_id) return u.chart_id === chart.id;
      return tasks.some((t) => t.competency_unit_id === u.id && t.chart_type === chart.kind);
    })
    .sort((a, b) => a.unit_number - b.unit_number);
}

export function tasksForUnit<T extends TaskLite>(tasks: T[], unitId: string): T[] {
  return tasks.filter((t) => t.competency_unit_id === unitId).sort((a, b) => a.task_number - b.task_number);
}

/** Next free number for a unit or task: 1 when empty, otherwise the highest + 1. */
export function nextNumber(existing: number[]): number {
  return existing.length === 0 ? 1 : Math.max(...existing) + 1;
}

export function chartProgress(tasks: TaskLite[], statusOf: (taskId: string) => TaskStatus): { done: number; total: number } {
  const done = tasks.filter((t) => {
    const s = statusOf(t.id);
    return s === 'output_correct' || s === 'competent';
  }).length;
  return { done, total: tasks.length };
}

export function validateChartName(name: string, existingNames: string[]): string | null {
  const clean = name.trim();
  if (clean.length < 3) return 'Give the chart a name, for example "Practical Skills Chart".';
  if (clean.length > 100) return 'The chart name is too long.';
  if (existingNames.some((n) => n.trim().toLowerCase() === clean.toLowerCase())) return 'This course already has a chart with that name.';
  return null;
}
