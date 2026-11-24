import { describe, expect, it } from 'vitest';
import {
  chartProgress,
  FALLBACK_CHARTS,
  nextNumber,
  TASK_STATUS_LABEL,
  tasksForUnit,
  unitsForChart,
  validateChartName,
  type TaskStatus,
} from '@/features/competency/chartModel';

const progress = { id: 'ch-p', name: 'Progress Chart', kind: 'progress' as const };
const custom = { id: 'ch-c', name: 'Practical Skills Chart', kind: 'custom' as const };

describe('charts, units and tasks', () => {
  const units = [
    { id: 'u2', chart_id: 'ch-p', unit_number: 2 },
    { id: 'u1', chart_id: 'ch-p', unit_number: 1 },
    { id: 'u3', chart_id: 'ch-c', unit_number: 1 },
  ];
  const tasks = [
    { id: 't1', competency_unit_id: 'u1', chart_type: 'progress', task_number: 2 },
    { id: 't0', competency_unit_id: 'u1', chart_type: 'progress', task_number: 1 },
    { id: 't9', competency_unit_id: 'u3', chart_type: 'custom', task_number: 1 },
  ];

  it('lists only the units inside the chosen chart, in order', () => {
    expect(unitsForChart(units, tasks, progress).map((u) => u.id)).toEqual(['u1', 'u2']);
    expect(unitsForChart(units, tasks, custom).map((u) => u.id)).toEqual(['u3']);
    expect(unitsForChart(units, tasks, null)).toEqual([]);
  });

  it('keeps units saved before charts existed working, matched by their task kind', () => {
    const legacy = [{ id: 'old', chart_id: null, unit_number: 1 }];
    const legacyTasks = [{ id: 'x', competency_unit_id: 'old', chart_type: 'achievement', task_number: 1 }];
    const [, achievement] = FALLBACK_CHARTS;
    expect(unitsForChart(legacy, legacyTasks, achievement ?? null).map((u) => u.id)).toEqual(['old']);
    expect(unitsForChart(legacy, legacyTasks, FALLBACK_CHARTS[0] ?? null)).toEqual([]);
  });

  it('orders the tasks of a unit by number', () => {
    expect(tasksForUnit(tasks, 'u1').map((t) => t.id)).toEqual(['t0', 't1']);
  });

  it('numbers the next unit or task automatically', () => {
    expect(nextNumber([])).toBe(1);
    expect(nextNumber([1, 2, 5])).toBe(6);
  });

  it('counts a task as done when the output is correct or the scholar is competent', () => {
    const status: Record<string, TaskStatus> = { t0: 'output_correct', t1: 'not_yet_competent', t9: 'competent' };
    expect(chartProgress(tasks, (id) => status[id] ?? 'not_assessed')).toEqual({ done: 2, total: 3 });
  });

  it('has the three results the Focal Person marks', () => {
    expect(TASK_STATUS_LABEL.output_correct).toBe('Submitted Output Correct');
    expect(TASK_STATUS_LABEL.competent).toBe('Competent');
    expect(TASK_STATUS_LABEL.not_yet_competent).toBe('Not Yet Competent');
  });
});

describe('new chart names', () => {
  it('accepts a new name and explains problems', () => {
    expect(validateChartName('Practical Skills Chart', ['Progress Chart'])).toBeNull();
    expect(validateChartName('ab', [])).toMatch(/name/i);
    expect(validateChartName('progress chart', ['Progress Chart'])).toMatch(/already has/i);
  });
});
