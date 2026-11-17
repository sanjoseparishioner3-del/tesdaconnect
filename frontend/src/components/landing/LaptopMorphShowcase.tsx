import React from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  ArrowDown,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Layers,
  Megaphone,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { ExpandedDashboardPreview } from '@/components/landing/ExpandedDashboardPreview';
import type { LaptopScrollState } from '@/components/landing/LaptopCanvasScene';
import { LightweightLaptopMockup } from '@/components/landing/LightweightLaptopMockup';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  detectLandingCapabilities,
  HERO_PRESETS,
  MORPH_MODULE_CARDS,
  type HeroPresetKey,
} from '@/lib/landing/laptopMetrics';
import { cn } from '@/lib/utils';

let scrollTriggerRegistered = false;

function ensureScrollTriggerRegistered(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  if (!scrollTriggerRegistered) {
    gsap.registerPlugin(ScrollTrigger);
    scrollTriggerRegistered = true;
  }
  return true;
}

const LazyLaptopCanvasScene = React.lazy(() => import('@/components/landing/LaptopCanvasScene'));

const MODULE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  intake: FileText,
  records: ShieldCheck,
  batches: Layers,
  schedules: CalendarDays,
  announcements: Megaphone,
  reports: FileSpreadsheet,
};

const STAGE_LABELS = [
  '1. 3D Laptop Hero',
  '2. Center Focus',
  '3. Live Dashboard',
  '4. Core Modules',
] as const;

interface LaptopMorphShowcaseProps {
  activePreset: HeroPresetKey;
  onSelectPreset: (preset: HeroPresetKey) => void;
}

export function LaptopMorphShowcase({ activePreset, onSelectPreset }: LaptopMorphShowcaseProps) {
  const [capabilities, setCapabilities] = React.useState(() => detectLandingCapabilities());
  const [webglRuntimeError, setWebglRuntimeError] = React.useState(false);
  const [isDesktopViewport, setIsDesktopViewport] = React.useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  );
  const [activeStage, setActiveStage] = React.useState(0);

  const pinStageRef = React.useRef<HTMLDivElement | null>(null);
  const heroLayerRef = React.useRef<HTMLDivElement | null>(null);
  const dashboardLayerRef = React.useRef<HTMLDivElement | null>(null);
  const modulesLayerRef = React.useRef<HTMLDivElement | null>(null);
  const scrollTriggerRef = React.useRef<ScrollTrigger | null>(null);

  const scrollStateRef = React.useRef<LaptopScrollState>({
    progress: 0,
    isPinnedDesktop: true,
  });

  const use3DDesktopMorph =
    isDesktopViewport && !capabilities.useSimplifiedMorph && !webglRuntimeError;

  // Sync capability & viewport listeners cleanly
  React.useEffect(() => {
    setCapabilities(detectLandingCapabilities());
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }

    const mqDesktop = window.matchMedia('(min-width: 1024px)');
    const mqMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const syncViewport = () => {
      setIsDesktopViewport(mqDesktop.matches);
    };
    const syncMotion = () => {
      setCapabilities(detectLandingCapabilities());
    };

    syncViewport();
    mqDesktop.addEventListener('change', syncViewport);
    mqMotion.addEventListener('change', syncMotion);

    return () => {
      mqDesktop.removeEventListener('change', syncViewport);
      mqMotion.removeEventListener('change', syncMotion);
    };
  }, []);

  // Keep shared R3F frame flag aligned with current mode
  React.useEffect(() => {
    scrollStateRef.current.isPinnedDesktop = use3DDesktopMorph;
  }, [use3DDesktopMorph]);

  // Master GSAP ScrollTrigger orchestration with full matchMedia & cleanup safety
  React.useEffect(() => {
    const pinEl = pinStageRef.current;
    if (!pinEl || !ensureScrollTriggerRegistered()) return undefined;

    const mm = gsap.matchMedia();

    if (use3DDesktopMorph) {
      mm.add('(min-width: 1024px) and (prefers-reduced-motion: no-preference)', () => {
        const heroEl = heroLayerRef.current;
        const dashEl = dashboardLayerRef.current;
        const modsEl = modulesLayerRef.current;
        const cards = modsEl ? gsap.utils.toArray<HTMLElement>('.morph-module-card', modsEl) : [];

        if (!heroEl || !dashEl || !modsEl) return undefined;

        gsap.set(heroEl, { opacity: 1, x: 0, pointerEvents: 'auto' });
        gsap.set(dashEl, { opacity: 0, scale: 0.72, y: 12, pointerEvents: 'none' });
        gsap.set(modsEl, { opacity: 0, pointerEvents: 'none' });
        gsap.set(cards, { opacity: 0, y: 30, scale: 0.94 });

        const tl = gsap.timeline({
          defaults: { ease: 'power2.inOut' },
          scrollTrigger: {
            trigger: pinEl,
            start: 'top top',
            end: '+=240%',
            pin: true,
            scrub: 0.6,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              const p = self.progress;
              scrollStateRef.current.progress = p;

              const stageIdx = p < 0.14 ? 0 : p < 0.42 ? 1 : p < 0.65 ? 2 : 3;
              setActiveStage((prev) => (prev !== stageIdx ? stageIdx : prev));

              // Toggle interactive hit-testing cleanly by active morph layer
              heroEl.style.pointerEvents = p < 0.2 ? 'auto' : 'none';
              dashEl.style.pointerEvents = p >= 0.48 && p < 0.64 ? 'auto' : 'none';
              modsEl.style.pointerEvents = p >= 0.68 ? 'auto' : 'none';
            },
          },
        });

        scrollTriggerRef.current = tl.scrollTrigger ?? null;

        // Stage 1 -> 2 (0.06 - 0.22): Cleanly slide & fade left hero copy before laptop centers
        tl.to(heroEl, { opacity: 0, x: -42, duration: 0.16 }, 0.06);

        // Stage 3 (0.42 - 0.52): Cross-morph expanding 3D screen cleanly into real React Dashboard
        tl.to(
          dashEl,
          { opacity: 1, scale: 1, y: 0, duration: 0.1, ease: 'power2.out' },
          0.42,
        );

        // Stage 3 -> 4 (0.61 - 0.69): Dashboard recedes cleanly as all 6 separated module cards reveal
        tl.to(
          dashEl,
          { opacity: 0, scale: 0.9, y: -24, duration: 0.08, ease: 'power2.in' },
          0.61,
        );
        tl.to(modsEl, { opacity: 1, duration: 0.06 }, 0.64);
        tl.to(
          cards,
          {
            opacity: 1,
            y: 0,
            scale: 1,
            stagger: 0.018,
            duration: 0.09,
            ease: 'power2.out',
          },
          0.66,
        );

        // Hold final Stage 4 grid (0.84 -> 1.00) cleanly before unpinning into Institutions section
        tl.to({}, { duration: 0.16 }, 0.84);

        const onResize = () => {
          ScrollTrigger.refresh();
        };
        window.addEventListener('resize', onResize);

        return () => {
          window.removeEventListener('resize', onResize);
          scrollTriggerRef.current = null;
        };
      });
    } else if (!capabilities.prefersReducedMotion) {
      // Mobile / low-performance simplified scroll morph (keep cards readable even without slow scroll pause)
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const laptopEl = pinEl.querySelector<HTMLElement>('.simplified-laptop-stage');
        if (laptopEl) {
          gsap.fromTo(
            laptopEl,
            { scale: 0.96, y: 8 },
            {
              scale: 1,
              y: 0,
              ease: 'power2.out',
              scrollTrigger: {
                trigger: laptopEl,
                start: 'top 90%',
                end: 'bottom 20%',
                scrub: 0.4,
              },
            },
          );
        }

        const cards = gsap.utils.toArray<HTMLElement>('.simplified-module-card', pinEl);
        if (cards.length > 0) {
          gsap.fromTo(
            cards,
            { y: 18, scale: 0.98 },
            {
              y: 0,
              scale: 1,
              duration: 0.4,
              stagger: 0.05,
              ease: 'power2.out',
              scrollTrigger: {
                trigger: '.simplified-modules-grid',
                start: 'top 92%',
                once: true,
              },
            },
          );
        }
      });
    }

    return () => {
      mm.revert();
      scrollTriggerRef.current = null;
    };
  }, [use3DDesktopMorph, capabilities.prefersReducedMotion]);

  function handleScrollToStage(targetStage: number) {
    const st = scrollTriggerRef.current;
    if (st) {
      const targetProgress = targetStage === 0 ? 0 : targetStage === 1 ? 0.28 : targetStage === 2 ? 0.56 : 0.9;
      const y = st.start + (st.end - st.start) * targetProgress;
      window.scrollTo({ top: y, behavior: capabilities.prefersReducedMotion ? 'auto' : 'smooth' });
      return;
    }

    const fallbackAnchor = document.getElementById('morph-modules-section');
    fallbackAnchor?.scrollIntoView({ behavior: capabilities.prefersReducedMotion ? 'auto' : 'smooth' });
  }

  // Hero Left Copy Block (shared consistently between Desktop Pinned Hero & Simplified/Mobile Mode)
  const heroCopyContent = (
    <div className="space-y-5">
      <Badge className="border border-emerald-600/25 bg-emerald-50 text-emerald-800 hover:bg-emerald-50">
        Offline-First Progressive Web App · Supabase + PostgreSQL RLS
      </Badge>

      <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-[3.15rem] lg:leading-[1.08]">
        Modernized TESDA Training Operations for{' '}
        <span className="text-emerald-600">BST</span> &amp;{' '}
        <span className="text-emerald-700">MIF</span>
      </h1>

      <p className="max-w-xl text-base leading-relaxed text-slate-600 sm:text-[1.05rem]">
        Scroll to morph seamlessly from a studio 3D laptop into the live TCTESDAConnect workspace —
        unifying MIS 03-01 registration intake, 8-document verification, post-confirmation ULI control,
        schedules, announcements, and offline field sync.
      </p>

      {/* Preset Focus Buttons */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Select campus or operations focus">
        {(['core', 'bst', 'mif', 'sync'] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onSelectPreset(key)}
            aria-pressed={activePreset === key}
            className={cn(
              'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2',
              activePreset === key
                ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/60 hover:text-emerald-800',
            )}
          >
            {HERO_PRESETS[key].label}
          </button>
        ))}
      </div>

      {/* Primary & Secondary CTAs */}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button
          asChild
          size="lg"
          className="bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 focus-visible:ring-emerald-600"
        >
          <Link to="/login" state={{ morphFromLaptop: true, preset: activePreset }}>
            Open Operations Portal <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>

        <Button
          type="button"
          size="lg"
          variant="outline"
          onClick={() => handleScrollToStage(use3DDesktopMorph ? 2 : 3)}
          className="border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
        >
          Explore Workflow Morph <ArrowDown className="h-4 w-4 text-emerald-600" />
        </Button>
      </div>

      {/* Quick Verification Metrics Strip */}
      <div className="grid max-w-lg grid-cols-3 gap-2 border-t border-slate-200 pt-4 text-[11px] sm:gap-3 sm:text-xs">
        <div>
          <p className="font-bold text-slate-900">MIS 03-01 Ready</p>
          <p className="text-slate-500">Filled &amp; blank PDFs</p>
        </div>
        <div>
          <p className="font-bold text-slate-900">8 Required Docs</p>
          <p className="text-slate-500">View &amp; download offline</p>
        </div>
        <div>
          <p className="font-bold text-slate-900">Post-Confirm ULI</p>
          <p className="text-slate-500">Admin &amp; Registrar lock</p>
        </div>
      </div>
    </div>
  );

  // Desktop Pinned 5-Stage Scrubbed Morph Mode
  if (use3DDesktopMorph) {
    return (
      <section
        id="morph-showcase"
        ref={pinStageRef}
        aria-label="Interactive 3D Laptop to Dashboard Workflow Showcase"
        className="relative flex h-screen min-h-[700px] w-full items-center overflow-hidden bg-white pt-16"
      >
        {/* Subtle institutional grid + soft emerald studio radial highlight */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_76%_42%,rgba(5,150,105,0.08),transparent_48%),linear-gradient(to_right,rgba(15,23,42,0.025)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,23,42,0.025)_1px,transparent_1px)] bg-[size:100%_100%,56px_56px,56px_56px]"
        />

        {/* Layer 1 (z-10): Lazy-Loaded R3F GLB 3D Laptop Canvas */}
        <div className="pointer-events-none absolute inset-0 z-10">
          <React.Suspense
            fallback={
              <div className="mx-auto grid h-full max-w-7xl items-center gap-10 px-6 lg:grid-cols-12">
                <div className="lg:col-span-6" />
                <div className="lg:col-span-6">
                  <LightweightLaptopMockup activePreset={activePreset} />
                </div>
              </div>
            }
          >
            <LazyLaptopCanvasScene
              activePreset={activePreset}
              scrollStateRef={scrollStateRef}
              onWebglError={() => setWebglRuntimeError(true)}
            />
          </React.Suspense>
        </div>

        {/* Layer 2 (z-20): Stage 1 Initial Hero Copy (Left Column) */}
        <div ref={heroLayerRef} className="relative z-20 mx-auto w-full max-w-7xl px-4 sm:px-6">
          <div className="grid items-center gap-10 lg:grid-cols-12">
            <div className="lg:col-span-6">{heroCopyContent}</div>
            <div className="hidden lg:col-span-6 lg:block" aria-hidden="true" />
          </div>
        </div>

        {/* Layer 3 (z-30): Stage 3 Seamless Expanded React Dashboard Overlay */}
        <div
          ref={dashboardLayerRef}
          className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center px-4 pt-16 sm:px-6"
        >
          <div className="w-full max-w-5xl">
            <ExpandedDashboardPreview activePreset={activePreset} onSelectPreset={onSelectPreset} />
          </div>
        </div>

        {/* Layer 4 (z-35): Stage 4 Modular Reveal Grid (6 Core Workflow Modules) */}
        <div
          id="morph-modules-section"
          ref={modulesLayerRef}
          className="pointer-events-none absolute inset-0 z-[35] flex items-center justify-center px-4 pt-16 sm:px-6"
        >
          <div className="mx-auto w-full max-w-6xl">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-600/20">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Modular TESDA Workflow Architecture
                </span>
                <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
                  Six Unified Training Operations Modules
                </h2>
              </div>
              <Button asChild className="bg-emerald-600 text-white hover:bg-emerald-700">
                <Link to="/login" state={{ morphFromLaptop: true, preset: activePreset }}>
                  Enter Operational Portal <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {MORPH_MODULE_CARDS.map((mod) => {
                const Icon = MODULE_ICONS[mod.id] ?? Users;
                return (
                  <article
                    key={mod.id}
                    className="morph-module-card flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-slate-600 uppercase">
                          {mod.code}
                        </span>
                      </div>
                      <h3 className="mt-3.5 text-base font-bold text-slate-900">{mod.title}</h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{mod.description}</p>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px]">
                      <span className="font-medium text-slate-500">{mod.roleTag}</span>
                      <span className="font-semibold text-emerald-700">{mod.accentLabel}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>

        {/* Unobtrusive Stage Progress Navigation HUD */}
        <div className="pointer-events-auto absolute bottom-5 left-1/2 z-40 hidden -translate-x-1/2 items-center gap-1.5 rounded-full border border-slate-200 bg-white/95 px-2.5 py-1.5 shadow-lg shadow-slate-900/5 backdrop-blur md:flex">
          {STAGE_LABELS.map((label, idx) => (
            <button
              key={label}
              type="button"
              onClick={() => handleScrollToStage(idx)}
              className={cn(
                'rounded-full px-3 py-1 text-[11px] font-semibold transition focus:outline-none focus:ring-2 focus:ring-emerald-600',
                activeStage === idx
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </section>
    );
  }

  // Mobile, Low-Performance, WebGL-Fallback, and Reduced-Motion Accessible Mode
  return (
    <section
      id="morph-showcase"
      ref={pinStageRef}
      aria-label="TCTESDAConnect Hero and Workflow Overview"
      className="bg-white pb-12 pt-24 sm:pb-16 sm:pt-28"
    >
      <div className="mx-auto max-w-7xl space-y-12 px-4 sm:px-6">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-6">{heroCopyContent}</div>
          <div className="simplified-laptop-stage min-w-0 lg:col-span-6">
            <LightweightLaptopMockup activePreset={activePreset}>
              <ExpandedDashboardPreview
                activePreset={activePreset}
                onSelectPreset={onSelectPreset}
                compact
                className="rounded-none border-0 shadow-none"
              />
            </LightweightLaptopMockup>
          </div>
        </div>

        {/* Expanded Dashboard Presentation (Visible & Accessible without Scroll Pinning) */}
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-xs font-bold tracking-wider text-emerald-700 uppercase">
              Unified Institutional Dashboard
            </p>
            <h2 className="mt-1 text-2xl font-extrabold text-slate-900">
              Complete Operational Visibility Across BST &amp; MIF
            </h2>
          </div>
          <ExpandedDashboardPreview activePreset={activePreset} onSelectPreset={onSelectPreset} />
        </div>

        {/* Separated Core Modules Reveal Grid */}
        <div id="morph-modules-section" className="simplified-modules-grid space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Core Workflow Modules
              </span>
              <h2 className="mt-2 text-2xl font-extrabold text-slate-900">
                Trainee Intake, Records, Batches, Schedules, Announcements &amp; Reports
              </h2>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MORPH_MODULE_CARDS.map((mod) => {
              const Icon = MODULE_ICONS[mod.id] ?? Users;
              return (
                <article
                  key={mod.id}
                  className="simplified-module-card flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/70 p-5 shadow-xs"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white text-emerald-700 shadow-2xs ring-1 ring-emerald-600/20">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="rounded-full bg-white px-2.5 py-0.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">
                        {mod.code}
                      </span>
                    </div>
                    <h3 className="mt-3 text-base font-bold text-slate-900">{mod.title}</h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{mod.description}</p>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-slate-200/80 pt-3 text-[11px]">
                    <span className="font-medium text-slate-500">{mod.roleTag}</span>
                    <span className="font-semibold text-emerald-700">{mod.accentLabel}</span>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
