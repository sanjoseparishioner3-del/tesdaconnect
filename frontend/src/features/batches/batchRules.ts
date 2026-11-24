export const BATCH_CAPACITY = 25;
export const MAX_BATCHES_PER_COURSE_YEAR = 6;

/** Same format the database builds: OAP-NCII-2026-B1 (course code, NC level, school year, batch number). */
export function buildBatchCode(courseCode: string, qualificationLevel: string | null | undefined, schoolYear: string, batchNumber: number): string {
  const level = (qualificationLevel ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `${courseCode.toUpperCase()}${level ? `-${level}` : ''}-${schoolYear}-B${batchNumber}`;
}

export function currentSchoolYear(now: Date = new Date()): string {
  return String(now.getFullYear());
}

export function freeBatchNumbers(usedNumbers: Array<number | null | undefined>): number[] {
  const used = new Set(usedNumbers.filter((n): n is number => typeof n === 'number'));
  return Array.from({ length: MAX_BATCHES_PER_COURSE_YEAR }, (_, i) => i + 1).filter((n) => !used.has(n));
}

export interface BatchFormValues {
  courseId: string;
  schoolYear: string;
  batchNumber: string;
  startsAt: string;
  endsAt: string;
  hours: string;
}

/** Returns a plain-English problem, or null when the form is fine. */
export function validateBatchForm(values: BatchFormValues, freeNumbers: number[]): string | null {
  if (!values.courseId) return 'Choose the course for this batch.';
  if (!/^\d{4}(-\d{4})?$/.test(values.schoolYear.trim())) return 'Enter the school year like 2026 or 2026-2027.';
  const n = Number.parseInt(values.batchNumber, 10);
  if (!Number.isInteger(n) || n < 1 || n > MAX_BATCHES_PER_COURSE_YEAR) return `Choose a batch number from 1 to ${MAX_BATCHES_PER_COURSE_YEAR}.`;
  if (!freeNumbers.includes(n)) return `Batch ${n} already exists for this course and school year.`;
  if (values.startsAt && values.endsAt && values.endsAt < values.startsAt) return 'The training end date must be on or after the start date.';
  if (values.hours.trim() && !/^\d+$/.test(values.hours.trim())) return 'Enter the training hours as a whole number.';
  return null;
}

export type BatchFill = 'open' | 'full' | 'closed';

/** A batch closes by itself when it reaches its capacity. */
export function batchFill(enrolled: number, capacity: number, status: string): { key: BatchFill; label: string } {
  if (status === 'completed' || status === 'cancelled') return { key: 'closed', label: status === 'completed' ? 'Completed' : 'Cancelled' };
  if (enrolled >= capacity) return { key: 'full', label: 'Full (closed)' };
  return { key: 'open', label: 'Open' };
}

export type ConfirmErrorKind = 'next_batch' | 'all_full' | 'other';

/** The database tags batch messages so the screen can ask the registrar the right question. */
export function parseConfirmError(message: string): { kind: ConfirmErrorKind; text: string } {
  const next = /^BATCH_NEXT:\s*(.*)$/s.exec(message);
  if (next) return { kind: 'next_batch', text: next[1] ?? message };
  const full = /^ALL_BATCHES_FULL:\s*(.*)$/s.exec(message);
  if (full) return { kind: 'all_full', text: full[1] ?? message };
  return { kind: 'other', text: message };
}

export const FULL_BATCHES_RETURN_MESSAGE =
  'Sorry, all available batches are full. Please submit your enrollment again when a new batch with open slots is announced.';

export function friendlyBatchError(message: string): string {
  if (/training_batches_code_key|duplicate key/i.test(message)) return 'A batch with that code already exists.';
  if (/row-level security|permission denied/i.test(message)) return 'You do not have permission to do that for this campus.';
  return message.replace(/^ERROR:\s*/i, '');
}
