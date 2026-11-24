import { describe, expect, it } from 'vitest';
import {
  friendlyPeriodError,
  getPeriodState,
  manilaToday,
  periodsOverlap,
  suggestPeriodCode,
  usagePercent,
  validatePeriodForm,
} from '@/features/admin/intakePeriods';
import { describeEnrollmentWindow } from '@/features/intake/enrollmentWindow';

const period = { institution_id: 'bst', starts_at: '2027-01-05', ends_at: '2027-01-31', quota: 100, is_locked: false };

describe('enrollment period state', () => {
  it('is open only inside the dates, unlocked, with slots left', () => {
    expect(getPeriodState(period, 10, '2027-01-10')).toMatchObject({ key: 'open', accepting: true });
    expect(getPeriodState(period, 10, '2027-01-04')).toMatchObject({ key: 'upcoming', accepting: false });
    expect(getPeriodState(period, 10, '2027-02-01')).toMatchObject({ key: 'ended', accepting: false });
    expect(getPeriodState({ ...period, is_locked: true }, 10, '2027-01-10')).toMatchObject({ key: 'locked', accepting: false });
    expect(getPeriodState(period, 100, '2027-01-10')).toMatchObject({ key: 'full', accepting: false });
  });

  it('treats the first and last day as inside the period', () => {
    expect(getPeriodState(period, 0, '2027-01-05').accepting).toBe(true);
    expect(getPeriodState(period, 0, '2027-01-31').accepting).toBe(true);
  });

  it('shows a locked period that used every slot as full', () => {
    expect(getPeriodState({ ...period, is_locked: true }, 100, '2027-01-10').key).toBe('full');
  });

  it('uses the Philippine calendar day, not the UTC day', () => {
    // 17:30 UTC on Dec 31 is already Jan 1 in Manila (UTC+8).
    expect(manilaToday(new Date('2026-12-31T17:30:00Z'))).toBe('2027-01-01');
  });

  it('computes usage percentages safely', () => {
    expect(usagePercent(42, 100)).toBe(42);
    expect(usagePercent(120, 100)).toBe(100);
    expect(usagePercent(0, 0)).toBe(0);
  });
});

describe('period form validation', () => {
  const base = { name: 'January 2027 intake', startsAt: '2027-01-05', endsAt: '2027-01-31', quota: '100' };

  it('accepts a good form', () => {
    expect(validatePeriodForm(base)).toBeNull();
  });

  it('explains each problem in plain English', () => {
    expect(validatePeriodForm({ ...base, name: 'ab' })).toMatch(/name/i);
    expect(validatePeriodForm({ ...base, endsAt: '2027-01-01' })).toMatch(/end date/i);
    expect(validatePeriodForm({ ...base, quota: 'abc' })).toMatch(/whole number/i);
    expect(validatePeriodForm({ ...base, quota: '-5' })).toMatch(/whole number/i);
    expect(validatePeriodForm({ ...base, startsAt: '' })).toMatch(/start date/i);
  });

  it('does not let the quota drop below slots already used', () => {
    expect(validatePeriodForm({ ...base, quota: '30' }, { used: 42 })).toMatch(/42/);
    expect(validatePeriodForm({ ...base, quota: '42' }, { used: 42 })).toBeNull();
  });

  it('blocks overlapping dates for the same campus only', () => {
    const others = [{ ...period, name: 'Earlier intake', starts_at: '2027-01-20', ends_at: '2027-02-20' }];
    expect(validatePeriodForm(base, { others, institutionId: 'bst' })).toMatch(/overlap/i);
    expect(validatePeriodForm(base, { others, institutionId: 'mif' })).toBeNull();
    expect(periodsOverlap({ starts_at: '2027-01-01', ends_at: '2027-01-04' }, period)).toBe(false);
  });
});

describe('period codes and errors', () => {
  it('builds a unique code from the campus and start month', () => {
    expect(suggestPeriodCode('bst', '2027-01-05', [])).toBe('BST-2027-01');
    expect(suggestPeriodCode('bst', '2027-01-05', ['BST-2027-01'])).toBe('BST-2027-01-2');
  });

  it('keeps server messages readable', () => {
    expect(friendlyPeriodError('new row violates row-level security policy')).toMatch(/permission/i);
    expect(friendlyPeriodError('ERROR: The quota cannot be lower than the 5 applications already counted.')).toBe(
      'The quota cannot be lower than the 5 applications already counted.',
    );
  });
});

describe('scholar enrollment banner text', () => {
  it('says nothing when the campus has no periods', () => {
    expect(describeEnrollmentWindow({ is_open: true, reason: 'no_periods' })).toBeNull();
  });

  it('shows slots left and the closing date when open', () => {
    const info = describeEnrollmentWindow({ is_open: true, reason: 'open', period_name: 'January intake', slots_left: 58, ends_at: '2027-01-31' });
    expect(info?.tone).toBe('open');
    expect(info?.text).toMatch(/58 slots left/);
    expect(info?.text).toMatch(/Jan 31, 2027/);
  });

  it('uses singular for one slot and passes through the server reason when closed', () => {
    expect(describeEnrollmentWindow({ is_open: true, reason: 'open', slots_left: 1 })?.text).toMatch(/1 slot left/);
    expect(describeEnrollmentWindow({ is_open: false, reason: 'full', message: 'Enrollment for X is full. All 100 slots are taken.' })).toEqual({
      tone: 'closed',
      text: 'Enrollment for X is full. All 100 slots are taken.',
    });
  });
});
