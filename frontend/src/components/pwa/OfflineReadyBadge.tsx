import { CheckCircle2, CloudDownload } from 'lucide-react';
import { useOfflineReadinessStore } from '@/lib/pwa/offlineReadiness';
import { cn } from '@/lib/utils';

/**
 * Tells the user whether the app has finished saving itself for offline use, so they know
 * when it is safe to switch off data / go somewhere without signal.
 */
export function OfflineReadyBadge({ className, compact = false }: { className?: string; compact?: boolean }) {
  const readiness = useOfflineReadinessStore((s) => s.readiness);
  if (readiness === 'unsupported' || readiness === 'checking') return null;

  const ready = readiness === 'ready';
  const label = ready ? 'Ready offline' : 'Saving for offline…';
  return (
    <span
      role="status"
      title={
        ready
          ? 'This app is saved on this device and will open without internet.'
          : 'Keep the app open with internet until this says "Ready offline".'
      }
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold',
        ready ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-sky-200 bg-sky-50 text-sky-800',
        className,
      )}
    >
      {ready ? <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> : <CloudDownload className="h-3 w-3 animate-pulse" aria-hidden="true" />}
      {compact ? <span className="sr-only sm:not-sr-only">{label}</span> : label}
    </span>
  );
}
