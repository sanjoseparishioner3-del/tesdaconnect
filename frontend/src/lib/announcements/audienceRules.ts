import type { AppRole } from '@/types/auth';

export type SelectableTargetGroup = 'scholars' | 'registrar' | 'focal_person';

export interface TargetGroupOption {
  id: SelectableTargetGroup;
  label: string;
}

export function getAllowedAnnouncementTargetsForRole(role?: AppRole | null): TargetGroupOption[] {
  if (role === 'system_administrator' || role === 'institutional_administrator') {
    return [
      { id: 'scholars', label: 'Scholars & Students' },
      { id: 'registrar', label: 'Registrar' },
      { id: 'focal_person', label: 'Focal Person' },
    ];
  }
  if (role === 'registrar') {
    return [
      { id: 'focal_person', label: 'Focal Person' },
      { id: 'scholars', label: 'Scholars & Students' },
    ];
  }
  return [];
}

export function canRolePublishAnnouncements(role?: AppRole | null): boolean {
  return (
    role === 'system_administrator' ||
    role === 'institutional_administrator' ||
    role === 'registrar'
  );
}

export function expandAndSanitizeTargetRoles(
  authorRole: AppRole | null | undefined,
  selectedGroups: SelectableTargetGroup[],
): { targetRoles: string[]; legacyAudience: 'all' | 'scholar' | 'focal_person' | 'staff' } {
  const allowedIds = new Set(getAllowedAnnouncementTargetsForRole(authorRole).map((o) => o.id));
  const cleanGroups = selectedGroups.filter((g) => allowedIds.has(g));
  const targetSet = new Set<string>();

  for (const g of cleanGroups) {
    if (g === 'scholars') {
      targetSet.add('scholar');
      targetSet.add('applicant');
    } else if (g === 'registrar') {
      targetSet.add('registrar');
    } else if (g === 'focal_person') {
      targetSet.add('focal_person');
    }
  }

  const targetRoles = Array.from(targetSet);

  let legacyAudience: 'all' | 'scholar' | 'focal_person' | 'staff' = 'scholar';
  if (cleanGroups.includes('registrar') && cleanGroups.includes('scholars') && cleanGroups.includes('focal_person')) {
    legacyAudience = 'all';
  } else if (cleanGroups.includes('registrar') || (cleanGroups.includes('focal_person') && !cleanGroups.includes('scholars'))) {
    legacyAudience = cleanGroups.length === 1 && cleanGroups[0] === 'focal_person' ? 'focal_person' : 'staff';
  } else if (cleanGroups.includes('focal_person') && cleanGroups.includes('scholars')) {
    legacyAudience = 'all';
  }

  return { targetRoles, legacyAudience };
}

export function formatTargetRolesSummary(targetRoles?: string[] | null, fallbackAudience?: string): string {
  if (!Array.isArray(targetRoles) || targetRoles.length === 0) {
    return fallbackAudience ?? 'all';
  }
  const labels: string[] = [];
  if (targetRoles.includes('scholar') || targetRoles.includes('applicant')) labels.push('Scholars/Students');
  if (targetRoles.includes('registrar')) labels.push('Registrar');
  if (targetRoles.includes('focal_person')) labels.push('Focal Person');
  return labels.length > 0 ? labels.join(' · ') : fallbackAudience ?? 'all';
}
