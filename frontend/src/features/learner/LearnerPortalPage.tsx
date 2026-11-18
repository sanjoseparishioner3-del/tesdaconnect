import React from 'react';
import { useQuery } from '@tanstack/react-query';
import dayGridPlugin from '@fullcalendar/daygrid';
import listPlugin from '@fullcalendar/list';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  Award,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  CloudOff,
  Copy,
  FileCheck,
  FileText,
  FolderUp,
  GraduationCap,
  IdCard,
  Info,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Pagination, usePagination } from '@/components/ui/pagination';
import { InstallAppButton } from '@/components/pwa/PwaInstallBanner';
import { RegistrationIntakeWorkspace } from '@/features/intake/RegistrationIntakeWorkspace';
import { DigitalSystemIdCard } from '@/features/learner/DigitalSystemIdCard';
import { LearnerDocumentsPanel } from '@/features/learner/documents/LearnerDocumentsPanel';
import { useLearnerDocuments } from '@/features/learner/documents/learnerDocuments';
import { DEFAULT_LEARNER_TAB, parseLearnerTab, type LearnerTab } from '@/features/learner/learnerTabs';
import { offlineDb } from '@/lib/db/dexie';
import { normalizeDocumentTypeKey, TESDA_REQUIRED_DOCUMENTS } from '@/lib/documents/requiredDocuments';
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

  // Enrollment Journey Step index
  const activeStep = React.useMemo(() => {
    if (appStatus === 'confirmed') return 4;
    if (appStatus === 'verified') return 3;
    if (appStatus === 'submitted') return 3;
    if (docCompliance.complete) return 2;
    return 1;
  }, [appStatus, docCompliance.complete]);

  function copyTextToClipboard(text: string, label: string) {
    void navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  }

  return (
    <div className="min-w-0 space-y-4 sm:space-y-6">
      {/* ================= HERO BANNER (Home only: other sections start with their own content) ================= */}
      {tab === 'overview' && (
      <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-900 via-[#0f295c] to-teal-950 p-4 text-white shadow-xl sm:p-6">
        <div className="absolute -right-12 -top-12 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 h-32 w-80 rounded-full bg-amber-400/10 blur-2xl" />

        <div className="relative z-10 flex flex-col gap-4 sm:gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-white/20 bg-white/10 shadow-inner backdrop-blur-md sm:h-16 sm:w-16">
              {idPhotoUrl ? (
                <img src={idPhotoUrl} alt={profile?.fullName ?? 'Scholar'} className="h-full w-full object-cover" />
              ) : (
                <GraduationCap className="h-8 w-8 text-teal-300" />
              )}
              <span
                className={`absolute bottom-1 right-1 h-3.5 w-3.5 rounded-full border-2 border-slate-900 ${
                  isOnline ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
                title={isOnline ? 'Online' : 'Offline Cache Mode'}
              />
            </div>

            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="break-words text-xl font-black tracking-tight text-white sm:text-3xl">
                  {profile?.fullName ?? 'TESDA Scholar'}
                </h1>
                <span className="rounded-full bg-teal-400/20 px-2.5 py-0.5 text-xs font-semibold text-teal-200 ring-1 ring-inset ring-teal-400/30">
                  {profile ? ROLE_LABELS[profile.role] : 'Scholar / Trainee'}
                </span>
              </div>

              <p className="flex flex-wrap items-center gap-x-2 text-xs text-slate-300">
                <span className="font-semibold text-amber-300">
                  {relInst?.name ?? profile?.institutions?.[0]?.name ?? 'Balli School of Technology'}
                </span>
                <span>•</span>
                <span>Campus Code: {relInst?.code ?? profile?.institutions?.[0]?.code ?? 'BST'}</span>
                {ownApp?.reference_no && (
                  <>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() => copyTextToClipboard(ownApp.reference_no, 'Application Reference')}
                      className="inline-flex items-center gap-1 font-mono text-teal-200 transition-colors hover:text-white"
                      title="Click to copy reference"
                    >
                      REF: {ownApp.reference_no}
                      <Copy className="h-3 w-3" />
                    </button>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Badge
              variant={isOnline ? 'success' : 'warning'}
              className="px-3 py-1.5 text-xs font-semibold shadow-sm backdrop-blur-sm"
            >
              {isOnline ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  Online Ready
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <CloudOff className="h-3.5 w-3.5 text-amber-300" />
                  Offline Cache Mode
                </span>
              )}
            </Badge>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setTab('intake')}
              className="border-white/20 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 hover:text-white"
            >
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              Edit MIS 03-01
            </Button>

            <InstallAppButton className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white" />
          </div>
        </div>

        {/* Quick KPI Cards Grid */}
        <div className="relative z-10 mt-4 grid grid-cols-2 gap-2 sm:mt-6 sm:grid-cols-4 sm:gap-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm">
            <p className="text-[11px] font-medium text-slate-300">Enrollment Status</p>
            <p className="mt-1 text-sm font-bold uppercase tracking-wider text-teal-300">
              {ownApp?.application_status ?? 'Draft'}
            </p>
            <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
              <span>Completeness</span>
              <span className="font-semibold text-white">{completeness}%</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-gradient-to-r from-teal-400 to-emerald-400 transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, completeness))}%` }}
              />
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm">
            <p className="text-[11px] font-medium text-slate-300">Document Compliance</p>
            <p className="mt-1 text-sm font-bold text-white">
              {uploadedTypesCount} <span className="text-xs font-normal text-slate-300">of {requiredDocsTotal} Submitted</span>
            </p>
            <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
              <span>Mandatory Requirements</span>
              <span className="font-semibold text-amber-300">{docCompliance.complete ? 'Complete' : 'Incomplete'}</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full transition-all duration-500 ${
                  docCompliance.complete ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
                style={{ width: `${(uploadedTypesCount / Math.max(1, requiredDocsTotal)) * 100}%` }}
              />
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm">
            <p className="text-[11px] font-medium text-slate-300">Enrolled Qualification</p>
            <p className="mt-1 truncate text-sm font-bold text-white" title={relCourse?.name ?? 'Not assigned yet'}>
              {relCourse?.name ?? 'Not assigned yet'}
            </p>
            <p className="mt-2 text-[10px] text-slate-400">
              Batch: <span className="font-semibold text-teal-200">{ownApp?.scholar_id ?? 'Pending assignment'}</span>
            </p>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm">
            <p className="text-[11px] font-medium text-slate-300">TESDA Main ULI</p>
            <p className={`mt-1 font-mono text-sm font-bold ${appStatus === 'confirmed' && uliValue ? 'text-emerald-300' : 'text-slate-300'}`}>
              {appStatus === 'confirmed' && uliValue ? uliValue : 'Pending ULI'}
            </p>
            <p className="mt-2 text-[10px] text-slate-400">
              {appStatus === 'confirmed' ? 'Verified by TESDA Main' : 'Encoded after confirmation'}
            </p>
          </div>
        </div>
      </div>
      )}

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

      {/* ================= TAB 1: OVERVIEW & DIGITAL ID ================= */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* Enrollment Milestones Stepper */}
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base font-bold text-slate-900">
                    <Sparkles className="h-4 w-4 text-teal-600" />
                    Scholar Enrollment Lifecycle Journey
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Track your application from registration to the official TESDA ULI.
                  </CardDescription>
                </div>
                <Badge variant={appStatus === 'confirmed' ? 'success' : appStatus === 'verified' ? 'info' : 'warning'}>
                  Current: {appStatus.toUpperCase()}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
                {/* Step 1 */}
                <div
                  onClick={() => setTab('intake')}
                  className={`group relative cursor-pointer rounded-xl border p-3.5 transition-all hover:shadow-sm ${
                    completeness >= 80
                      ? 'border-emerald-300 bg-emerald-50/50 text-emerald-950'
                      : activeStep === 1
                        ? 'border-teal-500 bg-teal-50/70 ring-2 ring-teal-200'
                        : 'border-slate-200 bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-800 text-xs font-bold text-white">
                      {completeness >= 80 ? <Check className="h-3.5 w-3.5" /> : '1'}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      {completeness}% encoded
                    </span>
                  </div>
                  <h4 className="mt-2 text-xs font-bold text-slate-900 group-hover:text-teal-800">
                    1. MIS 03-01 Registration
                  </h4>
                  <p className="mt-0.5 text-[11px] text-slate-600">Personal &amp; Demographic Profile</p>
                </div>

                {/* Step 2 */}
                <div
                  onClick={() => setTab('requirements')}
                  className={`group relative cursor-pointer rounded-xl border p-3.5 transition-all hover:shadow-sm ${
                    docCompliance.complete
                      ? 'border-emerald-300 bg-emerald-50/50 text-emerald-950'
                      : activeStep === 2
                        ? 'border-teal-500 bg-teal-50/70 ring-2 ring-teal-200'
                        : 'border-slate-200 bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-800 text-xs font-bold text-white">
                      {docCompliance.complete ? <Check className="h-3.5 w-3.5" /> : '2'}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      {uploadedTypesCount}/{requiredDocsTotal} docs
                    </span>
                  </div>
                  <h4 className="mt-2 text-xs font-bold text-slate-900 group-hover:text-teal-800">
                    2. 8 Required Documents
                  </h4>
                  <p className="mt-0.5 text-[11px] text-slate-600">PSA, Form 137, 2x2 Photo, etc.</p>
                </div>

                {/* Step 3 */}
                <div
                  className={`relative rounded-xl border p-3.5 ${
                    appStatus === 'verified' || appStatus === 'confirmed'
                      ? 'border-emerald-300 bg-emerald-50/50 text-emerald-950'
                      : appStatus === 'submitted'
                        ? 'border-teal-500 bg-teal-50/70 ring-2 ring-teal-200'
                        : 'border-slate-200 bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-800 text-xs font-bold text-white">
                      {appStatus === 'verified' || appStatus === 'confirmed' ? <Check className="h-3.5 w-3.5" /> : '3'}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Registrar
                    </span>
                  </div>
                  <h4 className="mt-2 text-xs font-bold text-slate-900">
                    3. Registrar Review
                  </h4>
                  <p className="mt-0.5 text-[11px] text-slate-600">Evaluation &amp; Verification</p>
                </div>

                {/* Step 4 */}
                <div
                  className={`relative rounded-xl border p-3.5 ${
                    appStatus === 'confirmed'
                      ? 'border-emerald-300 bg-emerald-50/50 text-emerald-950'
                      : 'border-slate-200 bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-800 text-xs font-bold text-white">
                      {appStatus === 'confirmed' ? <Check className="h-3.5 w-3.5" /> : '4'}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      TESDA Main
                    </span>
                  </div>
                  <h4 className="mt-2 text-xs font-bold text-slate-900">
                    4. Confirmation &amp; ULI
                  </h4>
                  <p className="mt-0.5 text-[11px] text-slate-600">Official ULI Issued</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-12">
            {/* Left Column: Academic & Enrollment Details */}
            <div className="min-w-0 space-y-4 lg:col-span-7">
              {/* Reference & Scholar ID Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Card className="border-slate-200 transition-shadow hover:shadow-md">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Application Reference
                    </CardDescription>
                    <CardTitle className="flex items-center justify-between font-mono text-base text-slate-900">
                      <span>{ownApp?.reference_no ?? 'Pending Registration Intake'}</span>
                      {ownApp?.reference_no && (
                        <button
                          type="button"
                          onClick={() => copyTextToClipboard(ownApp.reference_no, 'Application Reference')}
                          className="text-slate-400 hover:text-slate-700"
                          title="Copy reference number"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-slate-600">
                    Status: <strong className="capitalize text-teal-800">{ownApp?.application_status ?? 'draft'}</strong> · Completeness:{' '}
                    <strong>{ownApp?.record_completeness ?? 0}%</strong>
                  </CardContent>
                </Card>

                <Card className="border-slate-200 transition-shadow hover:shadow-md">
                  <CardHeader className="pb-2">
                    <CardDescription className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Confirmed Scholar ID
                    </CardDescription>
                    <CardTitle className="font-mono text-base text-teal-800">
                      {ownApp?.scholar_id ?? 'Pending confirmation'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs text-slate-600">
                    Generated by Registrar/Admin confirmation.
                  </CardContent>
                </Card>
              </div>

              {/* Official TESDA ULI Card */}
              <Card className="border-teal-200 bg-gradient-to-br from-teal-50/30 to-white shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base text-slate-900">
                      <ShieldCheck className="h-5 w-5 text-teal-700" />
                      TESDA Main Unique Learner Identifier (ULI)
                    </CardTitle>
                    {ownApp?.application_status === 'confirmed' && uliValue ? (
                      <Badge variant="success">Confirmed &amp; Active</Badge>
                    ) : (
                      <Badge variant="outline">Pending Issuance</Badge>
                    )}
                  </div>
                  <CardDescription className="text-xs">
                    Assigned strictly by the Registrar or Administrator after your enrollment confirmation and receipt from TESDA Main.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between rounded-xl border border-teal-200 bg-teal-50/60 px-4 py-3 font-mono font-bold text-slate-900">
                    <span className="text-sm sm:text-base">
                      {ownApp?.application_status === 'confirmed' && uliValue
                        ? uliValue
                        : 'Pending TESDA Main ULI (Encoded after confirmation)'}
                    </span>
                    {ownApp?.application_status === 'confirmed' && uliValue && (
                      <button
                        type="button"
                        onClick={() => copyTextToClipboard(uliValue, 'TESDA Main ULI')}
                        className="text-teal-700 hover:text-teal-900"
                        title="Copy ULI"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    The ULI is your official national number for all TESDA training records, certificates and national assessments.
                  </p>
                </CardContent>
              </Card>

              {/* Registrar Remarks Callout (if present) */}
              {ownApp?.remarks && (
                <Card className="border-amber-300 bg-amber-50/70 shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm text-amber-950">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      Registrar Review Remarks &amp; Corrections
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-xs leading-relaxed text-amber-900">
                    {ownApp.remarks}
                  </CardContent>
                </Card>
              )}

              {/* Document Compliance Summary Card */}
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-sm font-bold text-slate-900">
                      <FileCheck className="h-4 w-4 text-teal-700" />
                      8 Documentary Requirements Status
                    </CardTitle>
                    <span className="text-xs font-semibold text-slate-600">
                      {uploadedTypesCount} / {requiredDocsTotal} Submitted
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full transition-all duration-500 ${
                        docCompliance.complete ? 'bg-emerald-500' : 'bg-teal-600'
                      }`}
                      style={{ width: `${(uploadedTypesCount / Math.max(1, requiredDocsTotal)) * 100}%` }}
                    />
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {TESDA_REQUIRED_DOCUMENTS.map((req) => {
                      const isUploaded = displayedDocs.some(
                        (d) => normalizeDocumentTypeKey(d.document_type) === req.key,
                      );
                      return (
                        <span
                          key={req.key}
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-medium ${
                            isUploaded
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {isUploaded ? <Check className="h-3 w-3 text-emerald-600" /> : <Clock className="h-3 w-3 text-slate-400" />}
                          {req.label}
                        </span>
                      );
                    })}
                  </div>

                  <div className="pt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setTab('requirements')}
                      className="w-full text-xs text-teal-800 hover:bg-teal-50"
                    >
                      <FolderUp className="mr-1.5 h-3.5 w-3.5" />
                      Manage &amp; Upload Requirements ({displayedDocs.length} saved files)
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Actions Grid */}
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold text-slate-900">
                    Quick Navigation &amp; Actions
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setTab('intake')}
                    className="flex h-auto flex-col items-start p-3 text-left hover:border-teal-300 hover:bg-teal-50/40"
                  >
                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <FileText className="h-4 w-4 text-teal-700" />
                      MIS 03-01 Registration Form
                    </span>
                    <span className="mt-1 text-[11px] text-slate-500">
                      Encoded inputs, personal details, &amp; PDF print
                    </span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setTab('requirements')}
                    className="flex h-auto flex-col items-start p-3 text-left hover:border-teal-300 hover:bg-teal-50/40"
                  >
                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <Upload className="h-4 w-4 text-teal-700" />
                      Upload 8 Documents
                    </span>
                    <span className="mt-1 text-[11px] text-slate-500">
                      PSA, 2x2 photos, valid IDs, medical cert
                    </span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setTab('schedules')}
                    className="flex h-auto flex-col items-start p-3 text-left hover:border-teal-300 hover:bg-teal-50/40"
                  >
                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <CalendarDays className="h-4 w-4 text-teal-700" />
                      Calendar &amp; Announcements
                    </span>
                    <span className="mt-1 text-[11px] text-slate-500">
                      Batch classes, exam dates, deadlines
                    </span>
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setTab('progress')}
                    className="flex h-auto flex-col items-start p-3 text-left hover:border-teal-300 hover:bg-teal-50/40"
                  >
                    <span className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <ClipboardCheck className="h-4 w-4 text-teal-700" />
                      Competency Charts
                    </span>
                    <span className="mt-1 text-[11px] text-slate-500">
                      Progress and achievement records by Focal Person
                    </span>
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Right Column: 3D Flipping Digital System ID Card */}
            <div className="flex flex-col items-center justify-start lg:col-span-5">
              <div className="w-full rounded-2xl border border-slate-200/80 bg-gradient-to-b from-slate-50/70 to-white p-4 shadow-sm sm:p-6">
                <div className="mb-3 text-center">
                  <h3 className="text-sm font-bold text-slate-900">Digital System Account ID Card</h3>
                  <p className="text-[11px] text-slate-500">
                    Woven school lanyard · 3D flipping card with front and back credentials
                  </p>
                </div>

                <DigitalSystemIdCard
                  fullName={profile?.fullName ?? 'Learner'}
                  email={profile?.email}
                  systemAccountId={userId || 'SYSTEM-ACCOUNT'}
                  roleLabel={profile ? ROLE_LABELS[profile.role] : 'Scholar / Student'}
                  institutionCode={relInst?.code ?? profile?.institutions?.[0]?.code}
                  institutionName={relInst?.name ?? profile?.institutions?.[0]?.name}
                  courseName={relCourse?.name}
                  scholarId={ownApp?.scholar_id}
                  enrollmentStatus={ownApp?.application_status}
                  uliNumber={uliValue}
                  photoUrl={idPhotoUrl}
                  contactNumber={asText(ownProfileData?.contact_number) || null}
                />
              </div>
            </div>
          </div>
        </div>
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
              <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-3.5 text-xs text-teal-950">
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
                    Schedules &amp; Announcements Calendar (View-Only)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    See your class sessions, training batch schedule and official deadlines from the Administrator and Registrar. Also available offline.
                  </CardDescription>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
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
              <div className="w-full rounded-xl border border-slate-200 p-2 sm:p-4">
                {/* Phones get an agenda list (no sideways scrolling); larger screens keep the grid. */}
                <FullCalendar
                  key={isPhone ? 'phone' : 'wide'}
                  plugins={[dayGridPlugin, timeGridPlugin, listPlugin]}
                  initialView={isPhone ? 'listMonth' : 'dayGridMonth'}
                  headerToolbar={
                    isPhone
                      ? { left: 'prev,next', center: 'title', right: 'today' }
                      : { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,listMonth' }
                  }
                  buttonText={{ listMonth: 'list' }}
                  noEventsContent="No classes or deadlines this month."
                  events={studentCalendarEvents}
                  height="auto"
                />
              </div>
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
