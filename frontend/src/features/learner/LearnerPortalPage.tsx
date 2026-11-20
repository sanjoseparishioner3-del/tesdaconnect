import React from 'react';
import { useQuery } from '@tanstack/react-query';
import dayGridPlugin from '@fullcalendar/daygrid';
import listPlugin from '@fullcalendar/list';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Award,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  IdCard,
  Info,
  Upload,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Pagination, usePagination } from '@/components/ui/pagination';
import { RegistrationIntakeWorkspace } from '@/features/intake/RegistrationIntakeWorkspace';
import { ScholarHome } from '@/features/learner/home/ScholarHome';
import { ScheduleAgenda, type AgendaBatch, type AgendaEvent } from '@/features/learner/schedule/ScheduleAgenda';
import { LearnerDocumentsPanel } from '@/features/learner/documents/LearnerDocumentsPanel';
import { useLearnerDocuments } from '@/features/learner/documents/learnerDocuments';
import { DEFAULT_LEARNER_TAB, parseLearnerTab, type LearnerTab } from '@/features/learner/learnerTabs';
import { offlineDb } from '@/lib/db/dexie';
import { normalizeDocumentTypeKey } from '@/lib/documents/requiredDocuments';
import { PHONE_MEDIA_QUERY, useMediaQuery } from '@/hooks/useMediaQuery';
import { isSupabaseConfigured } from '@/lib/env';
import { getSupabaseClient } from '@/lib/supabase';
import { asText, formatShortDateTime } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useConnectivityStore } from '@/stores/connectivityStore';
import { ROLE_LABELS } from '@/types/auth';

interface LearnerEnrollmentSummary {
  id: string;
  reference_no: string;
  scholar_id: string | null;
  application_status: string;
  record_completeness: number;
  institution_id: string;
  remarks: string | null;
  courses?: { name?: string; code?: string } | Array<{ name?: string; code?: string }> | null;
  institutions?: { name?: string; code?: string } | Array<{ name?: string; code?: string }> | null;
}

interface OwnCompetencyRow {
  id: string;
  status: string;
  assessed_at: string | null;
  chartType: 'progress' | 'achievement';
  taskNumber: number;
  taskName: string;
  unitNumber: number;
  unitName: string;
}


export function LearnerPortalPage() {
  const profile = useAuthStore((s) => s.profile);
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const userId = profile?.id ?? '';

  const isPhone = useMediaQuery(PHONE_MEDIA_QUERY);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = parseLearnerTab(searchParams.get('tab'));
  const setTab = React.useCallback(
    (next: LearnerTab) => {
      setSearchParams(next === DEFAULT_LEARNER_TAB ? {} : { tab: next });
    },
    [setSearchParams],
  );

  // Switching sections (tabs here or the phone bottom bar) starts at the top of the page.
  React.useEffect(() => {
    document.querySelector('main')?.scrollTo({ top: 0 });
  }, [tab]);
  const [idPhotoUrl, setIdPhotoUrl] = React.useState<string | null>(null);

  const enrollmentQuery = useQuery<LearnerEnrollmentSummary | null>({
    queryKey: ['learner-own-enrollment', userId],
    enabled: isSupabaseConfigured && isOnline && Boolean(userId),
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client || !userId) return null;
      const { data, error } = await client
        .from('enrollment_applications')
        .select('id, reference_no, scholar_id, application_status, record_completeness, institution_id, remarks, courses(name, code), institutions(name, code)')
        .eq('learner_user_id', userId)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .returns<LearnerEnrollmentSummary[]>()
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data ?? null;
    },
  });

  const ownLearnerProfileQuery = useQuery<Record<string, unknown> | null>({
    queryKey: ['learner-own-profile-meta', userId],
    enabled: isSupabaseConfigured && isOnline && Boolean(userId),
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client || !userId) return null;
      const { data } = await client
        .from('learner_profiles')
        .select('*')
        .eq('user_id', userId)
        .returns<Record<string, unknown>[]>()
        .maybeSingle();
      return data ?? null;
    },
  });

  const cachedLearnerSnapshot = useLiveQuery(
    () => (userId ? offlineDb.cachedLearnerRecords.get(userId) : undefined),
    [userId],
  );

  const cachedCharts = useLiveQuery(
    () => (userId ? offlineDb.cachedCompetencyCharts.where('userId').equals(userId).toArray() : []),
    [userId],
    [],
  );

  const cachedSchedules = useLiveQuery(
    () => (userId ? offlineDb.cachedSchedules.where('userId').equals(userId).toArray() : []),
    [userId],
    [],
  );

  const cachedAnnouncements = useLiveQuery(
    () => (userId ? offlineDb.cachedAnnouncements.where('userId').equals(userId).toArray() : []),
    [userId],
    [],
  );

  const ownApp = React.useMemo<LearnerEnrollmentSummary | null>(() => {
    if (isOnline && enrollmentQuery.data) return enrollmentQuery.data;
    const snapApp = cachedLearnerSnapshot?.enrollmentApp;
    if (!snapApp) return null;
    const scholarIdStr = asText(snapApp.scholar_id);
    const remarksStr = asText(snapApp.remarks);
    return {
      id: asText(snapApp.id, 'offline-app'),
      reference_no: asText(snapApp.reference_no, 'OFFLINE-DRAFT'),
      scholar_id: scholarIdStr || null,
      application_status: asText(snapApp.application_status, 'draft'),
      record_completeness: Number(snapApp.record_completeness ?? 0),
      institution_id: asText(snapApp.institution_id, profile?.institutions?.[0]?.institutionId ?? ''),
      remarks: remarksStr || null,
      courses: (snapApp.courses as LearnerEnrollmentSummary['courses']) ?? null,
    };
  }, [isOnline, enrollmentQuery.data, cachedLearnerSnapshot, profile?.institutions]);

  const ownProfileData = isOnline && ownLearnerProfileQuery.data
    ? ownLearnerProfileQuery.data
    : (cachedLearnerSnapshot?.learnerProfile ?? null);

  // Documents: server rows (authoritative) merged with files still waiting on this device.
  const { files: displayedDocs, compliance: docCompliance } = useLearnerDocuments(userId, isOnline);

  // Resolve ID photo for Digital System Account ID Card
  React.useEffect(() => {
    let active = true;
    let revokeUrl: string | null = null;
    async function resolveIdPhoto() {
      const idPicDoc = displayedDocs.find((d) => normalizeDocumentTypeKey(d.document_type) === 'id_pictures');
      if (!idPicDoc) {
        if (active) setIdPhotoUrl(null);
        return;
      }
      if (idPicDoc.localBlob) {
        revokeUrl = URL.createObjectURL(idPicDoc.localBlob);
        if (active) setIdPhotoUrl(revokeUrl);
        return;
      }
      const client = getSupabaseClient();
      if (isOnline && client && idPicDoc.storage_path) {
        try {
          const session = (await client.auth.getSession()).data.session;
          if (session?.user) {
            const { data, error } = await client.storage.from('learner-documents').createSignedUrl(idPicDoc.storage_path, 600);
            if (active && !error && data?.signedUrl) setIdPhotoUrl(data.signedUrl);
          }
        } catch {
          // Ignore safely
        }
      }
    }
    void resolveIdPhoto();
    return () => {
      active = false;
      if (revokeUrl) URL.revokeObjectURL(revokeUrl);
    };
  }, [displayedDocs, isOnline]);

  const progressQuery = useQuery<OwnCompetencyRow[]>({
    queryKey: ['learner-own-competency', ownApp?.id],
    enabled: isSupabaseConfigured && isOnline && Boolean(ownApp?.id) && tab === 'progress',
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client || !ownApp?.id) return [];
      const { data, error } = await client
        .from('competency_progress')
        .select('id, status, assessed_at, competency_tasks(task_number, name, chart_type, competency_units(unit_number, name))')
        .eq('enrollment_application_id', ownApp.id)
        .limit(100);
      if (error) throw new Error(error.message);

      return (data ?? []).map((row) => {
        const tRaw = row.competency_tasks as unknown;
        const task = (Array.isArray(tRaw) ? tRaw[0] : tRaw) as
          | {
              task_number?: number;
              name?: string;
              chart_type?: string;
              competency_units?: { unit_number?: number; name?: string } | Array<{ unit_number?: number; name?: string }>;
            }
          | null
          | undefined;
        const uRaw = task?.competency_units;
        const unit = Array.isArray(uRaw) ? uRaw[0] : uRaw;
        return {
          id: String(row.id),
          status: String(row.status),
          assessed_at: row.assessed_at ? String(row.assessed_at) : null,
          chartType: task?.chart_type === 'achievement' ? 'achievement' : 'progress',
          taskNumber: Number(task?.task_number ?? 1),
          taskName: String(task?.name ?? 'Competency Task'),
          unitNumber: Number(unit?.unit_number ?? 1),
          unitName: String(unit?.name ?? 'Core Competency Unit'),
        };
      });
    },
  });

  const liveBatchesQuery = useQuery({
    queryKey: ['learner-schedule-batches', userId],
    enabled: isSupabaseConfigured && isOnline && Boolean(userId) && tab === 'schedules',
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return [];
      const { data } = await client
        .from('training_batches')
        .select('id, code, name, venue, status, starts_at, ends_at, courses(name)')
        .is('archived_at', null)
        .order('starts_at', { ascending: true })
        .limit(40)
        .returns<
          Array<{
            id: string;
            code: string;
            name: string;
            venue: string | null;
            status: string;
            starts_at: string | null;
            ends_at: string | null;
            courses: { name: string } | Array<{ name: string }> | null;
          }>
        >();
      return data ?? [];
    },
  });

  const liveScheduledAnnQuery = useQuery({
    queryKey: ['learner-scheduled-announcements', userId],
    enabled: isSupabaseConfigured && isOnline && Boolean(userId) && tab === 'schedules',
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return [];
      const { data } = await client
        .from('announcements')
        .select('id, title, body, announcement_type, event_date, event_time')
        .eq('is_draft', false)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(40)
        .returns<
          Array<{
            id: string;
            title: string;
            body: string;
            announcement_type: string;
            event_date: string | null;
            event_time: string | null;
          }>
        >();
      return data ?? [];
    },
  });


  const competencyRows: OwnCompetencyRow[] =
    isOnline && progressQuery.data
      ? progressQuery.data
      : cachedCharts.map((c) => ({
          id: c.id,
          status: c.status,
          assessed_at: c.assessedAt,
          chartType: c.chartType,
          taskNumber: c.taskNumber,
          taskName: c.taskName,
          unitNumber: c.unitNumber,
          unitName: c.unitName,
        }));

  const studentCalendarEvents = React.useMemo(() => {
    const batchItems =
      isOnline && liveBatchesQuery.data && liveBatchesQuery.data.length > 0
        ? liveBatchesQuery.data.map((b) => {
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

    const annItems =
      isOnline && liveScheduledAnnQuery.data && liveScheduledAnnQuery.data.length > 0
        ? liveScheduledAnnQuery.data
            .filter((a) => Boolean(a.event_date))
            .map((a) => ({
              id: `ann-${a.id}`,
              title: `[${a.announcement_type === 'deadline' ? 'Deadline' : 'Announcement'}] ${a.title}${a.event_time ? ` (${a.event_time})` : ''}`,
              start: a.event_date ?? undefined,
              backgroundColor: a.announcement_type === 'deadline' ? '#b45309' : '#0f766e',
              borderColor: a.announcement_type === 'deadline' ? '#b45309' : '#0f766e',
            }))
        : cachedAnnouncements
            .filter((a) => Boolean(a.eventDate))
            .map((a) => ({
              id: `ann-${a.id}`,
              title: `[${a.announcementType === 'deadline' ? 'Deadline' : 'Announcement'}] ${a.title}${a.eventTime ? ` (${a.eventTime})` : ''}`,
              start: a.eventDate ?? undefined,
              backgroundColor: a.announcementType === 'deadline' ? '#b45309' : '#0f766e',
              borderColor: a.announcementType === 'deadline' ? '#b45309' : '#0f766e',
            }));

    return [...batchItems, ...annItems];
  }, [isOnline, liveBatchesQuery.data, cachedSchedules, liveScheduledAnnQuery.data, cachedAnnouncements]);

  const agendaBatches = React.useMemo<AgendaBatch[]>(() => {
    if (isOnline && liveBatchesQuery.data && liveBatchesQuery.data.length > 0) {
      return liveBatchesQuery.data.map((b) => {
        const c = Array.isArray(b.courses) ? b.courses[0] : b.courses;
        return {
          id: b.id,
          code: b.code,
          course: c?.name ?? b.name,
          status: b.status,
          startsAt: b.starts_at,
          endsAt: b.ends_at,
          nextClassAt: null,
          venue: b.venue,
        };
      });
    }
    return cachedSchedules.map((sch) => ({
      id: sch.id,
      code: sch.batchCode,
      course: sch.courseName,
      status: sch.status,
      startsAt: sch.startsAt,
      endsAt: sch.endsAt,
      nextClassAt: sch.nextClassAt,
      venue: sch.venue,
    }));
  }, [isOnline, liveBatchesQuery.data, cachedSchedules]);

  const announcementsList = React.useMemo(() => {
    return isOnline && liveScheduledAnnQuery.data && liveScheduledAnnQuery.data.length > 0
      ? liveScheduledAnnQuery.data.map((a) => ({
          id: a.id,
          title: a.title,
          body: a.body,
          eventDate: a.event_date,
          eventTime: a.event_time,
          type: a.announcement_type,
        }))
      : cachedAnnouncements.map((a) => ({
          id: a.id,
          title: a.title,
          body: a.body,
          eventDate: a.eventDate,
          eventTime: a.eventTime,
          type: a.announcementType,
        }));
  }, [isOnline, liveScheduledAnnQuery.data, cachedAnnouncements]);

  // Real "coming up" data for the home screen: next class and newest announcement.
  const nextClass = React.useMemo(() => {
    const now = Date.now();
    const candidates = cachedSchedules
      .map((sch) => ({
        title: `${sch.batchCode}: ${sch.courseName}`,
        startsAt: sch.nextClassAt ?? sch.startsAt,
        venue: sch.venue,
      }))
      .filter((c): c is { title: string; startsAt: string; venue: string | null } => Boolean(c.startsAt))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const upcoming = candidates.find((c) => new Date(c.startsAt).getTime() >= now - 3600_000);
    return upcoming ?? null;
  }, [cachedSchedules]);

  const latestAnnouncement = React.useMemo(() => {
    const newest = [...cachedAnnouncements].sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))[0];
    return newest ? { title: newest.title, body: newest.body, date: newest.publishedAt ?? null } : null;
  }, [cachedAnnouncements]);

  const agendaEvents = React.useMemo<AgendaEvent[]>(
    () =>
      announcementsList
        .filter((a): a is typeof a & { eventDate: string } => Boolean(a.eventDate))
        .map((a) => ({ id: a.id, title: a.title, date: a.eventDate, time: a.eventTime ?? null, type: a.type ?? 'general' })),
    [announcementsList],
  );

  const announcementsPagination = usePagination({
    totalRecords: announcementsList.length,
    initialPageSize: 5,
  });
  const pagedAnnouncements = announcementsList.slice(
    announcementsPagination.startIndex,
    announcementsPagination.endIndex,
  );

  const relCourse = Array.isArray(ownApp?.courses) ? ownApp?.courses[0] : ownApp?.courses;
  const relInst = Array.isArray(ownApp?.institutions) ? ownApp?.institutions[0] : ownApp?.institutions;
  const uliValue = asText(ownProfileData?.uli_number) || null;

  // Requirement compliance: server-confirmed submissions of the always-required documents.
  const uploadedTypesCount = docCompliance.submitted;
  const requiredDocsTotal = docCompliance.requiredTotal;

  const appStatus = (ownApp?.application_status || 'draft').toLowerCase();
  const completeness = ownApp?.record_completeness ?? 0;


  function copyTextToClipboard(text: string, label: string) {
    void navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  }

  return (
    <div className="min-w-0 space-y-4 sm:space-y-6">
      {/* ================= NAVIGATION TABS ================= */}
      {/* Phones use the bottom tab bar (LearnerBottomNav); tablets and desktop use these tabs. */}
      <div className="hidden pb-3 md:block">
        <div
          role="tablist"
          aria-label="Scholar portal sections"
          className="flex snap-x items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pb-0 [&::-webkit-scrollbar]:hidden"
        >
          {(
            [
              { key: 'overview', Icon: IdCard, full: 'Overview & Digital System ID', short: 'Overview & ID' },
              { key: 'intake', Icon: FileText, full: 'Registration Inputs & MIS 03-01', short: 'MIS 03-01' },
              { key: 'requirements', Icon: Upload, full: 'Important Documents (8)', short: 'Documents' },
              { key: 'progress', Icon: ClipboardCheck, full: 'Progress & Achievement Charts', short: 'Progress' },
              { key: 'schedules', Icon: CalendarDays, full: 'Schedules & Announcements', short: 'Schedules' },
            ] as const
          ).map(({ key, Icon, full, short }) => (
            <Button
              key={key}
              type="button"
              size="sm"
              role="tab"
              aria-selected={tab === key}
              variant={tab === key ? 'default' : 'outline'}
              onClick={() => setTab(key)}
              className={`shrink-0 snap-start whitespace-nowrap ${tab === key ? 'bg-[#0f295c] text-white hover:bg-[#143a77]' : 'bg-white'}`}
            >
              <Icon className="mr-1.5 h-3.5 w-3.5" />
              <span className="sm:hidden">{short}</span>
              <span className="hidden sm:inline">{full}</span>
              {key === 'requirements' && uploadedTypesCount > 0 && (
                <span className="ml-1.5 rounded-full bg-teal-600 px-1.5 text-[10px] text-white">
                  {uploadedTypesCount}/{requiredDocsTotal}
                </span>
              )}
            </Button>
          ))}
        </div>
      </div>

      {/* ================= HOME ================= */}
      {tab === 'overview' && (
        <ScholarHome
          fullName={profile?.fullName ?? 'Scholar'}
          roleLabel={profile ? ROLE_LABELS[profile.role] : 'Scholar'}
          campusName={relInst?.name ?? profile?.institutions?.[0]?.name ?? ''}
          campusCode={relInst?.code ?? profile?.institutions?.[0]?.code ?? ''}
          isOnline={isOnline}
          photoUrl={idPhotoUrl}
          appStatus={appStatus}
          referenceNo={ownApp?.reference_no ?? null}
          completeness={completeness}
          remarks={ownApp?.remarks ?? null}
          docsSubmitted={uploadedTypesCount}
          docsRequired={requiredDocsTotal}
          docsWaiting={docCompliance.waiting}
          courseName={relCourse?.name ?? null}
          scholarId={ownApp?.scholar_id ?? null}
          uli={uliValue}
          nextClass={nextClass}
          latestAnnouncement={latestAnnouncement}
          isLoading={enrollmentQuery.isLoading && !cachedLearnerSnapshot}
          onNavigate={setTab}
          onCopy={copyTextToClipboard}
          idCardProps={{
            fullName: profile?.fullName ?? 'Learner',
            email: profile?.email,
            systemAccountId: userId || 'SYSTEM-ACCOUNT',
            roleLabel: profile ? ROLE_LABELS[profile.role] : 'Scholar / Student',
            institutionCode: relInst?.code ?? profile?.institutions?.[0]?.code,
            institutionName: relInst?.name ?? profile?.institutions?.[0]?.name,
            courseName: relCourse?.name,
            scholarId: ownApp?.scholar_id,
            enrollmentStatus: ownApp?.application_status,
            uliNumber: uliValue,
            photoUrl: idPhotoUrl,
            contactNumber: asText(ownProfileData?.contact_number) || null,
          }}
        />
      )}

      {/* ================= TAB 2: REGISTRATION INTAKE (MIS 03-01) ================= */}
      {tab === 'intake' && <RegistrationIntakeWorkspace embedded />}

      {/* ================= TAB 3: IMPORTANT DOCUMENTS (8) ================= */}
      {tab === 'requirements' && <LearnerDocumentsPanel />}

      {/* ================= TAB 4: PROGRESS & ACHIEVEMENT CHARTS ================= */}
      {tab === 'progress' && (
        <div className="space-y-6">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base font-bold text-slate-900">
                    <ClipboardCheck className="h-5 w-5 text-teal-700" />
                    TESDA Competency Progress &amp; Achievement Charts
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Official record of the competencies (Units of Competency) assessed and reviewed by your assigned Trainer or Focal Person.
                  </CardDescription>
                </div>
                <Badge variant="info">
                  Total Evaluated Tasks: {competencyRows.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="hidden rounded-xl border border-teal-200 bg-teal-50/50 p-3.5 text-xs text-teal-950 md:block">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 shrink-0 text-teal-700 mt-0.5" />
                  <p>
                    <strong>Note:</strong> The <strong>Progress Chart</strong> covers Basic and Common Competencies (formative assessments). The <strong>Achievement Chart</strong> covers Core Competency practical demonstrations (summative assessments). This data can be viewed offline once synced.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            {(['progress', 'achievement'] as const).map((chartKind) => {
              const items = competencyRows.filter((r) => r.chartType === chartKind);
              const doneCount = items.filter((i) => i.status === 'competent').length;
              const percent = items.length > 0 ? Math.round((doneCount / items.length) * 100) : 0;

              return (
                <Card key={chartKind} className="border-slate-200 bg-white shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-base capitalize font-bold text-slate-900">
                        {chartKind === 'progress' ? (
                          <BookOpen className="h-4 w-4 text-teal-700" />
                        ) : (
                          <Award className="h-4 w-4 text-amber-600" />
                        )}
                        {chartKind} Chart ({items.length} Tasks)
                      </CardTitle>
                      <Badge variant={doneCount === items.length && items.length > 0 ? 'success' : 'info'}>
                        {doneCount} / {items.length} Competent ({percent}%)
                      </Badge>
                    </div>
                    <CardDescription className="text-xs">
                      {chartKind === 'progress'
                        ? 'Basic & Common competencies formative evaluation'
                        : 'Core competency practical achievement records'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Progress Bar */}
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full transition-all duration-500 ${
                          chartKind === 'achievement' ? 'bg-amber-500' : 'bg-teal-600'
                        }`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>

                    {items.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
                        <ClipboardCheck className="mx-auto mb-2 h-6 w-6 text-slate-400" />
                        No {chartKind} chart tasks assessed yet for this qualification.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {items.map((row) => (
                          <div
                            key={row.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3 transition-colors hover:bg-slate-50"
                          >
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900">
                                Unit {row.unitNumber} · Task {row.taskNumber}: {row.taskName}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {row.unitName} · {row.assessed_at ? formatShortDateTime(row.assessed_at) : 'Pending Assessment'}
                              </p>
                            </div>
                            <Badge
                              variant={
                                row.status === 'competent'
                                  ? 'success'
                                  : row.status === 'not_yet_competent'
                                    ? 'warning'
                                    : 'outline'
                              }
                              className="shrink-0 text-[10px]"
                            >
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                              {row.status.replace(/_/g, ' ')}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ================= TAB 5: SCHEDULES & ANNOUNCEMENTS ================= */}
      {tab === 'schedules' && (
        <div className="space-y-6">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base font-bold text-slate-900">
                    <CalendarDays className="h-5 w-5 text-teal-700" />
                    Schedule
                  </CardTitle>
                  <CardDescription className="hidden text-xs md:block">
                    Your class sessions, training batch and official deadlines. Also available offline.
                  </CardDescription>
                </div>

                <div className="hidden flex-wrap items-center gap-2 text-xs md:flex">
                  <span className="flex items-center gap-1 rounded-md bg-[#0f295c] px-2 py-1 text-white">
                    <span className="h-2 w-2 rounded-full bg-blue-300" /> Training Batch Sessions
                  </span>
                  <span className="flex items-center gap-1 rounded-md bg-[#0f766e] px-2 py-1 text-white">
                    <span className="h-2 w-2 rounded-full bg-teal-200" /> Announcements
                  </span>
                  <span className="flex items-center gap-1 rounded-md bg-[#b45309] px-2 py-1 text-white">
                    <span className="h-2 w-2 rounded-full bg-amber-200" /> Deadlines
                  </span>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isPhone ? (
                // Phones: an agenda (one card per batch, upcoming dates) instead of a cramped grid.
                <ScheduleAgenda batches={agendaBatches} events={agendaEvents} />
              ) : (
                <div className="w-full rounded-xl border border-slate-200 p-2 sm:p-4">
                  <FullCalendar
                    plugins={[dayGridPlugin, timeGridPlugin, listPlugin]}
                    initialView="dayGridMonth"
                    headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,listMonth' }}
                    buttonText={{ listMonth: 'list' }}
                    noEventsContent="No classes or deadlines this month."
                    events={studentCalendarEvents}
                    height="auto"
                  />
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-slate-900">
                Recent Announcements from Admin &amp; Registrar ({announcementsList.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {announcementsList.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
                  <CalendarDays className="mx-auto mb-2 h-6 w-6 text-slate-400" />
                  No announcements loaded yet.
                </div>
              ) : (
                <>
                  <div className="space-y-2.5">
                    {pagedAnnouncements.map((a) => (
                      <div
                        key={a.id}
                        className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 transition hover:bg-slate-50"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-bold text-slate-900">{a.title}</p>
                          <div className="flex gap-1.5">
                            {a.eventDate && (
                              <Badge variant="info" className="text-[10px]">
                                <CalendarDays className="mr-1 inline h-3 w-3" />
                                {a.eventDate} {a.eventTime ? `· ${a.eventTime}` : ''}
                              </Badge>
                            )}
                            <Badge variant="outline" className="capitalize text-[10px]">
                              {a.type}
                            </Badge>
                          </div>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-slate-700">{a.body}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <Pagination
                      currentPage={announcementsPagination.currentPage}
                      totalPages={announcementsPagination.totalPages}
                      totalRecords={announcementsList.length}
                      pageSize={announcementsPagination.pageSize}
                      onPageChange={announcementsPagination.goToPage}
                      onPageSizeChange={announcementsPagination.setPageSize}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
