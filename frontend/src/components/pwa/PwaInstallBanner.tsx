import React from 'react';
import {
  Download,
  Smartphone,
  Share2,
  PlusSquare,
  X,
  CheckCircle2,
  WifiOff,
} from 'lucide-react';
import { usePwaInstall } from '@/lib/pwa/usePwaInstall';
import { Button } from '@/components/ui/button';

export function PwaInstallBanner() {
  const {
    isInstallable,
    canPromptDirectly,
    isInstalled,
    isIos,
    isInAppBrowser,
    promptInstall,
  } = usePwaInstall();

  const [dismissed, setDismissed] = React.useState(() => {
    try {
      return sessionStorage.getItem('tctesda_pwa_dismissed') === 'true';
    } catch {
      return false;
    }
  });

  const [showInstructionsModal, setShowInstructionsModal] = React.useState(false);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem('tctesda_pwa_dismissed', 'true');
    } catch {
      // ignore
    }
  };

  const handleInstallClick = async () => {
    if (canPromptDirectly) {
      const installed = await promptInstall();
      if (installed) {
        setDismissed(true);
      }
    } else {
      setShowInstructionsModal(true);
    }
  };

  if (isInstalled || dismissed) {
    return null;
  }

  // Only show if installable or on mobile devices
  if (!isInstallable) {
    return null;
  }

  return (
    <>
      <div className="relative z-40 border-b border-emerald-200 bg-gradient-to-r from-emerald-700 via-teal-700 to-[#0f295c] px-3 py-2 text-white shadow-md sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/20 text-white backdrop-blur-xs">
              <Smartphone className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-bold sm:text-sm">
                <span>I-install ang TCTESDAConnect App</span>
                <span className="hidden items-center gap-1 rounded bg-emerald-500/30 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-100 sm:inline-flex">
                  <WifiOff className="h-3 w-3" /> Offline Ready
                </span>
              </p>
              <p className="truncate text-[11px] text-emerald-100/90 sm:text-xs">
                I-save sa iyong cellphone para mabilis buksan kahit walang internet o data connection.
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleInstallClick}
              className="h-8 bg-white px-3 text-xs font-bold text-emerald-800 shadow-sm hover:bg-emerald-50 active:scale-95"
            >
              <Download className="mr-1.5 h-3.5 w-3.5 text-emerald-700" />
              <span>{canPromptDirectly ? 'Install App' : 'Paano I-install'}</span>
            </Button>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Isara ang paalala"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-emerald-100/80 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Manual Installation Instructions Modal for iOS or In-App Browsers */}
      {showInstructionsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
                  <Smartphone className="h-4 w-4" />
                </span>
                <h3 className="text-sm font-bold text-slate-900">
                  Gabay sa Pag-install sa Cellphone
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowInstructionsModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs text-slate-700">
              {isInAppBrowser ? (
                <div className="space-y-2.5 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5">
                  <p className="font-bold text-amber-900">
                    Bukas ka ngayon sa Facebook Lite / In-App Browser:
                  </p>
                  <ol className="list-decimal space-y-1.5 pl-4 text-slate-800">
                    <li>
                      Pindutin ang <strong>tatlong tuldok (⋮)</strong> o menu sa kanang itaas ng inyong screen.
                    </li>
                    <li>
                      Piliin ang <strong>&quot;Open in Chrome&quot;</strong> o <strong>&quot;Open in External Browser&quot;</strong>.
                    </li>
                    <li>
                      Pagkabukas sa Chrome, lalabas na ang opisyal na <strong>&quot;Install App&quot;</strong> prompt sa home screen!
                    </li>
                  </ol>
                </div>
              ) : isIos ? (
                <div className="space-y-2.5 rounded-xl border border-teal-200 bg-teal-50/60 p-3.5">
                  <p className="font-bold text-teal-950">
                    Para sa iPhone / iPad (Safari Browser):
                  </p>
                  <ol className="list-decimal space-y-2 pl-4 text-slate-800">
                    <li className="flex items-start gap-1.5">
                      <span className="font-bold">1.</span>
                      <span>
                        Pindutin ang <strong>Share button</strong> (
                        <Share2 className="inline h-3.5 w-3.5 text-blue-600" />
                        ) sa ibaba ng inyong Safari screen.
                      </span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="font-bold">2.</span>
                      <span>
                        Mag-scroll pababa at pindutin ang <strong>&quot;Add to Home Screen&quot;</strong> (
                        <PlusSquare className="inline h-3.5 w-3.5 text-slate-800" />
                        ).
                      </span>
                    </li>
                    <li className="flex items-start gap-1.5">
                      <span className="font-bold">3.</span>
                      <span>
                        Pindutin ang <strong>&quot;Add&quot;</strong> sa kanang itaas. Magkakaroon ka na ng TCTESDAConnect icon sa cellphone!
                      </span>
                    </li>
                  </ol>
                </div>
              ) : (
                <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                  <p className="font-bold text-slate-900">Para sa Android Chrome:</p>
                  <ol className="list-decimal space-y-1.5 pl-4 text-slate-800">
                    <li>
                      Pindutin ang <strong>tatlong tuldok (⋮)</strong> sa kanang itaas ng Chrome.
                    </li>
                    <li>
                      Piliin ang <strong>&quot;Install app&quot;</strong> o <strong>&quot;Add to Home screen&quot;</strong>.
                    </li>
                    <li>
                      Kumpirmahin ang pag-install. Matatagpuan na ito sa inyong cellphone apps list at magagamit offline!
                    </li>
                  </ol>
                </div>
              )}

              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-[11px] text-emerald-950">
                <div className="flex items-center gap-1.5 font-bold">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Bentahe ng Naka-install na App:
                </div>
                <p className="mt-1 leading-relaxed text-emerald-900">
                  Mabilis magbukas tulad ng native app, may sariling app icon sa homescreen, at kumpletong offline access sa Registration Intake, Digital ID, at mga dokumento kahit walang wifi o mobile data.
                </p>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => setShowInstructionsModal(false)}
                className="bg-[#0f295c] font-semibold text-white hover:bg-[#143a77]"
              >
                Naintindihan ko
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function InstallAppButton({ className = '' }: { className?: string }) {
  const { isInstalled, canPromptDirectly, promptInstall } = usePwaInstall();
  const [showModal, setShowModal] = React.useState(false);

  if (isInstalled) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 ${className}`}>
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
        <span className="hidden sm:inline">App Installed</span>
      </span>
    );
  }

  const handleClick = async () => {
    if (canPromptDirectly) {
      await promptInstall();
    } else {
      setShowModal(true);
    }
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={handleClick}
        className={`h-9 border-emerald-600/30 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 ${className}`}
      >
        <Download className="mr-1.5 h-3.5 w-3.5" />
        <span className="sm:hidden">Install</span>
        <span className="hidden sm:inline">Install App</span>
      </Button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
                  <Smartphone className="h-4 w-4" />
                </span>
                <h3 className="text-sm font-bold text-slate-900">
                  I-install ang TCTESDAConnect
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs text-slate-700">
              <p className="font-semibold text-slate-900">
                Paano i-install ang app sa iyong telepono:
              </p>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                <p className="font-bold text-slate-800">1. Para sa Chrome / Android:</p>
                <p>Pindutin ang tatlong tuldok (⋮) sa browser at piliin ang <strong>&quot;Install app&quot;</strong> o <strong>&quot;Add to Home screen&quot;</strong>.</p>
              </div>
              <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-3 space-y-2">
                <p className="font-bold text-teal-900">2. Para sa iPhone (Safari):</p>
                <p>I-tap ang <strong>Share button</strong> (📤) sa ibaba at piliin ang <strong>&quot;Add to Home Screen&quot;</strong> (+).</p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 space-y-2">
                <p className="font-bold text-amber-900">3. Kung nasa Facebook Lite / In-App Browser:</p>
                <p>Pindutin ang (⋮) menu sa itaas at piliin ang <strong>&quot;Open in external browser&quot;</strong> o <strong>&quot;Open in Chrome&quot;</strong>.</p>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => setShowModal(false)}
                className="bg-[#0f295c] font-semibold text-white hover:bg-[#143a77]"
              >
                Isara
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
