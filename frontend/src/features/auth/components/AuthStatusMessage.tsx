import { CheckCircle2, Info, ShieldAlert, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AuthMessageVariant = 'offline' | 'error' | 'success' | 'info';

interface AuthStatusMessageProps {
  variant: AuthMessageVariant;
  message: string;
  className?: string;
}

export function AuthStatusMessage({ variant, message, className }: AuthStatusMessageProps) {
  const styles: Record<AuthMessageVariant, string> = {
    offline: 'border-amber-200 bg-amber-50/90 text-amber-950',
    error: 'border-red-200 bg-red-50 text-red-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    info: 'border-slate-200 bg-slate-50 text-slate-800',
  };

  const Icon =
    variant === 'offline'
      ? WifiOff
      : variant === 'error'
        ? ShieldAlert
        : variant === 'success'
          ? CheckCircle2
          : Info;

  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
      className={cn(
        'flex items-start gap-2.5 rounded-xl border p-3 text-xs leading-relaxed',
        styles[variant],
        className,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
