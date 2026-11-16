import React from 'react';
import {
  CalendarDays,
  CloudOff,
  FileBarChart2,
  FilePlus2,
  Layers,
} from 'lucide-react';
import type { LaptopScrollState } from '@/components/landing/LaptopCanvasScene';
import { LightweightLaptopMockup } from '@/components/landing/LightweightLaptopMockup';
import { detectLandingCapabilities, type HeroPresetKey } from '@/lib/landing/laptopMetrics';

const LazyLaptopCanvasScene = React.lazy(() => import('@/components/landing/LaptopCanvasScene'));

const FLOATING_INDICATORS = [
  {
    id: 'intake',
    label: 'Trainee Intake',
    sublabel: 'MIS 03-01 Ready',
    icon: FilePlus2,
    positionClass: 'top-4 left-0 xl:-left-4',
  },
  {
    id: 'batches',
    label: 'Training Batches',
    sublabel: 'BST & MIF Cohorts',
    icon: Layers,
    positionClass: 'top-1/2 -left-2 -translate-y-1/2 xl:-left-5',
  },
  {
    id: 'offline',
    label: 'Offline Capabilities',
    sublabel: 'IndexedDB Vault',
    icon: CloudOff,
    positionClass: 'bottom-6 left-2 xl:-left-2',
  },
  {
    id: 'schedules',
    label: 'Schedules',
    sublabel: 'Synced Calendar',
    icon: CalendarDays,
    positionClass: 'top-10 right-0 xl:-right-4',
  },
  {
    id: 'reports',
    label: 'Reports',
    sublabel: 'ExcelJS & pdf-lib',
    icon: FileBarChart2,
    positionClass: 'bottom-12 right-1 xl:-right-4',
  },
] as const;

interface LoginLaptopPreviewProps {
  initialPreset?: HeroPresetKey;
}

export function LoginLaptopPreview({ initialPreset = 'core' }: LoginLaptopPreviewProps) {
  const [capabilities, setCapabilities] = React.useState(() => detectLandingCapabilities());
  const [webglError, setWebglError] = React.useState(false);

  const scrollStateRef = React.useRef<LaptopScrollState>({
    progress: 0,
    isPinnedDesktop: false,
  });

  React.useEffect(() => {
    setCapabilities(detectLandingCapabilities());
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const mqMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setCapabilities(detectLandingCapabilities());
    mqMotion.addEventListener('change', onChange);
    return () => mqMotion.removeEventListener('change', onChange);
  }, []);

  const activePreset: HeroPresetKey = initialPreset;
  const portalView = 'staff' as const;
  const useLightweight = capabilities.useSimplifiedMorph || webglError;

  return (
    <div
      data-login-laptop-stage
      className="relative mx-auto flex h-[310px] w-full max-w-[600px] items-center justify-center xl:h-[340px]"
    >
      {/* Subtle emerald ground ambiance underneath laptop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-4 left-1/2 h-14 w-[76%] -translate-x-1/2 rounded-full bg-emerald-500/12 blur-2xl"
      />

      {/* Center 3D Laptop Canvas (reuses shared GLB model & fallback architecture) */}
      <div className="relative z-10 h-full w-full max-w-[490px]">
        {useLightweight ? (
          <div className="flex h-full items-center justify-center px-4">
            <LightweightLaptopMockup activePreset={activePreset} />
          </div>
        ) : (
          <React.Suspense
            fallback={
              <div className="flex h-full items-center justify-center px-4">
                <LightweightLaptopMockup activePreset={activePreset} />
              </div>
            }
          >
            <LazyLaptopCanvasScene
              activePreset={activePreset}
              portalView={portalView}
              scrollStateRef={scrollStateRef}
              onWebglError={() => setWebglError(true)}
            />
          </React.Suspense>
        )}
      </div>

      {/* Surrounding Floating Workflow Indicators */}
      {FLOATING_INDICATORS.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.id}
            data-login-float-badge
            className={`pointer-events-none absolute z-20 hidden items-center gap-2.5 rounded-2xl border border-slate-200/90 bg-white/95 px-3 py-2 shadow-lg shadow-slate-900/5 sm:flex ${item.positionClass}`}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#047857]">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="leading-tight">
              <span className="block text-[11px] font-bold text-[#0F172A]">{item.label}</span>
              <span className="block text-[10px] font-medium text-slate-500">{item.sublabel}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
