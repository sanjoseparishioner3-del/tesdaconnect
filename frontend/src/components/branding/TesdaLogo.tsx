import { cn } from '@/lib/utils';

export interface TesdaLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'default' | 'white' | 'icon-only';
  className?: string;
  showSubtitle?: boolean;
}

const SIZES = {
  sm: {
    container: 'h-8 w-8',
    text: 'text-xs',
    subtitle: 'text-[8px]',
  },
  md: {
    container: 'h-10 w-10',
    text: 'text-sm',
    subtitle: 'text-[10px]',
  },
  lg: {
    container: 'h-12 w-12',
    text: 'text-base',
    subtitle: 'text-xs',
  },
  xl: {
    container: 'h-16 w-16',
    text: 'text-lg',
    subtitle: 'text-sm',
  },
};

export function TesdaLogo({
  size = 'md',
  variant = 'default',
  className,
  showSubtitle = true,
}: TesdaLogoProps) {
  const sizeClasses = SIZES[size];

  // Icon only variant
  if (variant === 'icon-only') {
    return (
      <div
        className={cn(
          'flex shrink-0 items-center justify-center rounded-lg bg-white p-1 shadow-sm',
          sizeClasses.container,
          className,
        )}
      >
        <img
          src="/tesda-logo.png"
          alt="TESDA Logo"
          className="h-full w-full object-contain"
        />
      </div>
    );
  }

  // Full branding with text
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div
        className={cn(
          'flex shrink-0 items-center justify-center rounded-lg bg-white p-1 shadow-sm',
          sizeClasses.container,
        )}
      >
        <img
          src="/tesda-logo.png"
          alt="TESDA Logo"
          className="h-full w-full object-contain"
        />
      </div>
      <div className="min-w-0">
        <p
          className={cn(
            'font-extrabold tracking-tight',
            sizeClasses.text,
            variant === 'white' ? 'text-white' : 'text-slate-900',
          )}
        >
          TESDA
          <span className={variant === 'white' ? 'text-amber-400' : 'text-amber-600'}>
            Connect
          </span>
        </p>
        {showSubtitle && (
          <p
            className={cn(
              'font-medium',
              sizeClasses.subtitle,
              variant === 'white' ? 'text-emerald-200' : 'text-slate-600',
            )}
          >
            Training Operations
          </p>
        )}
      </div>
    </div>
  );
}

// Separate component for header usage
export function TesdaLogoHeader() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white p-1 shadow-sm">
        <img
          src="/tesda-logo.png"
          alt="TESDA Logo"
          className="h-full w-full object-contain"
        />
      </div>
      <div className="hidden sm:block">
        <p className="text-sm font-bold text-slate-900">
          TESDA<span className="text-amber-600">Connect</span>
        </p>
      </div>
    </div>
  );
}
