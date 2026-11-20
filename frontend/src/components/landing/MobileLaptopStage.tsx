import React from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowRight, ChevronDown, WifiOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { LaptopScrollState } from '@/components/landing/LaptopCanvasScene';
import { LightweightLaptopMockup } from '@/components/landing/LightweightLaptopMockup';
import { LazyLaptopCanvasScene } from '@/components/landing/lazyLaptopScene';
import { HERO_PRESETS, type HeroPresetKey } from '@/lib/landing/laptopMetrics';
import { cn } from '@/lib/utils';

let registered = false;
function ensureRegistered() {
  if (!registered) {
    gsap.registerPlugin(ScrollTrigger);
    // Phone browsers resize the viewport while the address bar slides; do not rebuild on that.
    ScrollTrigger.config({ ignoreMobileResize: true });
    registered = true;
  }
}

/** Scroll position (0..1 of the pinned stage) at which each story chapter begins. */
const CHAPTERS: Array<{ preset: HeroPresetKey; from: number }> = [
  { preset: 'core', from: 0 },
  { preset: 'core', from: 0.4 },
  { preset: 'bst', from: 0.58 },
  { preset: 'mif', from: 0.75 },
  { preset: 'sync', from: 0.9 },
];

function chapterForProgress(p: number): number {
  let idx = 0;
  CHAPTERS.forEach((c, i) => {
    if (p >= c.from) idx = i;
  });
  return idx;
}

interface MobileLaptopStageProps {
  activePreset: HeroPresetKey;
  onSelectPreset: (preset: HeroPresetKey) => void;
  onWebglError: () => void;
}

/**
 * Phone and tablet hero. The real 3D laptop (GLB rendered with react-three-fiber) opens its lid on
 * load; scrolling then drives it through GSAP ScrollTrigger: it turns to face the viewer, grows,
 * and its screen cycles through Operations, BST, MIF and Offline sync. The stage is a CSS sticky
 * container (more reliable than JS pinning with mobile address bars).
 */
export function MobileLaptopStage({ activePreset, onSelectPreset, onWebglError }: MobileLaptopStageProps) {
  const sectionRef = React.useRef<HTMLElement | null>(null);
  const scrollStateRef = React.useRef<LaptopScrollState>({ progress: 0, isPinnedDesktop: false, lid: 0, mode: 'mobile' });
  const triggerRef = React.useRef<ScrollTrigger | null>(null);
  const chapterRef = React.useRef(0);
  const [chapter, setChapter] = React.useState(0);
  const [visible, setVisible] = React.useState(true);

  // Pause WebGL rendering while the stage is off screen (saves battery on phones).
  React.useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)), { rootMargin: '200px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  React.useEffect(() => {
    const section = sectionRef.current;
    if (!section) return undefined;
    ensureRegistered();

    const ctx = gsap.context(() => {
      const state = scrollStateRef.current;
      state.lid = 0;

      // Intro: the lid opens by itself, then the copy settles in.
      gsap.to(state, { lid: 1, duration: 1.9, delay: 0.3, ease: 'power3.inOut' });
      gsap.from('.mls-reveal', { opacity: 0, y: 22, duration: 0.8, stagger: 0.09, delay: 0.1, ease: 'power3.out' });

      const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: 'bottom bottom',
          scrub: 0.45,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            state.progress = self.progress;
            const next = chapterForProgress(self.progress);
            if (next !== chapterRef.current) {
              chapterRef.current = next;
              setChapter(next);
              const preset = CHAPTERS[next]?.preset;
              if (preset) onSelectPreset(preset);
            }
          },
        },
      });
      triggerRef.current = tl.scrollTrigger ?? null;

      // The intro copy lifts away as the laptop takes the stage; the caption card slides up.
      tl.to('.mls-copy', { opacity: 0, y: -46, duration: 0.2 }, 0.1)
        .fromTo('.mls-caption', { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.16 }, 0.36)
        .to('.mls-hint', { opacity: 0, duration: 0.06 }, 0.04);
    }, section);

    return () => {
      ctx.revert();
      triggerRef.current = null;
    };
    // The preset callback is stable enough; the timeline must be built once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fresh caption text each chapter.
  React.useEffect(() => {
    gsap.fromTo('.mls-caption-body', { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' });
  }, [chapter]);

  function jumpToChapter(index: number) {
    const st = triggerRef.current;
    const from = CHAPTERS[index]?.from ?? 0;
    if (!st) return;
    const y = st.start + (st.end - st.start) * Math.min(0.99, from + 0.02);
    window.scrollTo({ top: y, behavior: 'smooth' });
  }

  const spec = HERO_PRESETS[activePreset];
  const presetKeys: HeroPresetKey[] = ['core', 'bst', 'mif', 'sync'];

  return (
    <section
      id="morph-showcase"
      ref={sectionRef}
      aria-label="TCTESDAConnect overview with an interactive 3D laptop"
      className="relative bg-white"
      style={{ height: '340svh' }}
    >
      <div className="sticky top-0 flex h-svh w-full flex-col overflow-hidden bg-[radial-gradient(120%_70%_at_50%_100%,rgba(16,185,129,0.14),transparent_60%),linear-gradient(to_bottom,#ffffff,#f1f5f9)]">
        {/* 3D laptop fills the stage; copy and captions float above it. */}
        <div className="pointer-events-none absolute inset-0 z-10">
          <React.Suspense
            fallback={
              <div className="absolute inset-x-4 bottom-[18%] mx-auto max-w-sm opacity-80">
                <LightweightLaptopMockup activePreset={activePreset} />
              </div>
            }
          >
            <LazyLaptopCanvasScene
              activePreset={activePreset}
              scrollStateRef={scrollStateRef}
              onWebglError={onWebglError}
              quality="balanced"
              active={visible}
            />
          </React.Suspense>
        </div>

        {/* Intro copy */}
        <div className="mls-copy relative z-20 px-5 pt-[4.75rem]">
          <p className="mls-reveal inline-flex items-center gap-1.5 rounded-full border border-emerald-600/25 bg-white/80 px-3 py-1 text-[11px] font-semibold text-emerald-800 backdrop-blur">
            <WifiOff className="h-3 w-3" aria-hidden="true" /> Works offline · BST &amp; MIF
          </p>
          <h1 className="mls-reveal mt-3 text-[1.95rem] font-extrabold leading-[1.08] tracking-tight text-slate-900">
            TESDA training,
            <br />
            <span className="text-emerald-600">simple and always with you.</span>
          </h1>
          <p className="mls-reveal mt-3 max-w-sm text-[0.95rem] leading-relaxed text-slate-600">
            Register, submit your requirements and follow your schedule from any phone, even with no signal.
          </p>
          <div className="mls-reveal pointer-events-auto mt-4 flex flex-wrap items-center gap-2.5">
            <Link
              to="/login"
              state={{ morphFromLaptop: true, preset: activePreset }}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 active:scale-[0.98]"
            >
              Sign in <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <a
              href="#morph-modules-section"
              className="inline-flex h-11 items-center rounded-xl border border-slate-300 bg-white/80 px-4 text-sm font-semibold text-slate-800 backdrop-blur active:scale-[0.98]"
            >
              See features
            </a>
          </div>
        </div>

        {/* Scroll hint */}
        <div className="mls-hint pointer-events-none absolute inset-x-0 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-20 flex flex-col items-center gap-1 text-[11px] font-medium text-slate-500" aria-hidden="true">
          Scroll
          <ChevronDown className="h-4 w-4 animate-bounce" />
        </div>

        {/* Chapter caption card */}
        <div
          className="mls-caption pointer-events-auto absolute inset-x-3 bottom-[calc(0.9rem+env(safe-area-inset-bottom))] z-30 rounded-2xl border border-slate-200/80 bg-white/95 p-3.5 opacity-0 shadow-xl shadow-slate-900/10 backdrop-blur"
        >
          <div className="mls-caption-body">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">{spec.institutionTag}</p>
            <h2 className="mt-0.5 text-base font-bold leading-snug text-slate-900">{spec.headline}</h2>
            <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-600">{spec.subline}</p>
            <ul className="mt-2.5 grid grid-cols-2 gap-1.5">
              {spec.kpis.slice(0, 2).map((k) => (
                <li key={k.label} className="rounded-lg bg-slate-50 px-2.5 py-1.5">
                  <p className="text-[10px] text-slate-500">{k.label}</p>
                  <p className="truncate text-xs font-bold text-slate-900">{k.value}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2" role="group" aria-label="Choose what the laptop shows">
            {presetKeys.map((key) => {
              const idx = CHAPTERS.findIndex((c) => c.preset === key && c.from > 0);
              const selected = activePreset === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => jumpToChapter(idx < 0 ? 1 : idx)}
                  className={cn(
                    'h-8 flex-1 rounded-full border text-[11px] font-semibold transition-colors',
                    selected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 bg-white text-slate-600',
                  )}
                >
                  {HERO_PRESETS[key].shortLabel.replace(' Campus', '').replace('Unified ', '')}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
