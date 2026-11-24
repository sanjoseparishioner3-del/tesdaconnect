import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarDays, CloudOff, Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Pagination, usePagination } from '@/components/ui/pagination';
import { offlineDb } from '@/lib/db/dexie';
import { isSupabaseConfigured } from '@/lib/env';
import { getSupabaseClient } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useConnectivityStore } from '@/stores/connectivityStore';

interface LiveScheduleRow {
  id: string;
  institution_id: string;
  course_id: string;
  code: string;
  name: string;
  capacity: number;
  scheduled_hours: number | null;
  venue: string | null;
  status: 'upcoming' | 'in_training' | 'completed' | 'cancelled';
  starts_at: string | null;
  ends_at: string | null;
  next_class_at: string | null;
  courses: { name: string; training_hours: number | null } | Array<{ name: string; training_hours: number | null }> | null;
  institutions: { code: string } | Array<{ code: string }> | null;
}

export function TrainingSchedulesPage() {
  const profile = useAuthStore((s) => s.profile);
  const offlineOptIn = useAuthStore((s) => s.offlineOptIn);
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const queryClient = useQueryClient();
  const userId = profile?.id ?? '';

  const canManageBatches =
    profile?.role === 'system_administrator' ||
    profile?.role === 'institutional_administrator';

  const [tab, setTab] = React.useState<'calendar' | 'batches' | 'compliance'>('calendar');
  const [selectedInstitutionFilter, setSelectedInstitutionFilter] = React.useState('all');

  const liveSchedulesQuery = useQuery({
    queryKey: ['live-training-batches', userId],
    enabled: isSupabaseConfigured && isOnline && Boolean(userId),
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return [];
      const { data, error } = await client
        .from('training_batches')
        .select('id, institution_id, course_id, code, name, capacity, scheduled_hours, venue, status, starts_at, ends_at, next_class_at, courses(name, training_hours), institutions(code)')
        .is('archived_at', null)
        .order('starts_at', { ascending: true })
        .limit(100);
      if (error) throw new Error(error.message);

      const rows = (data ?? []) as LiveScheduleRow[];
      const syncedAt = new Date().toISOString();
      if (offlineOptIn && userId && rows.length > 0) {
        await offlineDb.cachedSchedules.bulkPut(
          rows.map((b) => {
            const c = Array.isArray(b.courses) ? b.courses[0] : b.courses;
            const inst = Array.isArray(b.institutions) ? b.institutions[0] : b.institutions;
            return {
              id: b.id,
              userId,
              institutionId: b.institution_id,
              institutionCode: inst?.code ?? 'INST',
              batchCode: b.code,
              batchName: b.name,
              courseName: c?.name ?? 'TESDA Program',
              venue: b.venue,
              status: b.status,
              startsAt: b.starts_at,
              endsAt: b.ends_at,
              nextClassAt: b.next_class_at,
              syncedAt,
            };
          }),
        );
      }
      return rows;
    },
  });

  const cachedSchedules = useLiveQuery(
    () => (userId ? offlineDb.cachedSchedules.where('userId').equals(userId).toArray() : []),
    [userId],
    [],
  );

  const liveScheduledAnnouncementsQuery = useQuery({
    queryKey: ['scheduled-announcements', userId],
    enabled: isSupabaseConfigured && isOnline && Boolean(userId),
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return [];
      const { data, error } = await client
        .from('announcements')
        .select('id, title, announcement_type, event_date, event_time')
        .eq('is_draft', false)
        .is('archived_at', null)
        .not('event_date', 'is', null)
        .limit(50)
        .returns<
          Array<{
            id: string;
            title: string;
            announcement_type: string;
            event_date: string;
            event_time: string | null;
          }>
        >();
      if (error) return [];
      return data ?? [];
    },
  });

  const cachedAnnouncements = useLiveQuery(
    () => (userId ? offlineDb.cachedAnnouncements.where('userId').equals(userId).toArray() : []),
    [userId],
    [],
  );

  const updateBatchStatusMutation = useMutation({
    mutationFn: async ({ batchId, nextStatus }: { batchId: string; nextStatus: LiveScheduleRow['status'] }) => {
      const client = getSupabaseClient();
      if (!client) throw new Error('Supabase unavailable.');
      const { error } = await client.from('training_batches').update({ status: nextStatus }).eq('id', batchId);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success('Updated canonical batch status.');
      await queryClient.invalidateQueries({ queryKey: ['live-training-batches'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const calendarEvents = React.useMemo(() => {
    const batchEvents =
      isOnline && liveSchedulesQuery.data && liveSchedulesQuery.data.length > 0
        ? liveSchedulesQuery.data.map((b) => {
            const c = Array.isArray(b.courses) ? b.courses[0] : b.courses;
            return {
              id: b.id,
              title: `${b.code}: ${c?.name ?? b.name} (${b.venue ?? 'TBD'})`,
              start: b.starts_at ?? undefined,
              end: b.ends_at ?? undefined,
              backgroundColor: '#0f295c',
              borderColor: '#0f295c',
            };
          })
        : cachedSchedules.map((s) => ({
            id: s.id,
            title: `${s.batchCode}: ${s.courseName} (${s.venue ?? 'TBD'})`,
            start: s.startsAt ?? undefined,
            end: s.endsAt ?? undefined,
            backgroundColor: '#0f295c',
            borderColor: '#0f295c',
          }));

    const annSource =
      isOnline && liveScheduledAnnouncementsQuery.data && liveScheduledAnnouncementsQuery.data.length > 0
        ? liveScheduledAnnouncementsQuery.data.map((a) => ({
            id: `ann-${a.id}`,
            title: `[${a.announcement_type === 'deadline' ? 'Deadline' : 'Notice'}] ${a.title}${a.event_time ? ` (${a.event_time})` : ''}`,
            start: a.event_date,
            backgroundColor: a.announcement_type === 'deadline' ? '#b45309' : '#0f766e',
            borderColor: a.announcement_type === 'deadline' ? '#b45309' : '#0f766e',
          }))
        : cachedAnnouncements
            .filter((a) => Boolean(a.eventDate))
            .map((a) => ({
              id: `ann-${a.id}`,
              title: `[${a.announcementType === 'deadline' ? 'Deadline' : 'Notice'}] ${a.title}${a.eventTime ? ` (${a.eventTime})` : ''}`,
              start: a.eventDate ?? undefined,
              backgroundColor: a.announcementType === 'deadline' ? '#b45309' : '#0f766e',
              borderColor: a.announcementType === 'deadline' ? '#b45309' : '#0f766e',
            }));

    return [...batchEvents, ...annSource];
  }, [isOnline, liveSchedulesQuery.data, cachedSchedules, liveScheduledAnnouncementsQuery.data, cachedAnnouncements]);

  const batchesList = React.useMemo<LiveScheduleRow[]>(() => {
    const rows: LiveScheduleRow[] =
      isOnline && liveSchedulesQuery.data && liveSchedulesQuery.data.length > 0
        ? liveSchedulesQuery.data
        : cachedSchedules.map((s) => ({
            id: s.id,
            institution_id: s.institutionId,
            course_id: '',
            code: s.batchCode,
            name: s.batchName,
            capacity: 25,
            scheduled_hours: null,
            venue: s.venue,
            status: (['upcoming', 'in_training', 'completed', 'cancelled'].includes(s.status)
              ? s.status
              : 'upcoming') as LiveScheduleRow['status'],
            starts_at: s.startsAt,
            ends_at: s.endsAt,
            next_class_at: s.nextClassAt,
            courses: { name: s.courseName, training_hours: null },
            institutions: { code: s.institutionCode },
          }));

    if (selectedInstitutionFilter === 'all') return rows;
    return rows.filter((r) => {
      const inst = Array.isArray(r.institutions) ? r.institutions[0] : r.institutions;
      return inst?.code === selectedInstitutionFilter;
    });
  }, [isOnline, liveSchedulesQuery.data, cachedSchedules, selectedInstitutionFilter]);

  const batchesPagination = usePagination({
    totalRecords: batchesList.length,
    initialPageSize: 10,
  });
  const pagedBatches = batchesList.slice(batchesPagination.startIndex, batchesPagination.endIndex);

  const durationStats = React.useMemo(() => {
    let compliant = 0;
    let shortOrMissing = 0;
    for (const b of batchesList) {
      const course = Array.isArray(b.courses) ? b.courses[0] : b.courses;
      const reqHours = course?.training_hours ?? 0;
      const schedHours = b.scheduled_hours ?? 0;
      if (reqHours > 0 && schedHours >= reqHours) compliant += 1;
      else shortOrMissing += 1;
    }
    return { compliant, shortOrMissing, total: batchesList.length };
  }, [batchesList]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <CalendarDays className="h-6 w-6 text-teal-700" />
            {canManageBatches ? 'Scheduling & Batch Management (Admin)' : 'Schedules & Announcements Calendar'}
          </h1>
          <p className="text-sm text-slate-500">
            {canManageBatches
              ? 'Assigned and managed by System / Institutional Administrators. Includes venue overlap checks and calendar integration.'
              : 'Read-only calendar combining Administrator training schedules and Admin/Registrar dated announcements (viewable offline).'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant={tab === 'calendar' ? 'secondary' : 'outline'} onClick={() => setTab('calendar')}>
            Calendar
          </Button>
          <Button type="button" size="sm" variant={tab === 'batches' ? 'secondary' : 'outline'} onClick={() => setTab('batches')}>
            {canManageBatches ? 'Batch Management' : 'Training Batches'}
          </Button>
          <Button type="button" size="sm" variant={tab === 'compliance' ? 'secondary' : 'outline'} onClick={() => setTab('compliance')}>
            Duration Compliance
          </Button>
          <Badge variant={isOnline ? 'success' : 'warning'}>
            {isOnline ? 'Live + Cached' : (
              <span className="inline-flex items-center gap-1">
                <CloudOff className="h-3.5 w-3.5" /> Cached Offline View
              </span>
            )}
          </Badge>
        </div>
      </div>

      {!canManageBatches && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          <Eye className="h-4 w-4 text-slate-600" />
          Read-only Schedules View: The Registrar creates batches and Administrators manage them. Focal Persons, Trainers and Scholars view schedules and announcements here.
        </div>
      )}

      {tab === 'calendar' && (
        <Card>
          <CardHeader>
            <CardTitle>Institutional Training Calendar</CardTitle>
            <CardDescription>
              Schedule overlap warnings run against PostgreSQL venue &amp; date-range rules on batch save.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              headerToolbar={{
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek',
              }}
              events={calendarEvents}
              height="auto"
            />
          </CardContent>
        </Card>
      )}

      {tab === 'batches' && (
        <div className="space-y-4">
          {canManageBatches && (
            <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              Batches are now created by the Registrar in <Link to="/batches" className="font-semibold text-teal-700 underline">Batch Management</Link>, where each batch gets its school year, number and code.
            </p>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Active Batches ({batchesList.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {batchesList.length === 0 ? (
                <p className="text-sm text-slate-500">
                  {isSupabaseConfigured ? 'No active batches found.' : 'Connect Supabase to view and manage scheduled training batches.'}
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    {pagedBatches.map((b) => (
                      <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                        <div>
                          <p className="font-medium text-slate-900">
                            {b.code} — {b.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {b.venue ?? 'Venue TBD'} • Cap {b.capacity} • {b.starts_at ?? 'TBD'} -&gt; {b.ends_at ?? 'TBD'}
                          </p>
                        </div>
                        {canManageBatches ? (
                          <select
                            aria-label={`Status for ${b.code}`}
                            value={b.status}
                            onChange={(e) => updateBatchStatusMutation.mutate({ batchId: b.id, nextStatus: e.target.value as LiveScheduleRow['status'] })}
                            className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                          >
                            <option value="upcoming">upcoming</option>
                            <option value="in_training">in_training</option>
                            <option value="completed">completed</option>
                            <option value="cancelled">cancelled</option>
                          </select>
                        ) : (
                          <Badge variant="secondary">{b.status}</Badge>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <Pagination
                      currentPage={batchesPagination.currentPage}
                      totalPages={batchesPagination.totalPages}
                      totalRecords={batchesList.length}
                      pageSize={batchesPagination.pageSize}
                      onPageChange={batchesPagination.goToPage}
                      onPageSizeChange={batchesPagination.setPageSize}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'compliance' && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Training Duration Compliance (Institution-Scoped)</CardTitle>
              <CardDescription>
                Fixes legacy summary total leak (`DATA-M2`) by applying institutional filters to compliance counts.
              </CardDescription>
            </div>
            <select
              value={selectedInstitutionFilter}
              onChange={(e) => setSelectedInstitutionFilter(e.target.value)}
              className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              <option value="all">All Institutions</option>
              <option value="BST">BST Only</option>
              <option value="MIF">MIF Only</option>
            </select>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Filtered Batches</p>
                <p className="text-xl font-bold text-slate-900">{durationStats.total}</p>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
                <p className="text-xs text-emerald-700">Meets Curriculum Hours</p>
                <p className="text-xl font-bold text-emerald-900">{durationStats.compliant}</p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
                <p className="text-xs text-amber-700">Needs Hours Review</p>
                <p className="text-xl font-bold text-amber-900">{durationStats.shortOrMissing}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
