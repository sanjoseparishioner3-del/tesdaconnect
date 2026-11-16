export const APP_ROLES = [
  'system_administrator',
  'institutional_administrator',
  'registrar',
  'focal_person',
  'trainer',
  'applicant',
  'scholar',
] as const;

export type AppRole = (typeof APP_ROLES)[number];

export type AccountStatus = 'active' | 'inactive' | 'pending_approval';

export interface InstitutionAssignment {
  institutionId: string;
  code: string;
  name: string;
  isPrimary: boolean;
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  username: string | null;
  role: AppRole;
  accountStatus: AccountStatus;
  forcePasswordChange: boolean;
  passwordExpiresAt: string | null;
  passwordExpiryExempt: boolean;
  lastLoginAt: string | null;
  institutions: InstitutionAssignment[];
}

export const ROLE_LABELS: Record<AppRole, string> = {
  system_administrator: 'System Administrator',
  institutional_administrator: 'Institutional Administrator',
  registrar: 'Registrar',
  focal_person: 'Focal Person',
  trainer: 'Trainer',
  applicant: 'Applicant',
  scholar: 'Scholar',
};

export function normalizeAppRole(rawRole: string | null | undefined): AppRole {
  if (!rawRole) return 'applicant';
  if (rawRole === 'administrator') return 'system_administrator';
  if ((APP_ROLES as readonly string[]).includes(rawRole)) {
    return rawRole as AppRole;
  }
  return 'applicant';
}
