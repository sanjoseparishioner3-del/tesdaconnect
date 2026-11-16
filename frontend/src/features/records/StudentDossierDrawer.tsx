import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  FileText,
  IdCard,
  Lock,
  Save,
  Upload,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Mis0301FormPreview } from '@/components/forms/Mis0301FormPreview';
import { MinimizableModal } from '@/components/ui/minimizable-modal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DigitalSystemIdCard } from '@/features/learner/DigitalSystemIdCard';
import { getDocumentLabel, normalizeDocumentTypeKey, TESDA_REQUIRED_DOCUMENTS } from '@/lib/documents/requiredDocuments';
import type { Mis0301RenderMode } from '@/lib/forms/generateMis0301Pdf';
import {
  CIVIL_STATUS_OPTIONS,
  EDUCATIONAL_ATTAINMENT_OPTIONS,
  EMPLOYMENT_STATUS_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
  type Mis0301Values,
  SEX_OPTIONS,
} from '@/lib/forms/mis0301Schema';
import { offlineDb, safeDexieWrite } from '@/lib/db/dexie';
import { isSupabaseConfigured } from '@/lib/env';
import { getSupabaseClient } from '@/lib/supabase';
import { enqueueMutation } from '@/lib/sync/syncEngine';
import { asText, formatShortDateTime } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useConnectivityStore } from '@/stores/connectivityStore';

export interface FullTraineeRecordRow {
  id: string;
  reference_no: string;
  learner_user_id: string;
  institution_id: string;
  course_id: string | null;
  learner_name: string;
  email?: string | null;
  scholarship_package?: string | null;
  application_status: string;
  record_completeness: number;
  scholar_id: string | null;
  forwarding_id: string | null;
  archived_at: string | null;
  courses?: { name?: string; code?: string } | Array<{ name?: string; code?: string }> | null;
  institutions?: { name?: string; code?: string } | Array<{ name?: string; code?: string }> | null;
  learner_profiles?: Record<string, unknown> | null;
}

interface DbDocRow {
  id: string;
  user_id: string;
  document_type: string;
  original_name: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  status: string;
  remarks: string | null;
  created_at: string;
}

interface StudentDossierDrawerProps {
  record: FullTraineeRecordRow;
  canEdit: boolean;
  onClose: () => void;
  onUpdated: () => Promise<void> | void;
}

export function StudentDossierDrawer({ record, canEdit, onClose, onUpdated }: StudentDossierDrawerProps) {
  const profile = useAuthStore((s) => s.profile);
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const queryClient = useQueryClient();
  const [dossierTab, setDossierTab] = React.useState<'profile' | 'documents' | 'mis0301' | 'system-id'>('profile');
  const [formMode, setFormMode] = React.useState<Mis0301RenderMode>('filled');
  const [previewDoc, setPreviewDoc] = React.useState<{ url: string; name: string; mime: string } | null>(null);
  const [photoSignedUrl, setPhotoSignedUrl] = React.useState<string | null>(null);
  const [auditReason, setAuditReason] = React.useState('');

  const lp = record.learner_profiles ?? {};
  const relCourse = Array.isArray(record.courses) ? record.courses[0] : record.courses;
  const relInst = Array.isArray(record.institutions) ? record.institutions[0] : record.institutions;

  const [editState, setEditState] = React.useState(() => ({
    uli_number: asText(lp.uli_number),
    first_name: asText(lp.first_name),
    last_name: asText(lp.last_name),
    middle_name: asText(lp.middle_name),
    extension_name: asText(lp.extension_name),
    entry_date: asText(lp.entry_date, new Date().toISOString().slice(0, 10)),
    contact_number: asText(lp.contact_number),
    email_or_facebook: asText(lp.email_or_facebook, record.email ?? ''),
    address_line: asText(lp.address_line),
    barangay: asText(lp.barangay),
    district: asText(lp.district),
    city_municipality: asText(lp.city_municipality),
    province: asText(lp.province),
    region: asText(lp.region),
    nationality: asText(lp.nationality, 'Filipino'),
    sex: asText(lp.sex, 'Male'),
    civil_status: asText(lp.civil_status, 'Single'),
    employment_status: asText(lp.employment_status, 'Unemployed'),
    employment_type: asText(lp.employment_type, 'None'),
    birthdate: asText(lp.birthdate),
    birthplace_city: asText(lp.birthplace_city),
    birthplace_province: asText(lp.birthplace_province),
    birthplace_region: asText(lp.birthplace_region),
    educational_attainment: asText(lp.educational_attainment, 'Senior High (K-12)'),
    guardian_name: asText(lp.guardian_name),
    guardian_address: asText(lp.guardian_address),
    scholarship_package: asText(lp.scholarship_package, record.scholarship_package ?? ''),
    noted_by_name: asText(lp.noted_by_name, profile?.fullName ?? ''),
    date_received: asText(lp.date_received, new Date().toISOString().slice(0, 10)),
  }));

  React.useEffect(() => {
    const nextLp = record.learner_profiles ?? {};
    setEditState({
      uli_number: asText(nextLp.uli_number),
      first_name: asText(nextLp.first_name),
      last_name: asText(nextLp.last_name),
      middle_name: asText(nextLp.middle_name),
      extension_name: asText(nextLp.extension_name),
      entry_date: asText(nextLp.entry_date, new Date().toISOString().slice(0, 10)),
      contact_number: asText(nextLp.contact_number),
      email_or_facebook: asText(nextLp.email_or_facebook, record.email ?? ''),
      address_line: asText(nextLp.address_line),
      barangay: asText(nextLp.barangay),
      district: asText(nextLp.district),
      city_municipality: asText(nextLp.city_municipality),
      province: asText(nextLp.province),
      region: asText(nextLp.region),
      nationality: asText(nextLp.nationality, 'Filipino'),
      sex: asText(nextLp.sex, 'Male'),
      civil_status: asText(nextLp.civil_status, 'Single'),
      employment_status: asText(nextLp.employment_status, 'Unemployed'),
      employment_type: asText(nextLp.employment_type, 'None'),
      birthdate: asText(nextLp.birthdate),
      birthplace_city: asText(nextLp.birthplace_city),
      birthplace_province: asText(nextLp.birthplace_province),
      birthplace_region: asText(nextLp.birthplace_region),
      educational_attainment: asText(nextLp.educational_attainment, 'Senior High (K-12)'),
      guardian_name: asText(nextLp.guardian_name),
      guardian_address: asText(nextLp.guardian_address),
      scholarship_package: asText(nextLp.scholarship_package, record.scholarship_package ?? ''),
      noted_by_name: asText(nextLp.noted_by_name, profile?.fullName ?? ''),
      date_received: asText(nextLp.date_received, new Date().toISOString().slice(0, 10)),
    });
    setAuditReason('');
  }, [record, profile?.fullName]);

  const docsQuery = useQuery<DbDocRow[]>({
    queryKey: ['student-dossier-docs', record.learner_user_id, isOnline],
    enabled: Boolean(record.learner_user_id),
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!isSupabaseConfigured || !isOnline || !client) {
        const cached = await offlineDb.cachedDocuments
          .where('targetUserId')
          .equals(record.learner_user_id)
          .toArray();
        return cached.map((d) => ({
          id: d.id,
          user_id: d.targetUserId,
          document_type: d.documentType,
          original_name: d.originalName,
          storage_path: d.storagePath ?? '',
          mime_type: d.mimeType,
          size_bytes: d.sizeBytes,
          status: d.queuedUpload ? 'queued_offline' : d.status,
          remarks: d.remarks,
          created_at: d.syncedAt,
        }));
      }
      const { data, error } = await client
        .from('learner_documents')
        .select('id, user_id, document_type, original_name, storage_path, mime_type, size_bytes, status, remarks, created_at')
        .eq('user_id', record.learner_user_id)
        .order('created_at', { ascending: false })
        .returns<DbDocRow[]>();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  // Resolve ID picture thumbnail cleanly if available
  React.useEffect(() => {
    let mounted = true;
    async function loadIdPhoto() {
      const client = getSupabaseClient();
      const idPic = (docsQuery.data ?? []).find((d) => normalizeDocumentTypeKey(d.document_type) === 'id_pictures');
      if (!client || !idPic) {
        if (mounted) setPhotoSignedUrl(null);
        return;
      }
      const { data } = await client.storage.from('learner-documents').createSignedUrl(idPic.storage_path, 600);
      if (mounted) setPhotoSignedUrl(data?.signedUrl ?? null);
    }
    void loadIdPhoto();
    return () => {
      mounted = false;
    };
  }, [docsQuery.data]);

  const isConfirmed = record.application_status === 'confirmed';

  const saveRecordMutation = useMutation({
    mutationFn: async () => {
      const client = getSupabaseClient();
      if (!client || !profile) throw new Error('Authenticated Registrar or Admin session required.');
      if (auditReason.trim().length < 5) {
        throw new Error('Provide an audit reason (at least 5 characters) before saving edits to this student record.');
      }
      if (!isConfirmed && editState.uli_number.trim() !== asText(lp.uli_number).trim()) {
        throw new Error('TESDA Main ULI cannot be encoded until this student enrollment status is CONFIRMED.');
      }

      const fullName = [editState.first_name, editState.middle_name, editState.last_name, editState.extension_name]
        .filter((p) => p.trim().length > 0)
        .join(' ');

      const profilePayload: Record<string, unknown> = {
        first_name: editState.first_name.trim(),
        last_name: editState.last_name.trim(),
        middle_name: editState.middle_name.trim() || null,
        extension_name: editState.extension_name.trim() || null,
        entry_date: editState.entry_date || null,
        contact_number: editState.contact_number.trim() || null,
        email_or_facebook: editState.email_or_facebook.trim() || null,
        address_line: editState.address_line.trim() || null,
        barangay: editState.barangay.trim() || null,
        district: editState.district.trim() || null,
        city_municipality: editState.city_municipality.trim() || null,
        province: editState.province.trim() || null,
        region: editState.region.trim() || null,
        nationality: editState.nationality.trim() || 'Filipino',
        sex: editState.sex,
        civil_status: editState.civil_status,
        employment_status: editState.employment_status,
        employment_type: editState.employment_type,
        birthdate: editState.birthdate || null,
        birthplace_city: editState.birthplace_city.trim() || null,
        birthplace_province: editState.birthplace_province.trim() || null,
        birthplace_region: editState.birthplace_region.trim() || null,
        educational_attainment: editState.educational_attainment.trim() || null,
        guardian_name: editState.guardian_name.trim() || null,
        guardian_address: editState.guardian_address.trim() || null,
        scholarship_package: editState.scholarship_package.trim() || null,
        noted_by_name: editState.noted_by_name.trim() || profile.fullName,
        date_received: editState.date_received || new Date().toISOString().slice(0, 10),
      };

      if (isConfirmed) {
        profilePayload.uli_number = editState.uli_number.trim() || null;
        if (editState.uli_number.trim()) {
          profilePayload.uli_assigned_at = new Date().toISOString();
          profilePayload.uli_assigned_by_user_id = profile.id;
        }
      }

      if (!isOnline || !client || !isSupabaseConfigured) {
        await enqueueMutation({
          userId: profile.id,
          entityType: 'trainee_profile',
          entityId: record.learner_user_id,
          operation: 'upsert',
          baseVersion: typeof lp.version === 'number' ? lp.version : null,
          payload: profilePayload,
        });

        await safeDexieWrite(async () => {
          const key = `${profile.id}:${record.id}`;
          const existing = await offlineDb.cachedTraineeDirectory.get(key);
          if (existing) {
            await offlineDb.cachedTraineeDirectory.update(key, {
              learnerName: fullName || existing.learnerName,
              scholarshipPackage: editState.scholarship_package.trim() || null,
              learnerProfileJson: { ...(existing.learnerProfileJson ?? {}), ...profilePayload },
              updatedAt: new Date().toISOString(),
            });
          }
        });
        return;
      }

      const { error: lpErr } = await client
        .from('learner_profiles')
        .update(profilePayload)
        .eq('user_id', record.learner_user_id);
      if (lpErr) throw new Error(lpErr.message);

      const { error: appErr } = await client
        .from('enrollment_applications')
        .update({
          learner_name: fullName || record.learner_name,
        })
        .eq('id', record.id);
      if (appErr) throw new Error(appErr.message);

      await client.from('security_audit_logs').insert({
        actor_user_id: profile.id,
        institution_id: record.institution_id,
        event: 'trainee_record_edited',
        description: `Edited trainee record ${record.reference_no}: ${auditReason.trim()}`,
        metadata: {
          reference_no: record.reference_no,
          learner_user_id: record.learner_user_id,
          uli_number: isConfirmed ? editState.uli_number.trim() || null : null,
          reason: auditReason.trim(),
        },
      });
    },
    onSuccess: async () => {
      toast.success(
        isOnline
          ? 'Student record updated and audit entry saved.'
          : 'Edits saved offline and queued for Pending Sync upon reconnect.',
      );
      setAuditReason('');
      await onUpdated();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  async function handleStaffUploadDoc(docKey: string, file: File) {
    const client = getSupabaseClient();
    if (!client || !profile) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File exceeds the 10 MB limit.');
      return;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${record.institution_id}/${record.learner_user_id}/${Date.now()}_${safeName}`;
    const { error: upErr } = await client.storage.from('learner-documents').upload(storagePath, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });
    if (upErr) {
      toast.error(upErr.message);
      return;
    }

    const { error: dbErr } = await client.from('learner_documents').insert({
      user_id: record.learner_user_id,
      document_type: docKey,
      original_name: file.name,
      storage_path: storagePath,
      mime_type: file.type || 'application/octet-stream',
      size_bytes: file.size,
      status: 'verified',
      reviewed_by_user_id: profile.id,
      reviewed_at: new Date().toISOString(),
    });
    if (dbErr) {
      toast.error(dbErr.message);
      return;
    }

    toast.success(`Uploaded and verified "${file.name}".`);
    await queryClient.invalidateQueries({ queryKey: ['student-dossier-docs', record.learner_user_id] });
  }

  async function handlePreviewOrDownloadDoc(doc: DbDocRow, action: 'preview' | 'download') {
    const client = getSupabaseClient();
    if (!client) return;
    const { data, error } = await client.storage.from('learner-documents').createSignedUrl(doc.storage_path, 600);
    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? 'Unable to generate secure file link.');
      return;
    }
    if (action === 'preview') {
      setPreviewDoc({ url: data.signedUrl, name: doc.original_name, mime: doc.mime_type });
      return;
    }
    const res = await fetch(data.signedUrl);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.original_name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function handleReviewDocument(doc: DbDocRow, status: 'verified' | 'rejected') {
    const client = getSupabaseClient();
    if (!client || !profile) return;
    const remarks =
      status === 'rejected'
        ? window.prompt(`Enter correction remarks for ${doc.original_name}:`, doc.remarks ?? 'Blurry or incomplete copy')
        : null;
    if (status === 'rejected' && (!remarks || remarks.trim().length < 3)) return;

    const { error } = await client
      .from('learner_documents')
      .update({
        status,
        remarks: remarks ? remarks.trim() : null,
        reviewed_by_user_id: profile.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', doc.id);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Document marked as ${status}.`);
    await queryClient.invalidateQueries({ queryKey: ['student-dossier-docs', record.learner_user_id] });
  }

  const mis0301Values: Partial<Mis0301Values> = {
    id_picture_url: photoSignedUrl ?? '',
    uli_number: editState.uli_number,
    entry_date: editState.entry_date,
    last_name: editState.last_name,
    first_name: editState.first_name,
    middle_name: editState.middle_name,
    extension_name: editState.extension_name,
    address_line: editState.address_line,
    barangay: editState.barangay,
    district: editState.district,
    city_municipality: editState.city_municipality,
    province: editState.province,
    region: editState.region,
    email_or_facebook: editState.email_or_facebook,
    contact_number: editState.contact_number,
    nationality: editState.nationality,
    sex: editState.sex === 'Female' ? 'Female' : 'Male',
    civil_status: editState.civil_status,
    employment_status: editState.employment_status,
    employment_type: editState.employment_type,
    birthdate: editState.birthdate,
    birthplace_city: editState.birthplace_city,
    birthplace_province: editState.birthplace_province,
    birthplace_region: editState.birthplace_region,
    educational_attainment: editState.educational_attainment,
    guardian_name: editState.guardian_name,
    guardian_address: editState.guardian_address,
    classifications: Array.isArray(lp.classifications) ? (lp.classifications as string[]) : [],
    classification_other: asText(lp.classification_other),
    disability_types: Array.isArray(lp.disability_types) ? (lp.disability_types as string[]) : [],
    disability_other: asText(lp.disability_other),
    disability_cause: asText(lp.disability_cause, 'none'),
    course_name: relCourse?.name ? `${relCourse.name} (${relCourse.code ?? ''})` : '',
    scholarship_package: editState.scholarship_package,
    privacy_consent: true,
    applicant_signature_name: asText(lp.applicant_signature_name, record.learner_name),
    date_accomplished: asText(lp.date_accomplished, editState.entry_date),
    noted_by_name: editState.noted_by_name,
    date_received: editState.date_received,
  };

  const docs = docsQuery.data ?? [];

  return (
    <>
      <MinimizableModal
        isOpen={true}
        onClose={onClose}
        title={`Student Record Dossier — ${record.learner_name}`}
        subtitle={
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-semibold text-slate-800">{record.reference_no}</span>
            <Badge variant={isConfirmed ? 'success' : 'warning'}>{record.application_status}</Badge>
            <span>Scholar ID: {record.scholar_id ?? 'Pending confirmation'}</span>
            <span>· ULI: {editState.uli_number || 'Pending TESDA Main'}</span>
          </div>
        }
        minimizedLabel={`Dossier: ${record.learner_name}`}
        icon={<IdCard className="h-4 w-4" />}
        className="max-w-6xl"
        bodyClassName="p-0"
      >
        <div className="flex flex-col h-full">
          {/* Dossier Tabs Header */}
          <div className="flex flex-wrap gap-2 border-b border-slate-200 bg-slate-50/80 px-6 py-3">
            <Button
              type="button"
              size="sm"
              variant={dossierTab === 'profile' ? 'secondary' : 'outline'}
              onClick={() => setDossierTab('profile')}
            >
              View / Edit Record &amp; ULI
            </Button>
            <Button
              type="button"
              size="sm"
              variant={dossierTab === 'documents' ? 'secondary' : 'outline'}
              onClick={() => setDossierTab('documents')}
            >
              Important Documents ({docs.length} uploaded)
            </Button>
            <Button
              type="button"
              size="sm"
              variant={dossierTab === 'mis0301' ? 'secondary' : 'outline'}
              onClick={() => setDossierTab('mis0301')}
            >
              <FileText className="h-3.5 w-3.5" /> MIS 03-01 Form &amp; PDF
            </Button>
            <Button
              type="button"
              size="sm"
              variant={dossierTab === 'system-id' ? 'secondary' : 'outline'}
              onClick={() => setDossierTab('system-id')}
            >
              <IdCard className="h-3.5 w-3.5" /> Digital System ID
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-5 p-6">
        {dossierTab === 'profile' && (
          <div className="space-y-5">
            {/* Post-Confirmation ULI Assignment Box */}
            <div className={`rounded-xl border p-4 ${isConfirmed ? 'border-teal-300 bg-teal-50/50' : 'border-amber-200 bg-amber-50/60'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label htmlFor="dossier_uli" className="flex items-center gap-1.5 font-semibold text-slate-900">
                  {!isConfirmed && <Lock className="h-4 w-4 text-amber-700" />}
                  1.1 TESDA Main Unique Learner Identifier (ULI)
                </Label>
                <Badge variant={isConfirmed ? 'success' : 'warning'}>
                  {isConfirmed ? 'Confirmed — ULI Encoding Unlocked' : 'Locked Until Confirmed'}
                </Badge>
              </div>
              <Input
                id="dossier_uli"
                className="mt-2 font-mono"
                disabled={!canEdit || !isConfirmed}
                value={editState.uli_number}
                onChange={(e) => setEditState((s) => ({ ...s, uli_number: e.target.value }))}
                placeholder={
                  isConfirmed
                    ? 'Enter official ULI from TESDA Main (e.g., 0487713087-001)'
                    : 'Locked: Confirm enrollment before encoding ULI from TESDA Main'
                }
              />
            </div>

            {/* Editable MIS 03-01 Profile Grid */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <Label htmlFor="d_first">First Name</Label>
                <Input id="d_first" disabled={!canEdit} value={editState.first_name} onChange={(e) => setEditState((s) => ({ ...s, first_name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="d_last">Last Name</Label>
                <Input id="d_last" disabled={!canEdit} value={editState.last_name} onChange={(e) => setEditState((s) => ({ ...s, last_name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="d_middle">Middle Name</Label>
                <Input id="d_middle" disabled={!canEdit} value={editState.middle_name} onChange={(e) => setEditState((s) => ({ ...s, middle_name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="d_ext">Extension</Label>
                <Input id="d_ext" disabled={!canEdit} value={editState.extension_name} onChange={(e) => setEditState((s) => ({ ...s, extension_name: e.target.value }))} />
              </div>

              <div className="space-y-1">
                <Label htmlFor="d_contact">Contact No.</Label>
                <Input id="d_contact" disabled={!canEdit} value={editState.contact_number} onChange={(e) => setEditState((s) => ({ ...s, contact_number: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="d_email">Email / Facebook</Label>
                <Input id="d_email" disabled={!canEdit} value={editState.email_or_facebook} onChange={(e) => setEditState((s) => ({ ...s, email_or_facebook: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="d_bdate">Birthdate</Label>
                <Input id="d_bdate" type="date" disabled={!canEdit} value={editState.birthdate} onChange={(e) => setEditState((s) => ({ ...s, birthdate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="d_sex">Sex</Label>
                <select id="d_sex" disabled={!canEdit} className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" value={editState.sex} onChange={(e) => setEditState((s) => ({ ...s, sex: e.target.value }))}>
                  {SEX_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="d_civil">Civil Status</Label>
                <select id="d_civil" disabled={!canEdit} className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" value={editState.civil_status} onChange={(e) => setEditState((s) => ({ ...s, civil_status: e.target.value }))}>
                  {CIVIL_STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="d_emp">Employment Status</Label>
                <select id="d_emp" disabled={!canEdit} className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" value={editState.employment_status} onChange={(e) => setEditState((s) => ({ ...s, employment_status: e.target.value }))}>
                  {EMPLOYMENT_STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="d_emptype">Employment Type</Label>
                <select id="d_emptype" disabled={!canEdit} className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" value={editState.employment_type} onChange={(e) => setEditState((s) => ({ ...s, employment_type: e.target.value }))}>
                  {EMPLOYMENT_TYPE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="d_sch">Scholarship Package</Label>
                <Input id="d_sch" disabled={!canEdit} value={editState.scholarship_package} onChange={(e) => setEditState((s) => ({ ...s, scholarship_package: e.target.value }))} />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="d_addr">Street Address</Label>
                <Input id="d_addr" disabled={!canEdit} value={editState.address_line} onChange={(e) => setEditState((s) => ({ ...s, address_line: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="d_brgy">Barangay</Label>
                <Input id="d_brgy" disabled={!canEdit} value={editState.barangay} onChange={(e) => setEditState((s) => ({ ...s, barangay: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="d_city">City / Municipality</Label>
                <Input id="d_city" disabled={!canEdit} value={editState.city_municipality} onChange={(e) => setEditState((s) => ({ ...s, city_municipality: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="d_prov">Province</Label>
                <Input id="d_prov" disabled={!canEdit} value={editState.province} onChange={(e) => setEditState((s) => ({ ...s, province: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="d_reg">Region</Label>
                <Input id="d_reg" disabled={!canEdit} value={editState.region} onChange={(e) => setEditState((s) => ({ ...s, region: e.target.value }))} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="d_edu">Educational Attainment</Label>
                <select id="d_edu" disabled={!canEdit} className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" value={editState.educational_attainment} onChange={(e) => setEditState((s) => ({ ...s, educational_attainment: e.target.value }))}>
                  {EDUCATIONAL_ATTAINMENT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="d_gname">Parent / Guardian</Label>
                <Input id="d_gname" disabled={!canEdit} value={editState.guardian_name} onChange={(e) => setEditState((s) => ({ ...s, guardian_name: e.target.value }))} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="d_gaddr">Parent / Guardian Address</Label>
                <Input id="d_gaddr" disabled={!canEdit} value={editState.guardian_address} onChange={(e) => setEditState((s) => ({ ...s, guardian_address: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="d_noted">Noted By (Registrar/Admin)</Label>
                <Input id="d_noted" disabled={!canEdit} value={editState.noted_by_name} onChange={(e) => setEditState((s) => ({ ...s, noted_by_name: e.target.value }))} />
              </div>
            </div>

            {canEdit && (
              <div className="flex flex-wrap items-end gap-3 border-t border-slate-200 pt-4">
                <div className="min-w-[260px] flex-1 space-y-1">
                  <Label htmlFor="dossier_reason">Mandatory Audit Reason for Record Update</Label>
                  <Input
                    id="dossier_reason"
                    value={auditReason}
                    onChange={(e) => setAuditReason(e.target.value)}
                    placeholder="e.g., Encoded TESDA Main ULI & verified guardian address"
                  />
                </div>
                <Button type="button" disabled={saveRecordMutation.isPending} onClick={() => saveRecordMutation.mutate()}>
                  <Save className="h-4 w-4" /> {saveRecordMutation.isPending ? 'Saving...' : 'Save Student Record'}
                </Button>
              </div>
            )}
          </div>
        )}

        {dossierTab === 'documents' && (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              {TESDA_REQUIRED_DOCUMENTS.map((reqDoc) => {
                const matchingDocs = docs.filter((d) => normalizeDocumentTypeKey(d.document_type) === reqDoc.key);
                return (
                  <div key={reqDoc.key} className="space-y-2 rounded-xl border border-slate-200 p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{reqDoc.label}</p>
                        <p className="text-[11px] text-slate-600">{reqDoc.description}</p>
                      </div>
                      <Badge variant={matchingDocs.length > 0 ? 'success' : 'outline'}>
                        {matchingDocs.length > 0 ? `${matchingDocs.length} File(s)` : 'Missing'}
                      </Badge>
                    </div>

                    {matchingDocs.map((doc) => (
                      <div key={doc.id} className="space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-medium text-slate-900">{doc.original_name}</p>
                            <p className="text-[11px] text-slate-500">
                              {getDocumentLabel(doc.document_type)} · {(doc.size_bytes / 1024).toFixed(1)} KB · {formatShortDateTime(doc.created_at)}
                            </p>
                          </div>
                          <Badge variant={doc.status === 'verified' ? 'success' : doc.status === 'rejected' ? 'destructive' : 'warning'}>
                            {doc.status}
                          </Badge>
                        </div>
                        {doc.remarks && <p className="text-[11px] text-red-700">Remarks: {doc.remarks}</p>}
                        <div className="flex flex-wrap gap-1.5">
                          <Button type="button" size="sm" variant="outline" onClick={() => void handlePreviewOrDownloadDoc(doc, 'preview')}>
                            <Eye className="h-3.5 w-3.5" /> View
                          </Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => void handlePreviewOrDownloadDoc(doc, 'download')}>
                            <Download className="h-3.5 w-3.5" /> Download
                          </Button>
                          {canEdit && (
                            <>
                              <Button type="button" size="sm" variant="secondary" onClick={() => void handleReviewDocument(doc, 'verified')}>
                                <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                              </Button>
                              <Button type="button" size="sm" variant="ghost" onClick={() => void handleReviewDocument(doc, 'rejected')}>
                                <XCircle className="h-3.5 w-3.5" /> Return
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}

                    {canEdit && (
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-teal-800 hover:bg-slate-50">
                        <Upload className="h-3.5 w-3.5" /> Upload / Attach Copy for Student
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void handleStaffUploadDoc(reqDoc.key, f);
                          }}
                        />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {dossierTab === 'mis0301' && (
          <Mis0301FormPreview
            values={mis0301Values}
            mode={formMode}
            onModeChange={setFormMode}
          />
        )}

        {dossierTab === 'system-id' && (
            <div className="flex justify-center py-2">
              <DigitalSystemIdCard
                fullName={record.learner_name}
                email={editState.email_or_facebook || record.email}
                systemAccountId={record.learner_user_id}
                institutionCode={relInst?.code}
                institutionName={relInst?.name}
                courseName={relCourse?.name}
                scholarId={record.scholar_id}
                enrollmentStatus={record.application_status}
                uliNumber={editState.uli_number}
                photoUrl={photoSignedUrl}
                contactNumber={editState.contact_number}
              />
            </div>
          )}
          </div>
        </div>
      </MinimizableModal>

      {/* Floating Document Preview with Minimize & Maximize */}
      {previewDoc && (
        <MinimizableModal
          isOpen={true}
          onClose={() => setPreviewDoc(null)}
          title={`Document Preview: ${previewDoc.name}`}
          minimizedLabel={`Preview: ${previewDoc.name}`}
          icon={<FileText className="h-4 w-4" />}
          className="max-w-4xl"
          headerActions={
            <a
              href={previewDoc.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
            >
              <ExternalLink className="h-3 w-3" /> Open New Tab
            </a>
          }
        >
          <div className="flex h-full w-full items-center justify-center p-2">
            {previewDoc.mime.startsWith('image/') ? (
              <img
                src={previewDoc.url}
                alt={previewDoc.name}
                className="max-h-[75vh] w-auto max-w-full rounded-lg border border-slate-200 bg-white object-contain shadow-sm"
              />
            ) : (
              <iframe
                src={previewDoc.url}
                title={previewDoc.name}
                className="h-[75vh] w-full rounded-lg border border-slate-200 bg-white"
              />
            )}
          </div>
        </MinimizableModal>
      )}
    </>
  );
}
