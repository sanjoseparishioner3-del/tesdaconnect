import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, CalendarDays, CloudOff, GraduationCap, School, Users } from 'lucide-react';
import { isSupabaseConfigured } from '@/lib/env';
import { getSupabaseClient } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { manilaToday } from '@/features/admin/intakePeriods';
import { useAuthStore } from '@/stores/authStore';
import { useConnectivityStore } from '@/stores/connectivityStore';
import { batchProgress, fillPercent, formatPhDate, PROGRESS_LABEL, summarize, type TesdaBatchRow, type TesdaProgress } from './tesdaOverview';

const PROGRESS_STYLE: Record<TesdaProgress, string> = {
  not_started: 'bg-sky-50 text-sky-800 ring-sky-200',
  started: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  completed: 'bg-slate-100 text-slate-700 ring-slate-200',
  cancelled: 'bg-red-50 text-red-700 ring-red-200',
};

type Filter = 'all' | TesdaProgress;

export function TesdaOverviewPage() {
  const profile = useAuthStore((s) => s.profile);
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const [filter, setFilter] = React.useState<Filter>('all');
  const [campus, setCampus] = React.useState('all');
  const today = manilaToday();

  const query = useQuery<TesdaBatchRow[]>({
    queryKey: ['tesda-overview'],
    enabled: isSupabaseConfigured && Boolean(profile?.id) && isOnline,
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return [];
      const result = await client.rpc('get_tesda_overview');
      if (result.error) throw new Error(result.error.message);
      return Array.isArray(result.data) ? (result.data as TesdaBatchRow[]) : [];
    },
  });

  const rows = React.useMemo(() => query.data ?? [], [query.data]);
  const campuses = React.useMemo(() => Array.from(new Set(rows.map((r) => r.institution_code))).sort(), [rows]);
  const visible = rows.filter(
    (r) => (campus === 'all' || r.institution_code === campus) && (filter === 'all' || batchProgress(r, today) === filter),
  );
  const totals = summarize(rows, today);

  const tiles = [
    { label: 'Schools', value: totals.campuses, Icon: School },
    { label: 'Batches', value: totals.batches, Icon: GraduationCap },
    { label: 'Started', value: totals.started, Icon: CalendarDays },
    { label: 'Enrolled scholars', value: totals.enrolled, Icon: Users },
  ];

  return (
    <div className="space-y-5 pb-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 sm:text-2xl">
          <BarChart3 className="h-6 w-6 shrink-0 text-teal-700" /> TESDA Overview
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600">
          Every school&apos;s training batches: when they start and end, and how many scholars are enrolled. Numbers only, no personal details.
        </p>
      </div>

      {!isOnline && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
          <CloudOff className="mt-0.5 h-4 w-4 shrink-0" /> You are offline. Connect to the internet to see the latest numbers.
        </p>
      )}
      {query.isError && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          Could not load the overview. {query.error instanceof Error ? query.error.message : ''}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(({ label, value, Icon }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
            <Icon className="h-4 w-4 text-teal-700" aria-hidden="true" />
            <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
            <p className="text-xs text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter batches">
        {(['all', 'not_started', 'started', 'completed'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            aria-pressed={filter === key}
            className={cn(
              'min-h-9 rounded-full border px-3.5 text-sm font-medium',
              filter === key ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
            )}
          >
            {key === 'all' ? 'All' : PROGRESS_LABEL[key]}
          </button>
        ))}
        {campuses.length > 1 && (
          <select
            value={campus}
            onChange={(e) => setCampus(e.target.value)}
            aria-label="School"
            className="min-h-9 rounded-full border border-slate-300 bg-white px-3 text-sm"
          >
            <option value="all">All schools</option>
            {campuses.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
      </div>

      {query.isLoading && <p className="text-sm text-slate-500">Loading…</p>}

      <ul className="grid gap-3 md:grid-cols-2" aria-label="Training batches">
        {visible.map((row) => {
          const progress = batchProgress(row, today);
          const percent = fillPercent(row.enrolled, row.capacity);
          return (
            <li key={row.batch_id} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">{row.institution_code}</p>
                  <p className="text-base font-semibold leading-snug text-slate-900">{row.course_name}</p>
                  <p className="font-mono text-[11px] text-slate-500">{row.batch_code}</p>
                </div>
                <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset', PROGRESS_STYLE[progress])}>
                  {PROGRESS_LABEL[progress]}
                </span>
              </div>

              <div>
                <div className="flex items-baseline justify-between text-xs text-slate-600">
                  <span>
                    Enrollees <strong className="text-base text-slate-900">{row.enrolled}/{row.capacity}</strong>
                  </span>
                  <span>{percent}%</span>
                </div>
                <div
                  className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={percent}
                  aria-label={`${row.enrolled} of ${row.capacity} enrolled`}
                >
                  <div className={cn('h-full rounded-full', percent >= 100 ? 'bg-amber-500' : 'bg-teal-600')} style={{ width: `${percent}%` }} />
                </div>
              </div>

              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-slate-500">Date started</dt>
                  <dd className="font-medium text-slate-900">{formatPhDate(row.starts_at)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Training ends</dt>
                  <dd className="font-medium text-slate-900">{formatPhDate(row.ends_at)}</dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>

      {!query.isLoading && visible.length === 0 && !query.isError && (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          {rows.length === 0 ? 'No training batches have been created yet.' : 'No batches match this filter.'}
        </p>
      )}
    </div>
  );
}
