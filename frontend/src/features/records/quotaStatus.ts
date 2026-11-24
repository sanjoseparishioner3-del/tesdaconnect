export interface QuotaPeriod {
  id: string;
  institution_id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  quota: number;
  is_locked: boolean;
}

export interface QuotaUsage {
  period_id: string;
  used: number;
  course_usage: Array<{ course_id: string; used: number }>;
}

export interface QuotaCourseLimit {
  intake_period_id: string;
  course_id: string;
  quota: number;
}

export interface CampusQuotaStatus {
  institutionId: string;
  periodId: string;
  periodName: string;
  quota: number;
  confirmed: number;
  left: number;
  full: boolean;
  courses: Array<{ courseId: string; limit: number; confirmed: number; full: boolean }>;
}

/** The period covering today for each campus, with how many scholars are already confirmed. */
export function buildQuotaStatuses(
  periods: QuotaPeriod[],
  usage: QuotaUsage[],
  limits: QuotaCourseLimit[],
  today: string,
): CampusQuotaStatus[] {
  const result: CampusQuotaStatus[] = [];
  const seen = new Set<string>();
  for (const period of periods) {
    if (today < period.starts_at || today > period.ends_at || seen.has(period.institution_id)) continue;
    seen.add(period.institution_id);
    const u = usage.find((x) => x.period_id === period.id);
    const confirmed = u?.used ?? 0;
    result.push({
      institutionId: period.institution_id,
      periodId: period.id,
      periodName: period.name,
      quota: period.quota,
      confirmed,
      left: Math.max(period.quota - confirmed, 0),
      full: confirmed >= period.quota,
      courses: limits
        .filter((l) => l.intake_period_id === period.id)
        .map((l) => {
          const used = u?.course_usage?.find((c) => c.course_id === l.course_id)?.used ?? 0;
          return { courseId: l.course_id, limit: l.quota, confirmed: used, full: used >= l.quota };
        }),
    });
  }
  return result;
}

/** True when confirming one more scholar of this campus/course would break the quota. */
export function isConfirmBlocked(statuses: CampusQuotaStatus[], institutionId: string, courseId: string | null): boolean {
  const status = statuses.find((s) => s.institutionId === institutionId);
  if (!status) return false;
  if (status.full) return true;
  if (!courseId) return false;
  return status.courses.some((c) => c.courseId === courseId && c.full);
}
