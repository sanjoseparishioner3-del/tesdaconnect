import { useQuery } from '@tanstack/react-query';
import { CalendarClock, CircleAlert, CircleCheck } from 'lucide-react';
import { isSupabaseConfigured } from '@/lib/env';
import { getSupabaseClient } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { describeEnrollmentWindow, type EnrollmentWindow } from './enrollmentWindow';

/**
 * Tells the scholar whether enrollment is open before they fill in the whole form. It is only a
 * hint: the server makes the final decision when the registration arrives (including for forms
 * saved offline), so this banner stays silent when offline or when the check fails.
 */
export function EnrollmentWindowBanner({ institutionId, courseId, isOnline }: { institutionId: string | null; courseId?: string | null; isOnline: boolean }) {
  const valid = Boolean(institutionId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(institutionId));
  const query = useQuery<EnrollmentWindow | null>({
    queryKey: ['enrollment-window', institutionId, courseId ?? null],
    enabled: isSupabaseConfigured && isOnline && valid,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return null;
      const result = await client.rpc('get_enrollment_window', {
        p_institution_id: institutionId,
        p_course_id: courseId && /^[0-9a-f-]{36}$/i.test(courseId) ? courseId : null,
      });
      if (result.error) return null;
      return (result.data ?? null) as EnrollmentWindow | null;
    },
  });

  if (!query.data) return null;
  const info = describeEnrollmentWindow(query.data);
  if (!info) return null;

  const Icon = info.tone === 'open' ? CircleCheck : query.data.reason === 'not_started' ? CalendarClock : CircleAlert;
  return (
    <p
      role="status"
      data-testid="enrollment-window-banner"
      className={cn(
        'flex items-start gap-2 rounded-xl border p-3 text-sm',
        info.tone === 'open' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-300 bg-amber-50 text-amber-900',
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        {info.text}
        {info.tone === 'closed' && ' You can still save your details, but they will not be accepted until enrollment reopens.'}
      </span>
    </p>
  );
}
