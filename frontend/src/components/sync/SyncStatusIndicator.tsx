import { AlertTriangle, CheckCircle2, CloudOff, Loader2, UploadCloud } from 'lucide-react';
import { Link } from 'react-router-dom';
import { deriveSyncIndicator, type SyncIndicatorState } from '@/lib/sync/syncIndicator';
import { cn } from '@/lib/utils';
import { useConnectivityStore } from '@/stores/connectivityStore';

const STYLES: Record<SyncIndicatorState, { className: string; Icon: typeof CloudOff }> = {
  offline: { className: 'border-slate-300 bg-slate-100 text-slate-700', Icon: CloudOff },
  syncing: { className: 'border-sky-200 bg-sky-50 text-sky-800', Icon: Loader2 },
  action_required: { className: 'border-red-200 bg-red-50 text-red-700', Icon: AlertTriangle },
  pending: { className: 'border-amber-200 bg-amber-50 text-amber-800', Icon: UploadCloud },
  up_to_date: { className: 'border-emerald-200 bg-emerald-50 text-emerald-800', Icon: CheckCircle2 },
};

/** Compact header status; opens the Sync Center for details and "Sync now". */
export function SyncStatusIndicator({ className }: { className?: string }) {
  const isOnline = useConnectivityStore((s) => s.isOnline);
  const syncStatus = useConnectivityStore((s) => s.syncStatus);
  const pendingCount = useConnectivityStore((s) => s.pendingCount);
  const failedCount = useConnectivityStore((s) => s.failedCount);
  const conflictCount = useConnectivityStore((s) => s.conflictCount);
  const { state, label } = deriveSyncIndicator({ isOnline, syncStatus, pendingCount, failedCount, conflictCount });
  const { className: tone, Icon } = STYLES[state];

  return (
    <Link
      to="/sync"
      title="Open Sync Center"
      className={cn(
        'inline-flex h-7 items-center gap-1 rounded-full border px-2 text-[11px] font-semibold whitespace-nowrap',
        tone,
        className,
      )}
    >
      <Icon className={cn('h-3.5 w-3.5', state === 'syncing' && 'animate-spin')} aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
}
