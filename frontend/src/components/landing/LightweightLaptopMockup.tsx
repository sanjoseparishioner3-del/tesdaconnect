import React from 'react';
import { HERO_PRESETS, type HeroPresetKey } from '@/lib/landing/laptopMetrics';

interface LightweightLaptopMockupProps {
  activePreset: HeroPresetKey;
  children?: React.ReactNode;
}

/**
 * Accessible, zero-GPU-cost brushed-silver laptop frame rendered when WebGL is disabled,
 * on low-performance devices, on simplified mobile layouts, or while the 3D GLB bundle streams.
 */
export function LightweightLaptopMockup({ activePreset, children }: LightweightLaptopMockupProps) {
  const spec = HERO_PRESETS[activePreset];

  return (
    <div className="mx-auto w-full max-w-[540px] select-none">
      {/* Upper Screen Lid */}
      <div className="rounded-t-2xl border-[6px] border-slate-300 bg-slate-900 p-2 shadow-xl shadow-slate-900/10 ring-1 ring-slate-200">
        <div className="mx-auto mb-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
        <div className="overflow-hidden rounded-lg bg-white">
          {children ?? (
            <div className="space-y-3 p-4 text-left">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-600 text-[10px] font-black text-white">
                    TC
                  </span>
                  <span className="text-xs font-bold text-slate-900">TCTESDAConnect</span>
                </div>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  {spec.shortLabel}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {spec.kpis.map((kpi) => (
                  <div key={kpi.label} className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <p className="text-[9px] font-semibold text-slate-500 uppercase">{kpi.label}</p>
                    <p className="text-sm font-extrabold text-slate-900">{kpi.value}</p>
                    <p className="text-[9px] font-medium text-emerald-700">{kpi.delta}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Brushed Aluminum Base Lip */}
      <div className="mx-auto h-3.5 w-full rounded-b-xl bg-gradient-to-b from-slate-200 via-slate-300 to-slate-400 shadow-md">
        <div className="mx-auto h-1 w-16 rounded-b-full bg-slate-400/80" />
      </div>
    </div>
  );
}
