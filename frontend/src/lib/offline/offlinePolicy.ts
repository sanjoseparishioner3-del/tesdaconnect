import { env } from '@/lib/env';
import type { AppRole } from '@/types/auth';

const DEFAULT_STAFF_TTL_HOURS = 12;
const DEFAULT_LEARNER_TTL_HOURS = 168;

const LEARNER_ROLES: readonly AppRole[] = ['scholar', 'applicant'];

/**
 * How long a device may unlock this role's workspace offline after the last
 * server-verified session. Staff keep the short shared-PC window; scholars and
 * applicants (personal phones, poor signal, mostly their own read-only data) get
 * a longer window that slides forward whenever the app reaches the server.
 */
export function offlineTtlHoursForRole(role: AppRole | null | undefined): number {
  if (role && LEARNER_ROLES.includes(role)) {
    return Number(env.VITE_LEARNER_OFFLINE_TTL_HOURS) || DEFAULT_LEARNER_TTL_HOURS;
  }
  return Number(env.VITE_OFFLINE_MAX_TTL_HOURS) || DEFAULT_STAFF_TTL_HOURS;
}

export function offlineExpiryIsoForRole(role: AppRole | null | undefined, nowMs: number = Date.now()): string {
  return new Date(nowMs + offlineTtlHoursForRole(role) * 3600 * 1000).toISOString();
}
