import type { SupabaseClient } from '@supabase/supabase-js';
import {
  offlineDb,
  safeDexieWrite,
  type CachedFocalDataRecord,
  type CachedTraineeDirectoryRecord,
} from '@/lib/db/dexie';
import { asText } from '@/lib/utils';
import { useConnectivityStore } from '@/stores/connectivityStore';
import { normalizeAppRole, type AppRole, type InstitutionAssignment, type UserProfile } from '@/types/auth';

interface DbProfileRow {
  id: string;
  email: string;
  full_name: string;
  username: string | null;
  role: string;
  account_status: string;
  force_password_change: boolean;
  password_expires_at: string | null;
  password_expiry_exempt: boolean;
  last_login_at: string | null;
}

interface DbInstitutionJoinRow {
  institution_id: string;
  is_primary: boolean;
  institutions:
    | { id: string; code: string; name: string }
    | Array<{ id: string; code: string; name: string }>
    | null;
}

export async function fetchAuthenticatedProfile(
  client: SupabaseClient,
  userId: string,
): Promise<{ profile: UserProfile | null; inactiveReason?: string }> {
  const { data: profileData, error: profileErr } = await client
    .from('profiles')
    .select(
      'id, email, full_name, username, role, account_status, force_password_change, password_expires_at, password_expiry_exempt, last_login_at',
    )
    .eq('id', userId)
    .returns<DbProfileRow[]>()
    .maybeSingle();

  const row = profileData ?? null;
  if (profileErr || !row) {
    return { profile: null, inactiveReason: 'Institutional profile record could not be loaded.' };
  }

  if (row.account_status !== 'active') {
    await client.auth.signOut().catch(() => undefined);
    return {
      profile: null,
      inactiveReason: `Account status is "${row.account_status}". Contact your Institutional Administrator.`,
    };
  }

  const { data: membershipData } = await client
    .from('institution_user')
    .select('institution_id, is_primary, institutions(id, code, name)')
    .eq('user_id', userId)
    .returns<DbInstitutionJoinRow[]>();

  const institutions: InstitutionAssignment[] = (membershipData ?? []).map((m) => {
    const inst = Array.isArray(m.institutions) ? m.institutions[0] : m.institutions;
    return {
      institutionId: m.institution_id,
      code: inst?.code ?? 'INST',
      name: inst?.name ?? 'Assigned Institution',
      isPrimary: m.is_primary,
    };
  });

  const userProfile: UserProfile = {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    username: row.username,
    role: normalizeAppRole(row.role),
    accountStatus: 'active',
    forcePasswordChange: row.force_password_change,
    passwordExpiresAt: row.password_expires_at,
    passwordExpiryExempt: row.password_expiry_exempt,
    lastLoginAt: row.last_login_at,
    institutions,
  };

  return { profile: userProfile };
}

export async function refreshOfflineCachesForUser(
  client: SupabaseClient,
  userId: string,
  role?: AppRole,
): Promise<string | null> {
  const syncedAt = new Date().toISOString();

  const [announcementsRes, batchesRes, ownProfileRes, ownAppRes, ownDocsRes] = await Promise.all([
    client
      .from('announcements')
      .select('id, institution_id, title, body, audience, target_roles, announcement_type, event_date, event_time, published_at, expires_at, deadline_at, institutions(code)')
      .eq('is_draft', false)
      .is('archived_at', null)
      .order('published_at', { ascending: false })
      .limit(50),
    client
      .from('training_batches')
      .select('id, institution_id, code, name, venue, status, starts_at, ends_at, next_class_at, courses(name), institutions(code)')
      .is('archived_at', null)
      .order('starts_at', { ascending: true })
      .limit(50),
    client
      .from('learner_profiles')
      .select('*')
      .eq('user_id', userId)
      .returns<Record<string, unknown>[]>()
      .maybeSingle(),
    client
      .from('enrollment_applications')
      .select('*, courses(name)')
      .eq('learner_user_id', userId)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .returns<Record<string, unknown>[]>()
      .maybeSingle(),
    client
      .from('learner_documents')
      .select('id, user_id, document_type, original_name, mime_type, size_bytes, status, remarks, storage_path')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  if (!announcementsRes.error && announcementsRes.data) {
    const rows = announcementsRes.data as Array<{
      id: string;
      institution_id: string | null;
      title: string;
      body: string;
      audience: string;
      target_roles?: string[];
      announcement_type?: string;
      event_date?: string | null;
      event_time?: string | null;
      published_at: string | null;
      expires_at: string | null;
      deadline_at: string | null;
      institutions: { code: string } | Array<{ code: string }> | null;
    }>;

    await offlineDb.cachedAnnouncements.where('userId').equals(userId).delete();
    if (rows.length > 0) {
      await offlineDb.cachedAnnouncements.bulkPut(
        rows.map((a) => {
          const inst = Array.isArray(a.institutions) ? a.institutions[0] : a.institutions;
          return {
            id: a.id,
            userId,
            institutionId: a.institution_id,
            institutionCode: inst?.code ?? null,
            title: a.title,
            body: a.body,
            audience: a.audience,
            targetRoles: Array.isArray(a.target_roles) ? a.target_roles : [a.audience],
            announcementType: a.announcement_type ?? 'general',
            eventDate: a.event_date ?? null,
            eventTime: a.event_time ?? null,
            publishedAt: a.published_at ?? syncedAt,
            expiresAt: a.expires_at,
            deadlineAt: a.deadline_at,
            isRead: false,
            syncedAt,
          };
        }),
      );
    }
  }

  if (!batchesRes.error && batchesRes.data) {
    const rows = batchesRes.data as Array<{
      id: string;
      institution_id: string;
      code: string;
      name: string;
      venue: string | null;
      status: string;
      starts_at: string | null;
      ends_at: string | null;
      next_class_at: string | null;
      courses: { name: string } | Array<{ name: string }> | null;
      institutions: { code: string } | Array<{ code: string }> | null;
    }>;

    await offlineDb.cachedSchedules.where('userId').equals(userId).delete();
    if (rows.length > 0) {
      await offlineDb.cachedSchedules.bulkPut(
        rows.map((b) => {
          const courseObj = Array.isArray(b.courses) ? b.courses[0] : b.courses;
          const inst = Array.isArray(b.institutions) ? b.institutions[0] : b.institutions;
          return {
            id: b.id,
            userId,
            institutionId: b.institution_id,
            institutionCode: inst?.code ?? 'INST',
            batchCode: b.code,
            batchName: b.name,
            courseName: courseObj?.name ?? 'TESDA Program',
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
  }

  const ownProfileData = ownProfileRes.data ?? null;
  const ownAppData = ownAppRes.data ?? null;

  if (ownProfileData || ownAppData) {
    await offlineDb.cachedLearnerRecords.put({
      userId,
      institutionId: asText(ownAppData?.institution_id, asText(ownProfileData?.institution_id)) || null,
      learnerProfile: ownProfileData,
      enrollmentApp: ownAppData,
      updatedAt: syncedAt,
    });
  }

  if (!ownDocsRes.error && ownDocsRes.data) {
    const existingBlobs = new Map<string, Blob>();
    const existingRows = await offlineDb.cachedDocuments.where('ownerUserId').equals(userId).toArray();
    for (const r of existingRows) {
      if (r.blob && !r.queuedUpload) existingBlobs.set(r.id, r.blob);
    }
    const serverDocs = ownDocsRes.data as Array<{
      id: string;
      user_id: string;
      document_type: string;
      original_name: string;
      mime_type: string;
      size_bytes: number;
      status: string;
      remarks: string | null;
      storage_path: string;
    }>;

    // Cache file blobs cleanly for offline view & download (up to 12 files)
    const authSession = (await client.auth.getSession()).data.session;
    for (const doc of serverDocs.slice(0, 12)) {
      let cachedBlob = existingBlobs.get(doc.id);
      if (!cachedBlob && doc.storage_path && authSession?.user) {
        try {
          const dl = await client.storage.from('learner-documents').download(doc.storage_path);
          if (dl && !dl.error && dl.data) {
            cachedBlob = dl.data;
          }
        } catch {
          // Deferred to offline queue if storage is unavailable or unauthenticated
        }
      }
      await offlineDb.cachedDocuments.put({
        id: doc.id,
        ownerUserId: userId,
        targetUserId: doc.user_id,
        institutionId: asText(ownAppData?.institution_id, 'INST') || 'INST',
        documentType: doc.document_type,
        originalName: doc.original_name,
        mimeType: doc.mime_type,
        sizeBytes: doc.size_bytes,
        status: doc.status,
        remarks: doc.remarks,
        storagePath: doc.storage_path,
        blob: cachedBlob,
        queuedUpload: false,
        syncedAt,
      });
    }
  }

  const ownAppId = asText(ownAppData?.id);
  if (ownAppId) {
    const { data: compRows } = await client
      .from('competency_progress')
      .select('id, status, assessed_at, competency_tasks(task_number, name, chart_type, competency_units(unit_number, name))')
      .eq('enrollment_application_id', ownAppId)
      .limit(100);

    if (compRows) {
      await offlineDb.cachedCompetencyCharts.where('userId').equals(userId).delete();
      const mapped = (compRows as Array<{
        id: string;
        status: string;
        assessed_at: string | null;
        competency_tasks:
          | {
              task_number: number;
              name: string;
              chart_type: 'progress' | 'achievement';
              competency_units: { unit_number: number; name: string } | Array<{ unit_number: number; name: string }> | null;
            }
          | Array<{
              task_number: number;
              name: string;
              chart_type: 'progress' | 'achievement';
              competency_units: { unit_number: number; name: string } | Array<{ unit_number: number; name: string }> | null;
            }>
          | null;
      }>).map((row) => {
        const task = Array.isArray(row.competency_tasks) ? row.competency_tasks[0] : row.competency_tasks;
        const unit = task?.competency_units
          ? (Array.isArray(task.competency_units) ? task.competency_units[0] : task.competency_units)
          : null;
        return {
          id: row.id,
          userId,
          chartType: task?.chart_type ?? ('progress' as const),
          unitNumber: unit?.unit_number ?? 1,
          unitName: unit?.name ?? 'Competency Unit',
          taskNumber: task?.task_number ?? 1,
          taskName: task?.name ?? 'Competency Task',
          status: row.status,
          assessedAt: row.assessed_at,
          syncedAt,
        };
      });
      if (mapped.length > 0) {
        await safeDexieWrite(
          () => offlineDb.cachedCompetencyCharts.bulkPut(mapped),
          {
            onQuotaWarning: (msg) => useConnectivityStore.getState().setStorageWarning(msg),
          },
        );
      }
    }
  }

  // Role-scoped Registrar / Admin cached directory (RLS-enforced on Supabase)
  const canViewTraineeDirectory =
    role === 'registrar' ||
    role === 'institutional_administrator' ||
    role === 'system_administrator' ||
    role === 'focal_person';

  if (canViewTraineeDirectory) {
    const { data: appRows, error: dirErr } = await client
      .from('enrollment_applications')
      .select(
        'id, reference_no, learner_user_id, institution_id, course_id, learner_name, email, application_status, record_completeness, scholar_id, forwarding_id, archived_at, courses(name, code), institutions(name, code)',
      )
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(100);

    if (!dirErr && appRows) {
      const apps = appRows as Array<{
        id: string;
        reference_no: string;
        learner_user_id: string;
        institution_id: string;
        course_id: string | null;
        learner_name: string;
        email: string;
        application_status: string;
        record_completeness: number;
        scholar_id: string | null;
        forwarding_id: string | null;
        archived_at: string | null;
        courses: { name: string; code: string } | Array<{ name: string; code: string }> | null;
        institutions: { name: string; code: string } | Array<{ name: string; code: string }> | null;
      }>;

      const learnerIds = Array.from(new Set(apps.map((a) => a.learner_user_id).filter(Boolean)));
      const lpMap = new Map<string, Record<string, unknown>>();
      if (learnerIds.length > 0) {
        const { data: lpRows } = await client
          .from('learner_profiles')
          .select('*')
          .in('user_id', learnerIds)
          .returns<Array<Record<string, unknown> & { user_id: string }>>();
        for (const lp of lpRows ?? []) {
          lpMap.set(lp.user_id, lp);
        }
      }

      const directoryRecords: CachedTraineeDirectoryRecord[] = apps.map((a) => {
        const course = Array.isArray(a.courses) ? a.courses[0] : a.courses;
        const inst = Array.isArray(a.institutions) ? a.institutions[0] : a.institutions;
        const lpRecord = lpMap.get(a.learner_user_id) ?? null;
        const pkg = typeof lpRecord?.scholarship_package === 'string' ? lpRecord.scholarship_package : null;
        return {
          id: `${userId}:${a.id}`,
          userId,
          applicationId: a.id,
          institutionId: a.institution_id,
          referenceNo: a.reference_no,
          learnerUserId: a.learner_user_id,
          learnerName: a.learner_name,
          email: a.email,
          courseId: a.course_id,
          courseName: course?.name ?? 'Program',
          courseCode: course?.code ?? 'TESDA',
          institutionName: inst?.name ?? 'Institution',
          institutionCode: inst?.code ?? 'INST',
          scholarshipPackage: pkg,
          applicationStatus: a.application_status,
          recordCompleteness: a.record_completeness,
          scholarId: a.scholar_id,
          forwardingId: a.forwarding_id,
          archivedAt: a.archived_at,
          learnerProfileJson: lpRecord,
          updatedAt: syncedAt,
        };
      });

      await safeDexieWrite(
        async () => {
          await offlineDb.cachedTraineeDirectory.where('userId').equals(userId).delete();
          if (directoryRecords.length > 0) {
            await offlineDb.cachedTraineeDirectory.bulkPut(directoryRecords);
          }
        },
        { onQuotaWarning: (msg) => useConnectivityStore.getState().setStorageWarning(msg) },
      );
    }
  }

  // Role-scoped Focal Person / Trainer / Admin Competency & Progress cache
  const canCacheCompetencyOps =
    role === 'focal_person' ||
    role === 'trainer' ||
    role === 'institutional_administrator' ||
    role === 'system_administrator';

  if (canCacheCompetencyOps) {
    const { data: batchRows } = await client
      .from('training_batches')
      .select('id, institution_id, code, name, course_id, status')
      .is('archived_at', null)
      .order('starts_at', { ascending: false })
      .limit(25);

    const batches = (batchRows ?? []) as Array<{
      id: string;
      institution_id: string;
      code: string;
      name: string;
      course_id: string;
      status: string;
    }>;

    if (batches.length > 0) {
      const focalRecords: CachedFocalDataRecord[] = [];
      for (const b of batches) {
        focalRecords.push({
          id: `${userId}:batch:${b.id}`,
          userId,
          institutionId: b.institution_id,
          batchId: b.id,
          kind: 'batch',
          entityId: b.id,
          payload: b,
          syncedAt,
        });
      }

      const batchIds = batches.map((b) => b.id);
      const courseIds = Array.from(new Set(batches.map((b) => b.course_id).filter(Boolean)));

      const [scholarsRes, unitsRes] = await Promise.all([
        client
          .from('enrollment_applications')
          .select('id, institution_id, training_batch_id, reference_no, learner_name, scholar_id, application_status')
          .in('training_batch_id', batchIds)
          .in('application_status', ['confirmed', 'verified'])
          .is('archived_at', null)
          .limit(200),
        courseIds.length > 0
          ? client
              .from('competency_units')
              .select('id, course_id, unit_number, name, sort_order, is_archived')
              .in('course_id', courseIds)
              .eq('is_archived', false)
              .limit(100)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const scholars = (scholarsRes.data ?? []) as Array<{
        id: string;
        institution_id: string;
        training_batch_id: string | null;
        reference_no: string;
        learner_name: string;
        scholar_id: string | null;
        application_status: string;
      }>;
      const units = (unitsRes.data ?? []) as Array<{
        id: string;
        course_id: string;
        unit_number: number;
        name: string;
        sort_order: number;
        is_archived: boolean;
      }>;

      for (const s of scholars) {
        focalRecords.push({
          id: `${userId}:scholar:${s.id}`,
          userId,
          institutionId: s.institution_id,
          batchId: s.training_batch_id ?? 'unassigned',
          kind: 'scholar',
          entityId: s.id,
          payload: s,
          syncedAt,
        });
      }

      for (const u of units) {
        focalRecords.push({
          id: `${userId}:unit:${u.id}`,
          userId,
          institutionId: batches.find((b) => b.course_id === u.course_id)?.institution_id ?? 'INST',
          batchId: u.course_id,
          kind: 'unit',
          entityId: u.id,
          payload: u,
          syncedAt,
        });
      }

      const unitIds = units.map((u) => u.id);
      const scholarIds = scholars.map((s) => s.id);

      const [tasksRes, progressRes, submissionsRes] = await Promise.all([
        unitIds.length > 0
          ? client
              .from('competency_tasks')
              .select('id, competency_unit_id, chart_type, task_number, name')
              .in('competency_unit_id', unitIds)
              .limit(300)
          : Promise.resolve({ data: [], error: null }),
        scholarIds.length > 0
          ? client
              .from('competency_progress')
              .select('id, enrollment_application_id, competency_task_id, status, remarks, assessed_at, version')
              .in('enrollment_application_id', scholarIds)
              .limit(500)
          : Promise.resolve({ data: [], error: null }),
        scholarIds.length > 0
          ? client
              .from('competency_report_submissions')
              .select('id, enrollment_application_id, status, submission_reference, remarks, version')
              .in('enrollment_application_id', scholarIds)
              .limit(200)
          : Promise.resolve({ data: [], error: null }),
      ]);

      for (const t of (tasksRes.data ?? []) as Array<Record<string, unknown> & { id: string; competency_unit_id: string }>) {
        focalRecords.push({
          id: `${userId}:task:${t.id}`,
          userId,
          institutionId: 'INST',
          batchId: t.competency_unit_id,
          kind: 'task',
          entityId: t.id,
          payload: t,
          syncedAt,
        });
      }

      for (const p of (progressRes.data ?? []) as Array<
        Record<string, unknown> & { id: string; enrollment_application_id: string }
      >) {
        focalRecords.push({
          id: `${userId}:progress:${p.id}`,
          userId,
          institutionId: 'INST',
          batchId: p.enrollment_application_id,
          kind: 'progress',
          entityId: p.id,
          payload: p,
          syncedAt,
        });
      }

      for (const sub of (submissionsRes.data ?? []) as Array<
        Record<string, unknown> & { id: string; enrollment_application_id: string }
      >) {
        focalRecords.push({
          id: `${userId}:submission:${sub.id}`,
          userId,
          institutionId: 'INST',
          batchId: sub.enrollment_application_id,
          kind: 'submission',
          entityId: sub.id,
          payload: sub,
          syncedAt,
        });
      }

      await safeDexieWrite(
        async () => {
          await offlineDb.cachedFocalData.where('userId').equals(userId).delete();
          if (focalRecords.length > 0) {
            await offlineDb.cachedFocalData.bulkPut(focalRecords);
          }
        },
        { onQuotaWarning: (msg) => useConnectivityStore.getState().setStorageWarning(msg) },
      );
    }
  }

  return syncedAt;
}
