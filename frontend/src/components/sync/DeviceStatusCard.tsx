import React from 'react';
import { HardDrive } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { OfflineReadyBadge } from '@/components/pwa/OfflineReadyBadge';
import { offlineDb } from '@/lib/db/dexie';
import { requestPersistentStorage, useOfflineReadinessStore } from '@/lib/pwa/offlineReadiness';
import { useUploadProgressStore } from '@/lib/documents/uploadQueue';

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Device facts for the Sync Center: offline readiness, storage use, queued documents. */
export function DeviceStatusCard({ userId }: { userId: string }) {
  const storagePersisted = useOfflineReadinessStore((s) => s.storagePersisted);
  const activeUploads = Object.keys(useUploadProgressStore((s) => s.progress)).length;
  const [estimate, setEstimate] = React.useState<{ usage: number; quota: number } | null>(null);

  const queuedDocs = useLiveQuery(
    () => (userId ? offlineDb.cachedDocuments.where('ownerUserId').equals(userId).filter((d) => d.queuedUpload).toArray() : []),
    [userId],
    [],
  );

  React.useEffect(() => {
    void requestPersistentStorage();
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return;
    void navigator.storage
      .estimate()
      .then((e) => setEstimate({ usage: e.usage ?? 0, quota: e.quota ?? 0 }))
      .catch(() => undefined);
  }, [queuedDocs.length]);

  const failedDocs = queuedDocs.filter((d) => d.uploadState === 'failed').length;
  const usedPercent = estimate && estimate.quota ? Math.min(100, Math.round((estimate.usage / estimate.quota) * 100)) : null;

  return (
    <section aria-labelledby="device-status-heading" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 id="device-status-heading" className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <HardDrive className="h-4 w-4 text-[#0f295c]" aria-hidden="true" /> This device
        </h2>
        <OfflineReadyBadge />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-slate-500">Documents waiting</dt>
          <dd className="mt-0.5 text-base font-semibold text-slate-900">{queuedDocs.length - failedDocs}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Uploading now</dt>
          <dd className="mt-0.5 text-base font-semibold text-slate-900">{activeUploads}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Failed uploads</dt>
          <dd className={`mt-0.5 text-base font-semibold ${failedDocs ? 'text-red-700' : 'text-slate-900'}`}>{failedDocs}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Storage used</dt>
          <dd className="mt-0.5 text-base font-semibold text-slate-900">
            {estimate ? formatBytes(estimate.usage) : '—'}
            {usedPercent !== null && <span className="ml-1 text-[11px] font-normal text-slate-500">({usedPercent}%)</span>}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-[11px] text-slate-500">
        {storagePersisted === true
          ? 'Offline data is protected from automatic clean-up on this device.'
          : storagePersisted === false
            ? 'The browser may clear offline data if the device runs low on space. Installing the app helps keep it.'
            : 'Offline data is stored in this browser.'}
      </p>
    </section>
  );
}
