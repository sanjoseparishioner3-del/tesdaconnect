import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, FileSpreadsheet, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Pagination, usePagination } from '@/components/ui/pagination';
import { offlineDb } from '@/lib/db/dexie';
import { isSupabaseConfigured } from '@/lib/env';
import {
  exportTraineeReportExcel,
  exportTraineeReportPdf,
  type ReportMetadata,
  type TraineeSummaryRow,
} from '@/lib/reports/exportReports';
import { getSupabaseClient } from '@/lib/supabase';
import { asText } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useConnectivityStore } from '@/stores/connectivityStore';

const REPORT_TYPES = [
  { id: 'trainee-summary', title: 'Trainee Summary Report', desc: 'Authorized trainee profile statuses, course assignments, and scholar IDs.' },
  { id: 'batch-summary', title: 'Training Batch Summary Report', desc: 'Capacity, enrolled headcount, venue, and schedule status across BST & MIF.' },
  { id: 'incomplete-records', title: 'Incomplete Record Report', desc: 'Applications below 100% completeness awaiting missing MIS 03-01 inputs.' },
  { id: 'missing-documents', title: 'Missing / Rejected Document Report', desc: 'Pending or rejected learner uploads requiring registrar follow-up.' },
  { id: 'schedule-report', title: 'Training Schedule Report', desc: 'Date ranges, next class sessions, and overlap compliance checks.' },
  { id: 'institution-summary', title: 'Institution-Level Summary Report', desc: 'Campus-level totals, intake capacity, and duration readiness.' },
] as const;

type ReportId = (typeof REPORT_TYPES)[number]['id'];

export function ReportsPage() {
  const profile = useAuthStore((s) => s.profile);
  const { isOnline, lastSyncedAt } = useConnectivityStore();
  const [selectedReport, setSelectedReport] = React.useState<ReportId>('trainee-summary');
  const [institutionFilter, setInstitutionFilter] = React.useState<'ALL' | 'BST' | 'MIF'>('ALL');
  const [exporting, setExporting] = React.useState<'excel' | 'pdf' | null>(null);

  const reportQuery = useQuery<TraineeSummaryRow[]>({
    queryKey: ['report-dataset', selectedReport, institutionFilter, isOnline, profile?.id],
    enabled: Boolean(profile?.id),
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client || !isSupabaseConfigured || !isOnline) {
        if (!profile?.id) return [];

        if (selectedReport === 'institution-summary') {
          return (profile.institutions ?? [])
            .filter((i) => institutionFilter === 'ALL' || i.code === institutionFilter)
            .map((i) => ({
              referenceNo: i.code,
              scholarId: null,
              uliNumber: null,
              fullName: i.name,
              courseName: 'Assigned Campus Scope',
              status: 'active',
              completeness: 100,
              missingRequirements: 'Cached Offline Snapshot',
            }));
        }

        if (selectedReport === 'schedule-report' || selectedReport === 'batch-summary') {
          const cached = await offlineDb.cachedSchedules.where('userId').equals(profile.id).toArray();
          return cached
            .filter((s) => institutionFilter === 'ALL' || s.institutionCode === institutionFilter)
            .map((s) => ({
              referenceNo: s.batchCode,
              scholarId: null,
              uliNumber: null,
              fullName: s.batchName,
              courseName: s.courseName,
              status: s.status,
              completeness: 100,
              missingRequirements: `${s.venue ?? 'Venue TBD'} (Offline Cache)`,
            }));
        }

        if (selectedReport === 'missing-documents') {
          const cachedDocs = await offlineDb.cachedDocuments
            .where('ownerUserId')
            .equals(profile.id)
            .filter((d) => d.status === 'pending' || d.status === 'rejected' || d.queuedUpload)
            .toArray();
          return cachedDocs.map((d) => ({
            referenceNo: d.targetUserId.slice(0, 8).toUpperCase(),
            scholarId: null,
            uliNumber: null,
            fullName: d.originalName,
            courseName: d.documentType,
            status: d.queuedUpload ? 'queued_offline' : d.status,
            completeness: d.status === 'rejected' ? 0 : 50,
            missingRequirements: d.remarks ?? 'Offline document snapshot',
          }));
        }

        const cachedDir = await offlineDb.cachedTraineeDirectory
          .where('userId')
          .equals(profile.id)
          .toArray();

        const filteredDir = cachedDir.filter((r) => {
          const matchesInst = institutionFilter === 'ALL' || r.institutionCode === institutionFilter;
          if (!matchesInst) return false;
          if (selectedReport === 'incomplete-records') return r.recordCompleteness < 100;
          return true;
        });

        if (filteredDir.length > 0) {
          return filteredDir.map((r) => ({
            referenceNo: r.referenceNo,
            scholarId: r.scholarId,
            uliNumber: typeof r.learnerProfileJson?.uli_number === 'string' ? r.learnerProfileJson.uli_number : null,
            fullName: r.learnerName,
            courseName: r.courseName,
            status: r.applicationStatus,
            completeness: r.recordCompleteness,
            missingRequirements: 'Cached Offline Directory Snapshot',
          }));
        }

        // Learner fallback using cached own application snapshot
        const ownSnap = await offlineDb.cachedLearnerRecords.get(profile.id);
        if (ownSnap?.enrollmentApp) {
          const app = ownSnap.enrollmentApp;
          return [
            {
              referenceNo: asText(app.reference_no, 'OWN-APP'),
              scholarId: typeof app.scholar_id === 'string' ? app.scholar_id : null,
              uliNumber: null,
              fullName: asText(app.learner_name, profile.fullName),
              courseName: 'Enrolled Program',
              status: asText(app.application_status, 'draft'),
              completeness: Number(app.record_completeness ?? 0),
              missingRequirements: 'Cached Personal Snapshot',
            },
          ];
        }

        return [];
      }

      if (selectedReport === 'institution-summary') {
        const { data, error } = await client
          .from('institutions')
          .select('code, name, address, is_active')
          .order('code', { ascending: true });
        if (error) throw new Error(error.message);
        return ((data ?? []) as Array<{ code: string; name: string; address: string | null; is_active: boolean }>)
          .filter((i) => institutionFilter === 'ALL' || i.code === institutionFilter)
          .map((i) => ({
            referenceNo: i.code,
            scholarId: null,
            uliNumber: null,
            fullName: i.name,
            courseName: i.address ?? 'Occidental Mindoro',
            status: i.is_active ? 'active' : 'inactive',
            completeness: 100,
            missingRequirements: 'Scoped institutional directory',
          }));
      }

      if (selectedReport === 'batch-summary' || selectedReport === 'schedule-report') {
        const { data, error } = await client
          .from('training_batches')
          .select('code, name, venue, status, capacity, starts_at, ends_at, courses(name), institutions(code)')
          .is('archived_at', null)
          .order('starts_at', { ascending: true })
          .limit(100);
        if (error) throw new Error(error.message);

        return ((data ?? []) as Array<{
          code: string;
          name: string;
          venue: string | null;
          status: string;
          capacity: number;
          starts_at: string | null;
          ends_at: string | null;
          courses: { name: string } | Array<{ name: string }> | null;
          institutions: { code: string } | Array<{ code: string }> | null;
        }>)
          .filter((b) => {
            const inst = Array.isArray(b.institutions) ? b.institutions[0] : b.institutions;
            return institutionFilter === 'ALL' || inst?.code === institutionFilter;
          })
          .map((b) => {
            const course = Array.isArray(b.courses) ? b.courses[0] : b.courses;
            return {
              referenceNo: b.code,
              scholarId: `${b.capacity} seats`,
              uliNumber: b.starts_at ? `${b.starts_at} → ${b.ends_at ?? 'TBD'}` : 'Unscheduled',
              fullName: b.name,
              courseName: course?.name ?? 'Program',
              status: b.status,
              completeness: 100,
              missingRequirements: b.venue ?? 'Venue TBD',
            };
          });
      }

      if (selectedReport === 'missing-documents') {
        const { data, error } = await client
          .from('learner_documents')
          .select('document_type, original_name, status, remarks, user_id')
          .in('status', ['pending', 'rejected'])
          .order('created_at', { ascending: false })
          .limit(100);
        if (error) throw new Error(error.message);

        return ((data ?? []) as Array<{
          document_type: string;
          original_name: string;
          status: string;
          remarks: string | null;
          user_id: string;
        }>).map((d) => ({
          referenceNo: d.user_id.slice(0, 8).toUpperCase(),
          scholarId: null,
          uliNumber: null,
          fullName: d.original_name,
          courseName: d.document_type,
          status: d.status,
          completeness: d.status === 'rejected' ? 0 : 50,
          missingRequirements: d.remarks ?? 'Awaiting registrar verification',
        }));
      }

      let query = client
        .from('enrollment_applications')
        .select('reference_no, scholar_id, learner_name, application_status, record_completeness, remarks, courses(name)')
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(150);

      if (selectedReport === 'incomplete-records') {
        query = query.lt('record_completeness', 100);
      }

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      return ((data ?? []) as Array<{
        reference_no: string;
        scholar_id: string | null;
        learner_name: string;
        application_status: string;
        record_completeness: number;
        remarks: string | null;
        courses: { name: string } | Array<{ name: string }> | null;
      }>).map((row) => {
        const course = Array.isArray(row.courses) ? row.courses[0] : row.courses;
        return {
          referenceNo: row.reference_no,
          scholarId: row.scholar_id,
          uliNumber: null,
          fullName: row.learner_name,
          courseName: course?.name ?? 'Unassigned Course',
          status: row.application_status,
          completeness: row.record_completeness,
          missingRequirements: row.remarks ?? (row.record_completeness < 100 ? 'Incomplete MIS 03-01 inputs' : 'Complete'),
        };
      });
    },
  });

  const reportRows = reportQuery.data ?? [];
  const reportsPagination = usePagination({
    totalRecords: reportRows.length,
    initialPageSize: 10,
  });
  const pagedReports = reportRows.slice(reportsPagination.startIndex, reportsPagination.endIndex);

  const metadata: ReportMetadata = React.useMemo(
    () => ({
      reportTitle: REPORT_TYPES.find((r) => r.id === selectedReport)?.title ?? 'Operations Report',
      institutionLabel: profile?.institutions?.[0]?.name ?? 'Scoped Institution',
      generatedBy: profile?.fullName ?? 'Authorized Staff',
      isOfflineSnapshot: !isOnline,
      lastSyncedAt,
    }),
    [selectedReport, profile, isOnline, lastSyncedAt],
  );

  async function handleExportExcel() {
    setExporting('excel');
    try {
      await exportTraineeReportExcel(reportRows, metadata);
      toast.success('Excel (.xlsx) report exported via ExcelJS.');
    } finally {
      setExporting(null);
    }
  }

  async function handleExportPdf() {
    setExporting('pdf');
    try {
      await exportTraineeReportPdf(reportRows, metadata);
      toast.success('PDF report exported via pdf-lib.');
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reports & Exports</h1>
          <p className="text-sm text-slate-500">
            Validated institutional reporting generated with ExcelJS and pdf-lib. Offline exports are labeled explicitly.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter report by institution"
            value={institutionFilter}
            onChange={(e) => setInstitutionFilter(e.target.value as 'ALL' | 'BST' | 'MIF')}
            className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm"
          >
            <option value="ALL">All Authorized Institutions</option>
            <option value="BST">BST Only</option>
            <option value="MIF">MIF Only</option>
          </select>
          <Badge variant={isOnline ? 'success' : 'warning'}>
            {isOnline ? 'Online Verified Data' : 'Offline Cache Mode (Labeled)'}
          </Badge>
        </div>
      </div>

      {!isOnline && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <span>
            You are offline. Any exported PDF or Excel file will include a warning banner stating that the data reflects locally cached snapshots rather than live server records.
          </span>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        {REPORT_TYPES.map((rep) => (
          <Card
            key={rep.id}
            onClick={() => setSelectedReport(rep.id)}
            className={`cursor-pointer transition ${
              selectedReport === rep.id ? 'border-teal-600 ring-2 ring-teal-600/20' : 'hover:border-slate-300'
            }`}
          >
            <CardHeader className="p-4">
              <CardTitle className="text-sm">{rep.title}</CardTitle>
              <CardDescription className="text-xs">{rep.desc}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>{metadata.reportTitle}</CardTitle>
            <CardDescription>
              Preview of authorized records matching selected institutional filters ({reportRows.length} rows loaded).
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={exporting !== null} onClick={handleExportExcel}>
              <FileSpreadsheet className="h-4 w-4" />
              {exporting === 'excel' ? 'Generating Excel...' : 'Export Excel (.xlsx)'}
            </Button>
            <Button type="button" variant="secondary" size="sm" disabled={exporting !== null} onClick={handleExportPdf}>
              <FileText className="h-4 w-4" />
              {exporting === 'pdf' ? 'Generating PDF...' : 'Export PDF (.pdf)'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {reportQuery.isFetching ? (
            <p className="text-sm text-slate-500">Loading authorized dataset from Supabase PostgreSQL...</p>
          ) : reportRows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              {isSupabaseConfigured
                ? 'No matching rows returned for this report filter. Header & watermark templates can still be exported.'
                : 'Connect Supabase PostgreSQL environment to populate live report rows. Export buttons remain testable right now.'}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="py-2 pr-4">Reference</th>
                    <th className="py-2 pr-4">Name / Title</th>
                    <th className="py-2 pr-4">Course / Type</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Completeness</th>
                    <th className="py-2">Notes / Venue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedReports.map((r, idx) => (
                    <tr key={`${r.referenceNo}-${idx}`}>
                      <td className="py-2 pr-4 font-mono text-xs">{r.referenceNo}</td>
                      <td className="py-2 pr-4 font-medium">{r.fullName}</td>
                      <td className="py-2 pr-4">{r.courseName}</td>
                      <td className="py-2 pr-4 capitalize">{r.status}</td>
                      <td className="py-2 pr-4">{r.completeness}%</td>
                      <td className="py-2 text-xs text-slate-600">{r.missingRequirements}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 border-t border-slate-100 pt-4">
              <Pagination
                currentPage={reportsPagination.currentPage}
                totalPages={reportsPagination.totalPages}
                totalRecords={reportRows.length}
                pageSize={reportsPagination.pageSize}
                onPageChange={reportsPagination.goToPage}
                onPageSizeChange={reportsPagination.setPageSize}
              />
            </div>
          </>
        )}
        </CardContent>
      </Card>
    </div>
  );
}
