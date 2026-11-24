import type { AppRole, UserProfile } from '@/types/auth';

export type NavSection =
  | 'overview'
  | 'operations'
  | 'records'
  | 'administration'
  | 'learner';

export interface NavItemConfig {
  label: string;
  to: string;
  section: NavSection;
  roles: AppRole[];
  icon:
    | 'LayoutDashboard'
    | 'FilePlus2'
    | 'ClipboardCheck'
    | 'Users'
    | 'CalendarDays'
    | 'CheckSquare'
    | 'BookOpen'
    | 'FolderKanban'
    | 'Megaphone'
    | 'FileSpreadsheet'
    | 'RefreshCw'
    | 'Building2'
    | 'ShieldAlert'
    | 'GraduationCap'
    | 'UserCog'
    | 'HelpCircle'
    | 'BarChart3';
  offlineCapable?: boolean;
}

export const FLAT_SIDEBAR_ITEMS: NavItemConfig[] = [
  {
    label: 'Dashboard',
    to: '/dashboard',
    section: 'overview',
    roles: [
      'system_administrator',
      'institutional_administrator',
      'registrar',
      'focal_person',
      'trainer',
    ],
    icon: 'LayoutDashboard',
  },
  {
    label: 'My Learning Portal',
    to: '/learner',
    section: 'overview',
    roles: ['applicant', 'scholar'],
    icon: 'GraduationCap',
    offlineCapable: true,
  },
  {
    label: 'TESDA Overview',
    to: '/tesda-overview',
    section: 'overview',
    roles: ['tesda_viewer', 'system_administrator'],
    icon: 'BarChart3',
  },
  {
    label: 'Offline Sync Center',
    to: '/sync',
    section: 'overview',
    roles: [
      'system_administrator',
      'institutional_administrator',
      'registrar',
      'focal_person',
      'trainer',
      'applicant',
      'scholar',
    ],
    icon: 'RefreshCw',
    offlineCapable: true,
  },
  {
    label: 'User Guide & Role Handbook',
    to: '/user-guide',
    section: 'overview',
    roles: [
      'system_administrator',
      'institutional_administrator',
      'registrar',
      'focal_person',
      'trainer',
      'applicant',
      'scholar',
    ],
    icon: 'HelpCircle',
    offlineCapable: true,
  },
  {
    label: 'Registration Intake',
    to: '/intake',
    section: 'operations',
    roles: ['registrar', 'institutional_administrator', 'system_administrator', 'applicant', 'scholar'],
    icon: 'FilePlus2',
    offlineCapable: true,
  },
  {
    label: 'Schedules & Announcements',
    to: '/schedules',
    section: 'operations',
    roles: [
      'system_administrator',
      'institutional_administrator',
      'registrar',
      'focal_person',
      'trainer',
      'scholar',
      'applicant',
    ],
    icon: 'CalendarDays',
    offlineCapable: true,
  },
  {
    label: 'Courses & Materials',
    to: '/courses',
    section: 'operations',
    roles: ['focal_person', 'trainer', 'institutional_administrator', 'system_administrator', 'scholar'],
    icon: 'BookOpen',
  },
  {
    label: 'Progress & Achievement Charts',
    to: '/competency',
    section: 'operations',
    roles: ['focal_person', 'institutional_administrator', 'system_administrator', 'registrar', 'trainer'],
    icon: 'CheckSquare',
  },
  {
    label: 'Operational Docs & Forms',
    to: '/focal-operations',
    section: 'operations',
    roles: ['focal_person', 'trainer', 'institutional_administrator', 'system_administrator'],
    icon: 'FolderKanban',
  },
  {
    label: 'Announcements',
    to: '/announcements',
    section: 'operations',
    roles: [
      'system_administrator',
      'institutional_administrator',
      'registrar',
      'focal_person',
      'trainer',
      'applicant',
      'scholar',
    ],
    icon: 'Megaphone',
    offlineCapable: true,
  },
  {
    label: 'Batch Management',
    to: '/batches',
    section: 'operations',
    roles: ['registrar', 'institutional_administrator', 'system_administrator'],
    icon: 'FolderKanban',
  },
  {
    label: 'Enrollment Review',
    to: '/enrollments',
    section: 'records',
    roles: ['registrar', 'institutional_administrator', 'system_administrator'],
    icon: 'ClipboardCheck',
  },
  {
    label: 'Trainee Records & ULI',
    to: '/trainees',
    section: 'records',
    roles: ['registrar', 'institutional_administrator', 'system_administrator'],
    icon: 'Users',
  },
  {
    label: 'Reports & Exports',
    to: '/reports',
    section: 'records',
    roles: ['system_administrator', 'institutional_administrator', 'registrar', 'focal_person'],
    icon: 'FileSpreadsheet',
  },
  {
    label: 'Institutions & Quotas',
    to: '/admin/institutions',
    section: 'administration',
    roles: ['system_administrator', 'institutional_administrator', 'registrar'],
    icon: 'Building2',
  },
  {
    label: 'Users & Role Access',
    to: '/admin/users',
    section: 'administration',
    roles: ['system_administrator', 'institutional_administrator'],
    icon: 'UserCog',
  },
  {
    label: 'Security & Audit Logs',
    to: '/admin/audit',
    section: 'administration',
    roles: ['system_administrator', 'institutional_administrator'],
    icon: 'ShieldAlert',
  },
];

export const STAFF_DASHBOARD_ROLES: readonly AppRole[] = [
  'system_administrator',
  'institutional_administrator',
  'registrar',
  'focal_person',
  'trainer',
];

export const ROUTE_ALLOWED_ROLES: Record<string, readonly AppRole[]> = {
  '/dashboard': STAFF_DASHBOARD_ROLES,
  '/sync': ['system_administrator', 'institutional_administrator', 'registrar', 'focal_person', 'trainer', 'applicant', 'scholar'],
  '/tesda-overview': ['tesda_viewer', 'system_administrator'],
  '/user-guide': ['system_administrator', 'institutional_administrator', 'registrar', 'focal_person', 'trainer', 'applicant', 'scholar'],
  '/announcements': ['system_administrator', 'institutional_administrator', 'registrar', 'focal_person', 'trainer', 'applicant', 'scholar'],
  '/settings/password': ['system_administrator', 'institutional_administrator', 'registrar', 'focal_person', 'trainer', 'applicant', 'scholar', 'tesda_viewer'],
  '/intake': ['system_administrator', 'institutional_administrator', 'registrar', 'applicant', 'scholar'],
  '/schedules': ['system_administrator', 'institutional_administrator', 'registrar', 'focal_person', 'trainer', 'applicant', 'scholar'],
  '/batches': ['system_administrator', 'institutional_administrator', 'registrar'],
  '/enrollments': ['system_administrator', 'institutional_administrator', 'registrar'],
  '/trainees': ['system_administrator', 'institutional_administrator', 'registrar'],
  '/competency': ['system_administrator', 'institutional_administrator', 'registrar', 'focal_person', 'trainer'],
  '/focal-operations': ['system_administrator', 'institutional_administrator', 'focal_person', 'trainer'],
  '/courses': ['system_administrator', 'institutional_administrator', 'focal_person', 'trainer', 'scholar'],
  '/reports': ['system_administrator', 'institutional_administrator', 'registrar', 'focal_person'],
  '/learner': ['applicant', 'scholar'],
  '/admin/institutions': ['system_administrator', 'institutional_administrator', 'registrar'],
  '/admin/users': ['system_administrator', 'institutional_administrator'],
  '/admin/audit': ['system_administrator', 'institutional_administrator'],
};

export function resolveRoleDefaultRoute(role: AppRole): string {
  switch (role) {
    case 'system_administrator':
    case 'institutional_administrator':
      return '/dashboard';
    case 'registrar':
      return '/enrollments';
    case 'focal_person':
      return '/competency';
    case 'trainer':
      return '/schedules';
    case 'tesda_viewer':
      return '/tesda-overview';
    case 'scholar':
    case 'applicant':
    default:
      return '/learner';
  }
}

export function isPathAllowedForRole(pathname: string, role: AppRole): boolean {
  const normalized = pathname.split('?')[0] ?? pathname;
  const allowed = ROUTE_ALLOWED_ROLES[normalized];
  if (!allowed) return false;
  return allowed.includes(role);
}

export function resolveAuthorizedPostLoginRoute(profile: UserProfile, requestedFrom?: string): string {
  if (isPasswordUpdateRequired(profile)) {
    return '/settings/password';
  }
  if (
    requestedFrom &&
    requestedFrom !== '/' &&
    requestedFrom !== '/login' &&
    isPathAllowedForRole(requestedFrom, profile.role)
  ) {
    return requestedFrom;
  }
  return resolveRoleDefaultRoute(profile.role);
}

export function isStaffRole(role: AppRole): boolean {
  return STAFF_DASHBOARD_ROLES.includes(role);
}

export function canAccessRoute(profile: UserProfile | null, allowedRoles: readonly AppRole[]): boolean {
  if (!profile || profile.accountStatus !== 'active') {
    return false;
  }
  return allowedRoles.includes(profile.role);
}

export function isPasswordUpdateRequired(profile: UserProfile | null): boolean {
  if (!profile) return false;
  if (profile.forcePasswordChange) return true;
  if (!profile.passwordExpiryExempt && profile.passwordExpiresAt) {
    return new Date(profile.passwordExpiresAt).getTime() <= Date.now();
  }
  return false;
}
