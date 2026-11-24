import React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Eye,
  Lock,
  Search,
  Send,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pagination, usePagination } from '@/components/ui/pagination';
import { AppDialog } from '@/components/ui/dialog';
import { FULL_BATCHES_RETURN_MESSAGE, parseConfirmError } from '@/features/batches/batchRules';
import { QuotaStatusPanel } from '@/features/records/QuotaStatusPanel';
import { isConfirmBlocked } from '@/features/records/quotaStatus';
import { useCampusQuotas } from '@/features/records/useCampusQuotas';
import { StudentDossierDrawer, type FullTraineeRecordRow } from '@/features/records/StudentDossierDrawer';
import { isSupabaseConfigured } from '@/lib/env';
import { downloadMis0301Pdf } from '@/lib/forms/generateMis0301Pdf';
import { createEmptyMis0301Values } from '@/lib/forms/mis0301Schema';
import { getSupabaseClient } from '@/lib/supabase';
import { formatShortDateTime, sanitizeCsvCell } from '@/lib/utils';
import { offlineDb, safeDexieWrite } from '@/lib/db/dexie';
import { useAuthStore } from '@/stores/authStore';
import { useConnectivityStore } from '@/stores/connectivityStore';

export interface EnrollmentRow {
  id: string;
  reference_no: string;
  learner_name: string;
  email: string | null;
  application_status: string;
  record_completeness: number;
  scholar_id: string | null;
  institution_id: string;
  course_id: string | null;
  archived_at: string | null;
}

export function EnrollmentReviewPage() {
  const profile = useAuthStore((s) => s.profile);
  const [rows, setRows] = React.useState<EnrollmentRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [statusFilter, setStatusFilter] = React.useState<'all' | 'submitted' | 'verified' | 'returned' | 'confirmed'>('all');
  const [returnReason, setReturnReason] = React.useState('');
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [batchPrompt, setBatchPrompt] = React.useState<{ row: EnrollmentRow; text: string } | null>(null);
  const [fullPrompt, setFullPrompt] = React.useState<{ row: EnrollmentRow; text: string } | null>(null);
  const { statuses: quotaStatuses, refetch: refetchQuotas } = useCampusQuotas();
  const campusNames = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const i of profile?.institutions ?? []) map[i.institutionId] = `${i.name} (${i.code})`;
    return map;
  }, [profile?.institutions]);
  const courseNamesQuery = useQuery<Record<string, string>>({
    queryKey: ['course-names-for-quota'],
    enabled: isSupabaseConfigured && quotaStatuses.some((q) => q.courses.length > 0),
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return {};
      const { data } = await client.from('courses').select('id, name').returns<Array<{ id: string; name: string }>>();
      return Object.fromEntries((data ?? []).map((c) => [c.id, c.name]));
    },
  });

  const canMutate =
    profile?.role === 'registrar' ||
    profile?.role === 'institutional_administrator' ||
    profile?.role === 'system_administrator';

  const loadApplications = React.useCallback(async () => {
    const client = getSupabaseClient();
    if (!client || !isSupabaseConfigured) return;
    setLoading(true);
    try {
      const { data, error } = await client
        .from('enrollment_applications')
        .select('id, reference_no, learner_name, email, application_status, record_completeness, scholar_id, institution_id, course_id, archived_at')
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(100)
        .returns<EnrollmentRow[]>();

      if (error) {
        toast.error(error.message);
        return;
      }
      setRows(data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadApplications();
  }, [loadApplications]);

  async function handleVerify(row: EnrollmentRow) {
    if (row.record_completeness < 100) {
      toast.error('Application must reach 100% completeness before verification.');
      return;
    }
    const client = getSupabaseClient();
    if (!client) return;
    const { error } = await client
      .from('enrollment_applications')
      .update({ application_status: 'verified', verified_at: new Date().toISOString() })
      .eq('id', row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Verified ${row.reference_no}.`);
    await loadApplications();
  }

  async function handleConfirm(row: EnrollmentRow, acceptNextBatch = false) {
    const client = getSupabaseClient();
    if (!client) return;
    type ConfirmResult = { data: (EnrollmentRow & { training_batch_id?: string | null }) | null; error: { message: string } | null };
    let rpcResponse = (await client.rpc('confirm_enrollment_application', {
      p_application_id: row.id,
      p_accept_next_batch: acceptNextBatch,
    })) as ConfirmResult;
    // Until the batch-management database update is applied, the older one-argument function is still in place.
    if (rpcResponse.error && /could not find the function/i.test(rpcResponse.error.message)) {
      rpcResponse = (await client.rpc('confirm_enrollment_application', { p_application_id: row.id })) as ConfirmResult;
    }

    if (rpcResponse.error) {
      const parsed = parseConfirmError(rpcResponse.error.message);
      if (parsed.kind === 'next_batch') {
        setBatchPrompt({ row, text: parsed.text });
      } else if (parsed.kind === 'all_full') {
        setFullPrompt({ row, text: parsed.text });
      } else {
        toast.error(parsed.text);
      }
      refetchQuotas();
      return;
    }
    toast.success(
      `Confirmed! Scholar ID: ${rpcResponse.data?.scholar_id ?? 'Generated'}${rpcResponse.data?.training_batch_id ? '. Placed in a batch.' : ''}`,
    );
    await loadApplications();
    refetchQuotas();
  }

  async function handleReturn() {
    if (!selectedId || returnReason.trim().length < 5) {
      toast.error('Provide a clear reason (at least 5 characters) when returning an intake record.');
      return;
    }
    const client = getSupabaseClient();
    if (!client) return;
    const { error } = await client
      .from('enrollment_applications')
      .update({ application_status: 'returned', remarks: returnReason.trim() })
      .eq('id', selectedId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Application returned to applicant with remarks.');
    setSelectedId(null);
    setReturnReason('');
    await loadApplications();
  }

  const visibleRows = rows.filter((r) => statusFilter === 'all' || r.application_status === statusFilter);
  const pagination = usePagination({
    totalRecords: visibleRows.length,
    initialPageSize: 10,
  });
  const pagedRows = visibleRows.slice(pagination.startIndex, pagination.endIndex);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <ClipboardCheck className="h-6 w-6 text-teal-700" />
            Enrollment Verification &amp; Confirmation
          </h1>
          <p className="text-sm text-slate-500">
            100% completeness gate, duplicate warning review without auto-merging, and atomic scholar ID confirmation.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={loadApplications} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh Queue'}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['all', 'submitted', 'verified', 'returned', 'confirmed'] as const).map((statusKey) => (
          <Button
            key={statusKey}
            type="button"
            size="sm"
            variant={statusFilter === statusKey ? 'secondary' : 'outline'}
            onClick={() => setStatusFilter(statusKey)}
            className="capitalize"
          >
            {statusKey === 'verified' ? 'Verified Records' : statusKey === 'submitted' ? 'Submissions' : statusKey}
          </Button>
        ))}
      </div>

      <AppDialog
        open={Boolean(batchPrompt)}
        onOpenChange={(open) => !open && setBatchPrompt(null)}
        title="Continue to the next batch?"
        description={batchPrompt?.text}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setBatchPrompt(null)}>
              No, stop here
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const target = batchPrompt?.row;
                setBatchPrompt(null);
                if (target) void handleConfirm(target, true);
              }}
            >
              Yes, continue
            </Button>
          </>
        }
      />

      <AppDialog
        open={Boolean(fullPrompt)}
        onOpenChange={(open) => !open && setFullPrompt(null)}
        title="All batches are full"
        description={fullPrompt?.text}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setFullPrompt(null)}>
              Close
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const target = fullPrompt?.row;
                setFullPrompt(null);
                if (target) {
                  setSelectedId(target.id);
                  setReturnReason(FULL_BATCHES_RETURN_MESSAGE);
                }
              }}
            >
              Return with a message
            </Button>
          </>
        }
      />

      <QuotaStatusPanel statuses={quotaStatuses} campusNames={campusNames} courseNames={courseNamesQuery.data ?? {}} />

      {!canMutate && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          Read-only view: Only Registrar and Institutional / System Administrators can verify, return, or confirm enrollments.
        </div>
      )}

      {selectedId && (
        <Card className="border-amber-300 bg-amber-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Return Application for Corrections</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="return_reason">Missing Fields / Rejection Reason</Label>
              <Input
                id="return_reason"
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="Explain which MIS 03-01 fields or documents need correction..."
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={handleReturn}>
                Confirm Return
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSelectedId(null)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Intake Applications ({visibleRows.length})</CardTitle>
          <CardDescription>Only verified records at 100% completeness may be confirmed by Registrar.</CardDescription>
        </CardHeader>
        <CardContent>
          {visibleRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              {isSupabaseConfigured
                ? 'No intake applications match the active status filter.'
                : 'No active applications loaded. Connect Supabase project environment variables to query institutional rows.'}
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs text-slate-500 uppercase">
                  <tr>
                    <th className="py-2 pr-4">Reference</th>
                    <th className="py-2 pr-4">Learner</th>
                    <th className="py-2 pr-4">Completeness</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Scholar ID</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedRows.map((row) => (
                    <tr key={row.id}>
                      <td className="py-2.5 pr-4 font-mono text-xs">{row.reference_no}</td>
                      <td className="py-2.5 pr-4 font-medium">{row.learner_name}</td>
                      <td className="py-2.5 pr-4">
                        <Badge variant={row.record_completeness >= 100 ? 'success' : 'warning'}>
                          {row.record_completeness}%
                        </Badge>
                      </td>
                      <td className="py-2.5 pr-4 capitalize">{row.application_status}</td>
                      <td className="py-2.5 pr-4 font-mono text-xs">{row.scholar_id ?? 'Pending'}</td>
                      <td className="py-2.5">
                        {canMutate && (
                          <div className="flex flex-wrap gap-1.5">
                            {row.application_status === 'submitted' && (
                              <Button size="sm" variant="outline" onClick={() => handleVerify(row)}>
                                <CheckCircle2 className="h-3.5 w-3.5" /> Verify
                              </Button>
                            )}
                            {row.application_status === 'verified' && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleConfirm(row)}
                                disabled={isConfirmBlocked(quotaStatuses, row.institution_id, row.course_id)}
                                title={isConfirmBlocked(quotaStatuses, row.institution_id, row.course_id) ? 'The quota is full. Raise the quota or wait for a slot to free up.' : undefined}
                              >
                                {isConfirmBlocked(quotaStatuses, row.institution_id, row.course_id) ? 'Quota full' : 'Confirm Scholar'}
                              </Button>
                            )}
                            {row.application_status !== 'confirmed' && (
                              <Button size="sm" variant="ghost" onClick={() => setSelectedId(row.id)}>
                                Return
                              </Button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 border-t border-slate-100 pt-4">
              <Pagination
                currentPage={pagination.currentPage}
                totalPages={pagination.totalPages}
                totalRecords={visibleRows.length}
                pageSize={pagination.pageSize}
                onPageChange={pagination.goToPage}
                onPageSizeChange={pagination.setPageSize}
              />
            </div>
          </>
        )}
        </CardContent>
      </Card>
    </div>
  );
}

interface TraineeRecordRow extends FullTraineeRecordRow {
  learner_profiles?: {
    uli_number: string | null;
    first_name: string;
    last_name: string;
    birthdate: string | null;
    [key: string]: unknown;
  } | null;
}

interface DuplicateCandidateRow {
  profile_id: string;
  user_id: string;
  full_name: string;
  uli_number: string | null;
  birthdate: string | null;
  match_reason: string;
}

interface ForwardingBatchRow {
  id: string;
  reference_code: string;
  institution_id: string;
  course_id: string;
  status: string;
  application_count: number;
  summary_filename: string;
  forwarded_at: string;
}

export function TraineeRecordsPage() {
  const profile = useAuthStore((s) => s.profile);
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const queryClient = useQueryClient();
  const [tab, setTab] = React.useState<'directory' | 'forwarding'>('directory');
  const [search, setSearch] = React.useState('');
  const [showArchived, setShowArchived] = React.useState(false);
  const [selectedRecord, setSelectedRecord] = React.useState<TraineeRecordRow | null>(null);
  const [editingRow, setEditingRow] = React.useState<TraineeRecordRow | null>(null);
  const [uliInput, setUliInput] = React.useState('');
  const [editReason, setEditReason] = React.useState('');
  const [duplicates, setDuplicates] = React.useState<DuplicateCandidateRow[]>([]);

  const canMutateRecords =
    profile?.role === 'registrar' ||
    profile?.role === 'institutional_administrator' ||
    profile?.role === 'system_administrator';

  const recordsQuery = useQuery<TraineeRecordRow[]>({
    queryKey: ['trainee-records', showArchived, isOnline, profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!isOnline || !isSupabaseConfigured || !client) {
        if (!profile?.id) return [];
        const cached = await offlineDb.cachedTraineeDirectory
          .where('userId')
          .equals(profile.id)
          .toArray();
        return cached
          .filter((row) => showArchived || !row.archivedAt)
          .map((row) => ({
            id: row.applicationId,
            reference_no: row.referenceNo,
            learner_user_id: row.learnerUserId,
            institution_id: row.institutionId,
            course_id: row.courseId,
            learner_name: row.learnerName,
            email: row.email,
            scholarship_package: row.scholarshipPackage,
            application_status: row.applicationStatus,
            record_completeness: row.recordCompleteness,
            scholar_id: row.scholarId,
            forwarding_id: row.forwardingId,
            archived_at: row.archivedAt,
            courses: { name: row.courseName, code: row.courseCode },
            institutions: { name: row.institutionName, code: row.institutionCode },
            learner_profiles: (row.learnerProfileJson as TraineeRecordRow['learner_profiles']) ?? null,
          }));
      }

      let query = client
        .from('enrollment_applications')
        .select(
          'id, reference_no, learner_user_id, institution_id, course_id, learner_name, email, application_status, record_completeness, scholar_id, forwarding_id, archived_at, courses(name, code), institutions(name, code)',
        )
        .order('created_at', { ascending: false })
        .limit(100);

      if (!showArchived) {
        query = query.is('archived_at', null);
      }

      const { data: appRows, error } = await query;
      if (error) throw new Error(error.message);
      const apps = (appRows ?? []) as TraineeRecordRow[];

      const userIds = Array.from(new Set(apps.map((a) => a.learner_user_id)));
      if (userIds.length === 0) return [];

      const { data: lpRows } = await client
        .from('learner_profiles')
        .select('*')
        .in('user_id', userIds);

      const lpByUser = new Map<string, TraineeRecordRow['learner_profiles']>();
      for (const lp of (lpRows ?? []) as Array<NonNullable<TraineeRecordRow['learner_profiles']> & { user_id: string }>) {
        lpByUser.set(lp.user_id, lp);
      }

      const hydrated = apps.map((a) => {
        const matchedLp = lpByUser.get(a.learner_user_id) ?? null;
        const pkg = typeof matchedLp?.scholarship_package === 'string' ? matchedLp.scholarship_package : null;
        return {
          ...a,
          scholarship_package: pkg,
          learner_profiles: matchedLp,
        };
      });

      // Keep local role-scoped directory synchronized safely for offline access
      if (profile?.id && !showArchived) {
        const nowIso = new Date().toISOString();
        await safeDexieWrite(() =>
          offlineDb.cachedTraineeDirectory.bulkPut(
            hydrated.map((h) => {
              const cObj = Array.isArray(h.courses) ? h.courses[0] : h.courses;
              const iObj = Array.isArray(h.institutions) ? h.institutions[0] : h.institutions;
              return {
                id: `${profile.id}:${h.id}`,
                userId: profile.id,
                applicationId: h.id,
                institutionId: h.institution_id,
                referenceNo: h.reference_no,
                learnerUserId: h.learner_user_id,
                learnerName: h.learner_name,
                email: h.email ?? '',
                courseId: h.course_id,
                courseName: cObj?.name ?? 'Program',
                courseCode: cObj?.code ?? 'TESDA',
                institutionName: iObj?.name ?? 'Institution',
                institutionCode: iObj?.code ?? 'INST',
                scholarshipPackage: h.scholarship_package ?? null,
                applicationStatus: h.application_status,
                recordCompleteness: h.record_completeness,
                scholarId: h.scholar_id,
                forwardingId: h.forwarding_id,
                archivedAt: h.archived_at,
                learnerProfileJson: (h.learner_profiles as Record<string, unknown>) ?? null,
                updatedAt: nowIso,
              };
            }),
          ),
        );
      }

      return hydrated;
    },
  });

  const forwardingsQuery = useQuery<ForwardingBatchRow[]>({
    queryKey: ['forwarding-batches'],
    enabled: isSupabaseConfigured && Boolean(profile?.id) && tab === 'forwarding',
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client) return [];
      const { data, error } = await client
        .from('enrollment_batch_forwardings')
        .select('id, reference_code, institution_id, course_id, status, application_count, summary_filename, forwarded_at')
        .order('forwarded_at', { ascending: false })
        .limit(50)
        .returns<ForwardingBatchRow[]>();
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const normalizedSearch = search.trim().toLowerCase();
  const filteredRows = (recordsQuery.data ?? []).filter((r) => {
    if (!normalizedSearch) return true;
    const uli = r.learner_profiles?.uli_number ?? '';
    return (
      r.learner_name.toLowerCase().includes(normalizedSearch) ||
      r.reference_no.toLowerCase().includes(normalizedSearch) ||
      (r.scholar_id ?? '').toLowerCase().includes(normalizedSearch) ||
      uli.toLowerCase().includes(normalizedSearch)
    );
  });

  const unforwardedConfirmed = (recordsQuery.data ?? []).filter(
    (r) => r.application_status === 'confirmed' && !r.archived_at && !r.forwarding_id && r.course_id,
  );

  const recordsPagination = usePagination({
    totalRecords: filteredRows.length,
    initialPageSize: 10,
  });
  const pagedRecords = filteredRows.slice(recordsPagination.startIndex, recordsPagination.endIndex);

  const forwardings = forwardingsQuery.data ?? [];
  const forwardingsPagination = usePagination({
    totalRecords: forwardings.length,
    initialPageSize: 10,
  });
  const pagedForwardings = forwardings.slice(forwardingsPagination.startIndex, forwardingsPagination.endIndex);

  const updateUliMutation = useMutation({
    mutationFn: async () => {
      const client = getSupabaseClient();
      if (!client || !profile || !editingRow) throw new Error('Select a trainee record first.');
      if (editingRow.application_status !== 'confirmed') {
        throw new Error('TESDA Main ULI can only be encoded AFTER enrollment status is Confirmed.');
      }
      if (editReason.trim().length < 5) {
        throw new Error('Provide an explicit audit reason (at least 5 characters) before modifying confirmed trainee ULI data.');
      }

      const { error: uliErr } = await client
        .from('learner_profiles')
        .update({
          uli_number: uliInput.trim() || null,
          uli_assigned_at: new Date().toISOString(),
          uli_assigned_by_user_id: profile.id,
        })
        .eq('user_id', editingRow.learner_user_id);
      if (uliErr) throw new Error(uliErr.message);

      await client.from('security_audit_logs').insert({
        actor_user_id: profile.id,
        institution_id: editingRow.institution_id,
        event: 'trainee_uli_updated',
        description: `Updated ULI for ${editingRow.reference_no}: ${editReason.trim()}`,
        metadata: {
          reference_no: editingRow.reference_no,
          learner_user_id: editingRow.learner_user_id,
          new_uli: uliInput.trim() || null,
          reason: editReason.trim(),
        },
      });
    },
    onSuccess: async () => {
      toast.success('Trainee ULI updated and audit reason logged.');
      setEditingRow(null);
      setUliInput('');
      setEditReason('');
      await queryClient.invalidateQueries({ queryKey: ['trainee-records'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const archiveToggleMutation = useMutation({
    mutationFn: async (row: TraineeRecordRow) => {
      const client = getSupabaseClient();
      if (!client || !profile) throw new Error('Authenticated Registrar session required.');
      const archiving = !row.archived_at;
      const { error } = await client
        .from('enrollment_applications')
        .update({
          archived_at: archiving ? new Date().toISOString() : null,
          archived_by_user_id: archiving ? profile.id : null,
          archive_reason: archiving ? 'Archived by Registrar record review' : 'Restored by Registrar record review',
        })
        .eq('id', row.id);
      if (error) throw new Error(error.message);
      await client.from('security_audit_logs').insert({
        actor_user_id: profile.id,
        institution_id: row.institution_id,
        event: archiving ? 'trainee_record_archived' : 'trainee_record_restored',
        description: `${archiving ? 'Archived' : 'Restored'} trainee record ${row.reference_no}.`,
      });
    },
    onSuccess: async () => {
      toast.success('Updated trainee record archive status and audit trail.');
      await queryClient.invalidateQueries({ queryKey: ['trainee-records'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const forwardBatchMutation = useMutation({
    mutationFn: async () => {
      const client = getSupabaseClient();
      if (!client || !profile) throw new Error('Authenticated Registrar session required.');
      const first = unforwardedConfirmed[0];
      if (!first) throw new Error('No confirmed unforwarded scholars available.');
      const matching = unforwardedConfirmed.filter(
        (r) => r.institution_id === first.institution_id && r.course_id === first.course_id,
      );
      const refCode = `FWD-${new Date().getUTCFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const filename = `${refCode}.csv`;
      const storagePath = `${first.institution_id}/forwardings/${filename}`;

      const csvHeader = ['Reference No', 'Scholar ID', 'Trainee Name'].map((h) => sanitizeCsvCell(h)).join(',');
      const csvRows = matching.map((r) => [r.reference_no, r.scholar_id ?? '', r.learner_name].map((c) => sanitizeCsvCell(c)).join(','));
      const csvBlob = new Blob([`\uFEFF${[csvHeader, ...csvRows].join('\n')}\n`], { type: 'text/csv;charset=utf-8;' });

      await client.storage.from('forwarding-summaries').upload(storagePath, csvBlob, {
        contentType: 'text/csv',
        upsert: false,
      });

      const { data: createdFwd, error: fwdErr } = await client
        .from('enrollment_batch_forwardings')
        .insert({
          reference_code: refCode,
          institution_id: first.institution_id,
          course_id: first.course_id,
          forwarded_by_user_id: profile.id,
          application_count: matching.length,
          summary_path: storagePath,
          summary_filename: filename,
        })
        .select('id')
        .single();
      if (fwdErr || !createdFwd) throw new Error(fwdErr?.message ?? 'Failed to record batch forwarding.');

      const { error: linkErr } = await client
        .from('enrollment_applications')
        .update({ forwarding_id: createdFwd.id })
        .in('id', matching.map((m) => m.id));
      if (linkErr) throw new Error(linkErr.message);
    },
    onSuccess: async () => {
      toast.success('Forwarded confirmed scholar cohort cleanly.');
      await queryClient.invalidateQueries({ queryKey: ['trainee-records'] });
      await queryClient.invalidateQueries({ queryKey: ['forwarding-batches'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  async function handleCheckDuplicates(row: TraineeRecordRow) {
    const client = getSupabaseClient();
    if (!client) return;
    const first = row.learner_profiles?.first_name ?? row.learner_name.split(' ')[0] ?? '';
    const last = row.learner_profiles?.last_name ?? row.learner_name.split(' ').slice(-1)[0] ?? '';

    const { data, error } = (await client.rpc('detect_duplicate_learner_candidates', {
      p_institution_id: row.institution_id,
      p_first_name: first,
      p_last_name: last,
      p_birthdate: row.learner_profiles?.birthdate ?? null,
      p_email: null,
      p_uli_number: row.learner_profiles?.uli_number ?? null,
      p_exclude_user_id: row.learner_user_id,
    })) as { data: DuplicateCandidateRow[] | null; error: { message: string } | null };

    if (error) {
      toast.error(error.message);
      return;
    }
    const found = data ?? [];
    setDuplicates(found);
    if (found.length === 0) {
      toast.success(`No duplicate profile candidates detected for ${row.learner_name}.`);
    } else {
      toast.warning(`Detected ${found.length} potential duplicate candidate(s) for manual registrar review.`);
    }
  }

  function handleDownloadForwardingCsv() {
    const headers = ['Reference No', 'Trainee Name', 'Scholar ID', 'ULI Number', 'Status'];
    const lines = [
      headers.map((h) => sanitizeCsvCell(h)).join(','),
      ...filteredRows.map((row) =>
        [
          row.reference_no,
          row.learner_name,
          row.scholar_id ?? 'Unassigned',
          row.learner_profiles?.uli_number ?? 'Pending ULI',
          row.application_status,
        ]
          .map((cell) => sanitizeCsvCell(cell))
          .join(','),
      ),
    ];
    const csv = `${lines.join('\n')}\n`;
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `forwarding-batch-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredRows.length} trainee row(s) into formula-safe UTF-8 CSV.`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Users className="h-6 w-6 text-teal-700" />
            Trainee Records, ULI &amp; Batch Forwarding
          </h1>
          <p className="text-sm text-slate-500">
            Search, filter, archive/restore with audit reasons, ULI verification, duplicate checks, and forwarded cohorts.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant={tab === 'directory' ? 'secondary' : 'outline'} onClick={() => setTab('directory')}>
            Trainee Directory
          </Button>
          <Button type="button" size="sm" variant={tab === 'forwarding' ? 'secondary' : 'outline'} onClick={() => setTab('forwarding')}>
            Forwarded Batches ({unforwardedConfirmed.length} Ready)
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void downloadMis0301Pdf(createEmptyMis0301Values(), 'blank')}
          >
            <Download className="h-3.5 w-3.5" /> Blank MIS 03-01 PDF
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={handleDownloadForwardingCsv}>
            Export CSV
          </Button>
        </div>
      </div>

      {!canMutateRecords && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
          Read-only view: Only Registrar and Administrators may edit trainee profiles, ULI, and documents.
        </div>
      )}

      {selectedRecord && (
        <StudentDossierDrawer
          record={selectedRecord}
          canEdit={canMutateRecords}
          onClose={() => setSelectedRecord(null)}
          onUpdated={async () => {
            const refreshed = await queryClient.fetchQuery<TraineeRecordRow[]>({
              queryKey: ['trainee-records', showArchived],
            });
            const latest = refreshed?.find((r) => r.id === selectedRecord.id) ?? null;
            setSelectedRecord(latest);
          }}
        />
      )}

      {tab === 'directory' && (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center gap-3 p-4">
              <div className="relative min-w-[240px] flex-1">
                <Search className="absolute top-2.5 left-3 h-4 w-4 text-slate-400" />
                <Input
                  className="pl-9"
                  placeholder="Search trainee name, reference no, scholar ID, or ULI..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
                <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
                Include Archived Records
              </label>
            </CardContent>
          </Card>

          {editingRow && canMutateRecords && (
            <Card className="border-teal-300 bg-teal-50/40">
              <CardHeader>
                <CardTitle className="text-base">Update ULI for {editingRow.learner_name}</CardTitle>
                <CardDescription>
                  Reference: {editingRow.reference_no}. A mandatory reason is logged immutably to security_audit_logs.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="uli_input">Unique Learner Identifier (ULI)</Label>
                  <Input id="uli_input" value={uliInput} onChange={(e) => setUliInput(e.target.value)} placeholder="e.g., TESDA-ULI-2026-001" />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <Label htmlFor="edit_reason">Audit Reason (Mandatory)</Label>
                  <Input id="edit_reason" value={editReason} onChange={(e) => setEditReason(e.target.value)} placeholder="Verified against registry" />
                </div>
                <div className="flex gap-2 md:col-span-3">
                  <Button type="button" size="sm" disabled={updateUliMutation.isPending} onClick={() => updateUliMutation.mutate()}>
                    {updateUliMutation.isPending ? 'Saving...' : 'Save ULI & Audit Entry'}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setEditingRow(null)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {duplicates.length > 0 && (
            <Card className="border-amber-300 bg-amber-50">
              <CardHeader>
                <CardTitle className="text-sm text-amber-900">Duplicate Candidates Found (Manual Review Required)</CardTitle>
                <CardDescription>TCTESDAConnect never auto-merges learner profiles by name alone.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1.5 text-xs text-amber-900">
                {duplicates.map((d) => (
                  <div key={d.profile_id} className="rounded border border-amber-200 bg-white px-3 py-2">
                    <strong>{d.full_name}</strong> • ULI: {d.uli_number ?? 'None'} • Reason: {d.match_reason}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Trainee Records Directory ({filteredRows.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {recordsQuery.isFetching ? (
                <p className="text-sm text-slate-500">Loading trainee records...</p>
              ) : filteredRows.length === 0 ? (
                <div className="flex items-start gap-2.5 text-sm text-slate-600">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  <span>
                    {isSupabaseConfigured
                      ? 'No trainee records match the active search or archive filter.'
                      : 'Connect Supabase PostgreSQL environment to query live trainee records, verify ULI uniqueness, and audit updates.'}
                  </span>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                        <th className="py-2 pr-4">Reference</th>
                        <th className="py-2 pr-4">Trainee</th>
                        <th className="py-2 pr-4">Scholar ID</th>
                        <th className="py-2 pr-4">ULI</th>
                        <th className="py-2 pr-4">Status</th>
                        <th className="py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pagedRecords.map((row) => (
                        <tr key={row.id}>
                          <td className="py-2.5 pr-4 font-mono text-xs">{row.reference_no}</td>
                          <td className="py-2.5 pr-4 font-medium">{row.learner_name}</td>
                          <td className="py-2.5 pr-4 font-mono text-xs">{row.scholar_id ?? 'Pending'}</td>
                          <td className="py-2.5 pr-4 font-mono text-xs">{row.learner_profiles?.uli_number ?? 'Unassigned'}</td>
                          <td className="py-2.5 pr-4 capitalize">{row.application_status}</td>
                          <td className="py-2.5">
                            <div className="flex flex-wrap gap-1.5">
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => setSelectedRecord(row)}
                              >
                                <Eye className="h-3.5 w-3.5" /> View / Edit Record &amp; Docs
                              </Button>
                              {canMutateRecords && (
                                <>
                                  {row.application_status === 'confirmed' ? (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        setEditingRow(row);
                                        setUliInput(row.learner_profiles?.uli_number ?? '');
                                        setEditReason('');
                                      }}
                                    >
                                      Encode ULI
                                    </Button>
                                  ) : (
                                    <span
                                      className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800"
                                      title="TESDA Main ULI can only be encoded after enrollment confirmation."
                                    >
                                      <Lock className="h-3 w-3" /> ULI Locked
                                    </span>
                                  )}
                                  <Button type="button" size="sm" variant="ghost" onClick={() => archiveToggleMutation.mutate(row)}>
                                    <Archive className="h-3.5 w-3.5" /> {row.archived_at ? 'Restore' : 'Archive'}
                                  </Button>
                                </>
                              )}
                              <Button type="button" size="sm" variant="ghost" onClick={() => handleCheckDuplicates(row)}>
                                Check Duplicates
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 border-t border-slate-100 pt-4">
                  <Pagination
                    currentPage={recordsPagination.currentPage}
                    totalPages={recordsPagination.totalPages}
                    totalRecords={filteredRows.length}
                    pageSize={recordsPagination.pageSize}
                    onPageChange={recordsPagination.goToPage}
                    onPageSizeChange={recordsPagination.setPageSize}
                  />
                </div>
              </>
            )}
            </CardContent>
          </Card>
        </>
      )}

      {tab === 'forwarding' && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Confirmed Batch Forwarding (`enrollment_batch_forwardings`)</CardTitle>
              <CardDescription>Groups confirmed institutional scholars by course for training batch assignment.</CardDescription>
            </div>
            {canMutateRecords && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={forwardBatchMutation.isPending || unforwardedConfirmed.length === 0}
                onClick={() => forwardBatchMutation.mutate()}
              >
                <Send className="h-3.5 w-3.5" /> Forward Ready Confirmed Scholars ({unforwardedConfirmed.length})
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {forwardings.length === 0 ? (
              <p className="text-slate-500">
                {isSupabaseConfigured ? 'No forwarding batches logged yet.' : 'Connect Supabase to record and audit confirmed batch forwardings.'}
              </p>
            ) : (
              <>
                {pagedForwardings.map((fwd) => (
                  <div key={fwd.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                    <div>
                      <p className="font-mono text-xs font-semibold text-teal-800">{fwd.reference_code}</p>
                      <p className="text-xs text-slate-500">
                        {fwd.application_count} scholar(s) • {fwd.summary_filename} • {formatShortDateTime(fwd.forwarded_at)}
                      </p>
                    </div>
                    <Badge variant="info">{fwd.status}</Badge>
                  </div>
                ))}

                <div className="mt-4 border-t border-slate-100 pt-4">
                  <Pagination
                    currentPage={forwardingsPagination.currentPage}
                    totalPages={forwardingsPagination.totalPages}
                    totalRecords={forwardings.length}
                    pageSize={forwardingsPagination.pageSize}
                    onPageChange={forwardingsPagination.goToPage}
                    onPageSizeChange={forwardingsPagination.setPageSize}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
