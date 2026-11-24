import { useQuery } from '@tanstack/react-query';
import { manilaToday } from '@/features/admin/intakePeriods';
import { isSupabaseConfigured } from '@/lib/env';
import { getSupabaseClient } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useConnectivityStore } from '@/stores/connectivityStore';
import { buildQuotaStatuses, type CampusQuotaStatus, type QuotaCourseLimit, type QuotaPeriod, type QuotaUsage } from './quotaStatus';

/** Live quota status per campus for staff. Empty when offline or when no period covers today. */
export function useCampusQuotas(): { statuses: CampusQuotaStatus[]; refetch: () => void } {
  const profile = useAuthStore((s) => s.profile);
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const enabled = isSupabaseConfigured && isOnline && Boolean(profile?.id);

  const query = useQuery<CampusQuotaStatus[]>({
    queryKey: ['campus-quota-status', profile?.id],
    enabled,
    staleTime: 15_000,
    retry: false,
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return [];
      const today = manilaToday();
      const [periodsRes, usageRes, limitsRes] = await Promise.all([
        client
          .from('intake_periods')
          .select('id, institution_id, name, starts_at, ends_at, quota, is_locked')
          .lte('starts_at', today)
          .gte('ends_at', today)
          .returns<QuotaPeriod[]>(),
        client.rpc('get_intake_usage', { p_institution_id: null }),
        client.from('intake_course_quotas').select('intake_period_id, course_id, quota').returns<QuotaCourseLimit[]>(),
      ]);
      if (periodsRes.error || usageRes.error) return [];
      const usage: QuotaUsage[] = Array.isArray(usageRes.data) ? (usageRes.data as QuotaUsage[]) : [];
      return buildQuotaStatuses(periodsRes.data ?? [], usage, limitsRes.data ?? [], today);
    },
  });

  return { statuses: query.data ?? [], refetch: () => void query.refetch() };
}
