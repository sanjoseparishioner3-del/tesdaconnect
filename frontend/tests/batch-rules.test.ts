import { describe, expect, it } from 'vitest';
import {
  batchFill,
  buildBatchCode,
  freeBatchNumbers,
  friendlyBatchError,
  FULL_BATCHES_RETURN_MESSAGE,
  parseConfirmError,
  validateBatchForm,
} from '@/features/batches/batchRules';
import { isPathAllowedForRole } from '@/lib/rbac';

describe('batch code and numbers', () => {
  it('builds the code from course, NC level, school year and batch number', () => {
    expect(buildBatchCode('oap', 'NC II', '2026', 1)).toBe('OAP-NCII-2026-B1');
    expect(buildBatchCode('SMAW', 'NC I', '2026-2027', 6)).toBe('SMAW-NCI-2026-2027-B6');
    expect(buildBatchCode('WLD', null, '2026', 2)).toBe('WLD-2026-B2');
  });

  it('offers only batch numbers 1 to 6 that are not used yet', () => {
    expect(freeBatchNumbers([])).toEqual([1, 2, 3, 4, 5, 6]);
    expect(freeBatchNumbers([1, 2, null])).toEqual([3, 4, 5, 6]);
    expect(freeBatchNumbers([1, 2, 3, 4, 5, 6])).toEqual([]);
  });
});

describe('batch form validation', () => {
  const ok = { courseId: 'c1', schoolYear: '2026', batchNumber: '1', startsAt: '2026-11-19', endsAt: '2026-12-10', hours: '268' };

  it('accepts a good form', () => {
    expect(validateBatchForm(ok, [1, 2, 3])).toBeNull();
  });

  it('explains problems in plain English', () => {
    expect(validateBatchForm({ ...ok, courseId: '' }, [1])).toMatch(/course/i);
    expect(validateBatchForm({ ...ok, schoolYear: '26' }, [1])).toMatch(/school year/i);
    expect(validateBatchForm({ ...ok, batchNumber: '7' }, [1])).toMatch(/1 to 6/);
    expect(validateBatchForm({ ...ok, batchNumber: '2' }, [1])).toMatch(/already exists/);
    expect(validateBatchForm({ ...ok, endsAt: '2026-11-01' }, [1])).toMatch(/end date/i);
    expect(validateBatchForm({ ...ok, hours: 'abc' }, [1])).toMatch(/hours/i);
  });
});

describe('batch fill', () => {
  it('closes a batch by itself at 25 scholars', () => {
    expect(batchFill(24, 25, 'upcoming')).toEqual({ key: 'open', label: 'Open' });
    expect(batchFill(25, 25, 'in_training')).toEqual({ key: 'full', label: 'Full (closed)' });
    expect(batchFill(3, 25, 'completed').key).toBe('closed');
  });
});

describe('confirm messages from the database', () => {
  it('asks the registrar before moving on to the next batch', () => {
    expect(parseConfirmError('BATCH_NEXT: Batch 1 is full. Continue and assign this scholar to Batch 2?')).toEqual({
      kind: 'next_batch',
      text: 'Batch 1 is full. Continue and assign this scholar to Batch 2?',
    });
  });

  it('tells the registrar to return the form when every batch is full', () => {
    const parsed = parseConfirmError('ALL_BATCHES_FULL: Every open batch for this course is full.');
    expect(parsed.kind).toBe('all_full');
    expect(FULL_BATCHES_RETURN_MESSAGE).toMatch(/all available batches are full/i);
  });

  it('passes any other message through untouched', () => {
    expect(parseConfirmError('The quota for X is already full.')).toEqual({ kind: 'other', text: 'The quota for X is already full.' });
    expect(friendlyBatchError('duplicate key value violates unique constraint "training_batches_code_key"')).toMatch(/already exists/);
  });
});

describe('batch management access', () => {
  it('is open to the registrar and administrators only', () => {
    for (const role of ['registrar', 'institutional_administrator', 'system_administrator'] as const) {
      expect(isPathAllowedForRole('/batches', role)).toBe(true);
    }
    for (const role of ['focal_person', 'trainer', 'scholar', 'applicant', 'tesda_viewer'] as const) {
      expect(isPathAllowedForRole('/batches', role)).toBe(false);
    }
  });
});
