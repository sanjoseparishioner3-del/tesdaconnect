import { describe, expect, it } from 'vitest';
import {
  isPathAllowedForRole,
  resolveAuthorizedPostLoginRoute,
  resolveRoleDefaultRoute,
  STAFF_DASHBOARD_ROLES,
} from '../src/lib/rbac';
import type { AppRole, UserProfile } from '../src/types/auth';

function buildProfile(role: AppRole, overrides?: Partial<UserProfile>): UserProfile {
  return {
    id: `user-${role}`,
    email: `${role}@tesda.gov.ph`,
    fullName: `Test ${role}`,
    username: role,
    role,
    accountStatus: 'active',
    forcePasswordChange: false,
    passwordExpiresAt: null,
    passwordExpiryExempt: false,
    lastLoginAt: null,
    institutions: [
      {
        institutionId: 'inst-mif',
        code: 'MIF',
        name: 'Mamburao Integrated Farm',
        isPrimary: true,
      },
    ],
    ...overrides,
  };
}

describe('Unified Auth Role-Based Routing & URL Bypass Protection', () => {
  it('routes every authenticated role to its authoritative default workspace', () => {
    expect(resolveRoleDefaultRoute('system_administrator')).toBe('/dashboard');
    expect(resolveRoleDefaultRoute('institutional_administrator')).toBe('/dashboard');
    expect(resolveRoleDefaultRoute('registrar')).toBe('/enrollments');
    expect(resolveRoleDefaultRoute('focal_person')).toBe('/competency');
    expect(resolveRoleDefaultRoute('trainer')).toBe('/schedules');
    expect(resolveRoleDefaultRoute('scholar')).toBe('/learner');
    expect(resolveRoleDefaultRoute('applicant')).toBe('/learner');
  });

  it('prevents non-staff roles from accessing staff dashboard or privileged admin routes', () => {
    expect(STAFF_DASHBOARD_ROLES).not.toContain('applicant');
    expect(STAFF_DASHBOARD_ROLES).not.toContain('scholar');

    expect(isPathAllowedForRole('/dashboard', 'scholar')).toBe(false);
    expect(isPathAllowedForRole('/dashboard', 'applicant')).toBe(false);
    expect(isPathAllowedForRole('/admin/users', 'registrar')).toBe(false);
    expect(isPathAllowedForRole('/admin/users', 'focal_person')).toBe(false);
    expect(isPathAllowedForRole('/enrollments', 'scholar')).toBe(false);
    expect(isPathAllowedForRole('/focal-operations', 'registrar')).toBe(false);
    expect(isPathAllowedForRole('/learner', 'registrar')).toBe(false);
    expect(isPathAllowedForRole('/admin/institutions', 'focal_person')).toBe(false);

    expect(isPathAllowedForRole('/dashboard', 'system_administrator')).toBe(true);
    expect(isPathAllowedForRole('/enrollments', 'registrar')).toBe(true);
    expect(isPathAllowedForRole('/competency', 'focal_person')).toBe(true);
    expect(isPathAllowedForRole('/schedules', 'trainer')).toBe(true);
    expect(isPathAllowedForRole('/learner', 'scholar')).toBe(true);
    expect(isPathAllowedForRole('/settings/password', 'applicant')).toBe(true);
  });

  it('blocks requestedFrom deep-link redirects when unauthorized for the authenticated role', () => {
    const scholar = buildProfile('scholar');
    expect(resolveAuthorizedPostLoginRoute(scholar, '/admin/users')).toBe('/learner');
    expect(resolveAuthorizedPostLoginRoute(scholar, '/dashboard')).toBe('/learner');
    expect(resolveAuthorizedPostLoginRoute(scholar, '/learner?tab=documents')).toBe('/learner?tab=documents');

    const registrar = buildProfile('registrar');
    expect(resolveAuthorizedPostLoginRoute(registrar, '/admin/users')).toBe('/enrollments');
    expect(resolveAuthorizedPostLoginRoute(registrar, '/trainees')).toBe('/trainees');
  });

  it('forces rotation route /settings/password when password change is required', () => {
    const expiredAdmin = buildProfile('system_administrator', {
      forcePasswordChange: true,
    });
    expect(resolveAuthorizedPostLoginRoute(expiredAdmin, '/dashboard')).toBe('/settings/password');
  });
});
