import React from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  CloudOff,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  Megaphone,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { HERO_PRESETS, type HeroPresetKey } from '@/lib/landing/laptopMetrics';
import { cn } from '@/lib/utils';

interface ExpandedDashboardPreviewProps {
  activePreset: HeroPresetKey;
  onSelectPreset?: (preset: HeroPresetKey) => void;
  compact?: boolean;
  className?: string;
}

const PREVIEW_NAV = [
  { label: 'Dashboard', icon: LayoutDashboard, active: true },
  { label: 'Registration Intake', icon: FileText, active: false },
  { label: 'Schedules & Calendar', icon: CalendarDays, active: false },
  { label: 'Trainee Records', icon: Users, active: false },
  { label: 'Announcements', icon: Megaphone, active: false },
  { label: 'Reports & Exports', icon: FileSpreadsheet, active: false },
];

export const ExpandedDashboardPreview = React.forwardRef<HTMLDivElement, ExpandedDashboardPreviewProps>(
  function ExpandedDashboardPreview({ activePreset, onSelectPreset, compact = false, className }, ref) {
    const spec = HERO_PRESETS[activePreset];

    return (
      <div
        ref={ref}
        className={cn(
          'overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-[0_28px_70px_-18px_rgba(15,23,42,0.22)]',
          className,
        )}
      >
        {/* Browser / App Chrome Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span className="ml-2 text-xs font-semibold text-slate-700">
              TCTESDAConnect · {spec.headline}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-600/20">
              <CloudOff className="h-3 w-3" />
              {spec.institutionTag}
            </span>
          </div>
        </div>

        <div className={cn('grid grid-cols-1 bg-white', compact ? '' : 'md:grid-cols-[200px_minmax(0,1fr)]')}>
          {/* Flat Non-Collapsible Institutional Sidebar Preview */}
          {!compact && (
            <aside className="hidden flex-col justify-between bg-[#0f295c] p-3.5 text-slate-100 md:flex">
              <div>
                <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-xs font-extrabold text-[#0f295c]">
                    TC
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold leading-none text-white">TESDAConnect</p>
                    <p className="mt-0.5 truncate text-[10px] text-emerald-300">Operations Portal</p>
                  </div>
                </div>

                <ul className="mt-3 space-y-1">
                  {PREVIEW_NAV.map((item) => {
                    const Icon = item.icon;
                    return (
                      <li
                        key={item.label}
                        className={cn(
                          'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[11px] font-medium',
                          item.active ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-200/85',
                        )}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-2.5 text-[10px] text-slate-200">
                <p className="font-semibold text-emerald-300">RLS + IndexedDB Active</p>
                <p className="mt-0.5 text-slate-300/80">Flat navigation · Zero accordions</p>
              </div>
            </aside>
          )}

          {/* Main Dashboard Workspace Preview */}
          <div className={cn('min-w-0 space-y-4 bg-white', compact ? 'p-3 sm:p-4' : 'p-4 sm:p-5')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-bold tracking-wider text-emerald-700 uppercase">
                  Live Workspace Architecture
                </p>
                <h3 className="text-base font-bold text-slate-900 sm:text-lg">{spec.headline}</h3>
                <p className="text-xs text-slate-600">{spec.subline}</p>
              </div>

              {onSelectPreset && (
                <div className="flex flex-wrap gap-1">
                  {(['core', 'bst', 'mif', 'sync'] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onSelectPreset(key)}
                      className={cn(
                        'rounded-md px-2 py-1 text-[10px] font-semibold transition',
                        activePreset === key
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                      )}
                    >
                      {HERO_PRESETS[key].shortLabel}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* KPI Row */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {spec.kpis.map((kpi) => (
                <div
                  key={kpi.label}
                  className="rounded-xl border border-slate-200 bg-slate-50/80 p-2.5"
                >
                  <p className="text-[10px] font-semibold text-slate-500 uppercase">{kpi.label}</p>
                  <p className="mt-1 text-lg font-extrabold tracking-tight text-slate-900">{kpi.value}</p>
                  <p className="mt-0.5 text-[10px] font-medium text-emerald-700">{kpi.delta}</p>
                </div>
              ))}
            </div>

            {/* Bottom Two-Column Preview */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1.35fr_.65fr]">
              <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-1">
                  <span className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-slate-800">
                    <ClipboardCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    Active TESDA Operational Pipeline
                  </span>
                  <span className="text-[10px] font-semibold text-emerald-700">MIS 03-01 Verified</span>
                </div>
                <div className="space-y-1.5">
                  {spec.workflows.map((wf) => (
                    <div
                      key={wf.title}
                      className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-semibold text-slate-900">{wf.title}</p>
                        <p className="truncate text-[10px] text-slate-500">{wf.meta}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                        {wf.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex min-w-0 flex-col justify-between rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                    Governance &amp; ULI
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600">
                    Post-confirmation TESDA Main ULI assignment with 8-document digital verification.
                  </p>
                </div>
                <div className="mt-2.5 space-y-1 text-[10px] font-medium text-emerald-800">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                    MIS 03-01 Filled / Blank PDF
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                    Admin Scheduling &amp; Focal Charts
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  },
);
