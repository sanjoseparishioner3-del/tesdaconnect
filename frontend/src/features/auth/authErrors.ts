/**
 * True when a Supabase sign-in error means the auth server could not be reached
 * (network failure, timeout, or 5xx) rather than a definitive credential rejection.
 */
export function isNetworkOrServerOutage(error: { message: string; status?: number }): boolean {
  if (typeof error.status === 'number' && (error.status === 0 || error.status >= 500)) return true;
  return /failed to fetch|networkerror|network request failed|load failed|timeout|timed out/i.test(error.message);
}
