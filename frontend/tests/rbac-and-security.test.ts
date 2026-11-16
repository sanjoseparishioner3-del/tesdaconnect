import { describe, expect, it } from 'vitest';
import { canAccessRoute, isPasswordUpdateRequired } from '@/lib/rbac';
import { sanitizeCsvCell } from '@/lib/utils';
import { normalizeAppRole, type UserProfile } from '@/types/auth';

const makeProfile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  id: 'user-1',
  email: 'registrar@bst.tesda.ph',
  fullName: 'Maria Santos',
  username: 'msantos',
  role: 'registrar',
  accountStatus: 'active',
  forcePasswordChange: false,
  passwordExpiresAt: null,
  passwordExpiryExempt: false,
  lastLoginAt: '2026-11-15T00:00:00Z',
  institutions: [{ institutionId: 'inst-1', code: 'BST', name: 'Balli School of Technology', isPrimary: true }],
  ...overrides,
});

describe('RBAC & Security Guardrails', () => {
  it('maps legacy administrator role cleanly to system_administrator', () => {
    expect(normalizeAppRole('administrator')).toBe('system_administrator');
    expect(normalizeAppRole('institutional_administrator')).toBe('institutional_administrator');
    expect(normalizeAppRole('trainer')).toBe('trainer');
    expect(normalizeAppRole('unknown_role')).toBe('applicant');
  });

  it('denies inactive or pending accounts regardless of role', () => {
    expect(canAccessRoute(makeProfile({ accountStatus: 'inactive', role: 'system_administrator' }), ['system_administrator'])).toBe(false);
    expect(canAccessRoute(makeProfile({ accountStatus: 'pending_approval', role: 'registrar' }), ['registrar'])).toBe(false);
    expect(canAccessRoute(makeProfile({ accountStatus: 'active', role: 'registrar' }), ['registrar'])).toBe(true);
  });

  it('requires password update when forced or expired (without relying on headers)', () => {
    expect(isPasswordUpdateRequired(makeProfile({ forcePasswordChange: true }))).toBe(true);
    expect(
      isPasswordUpdateRequired(
        makeProfile({
          forcePasswordChange: false,
          passwordExpiryExempt: false,
          passwordExpiresAt: new Date(Date.now() - 60_000).toISOString(),
        }),
      ),
    ).toBe(true);
    expect(
      isPasswordUpdateRequired(
        makeProfile({
          passwordExpiryExempt: true,
          passwordExpiresAt: new Date(Date.now() - 60_000).toISOString(),
        }),
      ),
    ).toBe(false);
  });

  it('neutralizes CSV spreadsheet formula injection payloads', () => {
    expect(sanitizeCsvCell('=CMD()')).toBe("'=CMD()");
    expect(sanitizeCsvCell('+1+2')).toBe("'+1+2");
    expect(sanitizeCsvCell('-SUM(A1:A2)')).toBe("'-SUM(A1:A2)");
    expect(sanitizeCsvCell('@malicious')).toBe("'@malicious");
    expect(sanitizeCsvCell('Normal Text, Inc.')).toBe('"Normal Text, Inc."');
  });
});
