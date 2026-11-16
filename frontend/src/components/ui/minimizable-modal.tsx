import * as React from 'react';
import { Maximize2, Minimize2, Minus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export type ModalWindowState = 'normal' | 'maximized' | 'minimized';

export interface MinimizableModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  headerActions?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  defaultState?: ModalWindowState;
  allowMinimize?: boolean;
  allowMaximize?: boolean;
  minimizedLabel?: string;
  icon?: React.ReactNode;
}

export function MinimizableModal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  headerActions,
  footer,
  className,
  bodyClassName,
  defaultState = 'normal',
  allowMinimize = true,
  allowMaximize = true,
  minimizedLabel,
  icon,
}: MinimizableModalProps) {
  const [windowState, setWindowState] = React.useState<ModalWindowState>(defaultState);

  // Sync state when opening
  React.useEffect(() => {
    if (isOpen && windowState === 'minimized') {
      // Keep minimized if user minimized it, otherwise reset to default
    }
  }, [isOpen, windowState]);

  // Handle escape key
  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && windowState !== 'minimized') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, windowState, onClose]);

  if (!isOpen) return null;

  // MINIMIZED STATE: Floating dock pill at bottom right
  if (windowState === 'minimized') {
    return (
      <aside
        aria-label="Minimized window"
        className="fixed bottom-4 right-4 z-50 flex max-w-md items-center gap-3 rounded-2xl border-2 border-emerald-500/80 bg-slate-900/95 px-4 py-3 text-white shadow-2xl backdrop-blur-md transition-all hover:border-emerald-400"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
          </span>
          {icon && <span className="shrink-0 text-emerald-400">{icon}</span>}
          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-white">
              {minimizedLabel || (typeof title === 'string' ? title : 'Active Window')}
            </p>
            <p className="text-[10px] text-slate-400">Minimized · Click to restore</p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setWindowState('normal')}
            className="h-7 px-2 text-xs font-semibold text-emerald-300 hover:bg-slate-800 hover:text-white"
            title="Restore window"
          >
            <Maximize2 className="h-3.5 w-3.5 mr-1" />
            Restore
          </Button>

          {allowMaximize && (
            <button
              type="button"
              onClick={() => setWindowState('maximized')}
              className="rounded p-1 text-slate-400 transition hover:bg-slate-800 hover:text-white"
              title="Maximize full screen"
              aria-label="Maximize full screen"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 transition hover:bg-rose-900/40 hover:text-rose-300"
            title="Close"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </aside>
    );
  }

  // NORMAL or MAXIMIZED STATE
  const isMaximized = windowState === 'maximized';

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-3 md:p-6"
    >
      {/* Backdrop overlay (dimmed background) */}
      <div
        className={cn(
          'fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity duration-200',
          isMaximized && 'opacity-0 pointer-events-none',
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Container */}
      <div
        className={cn(
          'relative z-10 flex flex-col bg-white text-slate-900 shadow-2xl transition-all duration-200 overflow-hidden',
          isMaximized
            ? 'fixed inset-0 h-screen w-screen rounded-none max-w-none'
            : 'max-h-[92vh] w-full max-w-5xl rounded-2xl border border-slate-200',
          className,
        )}
      >
        {/* Modal Window Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50/95 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3 min-w-0 pr-3">
            {icon && (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold text-slate-900 sm:text-lg">
                {title}
              </h2>
              {subtitle && (
                <div className="text-xs text-slate-500 truncate">{subtitle}</div>
              )}
            </div>
          </div>

          {/* Action buttons & Window Controls */}
          <div className="flex items-center gap-1.5 shrink-0">
            {headerActions}

            {/* Window management buttons */}
            <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
              {/* Minimize button */}
              {allowMinimize && (
                <button
                  type="button"
                  onClick={() => setWindowState('minimized')}
                  className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-200 hover:text-slate-800"
                  title="Minimize window"
                  aria-label="Minimize window"
                >
                  <Minus className="h-4 w-4" />
                </button>
              )}

              {/* Maximize / Restore button */}
              {allowMaximize && (
                <button
                  type="button"
                  onClick={() => setWindowState(isMaximized ? 'normal' : 'maximized')}
                  className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-200 hover:text-slate-800"
                  title={isMaximized ? 'Restore normal size' : 'Maximize window'}
                  aria-label={isMaximized ? 'Restore normal size' : 'Maximize window'}
                >
                  {isMaximized ? (
                    <Minimize2 className="h-4 w-4" />
                  ) : (
                    <Maximize2 className="h-4 w-4" />
                  )}
                </button>
              )}

              {/* Close button */}
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-slate-500 transition hover:bg-rose-100 hover:text-rose-700"
                title="Close"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div
          className={cn(
            'flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6',
            bodyClassName,
          )}
        >
          {children}
        </div>

        {/* Optional Footer */}
        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
