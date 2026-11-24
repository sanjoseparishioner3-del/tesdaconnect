import React from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  CloudOff,
  Download,
  FileText,
  Lock,
  Printer,
  Save,
  Send,
  Trash2,
  Upload,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { Mis0301FormPreview } from '@/components/forms/Mis0301FormPreview';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { offlineDb, type LocalDraftRecord } from '@/lib/db/dexie';
import { isSupabaseConfigured } from '@/lib/env';
import { downloadMis0301Pdf, type Mis0301RenderMode } from '@/lib/forms/generateMis0301Pdf';
import {
  calculateAgeFromBirthdate,
  calculateIntakeCompleteness,
  CIVIL_STATUS_OPTIONS,
  createEmptyMis0301Values,
  DISABILITY_CAUSES,
  DISABILITY_TYPES,
  EDUCATIONAL_ATTAINMENT_OPTIONS,
  EMPLOYMENT_STATUS_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
  MIS0301_CLASSIFICATIONS_COL1,
  MIS0301_CLASSIFICATIONS_COL2,
  MIS0301_CLASSIFICATIONS_COL3,
  mis0301Schema,
  type Mis0301Values,
  SEX_OPTIONS,
} from '@/lib/forms/mis0301Schema';
import { getSupabaseClient } from '@/lib/supabase';
import { enqueueMutation, generateStableId } from '@/lib/sync/syncEngine';
import { triggerForegroundSync } from '@/lib/sync/supabaseTransport';
import { asText, formatShortDateTime } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useConnectivityStore } from '@/stores/connectivityStore';
import { EnrollmentWindowBanner } from './EnrollmentWindowBanner';

const STEPS = [
  '1-2. Name & Address',
  '3. Personal & Education',
  '4-6. Classification & PWD',
  '7-10. Program & Consent',
  'MIS 03-01 Form & PDF',
];

interface InstitutionOption {
  id: string;
  code: string;
  name: string;
}

interface CourseOption {
  id: string;
  institution_id: string;
  code: string;
  name: string;
}

interface ExistingLearnerOption {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  uli_number: string | null;
  application_status?: string;
}

function mapSnapshotToMis0301(
  lp: Record<string, unknown> | null,
  app: Record<string, unknown> | null,
  fallbackInstId: string,
  fallbackFullName?: string,
  fallbackEmail?: string,
): Mis0301Values {
  const base = createEmptyMis0301Values(fallbackInstId);
  const nameTokens = (fallbackFullName ?? '').trim().split(/\s+/).filter(Boolean);
  const defaultFirst = nameTokens.length > 0 ? nameTokens[0] : '';
  const defaultLast = nameTokens.length > 1 ? nameTokens[nameTokens.length - 1] : '';

  const courseRel = app?.courses as { name?: string } | Array<{ name?: string }> | undefined;
  const relCourseName = Array.isArray(courseRel) ? courseRel[0]?.name : courseRel?.name;

  return {
    ...base,
    uli_number: asText(lp?.uli_number),
    entry_date: asText(lp?.entry_date, base.entry_date),
    id_picture_url: asText(lp?.id_picture_url, ''),
    last_name: asText(lp?.last_name, defaultLast),
    first_name: asText(lp?.first_name, defaultFirst),
    middle_name: asText(lp?.middle_name),
    extension_name: asText(lp?.extension_name),
    address_line: asText(lp?.address_line),
    barangay: asText(lp?.barangay),
    district: asText(lp?.district),
    city_municipality: asText(lp?.city_municipality),
    province: asText(lp?.province, base.province),
    region: asText(lp?.region, base.region),
    email_or_facebook: asText(lp?.email_or_facebook, fallbackEmail ?? ''),
    contact_number: asText(lp?.contact_number),
    nationality: asText(lp?.nationality, 'Filipino'),
    sex: lp?.sex === 'Female' ? 'Female' : 'Male',
    civil_status: asText(lp?.civil_status, 'Single'),
    employment_status: asText(lp?.employment_status, 'Unemployed'),
    employment_type: asText(lp?.employment_type, 'None'),
    birthdate: asText(lp?.birthdate),
    birthplace_city: asText(lp?.birthplace_city),
    birthplace_province: asText(lp?.birthplace_province),
    birthplace_region: asText(lp?.birthplace_region),
    educational_attainment: asText(lp?.educational_attainment, base.educational_attainment),
    guardian_name: asText(lp?.guardian_name),
    guardian_address: asText(lp?.guardian_address),
    classifications: Array.isArray(lp?.classifications) ? (lp.classifications as string[]) : [],
    classification_other: asText(lp?.classification_other),
    disability_types: Array.isArray(lp?.disability_types) ? (lp.disability_types as string[]) : [],
    disability_other: asText(lp?.disability_other),
    disability_cause: asText(lp?.disability_cause, 'none'),
    institution_id: asText(app?.institution_id, fallbackInstId),
    course_id: asText(app?.course_id),
    course_name: asText(relCourseName, asText(lp?.course_name)),
    scholarship_package: asText(lp?.scholarship_package, asText(app?.scholarship_package)),
    privacy_consent: lp?.privacy_consent === true,
    applicant_signature_name: asText(lp?.applicant_signature_name, fallbackFullName ?? ''),
    date_accomplished: asText(lp?.date_accomplished, base.date_accomplished),
    noted_by_name: asText(lp?.noted_by_name),
    date_received: asText(lp?.date_received),
  };
}

export function RegistrationIntakeWorkspace({ embedded = false }: { embedded?: boolean }) {
  const profile = useAuthStore((s) => s.profile);
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const userId = profile?.id ?? '';
  const isStaff =
    profile?.role === 'registrar' ||
    profile?.role === 'institutional_administrator' ||
    profile?.role === 'system_administrator';
  const defaultInstId = profile?.institutions?.[0]?.institutionId ?? '';

  const [step, setStep] = React.useState(0);
  const [clientDraftId, setClientDraftId] = React.useState<string>(() => generateStableId());
  const [targetLearnerUserId, setTargetLearnerUserId] = React.useState<string>('');
  const [applicationStatus, setApplicationStatus] = React.useState<string>('draft');
  const [previewMode, setPreviewMode] = React.useState<Mis0301RenderMode>('filled');
  const [institutions, setInstitutions] = React.useState<InstitutionOption[]>(
    (profile?.institutions ?? []).map((i) => ({ id: i.institutionId, code: i.code, name: i.name })),
  );
  const [courses, setCourses] = React.useState<CourseOption[]>([]);
  const [existingLearners, setExistingLearners] = React.useState<ExistingLearnerOption[]>([]);
  const [hydratedOnce, setHydratedOnce] = React.useState(false);

  const savedDrafts = useLiveQuery(
    () =>
      userId
        ? offlineDb.localDrafts
            .where('userId')
            .equals(userId)
            .filter((d) => d.draftType === 'trainee_intake')
            .reverse()
            .sortBy('updatedAt')
        : Promise.resolve([] as LocalDraftRecord[]),
    [userId],
    [] as LocalDraftRecord[],
  );

  const form = useForm<Mis0301Values>({
    resolver: zodResolver(mis0301Schema),
    defaultValues: createEmptyMis0301Values(defaultInstId),
  });

  const watchedValues = form.watch();
  const agePreview = React.useMemo(() => calculateAgeFromBirthdate(watchedValues.birthdate), [watchedValues.birthdate]);
  const completeness = React.useMemo(() => calculateIntakeCompleteness(watchedValues), [watchedValues]);

  // Load reference catalog + own profile or staff directory
  React.useEffect(() => {
    if (!userId) return;
    let active = true;

    async function hydrate() {
      const client = getSupabaseClient();

      if (isOnline && isSupabaseConfigured && client) {
        const [instRes, courseRes] = await Promise.all([
          client.from('institutions').select('id, code, name').order('code').returns<InstitutionOption[]>(),
          client
            .from('courses')
            .select('id, institution_id, code, name')
            .is('archived_at', null)
            .order('code')
            .returns<CourseOption[]>(),
        ]);
        if (active && !instRes.error && instRes.data && instRes.data.length > 0) {
          setInstitutions(instRes.data);
          const currentInst = form.getValues('institution_id');
          const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!currentInst || currentInst === 'BST' || !uuidPattern.test(currentInst)) {
            const matched = instRes.data.find((i) => i.code.toUpperCase() === 'BST') ?? instRes.data[0];
            if (matched) {
              form.setValue('institution_id', matched.id, { shouldValidate: true });
            }
          }
        }
        if (active && !courseRes.error && courseRes.data) {
          setCourses(courseRes.data);
        }

        if (isStaff) {
          const { data: learners } = await client
            .from('learner_profiles')
            .select('user_id, first_name, last_name, uli_number')
            .order('updated_at', { ascending: false })
            .limit(80)
            .returns<ExistingLearnerOption[]>();
          if (active && learners) {
            setExistingLearners(learners);
          }
        } else if (!hydratedOnce) {
          const [lpRes, appRes] = await Promise.all([
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
          ]);

          if (active && (lpRes.data || appRes.data)) {
            const appData = appRes.data ?? null;
            if (typeof appData?.client_draft_id === 'string') setClientDraftId(appData.client_draft_id);
            setApplicationStatus(asText(appData?.application_status, 'draft'));
            const mapped = mapSnapshotToMis0301(
              lpRes.data ?? null,
              appData,
              defaultInstId || instRes.data?.[0]?.id || '',
              profile?.fullName,
              profile?.email,
            );
            form.reset(mapped);
            setHydratedOnce(true);
            return;
          }
        }
      }

      // Offline / fallback snapshot from Dexie cache
      if (!hydratedOnce && !isStaff) {
        const cached = await offlineDb.cachedLearnerRecords.get(userId);
        if (active && cached) {
          setApplicationStatus(asText(cached.enrollmentApp?.application_status, 'draft'));
          const mapped = mapSnapshotToMis0301(
            cached.learnerProfile,
            cached.enrollmentApp,
            cached.institutionId ?? defaultInstId,
            profile?.fullName,
            profile?.email,
          );
          form.reset(mapped);
          setHydratedOnce(true);
        } else if (active) {
          const initial = mapSnapshotToMis0301(null, null, defaultInstId, profile?.fullName, profile?.email);
          form.reset(initial);
          setHydratedOnce(true);
        }
      }
    }

    void hydrate();
    return () => {
      active = false;
    };
  }, [userId, isOnline, isStaff, defaultInstId, hydratedOnce, profile?.fullName, profile?.email, form]);

  async function handleSelectLearnerForStaff(selectedUserId: string) {
    setClientDraftId(generateStableId());
    setTargetLearnerUserId(selectedUserId);
    if (!selectedUserId) {
      form.reset(createEmptyMis0301Values(defaultInstId || institutions[0]?.id || ''));
      setApplicationStatus('draft');
      return;
    }

    const client = getSupabaseClient();
    if (!client || !isSupabaseConfigured || !isOnline) return;
    const [lpRes, appRes] = await Promise.all([
      client
        .from('learner_profiles')
        .select('*')
        .eq('user_id', selectedUserId)
        .returns<Record<string, unknown>[]>()
        .maybeSingle(),
      client
        .from('enrollment_applications')
        .select('*, courses(name)')
        .eq('learner_user_id', selectedUserId)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .returns<Record<string, unknown>[]>()
        .maybeSingle(),
    ]);

    const appData = appRes.data ?? null;
    setApplicationStatus(asText(appData?.application_status, 'draft'));
    form.reset(
      mapSnapshotToMis0301(
        lpRes.data ?? null,
        appData,
        defaultInstId || institutions[0]?.id || '',
      ),
    );
    if (typeof appData?.client_draft_id === 'string') setClientDraftId(appData.client_draft_id);
    toast.info('Loaded learner registration inputs into MIS 03-01 editor.');
  }

  function toggleCheckboxArray(field: 'classifications' | 'disability_types', item: string) {
    const current = form.getValues(field);
    const next = current.includes(item) ? current.filter((x) => x !== item) : [...current, item];
    form.setValue(field, next, { shouldValidate: true });
  }

  const photoInputRef = React.useRef<HTMLInputElement | null>(null);

  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Choose a valid image (PNG, JPG, JPEG or WEBP).');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('The image is too large (maximum 5 MB).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (result) {
        form.setValue('id_picture_url', result, { shouldDirty: true, shouldValidate: true });
        toast.success('ID photo attached.');
      }
    };
    reader.onerror = () => {
      toast.error('The selected image could not be read.');
    };
    reader.readAsDataURL(file);
  }

  function handleRemovePhoto() {
    form.setValue('id_picture_url', '', { shouldDirty: true, shouldValidate: true });
    if (photoInputRef.current) {
      photoInputRef.current.value = '';
    }
    toast.info('The attached 2x2 ID picture was removed.');
  }

  async function handleSaveDraftLocally() {
    if (!userId) return;
    const nowIso = new Date().toISOString();
    const values = form.getValues();
    const titleName = `${values.first_name || 'Untitled'} ${values.last_name || 'Registration'}`.trim();

    await offlineDb.localDrafts.put({
      clientDraftId,
      userId,
      draftType: 'trainee_intake',
      title: titleName,
      institutionId: values.institution_id || null,
      payload: { ...values, target_learner_user_id: targetLearnerUserId || null },
      baseVersion: null,
      status: 'editing',
      updatedAt: nowIso,
      createdAt: nowIso,
    });

    if (!isStaff) {
      await offlineDb.cachedLearnerRecords.put({
        userId,
        institutionId: values.institution_id || defaultInstId || null,
        learnerProfile: values,
        enrollmentApp: {
          course_id: values.course_id,
          scholarship_package: values.scholarship_package,
          application_status: applicationStatus || 'draft',
          courses: values.course_name ? { name: values.course_name } : null,
        },
        updatedAt: nowIso,
      });
    }

    toast.success('Draft saved on this device.');
  }

  function handleResumeDraft(draftId: string) {
    const found = savedDrafts.find((d) => d.clientDraftId === draftId);
    if (!found) return;
    setClientDraftId(found.clientDraftId);
    setTargetLearnerUserId(asText(found.payload.target_learner_user_id));
    form.reset({ ...createEmptyMis0301Values(defaultInstId), ...(found.payload as Partial<Mis0301Values>) });
    toast.info(`Resumed local draft "${found.title}".`);
  }

  async function onSubmit(values: Mis0301Values) {
    if (!userId) {
      toast.warning('Sign in with your account first so the registration can be submitted and synced.');
      return;
    }
    if (isStaff && !targetLearnerUserId) {
      toast.warning('Select a learner account before submitting registration.');
      return;
    }
    const nowIso = new Date().toISOString();

    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let resolvedInstId = values.institution_id;
    if (!uuidPattern.test(resolvedInstId)) {
      const matchCandidate =
        institutions.find(
          (i) => i.code.toUpperCase() === (resolvedInstId || 'BST').toUpperCase() || i.id === resolvedInstId,
        ) ??
        institutions[0] ??
        profile?.institutions?.[0];

      if (matchCandidate) {
        const candidateId = 'institutionId' in matchCandidate ? matchCandidate.institutionId : matchCandidate.id;
        if (uuidPattern.test(candidateId)) {
          resolvedInstId = candidateId;
          values.institution_id = resolvedInstId;
          form.setValue('institution_id', resolvedInstId);
        }
      }
    }

    // ULI cannot be encoded via Registration Intake; only Admin/Registrar in Scholar Records after confirmation
    const intakePayload: Record<string, unknown> = { ...values, institution_id: resolvedInstId };
    delete intakePayload.uli_number;
    const fullName = `${values.first_name} ${values.last_name}`.trim();

    await offlineDb.localDrafts.put({
      clientDraftId,
      userId,
      draftType: 'trainee_intake',
      title: fullName,
      institutionId: values.institution_id,
      payload: { ...values, target_learner_user_id: targetLearnerUserId || null },
      baseVersion: null,
      status: 'ready_to_sync',
      updatedAt: nowIso,
      createdAt: nowIso,
    });

    if (!isStaff) {
      await offlineDb.cachedLearnerRecords.put({
        userId,
        institutionId: values.institution_id,
        learnerProfile: values,
        enrollmentApp: {
          institution_id: values.institution_id,
          course_id: values.course_id,
          scholarship_package: values.scholarship_package,
          application_status: 'submitted',
          courses: values.course_name ? { name: values.course_name } : null,
        },
        updatedAt: nowIso,
      });
      setApplicationStatus('submitted');
    }

    const mutation = await enqueueMutation({
      userId,
      entityType: 'trainee_intake',
      entityId: clientDraftId,
      operation: 'submit',
      payload: {
        ...intakePayload,
        target_learner_user_id: targetLearnerUserId || (isStaff ? undefined : userId),
        client_draft_id: clientDraftId,
        record_completeness: completeness.percentage,
        application_status: 'submitted',
      },
      baseVersion: null,
    });

    // Always recheck reachability: the last offline badge may be stale.
    await triggerForegroundSync(userId);
    const queued = await offlineDb.syncOutbox.get(mutation.mutationId);
    if (!queued) {
      toast.success('Registration uploaded successfully.');
    } else if (useConnectivityStore.getState().syncStatus === 'reauth_required') {
      toast.warning('Registration saved on this device. Sign in online from Sync Center to upload.');
    } else if (queued.status === 'failed' || queued.status === 'conflict') {
      toast.warning(queued.lastError ?? 'Registration needs attention. Open Sync Center for details.');
    } else {
      toast.info('Registration saved on this device and waiting to upload.');
    }
  }

  const filteredCourses = React.useMemo(() => {
    if (!watchedValues.institution_id) return courses;
    const subset = courses.filter((c) => c.institution_id === watchedValues.institution_id);
    return subset;
  }, [courses, watchedValues.institution_id]);

  return (
    <div className="space-y-5">
      {!embedded && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {isStaff
                ? 'Registration Intake'
                : 'My Registration'}
            </h1>
            <p className="text-sm text-slate-500">
              {isStaff
                ? 'Create or update learner details, then submit for review.'
                : 'Update your details, review your form, and submit your registration.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={completeness.isReadyForVerification ? 'success' : 'warning'}>
              Completeness: {completeness.percentage}%
            </Badge>
            <Badge variant="outline">Status: {applicationStatus}</Badge>
            {!isOnline && (
              <Badge variant="info">
                <CloudOff className="h-3.5 w-3.5" /> Offline Queue Ready
              </Badge>
            )}
          </div>
        </div>
      )}

      {!isStaff && <EnrollmentWindowBanner institutionId={watchedValues.institution_id || null} courseId={watchedValues.course_id || null} isOnline={isOnline} />}

      {/* Quick MIS 03-01 View / Print / PDF Toolbar */}
      <Card className="border-slate-200 bg-slate-50/80">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3 text-xs text-slate-700">
            <img src="/tesda-logo.png" alt="TESDA Official Logo" className="h-9 w-9 object-contain" />
            <div>
              <p className="font-semibold text-slate-900">
                Official TESDA MIS 03-01 (ver. 2021) Form Output
              </p>
              <p>Generate, view, print, or download PDF with current Registration Inputs OR as a Blank Form for manual pen fill-up.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setPreviewMode('filled');
                setStep(4);
              }}
              className="text-xs"
            >
              <FileText className="h-3.5 w-3.5" /> <span className="sm:hidden">Filled</span><span className="hidden sm:inline">View Filled Form</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setPreviewMode('blank');
                setStep(4);
              }}
              className="text-xs"
            >
              <Printer className="h-3.5 w-3.5" /> <span className="sm:hidden">Blank</span><span className="hidden sm:inline">View Blank (Manual)</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void downloadMis0301Pdf(form.getValues(), 'filled')}
              className="text-xs"
            >
              <Download className="h-3.5 w-3.5" /> <span className="sm:hidden">Filled PDF</span><span className="hidden sm:inline">Download Filled PDF</span>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void downloadMis0301Pdf(form.getValues(), 'blank')}
              className="text-xs"
            >
              <Download className="h-3.5 w-3.5" /> <span className="sm:hidden">Blank PDF</span><span className="hidden sm:inline">Download Blank PDF</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {isStaff && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Registration Target Record (Registrar / Admin Intake)</CardTitle>
            <CardDescription>
              Select the learner account whose registration you want to update.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="target_learner">Learner Account</Label>
              <select
                id="target_learner"
                className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                value={targetLearnerUserId}
                onChange={(e) => void handleSelectLearnerForStaff(e.target.value)}
              >
                <option value="">-- Select a learner --</option>
                {existingLearners.map((l) => (
                  <option key={l.user_id} value={l.user_id}>
                    {[l.last_name, l.first_name].filter(Boolean).join(', ') || l.user_id.slice(0, 8)}
                    {l.uli_number ? ` (ULI: ${l.uli_number})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <div className="w-full rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                <span className="flex items-center gap-1.5 font-semibold">
                  <Lock className="h-3.5 w-3.5" /> ULI Assignment Policy
                </span>
                ULI from TESDA Main is locked here and encoded inside <strong>Trainee Records</strong> only after enrollment status becomes <strong>Confirmed</strong>.
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {savedDrafts.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Saved Offline Drafts ({savedDrafts.length})</CardTitle>
            <CardDescription>Stored safely in IndexedDB on this device for offline editing and sync.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {savedDrafts.map((d) => (
              <Button
                key={d.clientDraftId}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => handleResumeDraft(d.clientDraftId)}
              >
                {d.title} ({formatShortDateTime(d.updatedAt)})
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      {completeness.missingFields.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div>
            <p className="font-semibold">Fields needed for 100% Registrar Verification:</p>
            <p className="mt-0.5">{completeness.missingFields.join(' · ')}</p>
          </div>
        </div>
      )}

      {/* Step tabs */}
      <div className="flex snap-x overflow-x-auto gap-1.5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {STEPS.map((label, idx) => {
          const mobileLabels = ['1. Profile', '2. Address', '3. Demographics', '4. Course', '5. Preview'];
          return (
            <Button
              key={label}
              type="button"
              size="sm"
              variant={step === idx ? 'secondary' : 'outline'}
              onClick={() => setStep(idx)}
              className="shrink-0 snap-start text-xs whitespace-nowrap"
            >
              <span className="sm:hidden">{mobileLabels[idx]}</span>
              <span className="hidden sm:inline">{label}</span>
            </Button>
          );
        })}
      </div>

      {step === 4 ? (
        <Mis0301FormPreview
          values={watchedValues}
          mode={previewMode}
          onModeChange={setPreviewMode}
        />
      ) : (
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
          <Card>
            <CardContent className="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
              {step === 0 && (
                <>
                  {/* 2x2 ID Picture Attachment */}
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/70 p-4 sm:col-span-2 lg:col-span-3">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                      <div className="relative flex h-36 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-slate-300 bg-white shadow-inner">
                        {watchedValues.id_picture_url ? (
                          <img
                            src={watchedValues.id_picture_url}
                            alt="2x2 ID Preview"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center p-2 text-center text-slate-400">
                            <Camera className="h-8 w-8 stroke-1 text-slate-400" />
                            <span className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-500">2x2 ID Photo</span>
                            <span className="text-[10px] text-slate-400">White Background</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <Label className="text-sm font-bold text-slate-900">
                            Attach Official 2x2 ID Picture
                          </Label>
                          <Badge variant="outline" className="text-[11px] font-normal text-slate-600">
                            MIS 03-01 Compliant
                          </Badge>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          Attach a clear 2x2 ID picture with a white background, wearing a collared shirt, taken within the last 6 months. It appears automatically in the Form Preview and the official TESDA PDF.
                        </p>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <input
                            ref={photoInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/jpg"
                            className="hidden"
                            onChange={handlePhotoUpload}
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={() => photoInputRef.current?.click()}
                          >
                            <Upload className="h-3.5 w-3.5" />
                            {watchedValues.id_picture_url ? 'Replace 2x2 Picture' : 'Upload 2x2 Picture'}
                          </Button>
                          {watchedValues.id_picture_url && (
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              className="gap-1.5"
                              onClick={handleRemovePhoto}
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Remove Picture
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 1. T2MIS */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="uli_locked" className="flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5 text-amber-600" />
                      1.1 Unique Learner Identifier (ULI) Number (TESDA Main Post-Confirmation Only)
                    </Label>
                    <Input
                      id="uli_locked"
                      readOnly
                      value={watchedValues.uli_number || 'Locked — Encoded by Admin/Registrar only after Enrollment Confirmation'}
                      className="bg-slate-100 text-slate-600"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="entry_date">1.2 Entry Date</Label>
                    <Input id="entry_date" type="date" {...form.register('entry_date')} />
                  </div>

                  {/* 2.1 Name */}
                  <div className="space-y-1.5">
                    <Label htmlFor="last_name">2.1 Last Name</Label>
                    <Input id="last_name" {...form.register('last_name')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="first_name">First Name</Label>
                    <Input id="first_name" {...form.register('first_name')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="middle_name">Middle Name</Label>
                    <Input id="middle_name" {...form.register('middle_name')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="extension_name">Extension Name (Jr., Sr., III)</Label>
                    <Input id="extension_name" {...form.register('extension_name')} />
                  </div>

                  {/* 2.2 Address */}
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="address_line">2.2 Number, Street (Permanent Mailing Address)</Label>
                    <Input id="address_line" {...form.register('address_line')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="barangay">Barangay</Label>
                    <Input id="barangay" {...form.register('barangay')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="district">District</Label>
                    <Input id="district" placeholder="e.g., Lone" {...form.register('district')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="city_municipality">City / Municipality</Label>
                    <Input id="city_municipality" {...form.register('city_municipality')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="province">Province</Label>
                    <Input id="province" {...form.register('province')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="region">Region</Label>
                    <Input id="region" placeholder="e.g., IV-B" {...form.register('region')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email_or_facebook">Email Address / Facebook Account</Label>
                    <Input id="email_or_facebook" {...form.register('email_or_facebook')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="contact_number">Contact No.</Label>
                    <Input id="contact_number" placeholder="09XX-XXX-XXXX" {...form.register('contact_number')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="nationality">Nationality</Label>
                    <Input id="nationality" {...form.register('nationality')} />
                  </div>
                </>
              )}

              {step === 1 && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="sex">3.1 Sex</Label>
                    <select
                      id="sex"
                      className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                      {...form.register('sex')}
                    >
                      {SEX_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="civil_status">3.2 Civil Status</Label>
                    <select
                      id="civil_status"
                      className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                      {...form.register('civil_status')}
                    >
                      {CIVIL_STATUS_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="employment_status">3.3 Employment Status (before training)</Label>
                    <select
                      id="employment_status"
                      className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                      {...form.register('employment_status')}
                    >
                      {EMPLOYMENT_STATUS_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="employment_type">Employment Type (if Wage-Employed / Underemployed)</Label>
                    <select
                      id="employment_type"
                      className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                      {...form.register('employment_type')}
                    >
                      {EMPLOYMENT_TYPE_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="birthdate">3.4 Birthdate</Label>
                    <Input id="birthdate" type="date" {...form.register('birthdate')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="computed_age">Computed Age</Label>
                    <Input id="computed_age" readOnly value={agePreview || 'Auto-computed'} className="bg-slate-100" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="birthplace_city">3.5 Birthplace City / Municipality</Label>
                    <Input id="birthplace_city" {...form.register('birthplace_city')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="birthplace_province">Birthplace Province</Label>
                    <Input id="birthplace_province" {...form.register('birthplace_province')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="birthplace_region">Birthplace Region</Label>
                    <Input id="birthplace_region" {...form.register('birthplace_region')} />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                    <Label htmlFor="educational_attainment">3.6 Educational Attainment Before the Training</Label>
                    <select
                      id="educational_attainment"
                      className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                      {...form.register('educational_attainment')}
                    >
                      {EDUCATIONAL_ATTAINMENT_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="guardian_name">3.7 Parent / Guardian Name</Label>
                    <Input id="guardian_name" {...form.register('guardian_name')} />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="guardian_address">Parent / Guardian Complete Permanent Mailing Address</Label>
                    <Input id="guardian_address" {...form.register('guardian_address')} />
                  </div>
                </>
              )}

              {step === 2 && (
                <div className="space-y-5 sm:col-span-2 lg:col-span-3">
                  <div className="space-y-2">
                    <Label>4. Learner / Trainee / Student (Clients) Classification</Label>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {[...MIS0301_CLASSIFICATIONS_COL1, ...MIS0301_CLASSIFICATIONS_COL2, ...MIS0301_CLASSIFICATIONS_COL3].map(
                        (opt) => {
                          const checked = watchedValues.classifications.includes(opt);
                          return (
                            <label
                              key={opt}
                              className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 p-2 text-xs hover:bg-slate-50"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleCheckboxArray('classifications', opt)}
                              />
                              <span>{opt}</span>
                            </label>
                          );
                        },
                      )}
                    </div>
                    {watchedValues.classifications.includes('Others') && (
                      <div className="mt-2 max-w-md space-y-1">
                        <Label htmlFor="classification_other">Others (Please Specify)</Label>
                        <Input id="classification_other" {...form.register('classification_other')} />
                      </div>
                    )}
                    {form.formState.errors.classifications && (
                      <p className="text-xs text-red-600">{form.formState.errors.classifications.message}</p>
                    )}
                  </div>

                  <div className="space-y-2 border-t border-slate-200 pt-4">
                    <Label>5. Type of Disability (For Persons with Disability Only)</Label>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {DISABILITY_TYPES.map((opt) => {
                        const checked = watchedValues.disability_types.includes(opt);
                        return (
                          <label
                            key={opt}
                            className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 p-2 text-xs hover:bg-slate-50"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleCheckboxArray('disability_types', opt)}
                            />
                            <span>{opt}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="max-w-sm space-y-1.5">
                    <Label htmlFor="disability_cause">6. Causes of Disability (if applicable)</Label>
                    <select
                      id="disability_cause"
                      className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                      {...form.register('disability_cause')}
                    >
                      <option value="none">Not Applicable (No Disability)</option>
                      {DISABILITY_CAUSES.map((cause) => (
                        <option key={cause} value={cause}>
                          {cause}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {step === 3 && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="institution_id">Campus / TESDA Institution</Label>
                    {institutions.length > 0 ? (
                      <select
                        id="institution_id"
                        className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                        {...form.register('institution_id')}
                      >
                        <option value="">-- Select campus --</option>
                        {institutions.map((inst) => (
                          <option key={inst.id} value={inst.id}>
                            {inst.code} — {inst.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input id="institution_id" placeholder="BST or MIF institution ID" {...form.register('institution_id')} />
                    )}
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="course_id">7. Name of Course / Qualification</Label>
                    {filteredCourses.length > 0 ? (
                      <select
                        id="course_id"
                        className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                        value={watchedValues.course_id}
                        onChange={(e) => {
                          const selectedId = e.target.value;
                          const matched = filteredCourses.find((c) => c.id === selectedId);
                          form.setValue('course_id', selectedId, { shouldValidate: true });
                          if (matched) {
                            form.setValue('course_name', `${matched.name} (${matched.code})`);
                          }
                        }}
                      >
                        <option value="">-- Select qualification / course --</option>
                        {filteredCourses.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.code} — {c.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Input
                        id="course_id"
                        placeholder="Course / Qualification code or UUID"
                        {...form.register('course_id')}
                      />
                    )}
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="scholarship_package">8. Scholarship Package (TWSP, PESFA, STEP, others)</Label>
                    <Input
                      id="scholarship_package"
                      placeholder="e.g., STEP, TWSP, PESFA, or Walk-in"
                      {...form.register('scholarship_package')}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="date_accomplished">10. Date Accomplished</Label>
                    <Input id="date_accomplished" type="date" {...form.register('date_accomplished')} />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="applicant_signature_name">Applicant&apos;s Signature Over Printed Name</Label>
                    <Input
                      id="applicant_signature_name"
                      placeholder="Type full printed name"
                      {...form.register('applicant_signature_name')}
                    />
                  </div>

                  <div className="space-y-2 sm:col-span-2 lg:col-span-3">
                    <div className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-950">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                      <div className="space-y-1.5">
                        <p className="font-semibold">9. Privacy Consent and Disclaimer (RA 10173)</p>
                        <p>
                          I hereby attest that I have read and understood the Privacy Notice of TESDA through its website and thereby give my consent in the processing of my personal information indicated in this Learners Profile for scholarships, enrollment confirmation, and TESDA programs.
                        </p>
                        <label className="inline-flex cursor-pointer items-center gap-2 font-semibold">
                          <input type="checkbox" {...form.register('privacy_consent')} />
                          <span>Agree &amp; Certify Information Is True and Correct</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Show validation errors summary cleanly if user clicks submit with missing required fields */}
          {Object.keys(form.formState.errors).length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900">
              <p className="font-semibold">Please complete required fields before submitting:</p>
              <ul className="mt-1 list-disc pl-5">
                {Object.entries(form.formState.errors).map(([key, err]) => (
                  <li key={key}>
                    <strong>{key}:</strong> {String(err?.message ?? 'Invalid value')}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
                Previous
              </Button>
              {step < 3 ? (
                <Button type="button" variant="default" size="sm" onClick={() => setStep((s) => s + 1)}>
                  Next Section
                </Button>
              ) : (
                <Button type="button" variant="outline" size="sm" onClick={() => setStep(4)}>
                  Preview Full MIS 03-01 Form
                </Button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => void handleSaveDraftLocally()}>
                <Save className="h-4 w-4" /> Save Draft
              </Button>
              <Button type="submit" variant="secondary" size="sm" disabled={form.formState.isSubmitting}>
                <Send className="h-4 w-4" /> {form.formState.isSubmitting ? 'Saving...' : isOnline ? 'Submit Registration' : 'Save & Queue Upload'}
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
