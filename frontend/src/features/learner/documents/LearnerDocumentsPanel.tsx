import React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  CloudOff,
  Download,
  Eye,
  FileText,
  KeyRound,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { AppDialog } from '@/components/ui/dialog';
import { offlineDb } from '@/lib/db/dexie';
import { ACCEPTED_DOCUMENT_EXTENSIONS, DocumentValidationError } from '@/lib/documents/prepareDocumentFile';
import {
  cancelDocumentUpload,
  removeUnsubmittedDocument,
  requeueDocumentUpload,
  saveDocumentForUpload,
  useUploadProgressStore,
} from '@/lib/documents/uploadQueue';
import { getSupabaseClient } from '@/lib/supabase';
import { refreshReactiveQueueCounts } from '@/lib/sync/connectivityMonitor';
import { flushQueuedOfflineDocuments } from '@/lib/sync/supabaseTransport';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useConnectivityStore } from '@/stores/connectivityStore';
import {
  fileRequirementStatus,
  LEARNER_DOCUMENTS_QUERY_KEY,
  matchesFilter,
  type LearnerDocumentFile,
  type RequirementFilter,
  type RequirementRow,
  type RequirementStatus,
  useLearnerDocuments,
} from './learnerDocuments';

const STATUS_META: Record<RequirementStatus, { label: string; className: string; Icon: React.ComponentType<{ className?: string }> }> = {
  missing: { label: 'Missing', className: 'bg-slate-100 text-slate-600', Icon: CircleDashed },
  saved_offline: { label: 'Saved offline', className: 'bg-slate-100 text-slate-700', Icon: CloudOff },
  pending_sync: { label: 'Pending sync', className: 'bg-amber-50 text-amber-800', Icon: CloudOff },
  uploading: { label: 'Uploading', className: 'bg-sky-50 text-sky-800', Icon: Loader2 },
  failed: { label: 'Failed', className: 'bg-red-50 text-red-700', Icon: AlertTriangle },
  auth_required: { label: 'Sign-in needed', className: 'bg-amber-50 text-amber-800', Icon: KeyRound },
  submitted: { label: 'Submitted', className: 'bg-teal-50 text-teal-800', Icon: CheckCircle2 },
  verified: { label: 'Verified', className: 'bg-emerald-50 text-emerald-800', Icon: ShieldCheck },
  returned: { label: 'Returned', className: 'bg-red-50 text-red-700', Icon: AlertTriangle },
};

const FILTERS: Array<{ key: RequirementFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'missing', label: 'Missing' },
  { key: 'pending', label: 'Pending' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'verified', label: 'Verified' },
];

function formatBytes(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatusChip({ status, percent }: { status: RequirementStatus; percent?: number }) {
  const meta = STATUS_META[status];
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', meta.className)}>
      <meta.Icon className={cn('h-3 w-3', status === 'uploading' && 'animate-spin')} aria-hidden="true" />
      {status === 'uploading' && typeof percent === 'number' ? `${percent}%` : meta.label}
    </span>
  );
}

/** Opens a document from the device, or fetches it once (online) and keeps it for offline use. */
async function resolveFileBlob(file: LearnerDocumentFile, userId: string, isOnline: boolean): Promise<Blob | null> {
  if (file.localBlob) return file.localBlob;
  const client = getSupabaseClient();
  if (!isOnline || !client || !file.storage_path) return null;
  const { data, error } = await client.storage.from('learner-documents').download(file.storage_path);
  if (error || !data) throw new Error(error?.message ?? 'Unable to load the file.');
  await offlineDb.cachedDocuments
    .update(file.id, { blob: data })
    .then((updated) =>
      updated
        ? undefined
        : offlineDb.cachedDocuments.put({
            id: file.id,
            ownerUserId: userId,
            targetUserId: userId,
            institutionId: 'INST',
            documentType: file.document_type,
            originalName: file.original_name,
            mimeType: file.mime_type ?? data.type,
            sizeBytes: file.size_bytes ?? data.size,
            status: file.status,
            remarks: file.remarks,
            storagePath: file.storage_path,
            blob: data,
            queuedUpload: false,
            uploadState: 'submitted',
            syncedAt: new Date().toISOString(),
          }),
    )
    .catch(() => undefined);
  return data;
}

export function LearnerDocumentsPanel() {
  const profile = useAuthStore((s) => s.profile);
  const activeInstitutionId = useAuthStore((s) => s.activeInstitutionId);
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const userId = profile?.id;
  const queryClient = useQueryClient();
  const { rows, compliance, isLoading, files } = useLearnerDocuments(userId, isOnline);
  const progress = useUploadProgressStore((s) => s.progress);

  const [filter, setFilter] = React.useState<RequirementFilter>('all');
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [savingKey, setSavingKey] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<{ url: string; name: string; isImage: boolean } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const pickTargetRef = React.useRef<string | null>(null);

  // Refresh server rows whenever a queued file has been confirmed and left the queue.
  const queuedCount = files.filter((f) => f.queuedUpload).length;
  const previousQueued = React.useRef(queuedCount);
  React.useEffect(() => {
    if (queuedCount < previousQueued.current) {
      void queryClient.invalidateQueries({ queryKey: [LEARNER_DOCUMENTS_QUERY_KEY] });
    }
    previousQueued.current = queuedCount;
  }, [queuedCount, queryClient]);

  React.useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview.url);
  }, [preview]);

  const startSync = React.useCallback(() => {
    if (!userId) return;
    void flushQueuedOfflineDocuments(userId)
      .then((sent) => {
        if (sent > 0) toast.success(sent === 1 ? 'Document submitted.' : `${sent} documents submitted.`);
      })
      .catch(() => undefined);
  }, [userId]);

  function openPicker(requirementKey: string, source: 'file' | 'camera') {
    pickTargetRef.current = requirementKey;
    (source === 'camera' ? cameraInputRef : fileInputRef).current?.click();
  }

  async function handleFilesSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = '';
    const requirementKey = pickTargetRef.current;
    if (!selected.length || !requirementKey || !userId) return;

    setSavingKey(requirementKey);
    let saved = 0;
    for (const file of selected) {
      try {
        await saveDocumentForUpload({
          userId,
          institutionId: activeInstitutionId ?? profile?.institutions?.[0]?.institutionId ?? null,
          documentType: requirementKey,
          file,
        });
        saved += 1;
      } catch (err) {
        toast.error(err instanceof DocumentValidationError || err instanceof Error ? err.message : 'Could not save the file.');
      }
    }
    setSavingKey(null);
    if (saved === 0) return;

    setExpanded(requirementKey);
    await refreshReactiveQueueCounts(userId);
    toast.success(isOnline ? 'Saved. Uploading in the background…' : 'Saved on this device. It will be sent when you are back online.');
    if (isOnline) startSync();
  }

  async function handleView(file: LearnerDocumentFile, mode: 'view' | 'download') {
    if (!userId) return;
    try {
      const blob = await resolveFileBlob(file, userId, isOnline);
      if (!blob) {
        toast.error('This file is not saved on this device yet. Open it once while online.');
        return;
      }
      const url = URL.createObjectURL(blob);
      const isImage = (file.mime_type ?? blob.type).startsWith('image/');
      if (mode === 'view' && isImage) {
        setPreview({ url, name: file.original_name, isImage });
        return;
      }
      const a = document.createElement('a');
      a.href = url;
      if (mode === 'download' || !isImage) a.download = file.original_name;
      if (mode === 'view') a.target = '_blank';
      a.rel = 'noopener';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to open the file.');
    }
  }

  async function handleRetry(file: LearnerDocumentFile) {
    await requeueDocumentUpload(file.id);
    if (userId) await refreshReactiveQueueCounts(userId);
    if (isOnline) startSync();
    else toast.info('It will be sent automatically when you are back online.');
  }

  async function handleCancel(file: LearnerDocumentFile) {
    await cancelDocumentUpload(file.id);
    if (userId) await refreshReactiveQueueCounts(userId);
  }

  async function handleRemove(file: LearnerDocumentFile) {
    if (!window.confirm(`Remove "${file.original_name}" from this device? It has not been submitted.`)) return;
    await removeUnsubmittedDocument(file.id);
    if (userId) await refreshReactiveQueueCounts(userId);
  }

  const visibleRows = rows.filter((r) => matchesFilter(r.status, filter));
  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, rows.filter((r) => matchesFilter(r.status, f.key)).length])) as Record<
    RequirementFilter,
    number
  >;
  const percent = compliance.requiredTotal ? Math.round((compliance.submitted / compliance.requiredTotal) * 100) : 0;

  return (
    <section aria-labelledby="documents-heading" className="space-y-3">
      <input ref={fileInputRef} type="file" accept={ACCEPTED_DOCUMENT_EXTENSIONS} multiple className="hidden" onChange={(e) => void handleFilesSelected(e)} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void handleFilesSelected(e)} />

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 id="documents-heading" className="text-base font-semibold text-slate-900">
              Documentary requirements
            </h2>
            <p className="text-xs text-slate-500">
              {compliance.submitted} of {compliance.requiredTotal} required submitted
              {compliance.verified > 0 ? ` · ${compliance.verified} verified` : ''}
              {compliance.waiting > 0 ? ` · ${compliance.waiting} waiting to send` : ''}
            </p>
          </div>
          <span className={cn('text-lg font-bold', compliance.complete ? 'text-emerald-700' : 'text-[#0f295c]')}>{percent}%</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Required documents submitted">
          <div className={cn('h-full rounded-full transition-all', compliance.complete ? 'bg-emerald-500' : 'bg-teal-600')} style={{ width: `${percent}%` }} />
        </div>
        <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Filter requirements">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                filter === f.key ? 'border-[#0f295c] bg-[#0f295c] text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              )}
            >
              {f.label} <span className={filter === f.key ? 'text-white/70' : 'text-slate-400'}>{counts[f.key]}</span>
            </button>
          ))}
        </div>
      </div>

      <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {isLoading &&
          [0, 1, 2, 3].map((i) => (
            <li key={i} className="flex items-center gap-3 p-4" aria-hidden="true">
              <div className="h-9 w-9 animate-pulse rounded-lg bg-slate-100" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-1/4 animate-pulse rounded bg-slate-100" />
              </div>
            </li>
          ))}
        {!isLoading && visibleRows.length === 0 && (
          <li className="p-6 text-center text-sm text-slate-500">No requirements in this filter.</li>
        )}
        {!isLoading &&
          visibleRows.map((row) => (
            <RequirementItem
              key={row.key}
              row={row}
              isExpanded={expanded === row.key}
              isSaving={savingKey === row.key}
              progress={progress}
              onToggle={() => setExpanded((cur) => (cur === row.key ? null : row.key))}
              onPick={(source) => openPicker(row.key, source)}
              onView={(f) => void handleView(f, 'view')}
              onDownload={(f) => void handleView(f, 'download')}
              onRetry={(f) => void handleRetry(f)}
              onCancel={(f) => void handleCancel(f)}
              onRemove={(f) => void handleRemove(f)}
            />
          ))}
      </ul>

      <AppDialog open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)} title={preview?.name ?? 'Preview'}>
        {preview?.isImage && <img src={preview.url} alt={preview.name} className="mx-auto max-h-[60dvh] w-auto rounded-lg object-contain" />}
      </AppDialog>
    </section>
  );
}

function RequirementItem({
  row,
  isExpanded,
  isSaving,
  progress,
  onToggle,
  onPick,
  onView,
  onDownload,
  onRetry,
  onCancel,
  onRemove,
}: {
  row: RequirementRow;
  isExpanded: boolean;
  isSaving: boolean;
  progress: Record<string, { loaded: number; total: number }>;
  onToggle: () => void;
  onPick: (source: 'file' | 'camera') => void;
  onView: (f: LearnerDocumentFile) => void;
  onDownload: (f: LearnerDocumentFile) => void;
  onRetry: (f: LearnerDocumentFile) => void;
  onCancel: (f: LearnerDocumentFile) => void;
  onRemove: (f: LearnerDocumentFile) => void;
}) {
  const newest = row.files[0];
  const p = newest ? progress[newest.id] : undefined;
  const percent = p && p.total ? Math.round((p.loaded / p.total) * 100) : undefined;
  const needsFile = row.status === 'missing' || row.status === 'returned';
  const panelId = `req-${row.key}`;

  return (
    <li>
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-controls={panelId}
          className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-[#0f295c]">
            <FileText className="h-4.5 w-4.5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-slate-900">{row.label}</span>
            <span className="mt-0.5 flex items-center gap-1.5">
              <StatusChip status={row.status} percent={percent} />
              {row.optional && <span className="text-[11px] text-slate-400">If applicable</span>}
            </span>
          </span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', isExpanded && 'rotate-180')} aria-hidden="true" />
        </button>
        {needsFile ? (
          <button
            type="button"
            disabled={isSaving}
            onClick={() => onPick('file')}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[#0f295c] px-3 text-xs font-semibold text-white hover:bg-[#143a77] disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {isSaving ? 'Saving' : row.status === 'returned' ? 'Replace' : 'Upload'}
          </button>
        ) : (
          newest && (
            <button
              type="button"
              onClick={() => onView(newest)}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Eye className="h-3.5 w-3.5" /> View
            </button>
          )
        )}
      </div>

      {row.status === 'uploading' && typeof percent === 'number' && (
        <div className="mx-4 -mt-1 mb-2 h-1 overflow-hidden rounded-full bg-sky-100" aria-hidden="true">
          <div className="h-full bg-sky-500 transition-all" style={{ width: `${percent}%` }} />
        </div>
      )}

      {isExpanded && (
        <div id={panelId} className="space-y-3 bg-slate-50/60 px-4 pb-4 pt-1">
          <p className="text-xs leading-relaxed text-slate-600">{row.description}</p>
          {newest?.status === 'rejected' && newest.remarks && (
            <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-800">
              <span className="font-semibold">Returned:</span> {newest.remarks}
            </p>
          )}

          {row.files.length > 0 && (
            <ul className="space-y-2">
              {row.files.map((f) => {
                const status = fileRequirementStatus(f);
                const fp = progress[f.id];
                const fPercent = fp && fp.total ? Math.round((fp.loaded / fp.total) * 100) : undefined;
                const unsent = Boolean(f.queuedUpload);
                return (
                  <li key={f.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-slate-900" title={f.original_name}>
                          {f.original_name}
                        </p>
                        <p className="text-[11px] text-slate-500">{formatBytes(f.size_bytes)}</p>
                      </div>
                      <StatusChip status={status} percent={fPercent} />
                    </div>
                    {f.uploadError && status !== 'uploading' && <p className="mt-1.5 text-[11px] text-red-700">{f.uploadError}</p>}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <SmallAction onClick={() => onView(f)} Icon={Eye} label="View" />
                      <SmallAction onClick={() => onDownload(f)} Icon={Download} label="Download" />
                      {unsent && ['failed', 'auth_required', 'saved_offline'].includes(status) && (
                        <SmallAction onClick={() => onRetry(f)} Icon={RotateCcw} label={status === 'saved_offline' ? 'Send' : 'Retry'} />
                      )}
                      {unsent && (status === 'uploading' || status === 'pending_sync') && (
                        <SmallAction onClick={() => onCancel(f)} Icon={X} label="Cancel" />
                      )}
                      {unsent && <SmallAction onClick={() => onRemove(f)} Icon={Trash2} label="Remove" tone="danger" />}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={isSaving}
              onClick={() => onPick('file')}
              className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <Upload className="h-3.5 w-3.5" /> {row.files.length ? 'Add file' : 'Choose file'}
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={() => onPick('camera')}
              className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <Camera className="h-3.5 w-3.5" /> Take photo
            </button>
          </div>
          <p className="text-[11px] text-slate-400">PDF, JPG or PNG · up to 10 MB. Large photos are reduced automatically.</p>
        </div>
      )}
    </li>
  );
}

function SmallAction({
  onClick,
  Icon,
  label,
  tone = 'default',
}: {
  onClick: () => void;
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  tone?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[11px] font-semibold',
        tone === 'danger' ? 'border-red-100 text-red-700 hover:bg-red-50' : 'border-slate-200 text-slate-700 hover:bg-slate-50',
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
    </button>
  );
}
