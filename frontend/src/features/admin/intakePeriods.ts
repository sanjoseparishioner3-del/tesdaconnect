export interface PeriodLike {
  id?: string;
  institution_id: string;
  starts_at: string;
  ends_at: string;
  quota: number;
  is_locked: boolean;
}

export type PeriodStateKey = 'open' | 'upcoming' | 'ended' | 'locked' | 'full';

export interface PeriodState {
  key: PeriodStateKey;
  label: string;
  /** Whether scholars can submit right now. */
  accepting: boolean;
}

/** Today's date in the Philippines (the server uses the same calendar day). */
export function manilaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Same order the server checks: locked, then dates, then slots. */
export function getPeriodState(period: PeriodLike, used: number, today: string = manilaToday()): PeriodState {
  if (period.is_locked) {
    return used >= period.quota && period.quota > 0
      ? { key: 'full', label: 'Full (closed)', accepting: false }
      : { key: 'locked', label: 'Closed by registrar', accepting: false };
  }
  if (today < period.starts_at) return { key: 'upcoming', label: 'Not started yet', accepting: false };
  if (today > period.ends_at) return { key: 'ended', label: 'Ended', accepting: false };
  if (used >= period.quota) return { key: 'full', label: 'Full', accepting: false };
  return { key: 'open', label: 'Open now', accepting: true };
}

export function usagePercent(used: number, quota: number): number {
  if (quota <= 0) return used > 0 ? 100 : 0;
  return Math.min(100, Math.round((used / quota) * 100));
}

export function periodsOverlap(a: { starts_at: string; ends_at: string }, b: { starts_at: string; ends_at: string }): boolean {
  return a.starts_at <= b.ends_at && a.ends_at >= b.starts_at;
}

export interface PeriodFormValues {
  name: string;
  startsAt: string;
  endsAt: string;
  quota: string;
}

/** Returns a plain-English problem, or null when the form is fine. */
export function validatePeriodForm(
  values: PeriodFormValues,
  options: { used?: number; others?: Array<PeriodLike & { name?: string }>; institutionId?: string } = {},
): string | null {
  if (values.name.trim().length < 3) return 'Give the period a name, for example "January 2027 intake".';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.startsAt) || !/^\d{4}-\d{2}-\d{2}$/.test(values.endsAt)) {
    return 'Choose both a start date and an end date.';
  }
  if (values.endsAt < values.startsAt) return 'The end date must be on or after the start date.';
  if (!/^\d+$/.test(values.quota.trim())) return 'Enter the number of slots as a whole number, for example 100.';
  const quota = Number.parseInt(values.quota, 10);
  if (quota > 100_000) return 'That number of slots looks too high. Please check it.';
  if (options.used !== undefined && quota < options.used) {
    return `${options.used} applications are already counted, so the slots cannot be lower than ${options.used}.`;
  }
  const clash = (options.others ?? []).find(
    (o) => o.institution_id === options.institutionId && periodsOverlap({ starts_at: values.startsAt, ends_at: values.endsAt }, o),
  );
  if (clash) {
    return `These dates overlap ${clash.name ?? 'another period'} (${clash.starts_at} to ${clash.ends_at}). Pick dates that do not overlap.`;
  }
  return null;
}

/** Builds a unique period code such as BST-2027-01 from the campus code and start date. */
export function suggestPeriodCode(campusCode: string, startsAt: string, existingCodes: string[]): string {
  const base = `${campusCode.toUpperCase()}-${startsAt.slice(0, 7)}`.slice(0, 34);
  const taken = new Set(existingCodes.map((c) => c.toUpperCase()));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36).toUpperCase()}`.slice(0, 40);
}

/** Server messages are already plain English; trim database prefixes just in case. */
export function friendlyPeriodError(message: string): string {
  if (/duplicate key|intake_periods_code_key/i.test(message)) return 'That period code is already used. Try again.';
  if (/row-level security|permission denied/i.test(message)) return 'You do not have permission to change enrollment periods for this campus.';
  return message.replace(/^ERROR:\s*/i, '');
}
