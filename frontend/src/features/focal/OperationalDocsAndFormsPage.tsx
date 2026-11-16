import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileStack, FileUp, FolderOpen, Printer, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pagination, usePagination } from '@/components/ui/pagination';
import { isSupabaseConfigured } from '@/lib/env';
import { getSupabaseClient } from '@/lib/supabase';
import { formatShortDateTime, sanitizeCsvCell } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useConnectivityStore } from '@/stores/connectivityStore';

interface OperationalDocRow {
  id: string;
  institution_id: string;
  category: 'assessment_form' | 'photo' | 'other';
  title: string;
  original_name: string;
  storage_path: string;
  size_bytes: number;
  notes: string | null;
  created_at: string;
}

interface OutgoingLogRow {
  id: string;
  document_type: string;
  reference_number: string | null;
  recipient: string | null;
  subject: string;
  sent_at: string;
  method: string;
  notes: string | null;
}

interface InstitutionOption {
  id: string;
  code: string;
  name: string;
}

type VerifiedTemplateKey =
  | 'progress-chart-template'
  | 'tesda-form-template'
  | 'batch-summary'
  | 'enrollment-summary'
  | 'progress-report'
  | 'trainee-roster'
  | 'meeting-minutes-template';

const VERIFIED_TEMPLATES: Array<{
  key: VerifiedTemplateKey;
  title: string;
  desc: string;
}> = [
  { key: 'progress-chart-template', title: 'Progress & Achievement Chart Template', desc: 'Blank institutional task progress & achievement checklist worksheet.' },
  { key: 'tesda-form-template', title: 'TESDA Filing Checklist Template', desc: 'Internal working preparation checklist (confirm current official revision before filing).' },
  { key: 'batch-summary', title: 'Training Batch Summary', desc: 'Live batch capacity, schedule dates, status, and confirmed trainee totals.' },
  { key: 'enrollment-summary', title: 'Confirmed Enrollment Summary', desc: 'Institution reference numbers, Scholar IDs, courses, and confirmation dates.' },
  { key: 'progress-report', title: 'Progress & Achievement Report', desc: 'Verified trainee progress and achievement task counts per batch.' },
  { key: 'trainee-roster', title: 'Confirmed Trainee Roster', desc: 'Confirmed trainee directory with Scholar IDs and contact details.' },
  { key: 'meeting-minutes-template', title: 'Meeting Minutes Template', desc: 'Blank institutional meeting minutes worksheet.' },
];

const MAX_OPERATIONAL_BYTES = 10 * 1024 * 1024;

export function OperationalDocsAndFormsPage() {
  const profile = useAuthStore((s) => s.profile);
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const queryClient = useQueryClient();

  const [tab, setTab] = React.useState<'documents' | 'logs' | 'templates'>('documents');
  const [docCategory, setDocCategory] = React.useState<'assessment_form' | 'photo' | 'other'>('assessment_form');
  const [docTitle, setDocTitle] = React.useState('');
  const [docFile, setDocFile] = React.useState<File | null>(null);

  const [logType, setLogType] = React.useState('transmittal');
  const [logRef, setLogRef] = React.useState('');
  const [logRecipient, setLogRecipient] = React.useState('');
  const [logSubject, setLogSubject] = React.useState('');
  const [logSentAt, setLogSentAt] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [logMethod, setLogMethod] = React.useState('physical');

  const [printPreview, setPrintPreview] = React.useState<{ title: string; headers: string[]; rows: string[][] } | null>(null);

  const canWriteOperational =
    profile?.role === 'system_administrator' ||
    profile?.role === 'institutional_administrator' ||
    profile?.role === 'focal_person';

  const institutionsQuery = useQuery<InstitutionOption[]>({
    queryKey: ['ops-institutions'],
    enabled: isSupabaseConfigured && isOnline && Boolean(profile?.id),
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return [];
      const { data, error } = await client
        .from('institutions')
        .select('id, code, name')
        .eq('is_active', true)
        .order('code', { ascending: true })
        .returns<InstitutionOption[]>();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const activeInstId = profile?.institutions?.[0]?.institutionId ?? institutionsQuery.data?.[0]?.id ?? '';

  const docsQuery = useQuery<OperationalDocRow[]>({
    queryKey: ['operational-documents', activeInstId],
    enabled: isSupabaseConfigured && isOnline && Boolean(profile?.id) && tab === 'documents',
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return [];
      const { data, error } = await client
        .from('operational_documents')
        .select('id, institution_id, category, title, original_name, storage_path, size_bytes, notes, created_at')
        .order('created_at', { ascending: false })
        .limit(50)
        .returns<OperationalDocRow[]>();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const logsQuery = useQuery<OutgoingLogRow[]>({
    queryKey: ['outgoing-document-logs', activeInstId],
    enabled: isSupabaseConfigured && isOnline && Boolean(profile?.id) && tab === 'logs',
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return [];
      const { data, error } = await client
        .from('outgoing_document_logs')
        .select('id, document_type, reference_number, recipient, subject, sent_at, method, notes')
        .order('sent_at', { ascending: false })
        .limit(50)
        .returns<OutgoingLogRow[]>();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const uploadDocMutation = useMutation({
    mutationFn: async () => {
      const client = getSupabaseClient();
      if (!client || !profile || !activeInstId) throw new Error('Institutional session is required.');
      if (!docFile) throw new Error('Select a file (<= 10 MB) first.');
      if (docFile.size > MAX_OPERATIONAL_BYTES) {
        throw new Error('Operational file exceeds the 10 MB limit enforced by PostgreSQL.');
      }
      const safeName = docFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `${activeInstId}/${profile.id}/${Date.now()}_${safeName}`;
      const { error: uploadErr } = await client.storage.from('operational-documents').upload(storagePath, docFile, {
        contentType: docFile.type || 'application/octet-stream',
        upsert: false,
      });
      if (uploadErr) throw new Error(uploadErr.message);

      const { error: insertErr } = await client.from('operational_documents').insert({
        institution_id: activeInstId,
        uploaded_by_user_id: profile.id,
        category: docCategory,
        title: docTitle.trim() || docFile.name,
        original_name: docFile.name,
        storage_path: storagePath,
        mime_type: docFile.type || 'application/octet-stream',
        size_bytes: docFile.size,
      });
      if (insertErr) throw new Error(insertErr.message);
    },
    onSuccess: async () => {
      toast.success('Operational document uploaded cleanly to private bucket.');
      setDocTitle('');
      setDocFile(null);
      await queryClient.invalidateQueries({ queryKey: ['operational-documents'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const createLogMutation = useMutation({
    mutationFn: async () => {
      const client = getSupabaseClient();
      if (!client || !profile || !activeInstId) throw new Error('Institutional session is required.');
      if (logSubject.trim().length < 3) throw new Error('Provide an outgoing document subject.');
      const { error } = await client.from('outgoing_document_logs').insert({
        institution_id: activeInstId,
        logged_by_user_id: profile.id,
        document_type: logType,
        reference_number: logRef.trim() || null,
        recipient: logRecipient.trim() || null,
        subject: logSubject.trim(),
        sent_at: logSentAt,
        method: logMethod,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      toast.success('Recorded entry in secretarial outgoing document log.');
      setLogRef('');
      setLogRecipient('');
      setLogSubject('');
      await queryClient.invalidateQueries({ queryKey: ['outgoing-document-logs'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  async function handleSignedDownload(doc: OperationalDocRow) {
    const client = getSupabaseClient();
    if (!client) return;
    const { data, error } = await client.storage.from('operational-documents').createSignedUrl(doc.storage_path, 120);
    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? 'Unable to generate temporary download link.');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function buildTemplatePayload(key: VerifiedTemplateKey): Promise<{ title: string; headers: string[]; rows: string[][] }> {
    if (key === 'progress-chart-template') {
      return {
        title: 'Blank Competency Progress Chart Worksheet',
        headers: ['Institution', 'Course Code', 'Course', 'Scholar ID', 'Trainee Name', 'Unit No.', 'Unit', 'Task No.', 'Task', 'Status', 'Assessed By', 'Assessed At'],
        rows: [],
      };
    }
    if (key === 'meeting-minutes-template') {
      return {
        title: 'Institutional Meeting Minutes Worksheet',
        headers: ['Meeting Date', 'Start Time', 'End Time', 'Venue', 'Attendees', 'Agenda Item', 'Discussion / Decisions', 'Action Owner', 'Due Date'],
        rows: [],
      };
    }
    if (key === 'tesda-form-template') {
      return {
        title: 'TESDA Preparation Checklist (Internal Working Template — Verify Official Revision Before Filing)',
        headers: ['Form / Document', 'Purpose', 'Institution', 'Course / Batch', 'Prepared By', 'Date Prepared', 'Remarks'],
        rows: [
          ['Enrollment Summary', 'Summary of submitted and confirmed learner records', '', '', profile?.fullName ?? '', '', 'Confirm current official TESDA form revision prior to filing.'],
          ['Progress & Achievement Chart Report', 'Task competency tracking summary', '', '', profile?.fullName ?? '', '', 'Internal operational copy, not a government-certified form.'],
        ],
      };
    }

    const client = getSupabaseClient();
    if (!client || !isSupabaseConfigured || !isOnline) {
      return { title: key, headers: ['Notice'], rows: [['Connect online to populate live Supabase rows for this worksheet.']] };
    }

    if (key === 'batch-summary') {
      const { data } = await client
        .from('training_batches')
        .select('code, name, capacity, starts_at, ends_at, status, venue, courses(code, name)')
        .is('archived_at', null)
        .order('starts_at', { ascending: true })
        .limit(100);
      const rows = ((data ?? []) as Array<{
        code: string;
        name: string;
        capacity: number;
        starts_at: string | null;
        ends_at: string | null;
        status: string;
        venue: string | null;
        courses: { code: string; name: string } | Array<{ code: string; name: string }> | null;
      }>).map((b) => {
        const c = Array.isArray(b.courses) ? b.courses[0] : b.courses;
        return [c?.code ?? '', c?.name ?? '', b.code, b.name, String(b.capacity), b.starts_at ?? '', b.ends_at ?? '', b.venue ?? '', b.status];
      });
      return {
        title: 'Training Batch Summary',
        headers: ['Course Code', 'Course', 'Batch Code', 'Batch', 'Capacity', 'Start Date', 'End Date', 'Venue', 'Status'],
        rows,
      };
    }

    if (key === 'progress-report') {
      const { data } = await client
        .from('competency_progress')
        .select('status, assessed_at, enrollment_applications(scholar_id, learner_name), competency_tasks(task_number, name)')
        .limit(200);
      const rows = ((data ?? []) as Array<{
        status: string;
        assessed_at: string | null;
        enrollment_applications: { scholar_id: string | null; learner_name: string } | Array<{ scholar_id: string | null; learner_name: string }> | null;
        competency_tasks: { task_number: number; name: string } | Array<{ task_number: number; name: string }> | null;
      }>).map((p) => {
        const ea = Array.isArray(p.enrollment_applications) ? p.enrollment_applications[0] : p.enrollment_applications;
        const t = Array.isArray(p.competency_tasks) ? p.competency_tasks[0] : p.competency_tasks;
        return [ea?.scholar_id ?? '', ea?.learner_name ?? '', String(t?.task_number ?? ''), t?.name ?? '', p.status, p.assessed_at ?? ''];
      });
      return {
        title: 'Competency Progress Report',
        headers: ['Scholar ID', 'Trainee Name', 'Task No.', 'Task Name', 'Status', 'Assessed At'],
        rows,
      };
    }

    const { data } = await client
      .from('enrollment_applications')
      .select('reference_no, scholar_id, learner_name, email, contact_number, application_status, confirmed_at, courses(code, name)')
      .eq('application_status', 'confirmed')
      .is('archived_at', null)
      .order('learner_name', { ascending: true })
      .limit(200);

    const rows = ((data ?? []) as Array<{
      reference_no: string;
      scholar_id: string | null;
      learner_name: string;
      email: string | null;
      contact_number: string | null;
      application_status: string;
      confirmed_at: string | null;
      courses: { code: string; name: string } | Array<{ code: string; name: string }> | null;
    }>).map((r) => {
      const c = Array.isArray(r.courses) ? r.courses[0] : r.courses;
      return key === 'trainee-roster'
        ? [r.scholar_id ?? r.reference_no, r.learner_name, c?.name ?? '', r.contact_number ?? '', r.email ?? '']
        : [r.reference_no, r.scholar_id ?? '', r.learner_name, c?.code ?? '', c?.name ?? '', r.application_status, r.confirmed_at ?? ''];
    });

    return key === 'trainee-roster'
      ? {
          title: 'Confirmed Trainee Roster',
          headers: ['Scholar ID', 'Trainee Name', 'Course', 'Contact Number', 'Email'],
          rows,
        }
      : {
          title: 'Confirmed Enrollment Summary',
          headers: ['Reference No', 'Scholar ID', 'Learner Name', 'Course Code', 'Course', 'Status', 'Confirmed At'],
          rows,
        };
  }

  async function handleDownloadTemplateCsv(key: VerifiedTemplateKey) {
    const payload = await buildTemplatePayload(key);
    const lines = [
      payload.headers.map((h) => sanitizeCsvCell(h)).join(','),
      ...payload.rows.map((row) => row.map((cell) => sanitizeCsvCell(cell)).join(',')),
    ];
    const csv = `${lines.join('\n')}\n`;
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tesda-${key}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${payload.title} (formula-safe UTF-8 CSV).`);
  }

  async function handleOpenPrintPreview(key: VerifiedTemplateKey) {
    const payload = await buildTemplatePayload(key);
    setPrintPreview(payload);
  }

  const docs = docsQuery.data ?? [];
  const docsPagination = usePagination({
    totalRecords: docs.length,
    initialPageSize: 10,
  });
  const pagedDocs = docs.slice(docsPagination.startIndex, docsPagination.endIndex);

  const logs = logsQuery.data ?? [];
  const logsPagination = usePagination({
    totalRecords: logs.length,
    initialPageSize: 10,
  });
  const pagedLogs = logs.slice(logsPagination.startIndex, logsPagination.endIndex);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <FileStack className="h-6 w-6 text-teal-700" />
            Operational Document Library &amp; Forms
          </h1>
          <p className="text-sm text-slate-500">
            Private focal document storage (&lt;= 10 MB), secretarial outgoing logbook, and verified institutional worksheets.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant={tab === 'documents' ? 'secondary' : 'outline'} onClick={() => setTab('documents')}>
            Document Library
          </Button>
          <Button type="button" size="sm" variant={tab === 'logs' ? 'secondary' : 'outline'} onClick={() => setTab('logs')}>
            Secretarial Outgoing Log
          </Button>
          <Button type="button" size="sm" variant={tab === 'templates' ? 'secondary' : 'outline'} onClick={() => setTab('templates')}>
            Institutional Forms &amp; Checklists
          </Button>
        </div>
      </div>

      {tab === 'documents' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderOpen className="h-4 w-4 text-teal-700" /> Private Bucket: <code className="rounded bg-slate-100 px-1">operational-documents</code>
            </CardTitle>
            <CardDescription>Assessment sheets, training photos, and operational documentation scoped strictly by institution.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {canWriteOperational && isSupabaseConfigured && (
              <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-4">
                <div className="space-y-1">
                  <Label htmlFor="op_doc_cat">Category</Label>
                  <select
                    id="op_doc_cat"
                    value={docCategory}
                    onChange={(e) => setDocCategory(e.target.value as typeof docCategory)}
                    className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm"
                  >
                    <option value="assessment_form">Assessment / Competency Form</option>
                    <option value="photo">Training Photo</option>
                    <option value="other">Other Document</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="op_doc_title">Document Title</Label>
                  <Input id="op_doc_title" value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="Progress Chart Assessment Folder" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="op_doc_file">File (&lt;= 10 MB)</Label>
                  <Input id="op_doc_file" type="file" onChange={(e) => setDocFile(e.target.files?.[0] ?? null)} />
                </div>
                <div className="flex items-end">
                  <Button type="button" size="sm" disabled={uploadDocMutation.isPending || !isOnline} onClick={() => uploadDocMutation.mutate()}>
                    <FileUp className="h-4 w-4" /> {uploadDocMutation.isPending ? 'Uploading...' : 'Upload'}
                  </Button>
                </div>
              </div>
            )}

            {docs.length === 0 ? (
              <p className="text-sm text-slate-500">
                {isSupabaseConfigured
                  ? 'No operational documents stored for this campus scope yet.'
                  : 'Connect Supabase PostgreSQL & Storage to store and access institutional operational documents.'}
              </p>
            ) : (
              <>
                <div className="space-y-2">
                  {pagedDocs.map((doc) => (
                    <div key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <div>
                        <p className="font-medium text-slate-900">{doc.title}</p>
                        <p className="text-xs text-slate-500">
                          {doc.category} • {doc.original_name} • {(doc.size_bytes / 1024).toFixed(1)} KB • {formatShortDateTime(doc.created_at)}
                        </p>
                      </div>
                      <Button type="button" size="sm" variant="outline" onClick={() => handleSignedDownload(doc)}>
                        <Download className="h-3.5 w-3.5" /> Signed Download
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="mt-4 border-t border-slate-100 pt-4">
                  <Pagination
                    currentPage={docsPagination.currentPage}
                    totalPages={docsPagination.totalPages}
                    totalRecords={docs.length}
                    pageSize={docsPagination.pageSize}
                    onPageChange={docsPagination.goToPage}
                    onPageSizeChange={docsPagination.setPageSize}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'logs' && (
        <Card>
          <CardHeader>
            <CardTitle>Outgoing Document &amp; Transmittal Log</CardTitle>
            <CardDescription>Tracks physical, email, or portal document dispatches from Focal / Institutional staff.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {canWriteOperational && isSupabaseConfigured && (
              <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-6">
                <div className="space-y-1">
                  <Label htmlFor="log_type">Type</Label>
                  <Input id="log_type" value={logType} onChange={(e) => setLogType(e.target.value)} placeholder="transmittal" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="log_ref">Ref No.</Label>
                  <Input id="log_ref" value={logRef} onChange={(e) => setLogRef(e.target.value)} placeholder="OUT-2026-001" />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label htmlFor="log_subject">Subject</Label>
                  <Input id="log_subject" value={logSubject} onChange={(e) => setLogSubject(e.target.value)} placeholder="Batch 1 Completion Folder" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="log_recipient">Recipient</Label>
                  <Input id="log_recipient" value={logRecipient} onChange={(e) => setLogRecipient(e.target.value)} placeholder="Registrar Office" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="log_date">Date Sent</Label>
                  <Input id="log_date" type="date" value={logSentAt} onChange={(e) => setLogSentAt(e.target.value)} />
                </div>
                <div className="flex items-end gap-2 md:col-span-6">
                  <select
                    value={logMethod}
                    onChange={(e) => setLogMethod(e.target.value)}
                    className="h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm"
                  >
                    <option value="physical">Physical Handover</option>
                    <option value="email">Official Email</option>
                    <option value="portal">Digital Portal</option>
                  </select>
                  <Button type="button" size="sm" variant="secondary" disabled={createLogMutation.isPending || !isOnline} onClick={() => createLogMutation.mutate()}>
                    <Send className="h-3.5 w-3.5" /> Record Dispatch
                  </Button>
                </div>
              </div>
            )}

            {logs.length === 0 ? (
              <p className="text-sm text-slate-500">
                {isSupabaseConfigured ? 'No outgoing document dispatches logged yet.' : 'Connect Supabase to record and audit outgoing document transmittals.'}
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                        <th className="py-2 pr-4">Date</th>
                        <th className="py-2 pr-4">Reference</th>
                        <th className="py-2 pr-4">Subject</th>
                        <th className="py-2 pr-4">Recipient</th>
                        <th className="py-2">Method</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pagedLogs.map((log) => (
                        <tr key={log.id}>
                          <td className="py-2 pr-4 text-xs">{log.sent_at}</td>
                          <td className="py-2 pr-4 font-mono text-xs">{log.reference_number ?? '—'}</td>
                          <td className="py-2 pr-4 font-medium">{log.subject}</td>
                          <td className="py-2 pr-4 text-xs">{log.recipient ?? '—'}</td>
                          <td className="py-2"><Badge variant="secondary">{log.method}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 border-t border-slate-100 pt-4">
                  <Pagination
                    currentPage={logsPagination.currentPage}
                    totalPages={logsPagination.totalPages}
                    totalRecords={logs.length}
                    pageSize={logsPagination.pageSize}
                    onPageChange={logsPagination.goToPage}
                    onPageSizeChange={logsPagination.setPageSize}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'templates' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
            <strong>Institutional Working Worksheets Only:</strong> These 7 preserved operational worksheets support progress monitoring and batch tracking. Use <strong>Registration Intake</strong> for the official MIS 03-01 (ver. 2021) Registration Form PDF.
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {VERIFIED_TEMPLATES.map((t) => (
              <Card key={t.key}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{t.title}</CardTitle>
                  <CardDescription className="text-xs">{t.desc}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => handleDownloadTemplateCsv(t.key)}>
                    <Download className="h-3.5 w-3.5" /> CSV
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => handleOpenPrintPreview(t.key)}>
                    <Printer className="h-3.5 w-3.5" /> Print Preview
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {printPreview && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{printPreview.title}</CardTitle>
                  <CardDescription>Rows ready: {printPreview.rows.length}</CardDescription>
                </div>
                <div className="no-print flex gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={() => window.print()}>
                    <Printer className="h-3.5 w-3.5" /> Print Sheet
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setPrintPreview(null)}>
                    Close Preview
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 uppercase text-slate-500">
                      {printPreview.headers.map((h) => (
                        <th key={h} className="py-2 pr-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {printPreview.rows.length === 0 ? (
                      <tr>
                        <td colSpan={printPreview.headers.length} className="py-4 text-slate-400">
                          Blank printable worksheet template ready.
                        </td>
                      </tr>
                    ) : (
                      printPreview.rows.map((r, idx) => (
                        <tr key={idx}>
                          {r.map((cell, cIdx) => (
                            <td key={cIdx} className="py-2 pr-3">{cell}</td>
                          ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
