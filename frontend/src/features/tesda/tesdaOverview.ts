export interface TesdaBatchRow {
  batch_id: string;
  institution_code: string;
  institution_name: string;
  course_name: string;
  batch_code: string;
  batch_status: string;
  starts_at: string | null;
  ends_at: string | null;
  enrolled: number;
  capacity: number;
}

export type TesdaProgress = 'not_started' | 'started' | 'completed' | 'cancelled';

/** What TESDA cares about: has the school started this batch yet? */
export function batchProgress(row: Pick<TesdaBatchRow, 'batch_status' | 'starts_at' | 'ends_at'>, today: string): TesdaProgress {
  if (row.batch_status === 'cancelled') return 'cancelled';
  if (row.batch_status === 'completed') return 'completed';
  if (row.batch_status === 'in_training') return 'started';
  // "upcoming": treat a batch whose dates have begun as started even if the school has not updated its status.
  if (row.ends_at && today > row.ends_at) return 'completed';
  if (row.starts_at && today >= row.starts_at) return 'started';
  return 'not_started';
}

export const PROGRESS_LABEL: Record<TesdaProgress, string> = {
  not_started: 'Pending',
  started: 'Ongoing',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export function summarize(rows: TesdaBatchRow[], today: string) {
  const campuses = new Set(rows.map((r) => r.institution_code));
  let enrolled = 0;
  let started = 0;
  let notStarted = 0;
  for (const r of rows) {
    const p = batchProgress(r, today);
    if (p === 'cancelled') continue;
    enrolled += r.enrolled;
    if (p === 'started') started += 1;
    if (p === 'not_started') notStarted += 1;
  }
  return { campuses: campuses.size, batches: rows.length, enrolled, started, notStarted };
}

export function fillPercent(enrolled: number, capacity: number): number {
  if (capacity <= 0) return enrolled > 0 ? 100 : 0;
  return Math.min(100, Math.round((enrolled / capacity) * 100));
}

export function formatPhDate(value: string | null): string {
  if (!value) return 'N/A';
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}
