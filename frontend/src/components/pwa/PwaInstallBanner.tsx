import React from 'react';
import { CheckCircle2, Download, PlusSquare, Share2, Smartphone, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppDialog } from '@/components/ui/dialog';
import { usePwaInstall } from '@/lib/pwa/usePwaInstall';

const DISMISS_KEY = 'tctesda_pwa_install_dismissed';

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === 'true';
  } catch {
    return false;
  }
}

function rememberDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, 'true');
  } catch {
    // Private mode: the prompt may reappear next visit, which is harmless.
  }
}

/**
 * Install instructions for browsers without a programmatic install prompt (iOS Safari,
 * in-app browsers). Rendered through a portal-based dialog so no parent stacking
 * context (sticky header with backdrop blur, overflow-hidden cards) can show through it.
 */
function InstallInstructionsDialog({
  open,
  onOpenChange,
  isIos,
  isInAppBrowser,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isIos: boolean;
  isInAppBrowser: boolean;
}) {
  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Install TCTESDAConnect"
      description="Access your account and use available features offline."
      footer={
        <Button type="button" onClick={() => onOpenChange(false)} className="bg-[#0f295c] text-white hover:bg-[#143a77]">
          Got it
        </Button>
      }
    >
      <ol className="space-y-3 text-sm text-slate-700">
        {isInAppBrowser ? (
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold">1</span>
            <span>
              Open this page in <strong>Chrome</strong> or <strong>Safari</strong> using the menu (⋮ or ···) → <strong>Open in browser</strong>.
            </span>
          </li>
        ) : null}
        {isIos ? (
          <>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold">{isInAppBrowser ? 2 : 1}</span>
              <span className="flex flex-wrap items-center gap-1">
                Tap <Share2 className="h-4 w-4 text-sky-600" aria-label="Share" /> <strong>Share</strong> in Safari.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold">{isInAppBrowser ? 3 : 2}</span>
              <span className="flex flex-wrap items-center gap-1">
                Choose <PlusSquare className="h-4 w-4" aria-hidden="true" /> <strong>Add to Home Screen</strong>.
              </span>
            </li>
          </>
        ) : (
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold">{isInAppBrowser ? 2 : 1}</span>
            <span>
              In Chrome, open the menu (⋮) and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.
            </span>
          </li>
        )}
      </ol>
    </AppDialog>
  );
}

/** One-time install prompt bar. Hidden once installed or dismissed (remembered on this device). */
export function PwaInstallBanner() {
  const { isInstallable, canPromptDirectly, isInstalled, isIos, isInAppBrowser, promptInstall } = usePwaInstall();
  const [dismissed, setDismissed] = React.useState(readDismissed);
  const [showInstructions, setShowInstructions] = React.useState(false);

  const dismiss = () => {
    setDismissed(true);
    rememberDismissed();
  };

  const install = async () => {
    if (canPromptDirectly) {
      if (await promptInstall()) setDismissed(true);
      return;
    }
    setShowInstructions(true);
  };

  if (isInstalled || dismissed || !isInstallable) return null;

  return (
    <>
      <div role="region" aria-label="Install app" className="no-print relative z-40 border-b border-teal-800 bg-[#0f295c] px-3 py-2 text-white sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <Smartphone className="h-4 w-4 shrink-0 text-teal-200" aria-hidden="true" />
          <p className="min-w-0 flex-1 truncate text-xs sm:text-sm">
            <span className="font-semibold">Install TCTESDAConnect</span>
            <span className="hidden text-white/75 sm:inline"> · Access your account and use available features offline.</span>
          </p>
          <Button type="button" size="sm" onClick={() => void install()} className="h-8 bg-white px-3 text-xs font-semibold text-[#0f295c] hover:bg-teal-50">
            <Download className="mr-1 h-3.5 w-3.5" /> Install App
          </Button>
          <button type="button" onClick={dismiss} className="h-8 rounded-lg px-2 text-xs font-medium text-white/80 hover:bg-white/10 hover:text-white">
            <span className="hidden sm:inline">Not Now</span>
            <X className="h-4 w-4 sm:hidden" aria-label="Not now" />
          </button>
        </div>
      </div>
      <InstallInstructionsDialog
        open={showInstructions}
        onOpenChange={(open) => {
          setShowInstructions(open);
          if (!open) dismiss();
        }}
        isIos={isIos}
        isInAppBrowser={isInAppBrowser}
      />
    </>
  );
}

/** Install action for headers and menus; shows "Installed" once the app runs installed. */
export function InstallAppButton({ className = '' }: { className?: string }) {
  const { isInstalled, canPromptDirectly, promptInstall, isIos, isInAppBrowser } = usePwaInstall();
  const [showInstructions, setShowInstructions] = React.useState(false);

  if (isInstalled) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 ${className}`}>
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
        <span className="hidden sm:inline">Installed</span>
      </span>
    );
  }

  const handleClick = async () => {
    if (canPromptDirectly) await promptInstall();
    else setShowInstructions(true);
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => void handleClick()}
        className={`h-9 border-teal-600/30 text-teal-800 hover:bg-teal-50 ${className}`}
      >
        <Download className="mr-1.5 h-3.5 w-3.5" />
        Install App
      </Button>
      <InstallInstructionsDialog open={showInstructions} onOpenChange={setShowInstructions} isIos={isIos} isInAppBrowser={isInAppBrowser} />
    </>
  );
}
