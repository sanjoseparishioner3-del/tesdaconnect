import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, CalendarRange, CloudOff, Lock, Pencil, Plus, School, SlidersHorizontal, Trash2, Unlock } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AppDialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isSupabaseConfigured } from '@/lib/env';
import { getSupabaseClient } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useConnectivityStore } from '@/stores/connectivityStore';
import { CAMPUS_STATUS_LABEL, loadCampuses, type CampusRow } from '@/lib/campuses';
import { validateCampusForm } from './campuses';
import {
  friendlyPeriodError,
  getPeriodState,
  manilaToday,
  suggestPeriodCode,
  usagePercent,
  validatePeriodForm,
  type PeriodStateKey,
} from './intakePeriods';

type InstitutionRow = CampusRow & {
  address: string | null;
  contact_email: string | null;
  contact_number: string | null;
  is_active: boolean;
};

interface PeriodRow {
  id: string;
  institution_id: string;
  code: string;
  name: string;
  starts_at: string;
  ends_at: string;
  quota: number;
  is_locked: boolean;
}

interface CourseRow {
  id: string;
  institution_id: string;
  code: string;
  name: string;
  is_active: boolean;
}

interface CourseQuotaRow {
  id: string;
  intake_period_id: string;
  course_id: string;
  quota: number;
}

interface UsageRow {
  period_id: string;
  used: number;
  course_usage: Array<{ course_id: string; used: number }>;
}

const STATE_STYLE: Record<PeriodStateKey, string> = {
  open: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  upcoming: 'bg-sky-50 text-sky-800 ring-sky-200',
  ended: 'bg-slate-100 text-slate-700 ring-slate-200',
  locked: 'bg-amber-50 text-amber-800 ring-amber-200',
  full: 'bg-red-50 text-red-700 ring-red-200',
};

function fmtDate(value: string): string {
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function emptyForm(campusId = '') {
  const start = manilaToday();
  const end = new Date(Date.now() + 60 * 86_400_000).toISOString().slice(0, 10);
  return { campusId, name: '', startsAt: start, endsAt: end, quota: '100' };
}

export function InstitutionsAdminPage() {
  const profile = useAuthStore((s) => s.profile);
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const queryClient = useQueryClient();
  const enabled = isSupabaseConfigured && Boolean(profile?.id);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PeriodRow | null>(null);
  const [form, setForm] = React.useState(emptyForm());
  const [formError, setFormError] = React.useState<string | null>(null);
  const [courseLimitsFor, setCourseLimitsFor] = React.useState<PeriodRow | null>(null);
  const [courseDraft, setCourseDraft] = React.useState<Record<string, string>>({});
  const [deleting, setDeleting] = React.useState<PeriodRow | null>(null);
  const [campusOpen, setCampusOpen] = React.useState(false);
  const [editingCampus, setEditingCampus] = React.useState<InstitutionRow | null>(null);
  const [campusForm, setCampusForm] = React.useState({ code: '', name: '', address: '', email: '', phone: '' });
  const [campusError, setCampusError] = React.useState<string | null>(null);
  const isSysAdmin = profile?.role === 'system_administrator';

  const instQuery = useQuery<InstitutionRow[]>({
    queryKey: ['admin-institutions'],
    enabled,
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return [];
      const { data, error } = await loadCampuses(client);
      if (error) throw new Error(error);
      return data as InstitutionRow[];
    },
  });

  const periodsQuery = useQuery<PeriodRow[]>({
    queryKey: ['admin-intake-periods'],
    enabled,
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return [];
      const { data, error } = await client
        .from('intake_periods')
        .select('id, institution_id, code, name, starts_at, ends_at, quota, is_locked')
        .order('starts_at', { ascending: false })
        .limit(60)
        .returns<PeriodRow[]>();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const usageQuery = useQuery<Record<string, UsageRow>>({
    queryKey: ['admin-intake-usage'],
    enabled,
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return {};
      const result = await client.rpc('get_intake_usage', { p_institution_id: null });
      if (result.error) throw new Error(result.error.message);
      const rows: UsageRow[] = Array.isArray(result.data) ? (result.data as UsageRow[]) : [];
      const map: Record<string, UsageRow> = {};
      for (const row of rows) map[row.period_id] = row;
      return map;
    },
  });

  const coursesQuery = useQuery<CourseRow[]>({
    queryKey: ['admin-courses-for-quotas'],
    enabled,
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return [];
      const { data, error } = await client
        .from('courses')
        .select('id, institution_id, code, name, is_active')
        .eq('is_active', true)
        .order('name', { ascending: true })
        .returns<CourseRow[]>();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const courseQuotasQuery = useQuery<CourseQuotaRow[]>({
    queryKey: ['admin-intake-course-quotas'],
    enabled,
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return [];
      const { data, error } = await client
        .from('intake_course_quotas')
        .select('id, intake_period_id, course_id, quota')
        .returns<CourseQuotaRow[]>();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const institutions = React.useMemo(() => instQuery.data ?? [], [instQuery.data]);
  const periods = React.useMemo(() => periodsQuery.data ?? [], [periodsQuery.data]);
  const usage = usageQuery.data ?? {};
  const today = manilaToday();

  const refreshAll = React.useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-intake-periods'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-intake-usage'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-intake-course-quotas'] }),
    ]);
  }, [queryClient]);

  const defaultCampus = profile?.institutions?.[0]?.institutionId ?? institutions[0]?.id ?? '';

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm(defaultCampus));
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (period: PeriodRow) => {
    setEditing(period);
    setForm({ campusId: period.institution_id, name: period.name, startsAt: period.starts_at, endsAt: period.ends_at, quota: String(period.quota) });
    setFormError(null);
    setFormOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const client = getSupabaseClient();
      if (!client || !profile) throw new Error('Sign in to continue.');
      const campusId = form.campusId || defaultCampus;
      if (!campusId) throw new Error('Choose a campus first.');
      const problem = validatePeriodForm(form, {
        used: editing ? usage[editing.id]?.used ?? 0 : undefined,
        others: periods.filter((p) => p.id !== editing?.id),
        institutionId: campusId,
      });
      if (problem) throw new Error(problem);
      const values = {
        name: form.name.trim(),
        starts_at: form.startsAt,
        ends_at: form.endsAt,
        quota: Number.parseInt(form.quota, 10),
      };
      if (editing) {
        const { error } = await client.from('intake_periods').update(values).eq('id', editing.id);
        if (error) throw new Error(error.message);
        return 'Enrollment period saved.';
      }
      const campus = institutions.find((i) => i.id === campusId);
      const code = suggestPeriodCode(campus?.code ?? 'INT', form.startsAt, periods.map((p) => p.code));
      const { error } = await client
        .from('intake_periods')
        .insert({ ...values, institution_id: campusId, code, created_by_user_id: profile.id });
      if (error) throw new Error(error.message);
      return 'Enrollment period created.';
    },
    onSuccess: async (message) => {
      toast.success(message);
      setFormOpen(false);
      await refreshAll();
    },
    onError: (err: Error) => setFormError(friendlyPeriodError(err.message)),
  });

  const lockMutation = useMutation({
    mutationFn: async (period: PeriodRow) => {
      const client = getSupabaseClient();
      if (!client || !profile) throw new Error('Sign in to continue.');
      const lock = !period.is_locked;
      const { error } = await client
        .from('intake_periods')
        .update({ is_locked: lock, locked_at: lock ? new Date().toISOString() : null, locked_by_user_id: lock ? profile.id : null })
        .eq('id', period.id);
      if (error) throw new Error(error.message);
      return lock;
    },
    onSuccess: async (locked) => {
      toast.success(locked ? 'Enrollment closed for this period.' : 'Enrollment reopened for this period.');
      await refreshAll();
    },
    onError: (err: Error) => toast.error(friendlyPeriodError(err.message)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (period: PeriodRow) => {
      const client = getSupabaseClient();
      if (!client) throw new Error('Sign in to continue.');
      const { error } = await client.from('intake_periods').delete().eq('id', period.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success('Enrollment period deleted.');
      setDeleting(null);
      await refreshAll();
    },
    onError: (err: Error) => {
      toast.error(friendlyPeriodError(err.message));
      setDeleting(null);
    },
  });

  const openCourseLimits = (period: PeriodRow) => {
    const draft: Record<string, string> = {};
    for (const q of courseQuotasQuery.data ?? []) {
      if (q.intake_period_id === period.id) draft[q.course_id] = String(q.quota);
    }
    setCourseDraft(draft);
    setCourseLimitsFor(period);
  };

  const courseLimitsMutation = useMutation({
    mutationFn: async () => {
      const client = getSupabaseClient();
      if (!client || !profile || !courseLimitsFor) throw new Error('Sign in to continue.');
      const period = courseLimitsFor;
      const existing = (courseQuotasQuery.data ?? []).filter((q) => q.intake_period_id === period.id);
      const campusCourses = (coursesQuery.data ?? []).filter((c) => c.institution_id === period.institution_id);

      const upserts: Array<{ intake_period_id: string; course_id: string; quota: number; created_by_user_id: string }> = [];
      const removals: string[] = [];
      for (const course of campusCourses) {
        const raw = (courseDraft[course.id] ?? '').trim();
        const current = existing.find((q) => q.course_id === course.id);
        if (raw === '') {
          if (current) removals.push(current.id);
          continue;
        }
        if (!/^\d+$/.test(raw) || Number.parseInt(raw, 10) < 1) {
          throw new Error(`Enter a whole number of 1 or more for ${course.name}, or leave it empty for no limit.`);
        }
        const value = Number.parseInt(raw, 10);
        if (value > period.quota) throw new Error(`${course.name}: a course limit cannot be higher than the period total of ${period.quota}.`);
        if (!current || current.quota !== value) {
          upserts.push({ intake_period_id: period.id, course_id: course.id, quota: value, created_by_user_id: profile.id });
        }
      }
      if (removals.length > 0) {
        const { error } = await client.from('intake_course_quotas').delete().in('id', removals);
        if (error) throw new Error(error.message);
      }
      if (upserts.length > 0) {
        const { error } = await client.from('intake_course_quotas').upsert(upserts, { onConflict: 'intake_period_id,course_id' });
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: async () => {
      toast.success('Course limits saved.');
      setCourseLimitsFor(null);
      await refreshAll();
    },
    onError: (err: Error) => toast.error(friendlyPeriodError(err.message)),
  });

  const openAddCampus = () => {
    setEditingCampus(null);
    setCampusForm({ code: '', name: '', address: '', email: '', phone: '' });
    setCampusError(null);
    setCampusOpen(true);
  };

  const openEditCampus = (inst: InstitutionRow) => {
    setEditingCampus(inst);
    setCampusForm({ code: inst.code, name: inst.name, address: inst.address ?? '', email: inst.contact_email ?? '', phone: inst.contact_number ?? '' });
    setCampusError(null);
    setCampusOpen(true);
  };

  const campusMutation = useMutation({
    mutationFn: async (override?: { inst: InstitutionRow; isActive: boolean }) => {
      const client = getSupabaseClient();
      if (!client) throw new Error('Sign in to continue.');
      if (override) {
        const { error } = await client.from('institutions').update({ is_active: override.isActive }).eq('id', override.inst.id);
        if (error) throw new Error(error.message);
        return override.isActive ? 'Campus is active again.' : 'Campus deactivated.';
      }
      const problem = validateCampusForm(campusForm, { existingCodes: institutions.map((i) => i.code), editing: Boolean(editingCampus) });
      if (problem) throw new Error(problem);
      const values = {
        name: campusForm.name.trim(),
        address: campusForm.address.trim() || null,
        contact_email: campusForm.email.trim() || null,
        contact_number: campusForm.phone.trim() || null,
      };
      if (editingCampus) {
        const { error } = await client.from('institutions').update(values).eq('id', editingCampus.id);
        if (error) throw new Error(error.message);
        return 'Campus saved.';
      }
      const { error } = await client.from('institutions').insert({ ...values, code: campusForm.code.trim().toUpperCase(), is_active: true });
      if (error) throw new Error(error.message);
      return 'Campus added. Assign its staff in Users & Role Access.';
    },
    onSuccess: async (message) => {
      toast.success(message);
      setCampusOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['admin-institutions'] });
    },
    onError: (err: Error) => {
      const message = /duplicate key|institutions_code_key/i.test(err.message) ? 'A campus with that code already exists.' : friendlyPeriodError(err.message);
      setCampusError(message);
      if (!campusOpen) toast.error(message);
    },
  });

  const loadFailed = instQuery.isError || periodsQuery.isError;
  const busy = saveMutation.isPending || lockMutation.isPending || deleteMutation.isPending || courseLimitsMutation.isPending;

  const periodsByCampus = (campusId: string) => periods.filter((p) => p.institution_id === campusId);

  return (
    <div className="space-y-5 pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 sm:text-2xl">
            <Building2 className="h-6 w-6 shrink-0 text-teal-700" /> Campuses &amp; Enrollment Periods
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Choose when each campus accepts new registrations and how many scholars it can take. Scholars cannot submit outside an open period, and the registrar cannot confirm more scholars than the slots.
          </p>
        </div>
        {isSupabaseConfigured && (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {isSysAdmin && (
              <Button type="button" size="lg" variant="outline" className="w-full sm:w-auto" onClick={openAddCampus} disabled={!isOnline}>
                <School className="h-4 w-4" /> Add campus
              </Button>
            )}
            <Button type="button" size="lg" variant="secondary" className="w-full sm:w-auto" onClick={openCreate} disabled={!isOnline || institutions.length === 0}>
              <Plus className="h-4 w-4" /> Add enrollment period
            </Button>
          </div>
        )}
      </div>

      {!isOnline && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
          <CloudOff className="mt-0.5 h-4 w-4 shrink-0" /> You are offline. You can look at the periods below, but changes need an internet connection.
        </p>
      )}

      {loadFailed && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          Could not load the campuses. Check your connection and try again.
        </p>
      )}

      {usageQuery.isError && !loadFailed && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
          Slot counts are not available right now, so the numbers below may show 0 used. Reload the page or ask the system administrator to finish the database update.
        </p>
      )}

      <div className="space-y-4">
        {institutions.map((inst) => {
          const campusPeriods = periodsByCampus(inst.id);
          const current = campusPeriods.find((p) => today >= p.starts_at && today <= p.ends_at);
          const currentUsed = current ? usage[current.id]?.used ?? 0 : 0;
          const currentState = current ? getPeriodState(current, currentUsed, today) : null;
          return (
            <section key={inst.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label={inst.name}>
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-slate-900">{inst.name}</h2>
                  <p className="truncate text-xs text-slate-500">{inst.address ?? 'Occidental Mindoro'}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {!inst.is_active && <Badge variant="warning">Inactive</Badge>}
                  {inst.operating_status && (
                    <span
                      className={
                        inst.operating_status === 'active'
                          ? 'rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-semibold text-white'
                          : 'rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-800 ring-1 ring-inset ring-sky-200'
                      }
                    >
                      {CAMPUS_STATUS_LABEL[inst.operating_status]}
                    </span>
                  )}
                  <Badge variant={inst.is_active ? 'success' : 'secondary'}>{inst.code}</Badge>
                  {isSysAdmin && (
                    <>
                      <Button type="button" size="sm" variant="ghost" aria-label={`Edit ${inst.name}`} disabled={!isOnline} onClick={() => openEditCampus(inst)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" size="sm" variant="ghost" disabled={!isOnline || campusMutation.isPending} onClick={() => campusMutation.mutate({ inst, isActive: !inst.is_active })}>
                        {inst.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                    </>
                  )}
                </div>
              </header>

              <p className="px-4 pt-3 text-sm text-slate-700" data-testid={`campus-status-${inst.code}`}>
                {campusPeriods.length === 0
                  ? 'No enrollment period is set, so scholars can register at any time.'
                  : currentState?.accepting && current
                    ? `Enrollment is open. ${Math.max(current.quota - currentUsed, 0)} of ${current.quota} slots left to confirm. Closes ${fmtDate(current.ends_at)}.`
                    : current && currentState
                      ? `Enrollment is closed right now (${currentState.label.toLowerCase()}).`
                      : 'Enrollment is closed right now. No period covers today.'}
              </p>

              {campusPeriods.length === 0 ? (
                <p className="px-4 pb-4 pt-1 text-xs text-slate-500">Add a period to control the dates and number of slots.</p>
              ) : (
                <ul className="divide-y divide-slate-100 px-4 pb-1 pt-2">
                  {campusPeriods.map((period) => {
                    const used = usage[period.id]?.used ?? 0;
                    const state = getPeriodState(period, used, today);
                    const percent = usagePercent(used, period.quota);
                    const limits = (courseQuotasQuery.data ?? []).filter((q) => q.intake_period_id === period.id);
                    return (
                      <li key={period.id} className="space-y-2.5 py-3.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold leading-snug text-slate-900">{period.name}</p>
                            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-600">
                              <CalendarRange className="h-3.5 w-3.5 shrink-0 text-teal-700" aria-hidden="true" />
                              {fmtDate(period.starts_at)} to {fmtDate(period.ends_at)}
                            </p>
                          </div>
                          <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset', STATE_STYLE[state.key])}>{state.label}</span>
                        </div>

                        <div>
                          <div className="flex items-baseline justify-between text-xs text-slate-600">
                            <span>
                              <strong className="text-sm text-slate-900">{used}</strong> of {period.quota} scholars confirmed
                            </span>
                            <span>{percent}%</span>
                          </div>
                          <div
                            className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={percent}
                            aria-label={`${used} of ${period.quota} scholars confirmed`}
                          >
                            <div className={cn('h-full rounded-full', percent >= 100 ? 'bg-red-500' : percent >= 80 ? 'bg-amber-500' : 'bg-teal-600')} style={{ width: `${percent}%` }} />
                          </div>
                          {limits.length > 0 && (
                            <p className="mt-1 text-[11px] text-slate-500">{limits.length} course limit{limits.length === 1 ? '' : 's'} set</p>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button type="button" size="sm" variant="outline" disabled={!isOnline || busy} onClick={() => openEdit(period)}>
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </Button>
                          <Button type="button" size="sm" variant="outline" disabled={!isOnline || busy} onClick={() => openCourseLimits(period)}>
                            <SlidersHorizontal className="h-3.5 w-3.5" /> Course limits
                          </Button>
                          <Button type="button" size="sm" variant="outline" disabled={!isOnline || busy} onClick={() => lockMutation.mutate(period)}>
                            {period.is_locked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                            {period.is_locked ? 'Reopen' : 'Close enrollment'}
                          </Button>
                          {used === 0 && (
                            <Button type="button" size="sm" variant="ghost" className="text-red-700 hover:bg-red-50 hover:text-red-800" disabled={!isOnline || busy} onClick={() => setDeleting(period)}>
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
        {institutions.length === 0 && !instQuery.isLoading && !loadFailed && (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No campuses to show.</p>
        )}
      </div>

      <p className="px-1 text-xs leading-relaxed text-slate-500">
        A slot is used when the registrar confirms a scholar. If a scholar backs out and is archived, the slot is freed. When the last slot is confirmed, the period closes by itself. The registrar cannot confirm past the quota. Slots are counted using the Philippine date. A registration saved offline is checked when it reaches the server, and the scholar sees the reason in Sync Center if it is refused.
      </p>

      <AppDialog
        open={formOpen}
        onOpenChange={(open) => !saveMutation.isPending && setFormOpen(open)}
        title={editing ? 'Edit enrollment period' : 'Add enrollment period'}
        description="Scholars can submit only between these dates and while slots remain."
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)} disabled={saveMutation.isPending}>
              Cancel
            </Button>
            <Button type="button" variant="secondary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving…' : editing ? 'Save changes' : 'Create period'}
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          {!editing && (
            <div className="space-y-1">
              <Label htmlFor="ip_campus">Campus</Label>
              <select
                id="ip_campus"
                value={form.campusId || defaultCampus}
                onChange={(e) => setForm((f) => ({ ...f, campusId: e.target.value }))}
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base sm:h-10 sm:text-sm"
              >
                {institutions.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.code})
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="ip_name">Period name</Label>
            <Input id="ip_name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="January 2027 intake" className="h-11 text-base sm:h-10 sm:text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="ip_starts">Opens on</Label>
              <Input id="ip_starts" type="date" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} className="h-11 text-base sm:h-10 sm:text-sm" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ip_ends">Closes on</Label>
              <Input id="ip_ends" type="date" value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} className="h-11 text-base sm:h-10 sm:text-sm" />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ip_quota">Number of slots</Label>
            <Input id="ip_quota" inputMode="numeric" value={form.quota} onChange={(e) => setForm((f) => ({ ...f, quota: e.target.value }))} className="h-11 text-base sm:h-10 sm:text-sm" />
            <p className="text-xs text-slate-500">
              {editing ? `${usage[editing.id]?.used ?? 0} already confirmed. ` : ''}The most scholars the registrar can confirm in this period.
            </p>
          </div>
          {formError && (
            <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-800" role="alert">
              {formError}
            </p>
          )}
        </div>
      </AppDialog>

      <AppDialog
        open={campusOpen}
        onOpenChange={(open) => !campusMutation.isPending && setCampusOpen(open)}
        title={editingCampus ? 'Edit campus' : 'Add campus'}
        description={editingCampus ? undefined : 'Add a new school so it can use TESDA Connect. You can set its enrollment periods and staff afterwards.'}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setCampusOpen(false)} disabled={campusMutation.isPending}>
              Cancel
            </Button>
            <Button type="button" variant="secondary" onClick={() => campusMutation.mutate(undefined)} disabled={campusMutation.isPending}>
              {campusMutation.isPending ? 'Saving…' : editingCampus ? 'Save changes' : 'Add campus'}
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <div className="space-y-1">
            <Label htmlFor="campus_code">Short code</Label>
            <Input id="campus_code" value={campusForm.code} disabled={Boolean(editingCampus)} maxLength={10} placeholder="BST" onChange={(e) => setCampusForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} className="h-11 text-base sm:h-10 sm:text-sm" />
            <p className="text-xs text-slate-500">Used in scholar IDs, such as BST-2027-0001. It cannot be changed later.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="campus_name">School name</Label>
            <Input id="campus_name" value={campusForm.name} onChange={(e) => setCampusForm((f) => ({ ...f, name: e.target.value }))} className="h-11 text-base sm:h-10 sm:text-sm" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="campus_address">Address (optional)</Label>
            <Input id="campus_address" value={campusForm.address} onChange={(e) => setCampusForm((f) => ({ ...f, address: e.target.value }))} className="h-11 text-base sm:h-10 sm:text-sm" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="campus_email">Email (optional)</Label>
              <Input id="campus_email" type="email" value={campusForm.email} onChange={(e) => setCampusForm((f) => ({ ...f, email: e.target.value }))} className="h-11 text-base sm:h-10 sm:text-sm" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="campus_phone">Phone (optional)</Label>
              <Input id="campus_phone" inputMode="tel" value={campusForm.phone} onChange={(e) => setCampusForm((f) => ({ ...f, phone: e.target.value }))} className="h-11 text-base sm:h-10 sm:text-sm" />
            </div>
          </div>
          {campusError && (
            <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-800" role="alert">
              {campusError}
            </p>
          )}
        </div>
      </AppDialog>

      <AppDialog
        open={Boolean(courseLimitsFor)}
        onOpenChange={(open) => !courseLimitsMutation.isPending && !open && setCourseLimitsFor(null)}
        title="Course limits"
        description={courseLimitsFor ? `Optional. Cap how many scholars each course can take in ${courseLimitsFor.name}. Leave empty for no limit.` : undefined}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setCourseLimitsFor(null)} disabled={courseLimitsMutation.isPending}>
              Cancel
            </Button>
            <Button type="button" variant="secondary" onClick={() => courseLimitsMutation.mutate()} disabled={courseLimitsMutation.isPending}>
              {courseLimitsMutation.isPending ? 'Saving…' : 'Save limits'}
            </Button>
          </>
        }
      >
        {courseLimitsFor && (
          <ul className="space-y-3">
            {(coursesQuery.data ?? [])
              .filter((c) => c.institution_id === courseLimitsFor.institution_id)
              .map((course) => {
                const courseUsed = usage[courseLimitsFor.id]?.course_usage?.find((u) => u.course_id === course.id)?.used;
                return (
                  <li key={course.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Label htmlFor={`cq_${course.id}`} className="block truncate text-sm font-medium text-slate-900">
                        {course.name}
                      </Label>
                      <p className="text-xs text-slate-500">{courseUsed !== undefined ? `${courseUsed} used` : course.code}</p>
                    </div>
                    <Input
                      id={`cq_${course.id}`}
                      inputMode="numeric"
                      placeholder="No limit"
                      value={courseDraft[course.id] ?? ''}
                      onChange={(e) => setCourseDraft((d) => ({ ...d, [course.id]: e.target.value }))}
                      className="h-11 w-28 shrink-0 text-base sm:h-10 sm:text-sm"
                    />
                  </li>
                );
              })}
            {(coursesQuery.data ?? []).filter((c) => c.institution_id === courseLimitsFor.institution_id).length === 0 && (
              <li className="text-sm text-slate-500">This campus has no active courses yet.</li>
            )}
          </ul>
        )}
      </AppDialog>

      <AppDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this enrollment period?"
        description={deleting ? `${deleting.name} has no applications. This cannot be undone.` : undefined}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button type="button" variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleting && deleteMutation.mutate(deleting)}>
              {deleteMutation.isPending ? 'Deleting…' : 'Delete period'}
            </Button>
          </>
        }
      />
    </div>
  );
}
