import { CircleAlert, Gauge } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CampusQuotaStatus } from './quotaStatus';

/**
 * Shows the registrar how many scholars are confirmed against the quota, so they confirm
 * with the quota in mind. The database refuses to confirm past the quota either way.
 */
export function QuotaStatusPanel({ statuses, campusNames, courseNames }: { statuses: CampusQuotaStatus[]; campusNames: Record<string, string>; courseNames: Record<string, string> }) {
  if (statuses.length === 0) return null;
  return (
    <section aria-label="Enrollment quota" className="grid gap-3 md:grid-cols-2">
      {statuses.map((s) => {
        const percent = s.quota <= 0 ? 100 : Math.min(100, Math.round((s.confirmed / s.quota) * 100));
        return (
          <div key={s.periodId} className={cn('space-y-2.5 rounded-2xl border bg-white p-4 shadow-sm', s.full ? 'border-red-300' : 'border-slate-200')} data-testid="quota-card">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-teal-800">
                  <Gauge className="h-3.5 w-3.5" aria-hidden="true" /> {campusNames[s.institutionId] ?? 'Campus'}
                </p>
                <p className="truncate text-sm font-semibold text-slate-900">{s.periodName}</p>
              </div>
              <p className="shrink-0 text-right">
                <span className="text-2xl font-bold text-slate-900">{s.confirmed}</span>
                <span className="text-sm text-slate-500"> / {s.quota}</span>
                <span className="block text-[11px] text-slate-500">confirmed</span>
              </p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={`${s.confirmed} of ${s.quota} confirmed`}>
              <div className={cn('h-full rounded-full', s.full ? 'bg-red-500' : percent >= 80 ? 'bg-amber-500' : 'bg-teal-600')} style={{ width: `${percent}%` }} />
            </div>
            {s.full ? (
              <p className="flex items-start gap-1.5 text-sm font-medium text-red-700" role="alert">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                Quota is full. You cannot confirm more scholars until a slot is freed or the quota is raised.
              </p>
            ) : (
              <p className="text-sm text-slate-700">{s.left} slot{s.left === 1 ? '' : 's'} left to confirm.</p>
            )}
            {s.courses.length > 0 && (
              <ul className="space-y-1 border-t border-slate-100 pt-2 text-xs text-slate-600">
                {s.courses.map((c) => (
                  <li key={c.courseId} className="flex justify-between gap-2">
                    <span className="truncate">{courseNames[c.courseId] ?? 'Course'}</span>
                    <span className={cn('shrink-0 font-medium', c.full ? 'text-red-700' : 'text-slate-900')}>
                      {c.confirmed} / {c.limit}
                      {c.full ? ' (full)' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}
