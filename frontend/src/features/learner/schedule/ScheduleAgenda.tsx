import { CalendarDays, Clock, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AgendaBatch {
  id: string;
  code: string;
  course: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  nextClassAt: string | null;
  venue: string | null;
}

export interface AgendaEvent {
  id: string;
  title: string;
  date: string;
  time: string | null;
  type: string;
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  upcoming: { label: 'Upcoming', className: 'bg-sky-50 text-sky-800' },
  in_training: { label: 'In training', className: 'bg-emerald-50 text-emerald-800' },
  completed: { label: 'Completed', className: 'bg-slate-100 text-slate-700' },
  cancelled: { label: 'Cancelled', className: 'bg-red-50 text-red-700' },
};

function fmtDate(iso: string | null | undefined, withYear = false): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}) });
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/**
 * Phone-friendly schedule: one card per training batch (instead of repeating a multi-week batch on
 * every day of a calendar list) and a short list of upcoming dates and deadlines.
 */
export function ScheduleAgenda({ batches, events }: { batches: AgendaBatch[]; events: AgendaEvent[] }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = events
    .filter((e) => new Date(`${e.date}T00:00:00`).getTime() >= today.getTime())
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-4">
      <section aria-label="Training batches">
        <h3 className="px-1 text-xs font-bold uppercase tracking-wider text-slate-500">Your training batch</h3>
        {batches.length === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">No training batch assigned yet.</p>
        ) : (
          <ul className="mt-2 space-y-2.5">
            {batches.map((b) => {
              const st = STATUS_LABEL[b.status] ?? { label: b.status.replace(/_/g, ' '), className: 'bg-slate-100 text-slate-700' };
              return (
                <li key={b.id} className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold leading-snug text-slate-900">{b.course}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-slate-500">{b.code}</p>
                    </div>
                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize', st.className)}>{st.label}</span>
                  </div>
                  <dl className="mt-2.5 space-y-1 text-xs text-slate-600">
                    {(b.startsAt || b.endsAt) && (
                      <div className="flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-teal-700" aria-hidden="true" />
                        <dt className="sr-only">Dates</dt>
                        <dd>
                          {fmtDate(b.startsAt)}
                          {b.endsAt ? ` to ${fmtDate(b.endsAt, true)}` : ''}
                        </dd>
                      </div>
                    )}
                    {b.nextClassAt && (
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 shrink-0 text-teal-700" aria-hidden="true" />
                        <dt className="sr-only">Next class</dt>
                        <dd>Next class: {fmtDateTime(b.nextClassAt)}</dd>
                      </div>
                    )}
                    {b.venue && (
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0 text-teal-700" aria-hidden="true" />
                        <dt className="sr-only">Venue</dt>
                        <dd>{b.venue}</dd>
                      </div>
                    )}
                  </dl>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label="Dates and deadlines">
        <h3 className="px-1 text-xs font-bold uppercase tracking-wider text-slate-500">Dates and deadlines</h3>
        {upcoming.length === 0 ? (
          <p className="mt-2 rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">No upcoming dates yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {upcoming.map((e) => {
              const d = new Date(`${e.date}T00:00:00`);
              const deadline = e.type === 'deadline';
              return (
                <li key={e.id} className="flex items-center gap-3 p-3">
                  <div className={cn('flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl', deadline ? 'bg-amber-50 text-amber-800' : 'bg-teal-50 text-teal-800')}>
                    <span className="text-[10px] font-semibold uppercase leading-none">{d.toLocaleDateString('en-PH', { month: 'short' })}</span>
                    <span className="text-lg font-bold leading-tight">{d.getDate()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900">{e.title}</p>
                    <p className="text-xs text-slate-500">
                      {deadline ? 'Deadline' : 'Announcement'}
                      {e.time ? ` · ${e.time}` : ''}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
