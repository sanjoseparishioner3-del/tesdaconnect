import { Building2, Sprout } from 'lucide-react';
import { LoginLaptopPreview } from '@/features/auth/components/LoginLaptopPreview';
import type { HeroPresetKey } from '@/lib/landing/laptopMetrics';

interface LoginBrandingPanelProps {
  initialPreset?: HeroPresetKey;
}

export function LoginBrandingPanel({ initialPreset }: LoginBrandingPanelProps) {
  return (
    <section
      aria-label="TCTESDAConnect Institutional Overview"
      className="relative hidden flex-col justify-between overflow-hidden rounded-3xl border border-slate-200/80 bg-white lg:flex lg:col-span-7"
    >
      {/* Subtle bright top-right institutional campus architectural fade matching landing branding */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-0 right-0 h-72 w-80 overflow-hidden opacity-15"
      >
        <img
          src="/images/landing/tesda-main-plaza.jpg"
          alt=""
          className="h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-bl from-transparent via-white/70 to-white" />
      </div>

      {/* Top Header & Headline */}
      <div className="relative z-10 space-y-5 px-8 pt-8 xl:px-10 xl:pt-9">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white p-1 shadow-sm border border-slate-200">
            <img src="/tesda-logo.png" alt="TESDA Seal" className="h-full w-full object-contain" />
          </div>
          <div>
            <p className="text-lg font-extrabold tracking-tight text-[#0F172A]">
              TCTESDA<span className="text-[#047857]">Connect</span>
            </p>
            <p className="text-xs font-medium text-slate-500">
              TESDA Training Operations Workflow Support
            </p>
          </div>
        </div>

        <div className="max-w-xl space-y-2.5">
          <h1 className="text-3xl font-extrabold tracking-tight text-[#0F172A] xl:text-[2.35rem] xl:leading-[1.12]">
            Training Operations{' '}
            <span className="text-[#047857]">Management System</span>
          </h1>
          <p className="text-sm leading-relaxed text-slate-600">
            A centralized, secure, and offline-capable platform for managing trainee intake,
            training records, batches, schedules, announcements, and reports for Balli School of
            Technology and Mamburao Integrated Farm.
          </p>
        </div>
      </div>

      {/* Interactive 3D Laptop Centerpiece + Floating Workflow Indicators */}
      <div className="relative z-10 my-2 px-4 xl:px-8">
        <LoginLaptopPreview initialPreset={initialPreset} />
      </div>

      {/* Bottom Institutional Campus Strip (Pure Emerald Gradient Banner) */}
      <div className="relative z-10 mt-auto border-t border-emerald-700/15 bg-gradient-to-r from-[#047857] via-[#059669] to-[#10B981] px-8 py-5 text-white xl:px-10">
        <div className="grid gap-4 sm:grid-cols-2 sm:divide-x sm:divide-white/20">
          <div className="flex items-start gap-3 pr-2">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-emerald-700">
              <Sprout className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="flex flex-wrap items-center gap-2 text-xs font-bold tracking-wide text-white">
                Mamburao Integrated Farm (MIF)
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-emerald-700">Now enrolling</span>
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-emerald-50/90">
                Organic Agriculture Production NC II: field operations, batches and progress charts
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 sm:pl-4">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white">
              <Building2 className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="flex flex-wrap items-center gap-2 text-xs font-bold tracking-wide text-white">
                Balli School of Technology (BST)
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white">Opening next year</span>
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-emerald-50/90">
                Shielded Metal Arc Welding NC II, coming soon
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
