import { useLiveQuery } from 'dexie-react-hooks';
import { AlertTriangle, CloudOff, Loader2, RotateCcw, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { offlineDb, type QueuedUploadKind, type QueuedUploadState } from '@/lib/db/dexie';
import { cancelStaffUpload, processStaffUploadQueue, removeStaffUpload, requeueStaffUpload } from '@/lib/documents/staffUploadQueue';
import { useUploadProgressStore } from '@/lib/documents/uploadQueue';
import { refreshReactiveQueueCounts } from '@/lib/sync/connectivityMonitor';
import { useConnectivityStore } from '@/stores/connectivityStore';

const KIND_LABEL: Record<QueuedUploadKind, string> = {
  operational_document: 'Operational document',
  announcement: 'Announcement with attachment',
  learner_document_staff: 'Learner document',
  course_material: 'Learning material',
};

const STATE_LABEL: Record<QueuedUploadState, string> = {
  pending: 'Waiting to send',
  uploading: 'Uploading',
  failed: 'Failed, will retry',
  auth_required: 'Sign-in needed',
  saved_offline: 'Paused',
};

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Files added by staff that are saved on this device and not yet in the system. */
export function QueuedUploadsCard({ userId }: { userId: string }) {
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const progress = useUploadProgressStore((s) => s.progress);
  const items = useLiveQuery(() => offlineDb.queuedUploads.where('userId').equals(userId).sortBy('createdAt'), [userId], []);
  if (items.length === 0) return null;

  async function afterChange() {
    await refreshReactiveQueueCounts(userId);
  }

  async function retry(id: string) {
    await requeueStaffUpload(id);
    await afterChange();
    if (isOnline) {
      void processStaffUploadQueue(userId, { force: true }).then(async (sent) => {
        if (sent > 0) toast.success(sent === 1 ? 'File uploaded.' : `${sent} files uploaded.`);
        await afterChange();
      });
    } else {
      toast.info('It will be sent automatically when you are back online.');
    }
  }

  return (
    <section aria-labelledby="queued-uploads-heading" className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 shadow-sm">
      <h2 id="queued-uploads-heading" className="flex items-center gap-2 text-sm font-semibold text-amber-900">
        <CloudOff className="h-4 w-4" aria-hidden="true" /> Files waiting to upload ({items.length})
      </h2>
      <p className="mt-0.5 text-xs text-amber-800">Saved on this device. They are sent automatically as soon as you are online.</p>
      <ul className="mt-3 space-y-2">
        {items.map((u) => {
          const p = progress[u.id];
          const percent = p && p.total ? Math.round((p.loaded / p.total) * 100) : undefined;
          return (
            <li key={u.id} className="rounded-xl border border-amber-200 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-slate-900" title={u.label}>
                    {u.label}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {KIND_LABEL[u.kind]} · {formatBytes(u.sizeBytes)}
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                  {u.state === 'uploading' ? <Loader2 className="h-3 w-3 animate-spin" /> : u.state === 'failed' ? <AlertTriangle className="h-3 w-3" /> : null}
                  {u.state === 'uploading' && typeof percent === 'number' ? `${percent}%` : STATE_LABEL[u.state]}
                </span>
              </div>
              {u.error && u.state !== 'uploading' && <p className="mt-1 text-[11px] text-red-700">{u.error}</p>}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {u.state !== 'uploading' && (
                  <button type="button" onClick={() => void retry(u.id)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">
                    <RotateCcw className="h-3.5 w-3.5" /> {u.state === 'saved_offline' ? 'Send' : 'Retry'}
                  </button>
                )}
                {u.state === 'uploading' && (
                  <button type="button" onClick={() => void cancelStaffUpload(u.id).then(afterChange)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50">
                    <X className="h-3.5 w-3.5" /> Cancel
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Remove "${u.label}" from this device? It has not been uploaded yet.`)) void removeStaffUpload(u.id).then(afterChange);
                  }}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-red-100 px-2.5 text-[11px] font-semibold text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
