import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarRange, CloudOff, Layers, MapPin, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { AppDialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isSupabaseConfigured } from '@/lib/env';
import { getSupabaseClient } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useConnectivityStore } from '@/stores/connectivityStore';
import {
  BATCH_CAPACITY,
  batchFill,
  buildBatchCode,
  currentSchoolYear,
  freeBatchNumbers,
  friendlyBatchError,
  MAX_BATCHES_PER_COURSE_YEAR,
  validateBatchForm,
} from './batchRules';

interface CourseRow {
  id: string;
  institution_id: string;
  code: string;
  name: string;
  qualification_level: string | null;
  training_hours: number | null;
}

interface BatchRow {
  id: string;
  institution_id: string;
  course_id: string;
  code: string;
  name: string;
  capacity: number;
  school_year: string | null;
  batch_number: number | null;
  venue: string | null;
  status: 'upcoming' | 'in_training' | 'completed' | 'cancelled';
  starts_at: string | null;
  ends_at: string | null;
  scheduled_hours: number | null;
}

interface InstitutionRow {
  id: string;
  code: string;
  name: string;
}

const STATUS_LABEL: Record<BatchRow['status'], string> = {
  upcoming: 'Not started',
  in_training: 'In training',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const FILL_STYLE = {
  open: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  full: 'bg-red-50 text-red-700 ring-red-200',
  closed: 'bg-slate-100 text-slate-700 ring-slate-200',
} as const;

function fmt(value: string | null): string {
  if (!value) return 'Not set';
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

function emptyForm() {
  return { courseId: '', schoolYear: currentSchoolYear(), batchNumber: '1', startsAt: '', endsAt: '', hours: '', venue: '' };
}

export function BatchManagementPage() {
  const profile = useAuthStore((s) => s.profile);
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const queryClient = useQueryClient();
  const enabled = isSupabaseConfigured && Boolean(profile?.id);
  const isAdmin = profile?.role === 'system_administrator' || profile?.role === 'institutional_administrator';

  const [createOpen, setCreateOpen] = React.useState(false);
  const [form, setForm] = React.useState(emptyForm());
  const [formError, setFormError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<BatchRow | null>(null);
  const [editForm, setEditForm] = React.useState({ startsAt: '', endsAt: '', hours: '', venue: '' });
  const [deleting, setDeleting] = React.useState<BatchRow | null>(null);

  const batchesQuery = useQuery<BatchRow[]>({
    queryKey: ['batch-management-batches'],
    enabled,
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return [];
      const { data, error } = await client
        .from('training_batches')
        .select('id, institution_id, course_id, code, name, capacity, school_year, batch_number, venue, status, starts_at, ends_at, scheduled_hours')
        .is('archived_at', null)
        .order('school_year', { ascending: false, nullsFirst: false })
        .order('batch_number', { ascending: true })
        .returns<BatchRow[]>();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const fillQuery = useQuery<Record<string, number>>({
    queryKey: ['batch-management-fill'],
    enabled,
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return {};
      const result = await client.rpc('get_batch_fill', { p_institution_id: null });
      if (result.error) throw new Error(result.error.message);
      const rows: Array<{ batch_id: string; enrolled: number }> = Array.isArray(result.data) ? (result.data as Array<{ batch_id: string; enrolled: number }>) : [];
      return Object.fromEntries(rows.map((r) => [r.batch_id, r.enrolled]));
    },
  });

  const coursesQuery = useQuery<CourseRow[]>({
    queryKey: ['batch-management-courses'],
    enabled,
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return [];
      const { data, error } = await client
        .from('courses')
        .select('id, institution_id, code, name, qualification_level, training_hours')
        .is('archived_at', null)
        .eq('is_active', true)
        .order('name', { ascending: true })
        .returns<CourseRow[]>();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const institutionsQuery = useQuery<InstitutionRow[]>({
    queryKey: ['batch-management-institutions'],
    enabled,
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return [];
      const { data, error } = await client.from('institutions').select('id, code, name').order('code').returns<InstitutionRow[]>();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const batches = React.useMemo(() => batchesQuery.data ?? [], [batchesQuery.data]);
  const courses = React.useMemo(() => coursesQuery.data ?? [], [coursesQuery.data]);
  const fill = fillQuery.data ?? {};
  const courseById = React.useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const campusById = React.useMemo(() => new Map((institutionsQuery.data ?? []).map((i) => [i.id, i])), [institutionsQuery.data]);

  const chosenCourse = courseById.get(form.courseId);
  const usedNumbers = batches
    .filter((b) => b.course_id === form.courseId && b.school_year === form.schoolYear.trim())
    .map((b) => b.batch_number);
  const freeNumbers = freeBatchNumbers(usedNumbers);
  const previewCode =
    chosenCourse && /^\d{4}(-\d{4})?$/.test(form.schoolYear.trim())
      ? buildBatchCode(chosenCourse.code, chosenCourse.qualification_level, form.schoolYear.trim(), Number.parseInt(form.batchNumber, 10) || 1)
      : null;

  const refresh = React.useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['batch-management-batches'] }),
      queryClient.invalidateQueries({ queryKey: ['batch-management-fill'] }),
      queryClient.invalidateQueries({ queryKey: ['live-training-batches'] }),
    ]);
  }, [queryClient]);

  const openCreate = () => {
    const first = courses[0];
    const next = { ...emptyForm(), courseId: first?.id ?? '', hours: first?.training_hours ? String(first.training_hours) : '' };
    const free = freeBatchNumbers(batches.filter((b) => b.course_id === next.courseId && b.school_year === next.schoolYear).map((b) => b.batch_number));
    next.batchNumber = String(free[0] ?? 1);
    setForm(next);
    setFormError(null);
    setCreateOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const client = getSupabaseClient();
      if (!client || !profile) throw new Error('Sign in to continue.');
      const problem = validateBatchForm(form, freeNumbers);
      if (problem) throw new Error(problem);
      if (!chosenCourse) throw new Error('Choose the course for this batch.');
      const n = Number.parseInt(form.batchNumber, 10);
      const schoolYear = form.schoolYear.trim();
      if (form.venue.trim() && form.startsAt && form.endsAt) {
        const overlap = await client.rpc('detect_batch_schedule_conflicts', {
          p_institution_id: chosenCourse.institution_id,
          p_venue: form.venue.trim(),
          p_starts_at: form.startsAt,
          p_ends_at: form.endsAt,
          p_exclude_batch_id: null,
        });
        const clashes: Array<{ conflicting_code: string }> = Array.isArray(overlap.data) ? (overlap.data as Array<{ conflicting_code: string }>) : [];
        if (clashes[0]) toast.warning(`Heads up: ${clashes[0].conflicting_code} uses ${form.venue.trim()} on overlapping dates.`);
      }
      const { error } = await client.from('training_batches').insert({
        institution_id: chosenCourse.institution_id,
        course_id: chosenCourse.id,
        school_year: schoolYear,
        batch_number: n,
        // The database rebuilds the code and name from the course, school year and number.
        code: buildBatchCode(chosenCourse.code, chosenCourse.qualification_level, schoolYear, n),
        name: `Batch ${n}`,
        capacity: BATCH_CAPACITY,
        scheduled_hours: form.hours.trim() ? Number.parseInt(form.hours, 10) : null,
        venue: form.venue.trim() || null,
        starts_at: form.startsAt || null,
        ends_at: form.endsAt || null,
        status: 'upcoming',
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success('Batch created.');
      setCreateOpen(false);
      await refresh();
    },
    onError: (err: Error) => setFormError(friendlyBatchError(err.message)),
  });

  const statusMutation = useMutation({
    mutationFn: async ({ batch, status }: { batch: BatchRow; status: BatchRow['status'] }) => {
      const client = getSupabaseClient();
      if (!client) throw new Error('Sign in to continue.');
      const { error } = await client.from('training_batches').update({ status }).eq('id', batch.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success('Batch status updated.');
      await refresh();
    },
    onError: (err: Error) => toast.error(friendlyBatchError(err.message)),
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      const client = getSupabaseClient();
      if (!client || !editing) throw new Error('Sign in to continue.');
      if (editForm.startsAt && editForm.endsAt && editForm.endsAt < editForm.startsAt) throw new Error('The training end date must be on or after the start date.');
      const { error } = await client
        .from('training_batches')
        .update({
          starts_at: editForm.startsAt || null,
          ends_at: editForm.endsAt || null,
          venue: editForm.venue.trim() || null,
          scheduled_hours: editForm.hours.trim() ? Number.parseInt(editForm.hours, 10) : null,
        })
        .eq('id', editing.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success('Batch saved.');
      setEditing(null);
      await refresh();
    },
    onError: (err: Error) => toast.error(friendlyBatchError(err.message)),
  });

  const deleteMutation = useMutation({
    mutationFn: async (batch: BatchRow) => {
      const client = getSupabaseClient();
      if (!client) throw new Error('Sign in to continue.');
      const { error } = await client.from('training_batches').delete().eq('id', batch.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success('Batch deleted.');
      setDeleting(null);
      await refresh();
    },
    onError: (err: Error) => {
      toast.error(friendlyBatchError(err.message));
      setDeleting(null);
    },
  });

  // Group: campus > course > batches
  const groups = React.useMemo(() => {
    const byCampus = new Map<string, Map<string, BatchRow[]>>();
    for (const b of batches) {
      const campus = byCampus.get(b.institution_id) ?? new Map<string, BatchRow[]>();
      const list = campus.get(b.course_id) ?? [];
      list.push(b);
      campus.set(b.course_id, list);
      byCampus.set(b.institution_id, campus);
    }
    return Array.from(byCampus.entries());
  }, [batches]);

  const loadFailed = batchesQuery.isError;
  const busy = createMutation.isPending || statusMutation.isPending || editMutation.isPending || deleteMutation.isPending;

  return (
    <div className="space-y-5 pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 sm:text-2xl">
            <Layers className="h-6 w-6 shrink-0 text-teal-700" /> Batch Management
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Each batch takes up to {BATCH_CAPACITY} scholars. When the Registrar confirms a scholar, they are placed in the first open batch of their course. A full batch closes by itself.
          </p>
        </div>
        <Button type="button" size="lg" variant="secondary" className="w-full sm:w-auto" onClick={openCreate} disabled={!isOnline || courses.length === 0}>
          <Plus className="h-4 w-4" /> Create batch
        </Button>
      </div>

      {!isOnline && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
          <CloudOff className="mt-0.5 h-4 w-4 shrink-0" /> You are offline. Changes to batches need an internet connection.
        </p>
      )}
      {loadFailed && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          Could not load the batches. Check your connection and try again.
        </p>
      )}
      {!isAdmin && (
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          You can create batches. Changing a batch&apos;s status, dates or venue is done by an Administrator.
        </p>
      )}

      {groups.length === 0 && !batchesQuery.isLoading && !loadFailed && (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          No batches yet. Create Batch 1 for a course so confirmed scholars can be placed in it.
        </p>
      )}

      {groups.map(([campusId, byCourse]) => (
        <section key={campusId} className="space-y-3" aria-label={campusById.get(campusId)?.name ?? 'Campus'}>
          <h2 className="px-1 text-sm font-bold uppercase tracking-wide text-slate-500">{campusById.get(campusId)?.name ?? 'Campus'}</h2>
          {Array.from(byCourse.entries()).map(([courseId, list]) => {
            const course = courseById.get(courseId);
            return (
              <div key={courseId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <header className="border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                  <p className="text-sm font-semibold text-slate-900">{course?.name ?? 'Course'}</p>
                  <p className="text-xs text-slate-500">
                    {course?.qualification_level ?? ''} {list.length} of {MAX_BATCHES_PER_COURSE_YEAR} batches per school year at most
                  </p>
                </header>
                <ul className="divide-y divide-slate-100">
                  {list.map((b) => {
                    const enrolled = fill[b.id] ?? 0;
                    const state = batchFill(enrolled, b.capacity, b.status);
                    const percent = Math.min(100, Math.round((enrolled / Math.max(b.capacity, 1)) * 100));
                    return (
                      <li key={b.id} className="space-y-2.5 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900">{b.name}</p>
                            <p className="font-mono text-[11px] text-slate-500">{b.code}</p>
                          </div>
                          <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset', FILL_STYLE[state.key])}>{state.label}</span>
                        </div>

                        <div>
                          <div className="flex items-baseline justify-between text-xs text-slate-600">
                            <span>
                              <strong className="text-sm text-slate-900">{enrolled}</strong> / {b.capacity} scholars
                            </span>
                            <span>{percent}%</span>
                          </div>
                          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={`${enrolled} of ${b.capacity} scholars in ${b.name}`}>
                            <div className={cn('h-full rounded-full', percent >= 100 ? 'bg-red-500' : percent >= 80 ? 'bg-amber-500' : 'bg-teal-600')} style={{ width: `${percent}%` }} />
                          </div>
                        </div>

                        <dl className="space-y-1 text-xs text-slate-600">
                          <div className="flex items-center gap-1.5">
                            <CalendarRange className="h-3.5 w-3.5 shrink-0 text-teal-700" aria-hidden="true" />
                            <dt className="sr-only">Dates</dt>
                            <dd>
                              {fmt(b.starts_at)} to {fmt(b.ends_at)}
                            </dd>
                          </div>
                          {b.venue && (
                            <div className="flex items-center gap-1.5">
                              <MapPin className="h-3.5 w-3.5 shrink-0 text-teal-700" aria-hidden="true" />
                              <dt className="sr-only">Venue</dt>
                              <dd>{b.venue}</dd>
                            </div>
                          )}
                        </dl>

                        {isAdmin && (
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              aria-label={`Status of ${b.code}`}
                              value={b.status}
                              disabled={!isOnline || busy}
                              onChange={(e) => statusMutation.mutate({ batch: b, status: e.target.value as BatchRow['status'] })}
                              className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs"
                            >
                              {(Object.keys(STATUS_LABEL) as Array<BatchRow['status']>).map((s) => (
                                <option key={s} value={s}>
                                  {STATUS_LABEL[s]}
                                </option>
                              ))}
                            </select>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={!isOnline || busy}
                              onClick={() => {
                                setEditing(b);
                                setEditForm({ startsAt: b.starts_at ?? '', endsAt: b.ends_at ?? '', hours: b.scheduled_hours ? String(b.scheduled_hours) : '', venue: b.venue ?? '' });
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" /> Edit
                            </Button>
                            {enrolled === 0 && (
                              <Button type="button" size="sm" variant="ghost" className="text-red-700 hover:bg-red-50 hover:text-red-800" disabled={!isOnline || busy} onClick={() => setDeleting(b)}>
                                <Trash2 className="h-3.5 w-3.5" /> Delete
                              </Button>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </section>
      ))}

      <AppDialog
        open={createOpen}
        onOpenChange={(open) => !createMutation.isPending && setCreateOpen(open)}
        title="Create batch"
        description="Pick the course, school year and batch number. The batch code is made for you."
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={createMutation.isPending}>
              Cancel
            </Button>
            <Button type="button" variant="secondary" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creating…' : 'Create batch'}
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <div className="space-y-1">
            <Label htmlFor="bm_course">Course</Label>
            <select
              id="bm_course"
              value={form.courseId}
              onChange={(e) => {
                const course = courseById.get(e.target.value);
                const free = freeBatchNumbers(batches.filter((b) => b.course_id === e.target.value && b.school_year === form.schoolYear.trim()).map((b) => b.batch_number));
                setForm((f) => ({ ...f, courseId: e.target.value, batchNumber: String(free[0] ?? 1), hours: course?.training_hours ? String(course.training_hours) : f.hours }));
              }}
              className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base sm:h-10 sm:text-sm"
            >
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.qualification_level && !c.name.toUpperCase().replace(/\s/g, '').includes(c.qualification_level.toUpperCase().replace(/\s/g, '')) ? ` (${c.qualification_level})` : ''}
                  {campusById.get(c.institution_id) ? ` - ${campusById.get(c.institution_id)?.code}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="bm_year">School year</Label>
              <Input id="bm_year" value={form.schoolYear} onChange={(e) => setForm((f) => ({ ...f, schoolYear: e.target.value }))} placeholder="2026" className="h-11 text-base sm:h-10 sm:text-sm" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bm_number">Batch number</Label>
              <select
                id="bm_number"
                value={form.batchNumber}
                onChange={(e) => setForm((f) => ({ ...f, batchNumber: e.target.value }))}
                className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base sm:h-10 sm:text-sm"
              >
                {Array.from({ length: MAX_BATCHES_PER_COURSE_YEAR }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n} disabled={!freeNumbers.includes(n)}>
                    Batch {n}
                    {freeNumbers.includes(n) ? '' : ' (already made)'}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {previewCode && (
            <p className="rounded-lg bg-slate-50 p-2.5 text-sm text-slate-700">
              Batch code: <strong className="font-mono text-slate-900">{previewCode}</strong>
              <span className="block text-xs text-slate-500">Up to {BATCH_CAPACITY} scholars.</span>
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="bm_starts">Training starts</Label>
              <Input id="bm_starts" type="date" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} className="h-11 text-base sm:h-10 sm:text-sm" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bm_ends">Training ends</Label>
              <Input id="bm_ends" type="date" value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} className="h-11 text-base sm:h-10 sm:text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="bm_hours">Training hours</Label>
              <Input id="bm_hours" inputMode="numeric" value={form.hours} onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))} className="h-11 text-base sm:h-10 sm:text-sm" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="bm_venue">Venue (optional)</Label>
              <Input id="bm_venue" value={form.venue} onChange={(e) => setForm((f) => ({ ...f, venue: e.target.value }))} className="h-11 text-base sm:h-10 sm:text-sm" />
            </div>
          </div>
          {formError && (
            <p className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-800" role="alert">
              {formError}
            </p>
          )}
        </div>
      </AppDialog>

      <AppDialog
        open={Boolean(editing)}
        onOpenChange={(open) => !editMutation.isPending && !open && setEditing(null)}
        title={editing ? `Edit ${editing.name}` : 'Edit batch'}
        description={editing?.code}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={editMutation.isPending}>
              Cancel
            </Button>
            <Button type="button" variant="secondary" onClick={() => editMutation.mutate()} disabled={editMutation.isPending}>
              {editMutation.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="be_starts">Training starts</Label>
              <Input id="be_starts" type="date" value={editForm.startsAt} onChange={(e) => setEditForm((f) => ({ ...f, startsAt: e.target.value }))} className="h-11 text-base sm:h-10 sm:text-sm" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="be_ends">Training ends</Label>
              <Input id="be_ends" type="date" value={editForm.endsAt} onChange={(e) => setEditForm((f) => ({ ...f, endsAt: e.target.value }))} className="h-11 text-base sm:h-10 sm:text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="be_hours">Training hours</Label>
              <Input id="be_hours" inputMode="numeric" value={editForm.hours} onChange={(e) => setEditForm((f) => ({ ...f, hours: e.target.value }))} className="h-11 text-base sm:h-10 sm:text-sm" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="be_venue">Venue</Label>
              <Input id="be_venue" value={editForm.venue} onChange={(e) => setEditForm((f) => ({ ...f, venue: e.target.value }))} className="h-11 text-base sm:h-10 sm:text-sm" />
            </div>
          </div>
        </div>
      </AppDialog>

      <AppDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete this batch?"
        description={deleting ? `${deleting.name} (${deleting.code}) has no scholars. This cannot be undone.` : undefined}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setDeleting(null)}>
              Keep it
            </Button>
            <Button type="button" variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleting && deleteMutation.mutate(deleting)}>
              {deleteMutation.isPending ? 'Deleting…' : 'Delete batch'}
            </Button>
          </>
        }
      />
    </div>
  );
}
