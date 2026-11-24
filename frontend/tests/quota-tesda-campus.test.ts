import { describe, expect, it } from 'vitest';
import { validateCampusForm } from '@/features/admin/campuses';
import { buildQuotaStatuses, isConfirmBlocked } from '@/features/records/quotaStatus';
import { batchProgress, fillPercent, summarize, type TesdaBatchRow } from '@/features/tesda/tesdaOverview';
import { FLAT_SIDEBAR_ITEMS, isPathAllowedForRole, resolveRoleDefaultRoute } from '@/lib/rbac';
import { APP_ROLES, normalizeAppRole, ROLE_LABELS } from '@/types/auth';

const period = { id: 'p1', institution_id: 'bst', name: 'Jan intake', starts_at: '2027-01-05', ends_at: '2027-01-31', quota: 30, is_locked: false };

describe('registrar quota status', () => {
  it('shows confirmed against quota for the period covering today', () => {
    const [s] = buildQuotaStatuses([period], [{ period_id: 'p1', used: 28, course_usage: [] }], [], '2027-01-10');
    expect(s).toMatchObject({ confirmed: 28, quota: 30, left: 2, full: false });
  });

  it('ignores periods that do not cover today', () => {
    expect(buildQuotaStatuses([period], [], [], '2027-02-10')).toEqual([]);
  });

  it('blocks confirming once the quota is filled, and frees a slot after a back-out', () => {
    const full = buildQuotaStatuses([period], [{ period_id: 'p1', used: 30, course_usage: [] }], [], '2027-01-10');
    expect(isConfirmBlocked(full, 'bst', null)).toBe(true);
    // a scholar backs out (archived), so the confirmed count drops to 29
    const freed = buildQuotaStatuses([period], [{ period_id: 'p1', used: 29, course_usage: [] }], [], '2027-01-10');
    expect(isConfirmBlocked(freed, 'bst', null)).toBe(false);
  });

  it('blocks a full course even when the campus total still has room', () => {
    const statuses = buildQuotaStatuses(
      [period],
      [{ period_id: 'p1', used: 10, course_usage: [{ course_id: 'weld', used: 5 }] }],
      [{ intake_period_id: 'p1', course_id: 'weld', quota: 5 }],
      '2027-01-10',
    );
    expect(isConfirmBlocked(statuses, 'bst', 'weld')).toBe(true);
    expect(isConfirmBlocked(statuses, 'bst', 'cook')).toBe(false);
  });

  it('does not block other campuses or campuses without a period', () => {
    const statuses = buildQuotaStatuses([period], [{ period_id: 'p1', used: 30, course_usage: [] }], [], '2027-01-10');
    expect(isConfirmBlocked(statuses, 'mif', null)).toBe(false);
  });
});

describe('TESDA overview helpers', () => {
  const row = (over: Partial<TesdaBatchRow>): TesdaBatchRow => ({
    batch_id: 'b', institution_code: 'MIF', institution_name: 'MIF', course_name: 'Organic Agriculture', batch_code: 'OA-1',
    batch_status: 'upcoming', starts_at: '2026-11-19', ends_at: '2026-12-10', enrolled: 28, capacity: 30, ...over,
  });

  it('tells whether the school has started the batch', () => {
    expect(batchProgress(row({}), '2026-11-10')).toBe('not_started');
    expect(batchProgress(row({}), '2026-11-20')).toBe('started');
    expect(batchProgress(row({ batch_status: 'in_training' }), '2026-11-01')).toBe('started');
    expect(batchProgress(row({ batch_status: 'completed' }), '2026-11-01')).toBe('completed');
    expect(batchProgress(row({ batch_status: 'cancelled' }), '2026-11-20')).toBe('cancelled');
    expect(batchProgress(row({}), '2026-12-11')).toBe('completed');
  });

  it('summarises schools, batches and enrolled scholars without counting cancelled batches', () => {
    const rows = [row({}), row({ batch_id: 'c', institution_code: 'BST', enrolled: 12 }), row({ batch_id: 'd', batch_status: 'cancelled', enrolled: 9 })];
    expect(summarize(rows, '2026-11-20')).toEqual({ campuses: 2, batches: 3, enrolled: 40, started: 2, notStarted: 0 });
  });

  it('computes fill percentage safely', () => {
    expect(fillPercent(28, 30)).toBe(93);
    expect(fillPercent(5, 0)).toBe(100);
  });
});

describe('campus form validation', () => {
  const ok = { code: 'NEW', name: 'New Technical School', address: '', email: '', phone: '' };

  it('accepts a minimal campus', () => {
    expect(validateCampusForm(ok, { existingCodes: ['BST', 'MIF'] })).toBeNull();
  });

  it('explains problems in plain English', () => {
    expect(validateCampusForm({ ...ok, code: 'X' })).toMatch(/2 to 10/);
    expect(validateCampusForm({ ...ok, code: 'bst' }, { existingCodes: ['BST'] })).toMatch(/already exists/);
    expect(validateCampusForm({ ...ok, name: 'ab' })).toMatch(/name/i);
    expect(validateCampusForm({ ...ok, email: 'nope' })).toMatch(/email/i);
    expect(validateCampusForm({ ...ok, phone: 'abc' })).toMatch(/phone/i);
  });

  it('does not re-check the code when editing', () => {
    expect(validateCampusForm({ ...ok, code: 'BST' }, { existingCodes: ['BST'], editing: true })).toBeNull();
  });
});

describe('TESDA viewer role', () => {
  it('exists and has a readable label', () => {
    expect(APP_ROLES).toContain('tesda_viewer');
    expect(ROLE_LABELS.tesda_viewer).toBe('TESDA Viewer');
    expect(normalizeAppRole('tesda_viewer')).toBe('tesda_viewer');
  });

  it('can open only the overview (and change its own password), nothing with personal data', () => {
    expect(isPathAllowedForRole('/tesda-overview', 'tesda_viewer')).toBe(true);
    expect(isPathAllowedForRole('/settings/password', 'tesda_viewer')).toBe(true);
    for (const path of ['/enrollments', '/trainees', '/competency', '/reports', '/learner', '/admin/users', '/admin/institutions', '/dashboard']) {
      expect(isPathAllowedForRole(path, 'tesda_viewer')).toBe(false);
    }
    expect(resolveRoleDefaultRoute('tesda_viewer')).toBe('/tesda-overview');
  });

  it('shows only the overview in the viewer menu, and the overview is closed to other roles', () => {
    const items = FLAT_SIDEBAR_ITEMS.filter((i) => i.roles.includes('tesda_viewer')).map((i) => i.to);
    expect(items).toEqual(['/tesda-overview']);
    expect(isPathAllowedForRole('/tesda-overview', 'registrar')).toBe(false);
    expect(isPathAllowedForRole('/tesda-overview', 'scholar')).toBe(false);
  });
});
