export interface EnrollmentWindow {
  is_open: boolean;
  reason: 'no_periods' | 'open' | 'locked' | 'full' | 'course_full' | 'closed_dates' | 'not_started';
  period_name?: string;
  starts_at?: string;
  ends_at?: string;
  quota?: number;
  slots_left?: number;
  message?: string;
}

function fmt(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Plain-English line for the scholar. Returns null when there is nothing worth saying. */
export function describeEnrollmentWindow(w: EnrollmentWindow): { tone: 'open' | 'closed'; text: string } | null {
  if (w.reason === 'no_periods') return null;
  if (w.is_open) {
    const left = w.slots_left ?? 0;
    const closes = w.ends_at ? ` Closes ${fmt(w.ends_at)}.` : '';
    return { tone: 'open', text: `${w.period_name ?? 'Enrollment'} is open. ${left} slot${left === 1 ? '' : 's'} left.${closes}` };
  }
  return { tone: 'closed', text: w.message ?? 'Enrollment is closed right now.' };
}
