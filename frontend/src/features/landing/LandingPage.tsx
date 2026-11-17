import React from 'react';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  CloudOff,
  Cpu,
  Database,
  FileSpreadsheet,
  GraduationCap,
  ShieldCheck,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { LaptopMorphShowcase } from '@/components/landing/LaptopMorphShowcase';
import { InstallAppButton } from '@/components/pwa/PwaInstallBanner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { HeroPresetKey } from '@/lib/landing/laptopMetrics';

const GALLERY_ITEMS = [
  {
    src: '/images/landing/tesda-main-plaza.jpg',
    title: 'Institutional Operations Hub',
    caption: 'Unified enrollment verification, ULI tracking, and registrar compliance across BST and MIF.',
  },
  {
    src: '/images/landing/tesda-welding-workshop.jpg',
    title: 'SMAW & Metals Assessment',
    caption: 'Competency unit verification with progress/achievement task checklists.',
  },
  {
    src: '/images/landing/tesda-organic-farm.jpg',
    title: 'Mamburao Integrated Farm (MIF)',
    caption: 'Progress & Achievement Chart task tracking for agricultural NC II programs.',
  },
  {
    src: '/images/landing/tesda-digital-lab.jpg',
    title: 'Digital & Assessment Labs',
    caption: 'Offline-first IndexedDB drafts synced safely with conflict resolution once reconnected.',
  },
  {
    src: '/images/landing/tesda-automotive-shop.jpg',
    title: 'Automotive Servicing Workshop',
    caption: 'Batch capacity tracking and practical skills assessment schedules for BST scholars.',
  },
  {
    src: '/images/landing/tesda-organic-crops.jpg',
    title: 'Organic Agriculture Production',
    caption: 'Agricultural crop module tasks and verified Progress Chart tracking at MIF.',
  },
  {
    src: '/images/landing/tesda-plumbing-assessment.jpg',
    title: 'Technical & Trade Assessments',
    caption: 'Locked unit reviews managed by Focal Persons toward TESDA qualification readiness.',
  },
  {
    src: '/images/landing/tesda-vr-welding-lab.jpg',
    title: 'Simulation & Modern Training Labs',
    caption: 'Safe competency progression before live workshop accreditation testing.',
  },
];

const TECHNOLOGY_PILLARS = [
  {
    title: 'React + TypeScript + Vite PWA',
    description:
      'Strongly typed component architecture with Workbox service worker precaching so field teams open portals seamlessly offline.',
    icon: Cpu,
    badge: 'Installable PWA',
  },
  {
    title: 'Supabase + PostgreSQL RLS',
    description:
      'Strict row-level security, immutable security audit trails, private storage buckets, and server-side ULI assignment locks.',
    icon: ShieldCheck,
    badge: 'Zero-Trust RBAC',
  },
  {
    title: 'IndexedDB & Conflict-Safe Sync',
    description:
      'Dexie.js local storage caches MIS 03-01 intakes, documents, announcements, and schedules with manual drift resolution.',
    icon: CloudOff,
    badge: 'Offline Resilience',
  },
  {
    title: 'Official Exports & Document Engine',
    description:
      'Client and server export workflows using ExcelJS and pdf-lib for 2-page MIS 03-01 forms, Digital System IDs, and reports.',
    icon: FileSpreadsheet,
    badge: 'ExcelJS + pdf-lib',
  },
];

export function LandingPage() {
  const [preset, setPreset] = React.useState<HeroPresetKey>('core');

  return (
    <div className="min-h-screen bg-white text-[#0F172A] selection:bg-emerald-600 selection:text-white">
      {/* Fixed Institutional Navigation Header aligned to y=0 ScrollTrigger pin */}
      <header className="fixed inset-x-0 top-0 z-50 h-16 border-b border-slate-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-2 px-3 sm:gap-4 sm:px-6">
          <a href="#top" className="flex min-w-0 items-center gap-2 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 sm:gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-sm font-extrabold text-white shadow-xs sm:h-10 sm:w-10 sm:text-base">
              TC
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold tracking-tight text-slate-900 sm:text-base">
                TCTESDA<span className="text-emerald-600">Connect</span>
              </p>
              <p className="hidden truncate text-xs text-slate-500 sm:block">Training Operations Workflow Support</p>
            </div>
          </a>

          <nav aria-label="Primary landing navigation" className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
            <a href="#morph-showcase" className="transition hover:text-emerald-700 focus-visible:text-emerald-700">
              Workflow Morph
            </a>
            <a href="#institutions" className="transition hover:text-emerald-700 focus-visible:text-emerald-700">
              Supported Institutions
            </a>
            <a href="#technology" className="transition hover:text-emerald-700 focus-visible:text-emerald-700">
              Technology
            </a>
            <a href="#about" className="transition hover:text-emerald-700 focus-visible:text-emerald-700">
              About
            </a>
          </nav>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
            <InstallAppButton />
            <Button
              asChild
              className="h-9 bg-emerald-600 px-3 text-xs text-white hover:bg-emerald-700 focus-visible:ring-emerald-600 sm:h-10 sm:px-4 sm:text-sm"
            >
              <Link to="/login" state={{ morphFromLaptop: true, preset }}>
                <span className="sm:hidden">Login</span>
                <span className="hidden sm:inline">Staff &amp; Scholar Login</span>
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Stages 1–4: Continuous Scrubbed 3D Laptop -> Dashboard -> Modular Workflow Showcase */}
        <LaptopMorphShowcase activePreset={preset} onSelectPreset={setPreset} />

        {/* Stage 5 Section 1: Supported Institutions & Field Documentation */}
        <section id="institutions" className="scroll-mt-20 border-t border-slate-200 bg-[#F8FAFC] py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div>
                <p className="text-xs font-bold tracking-[0.16em] text-emerald-700 uppercase">
                  Supported Institutions
                </p>
                <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
                  Two Occidental Mindoro Campuses, One Verified Operations Standard
                </h2>
              </div>
              <p className="max-w-xl text-sm leading-relaxed text-slate-600">
                Strict institutional scoping keeps trainee intake, 8-document checklists, schedules, and ULI records isolated for each TESDA training center.
              </p>
            </div>

            {/* Dual Institution Cards */}
            <div className="mt-10 grid gap-6 md:grid-cols-2">
              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm transition hover:border-emerald-300 hover:shadow-md">
                <CardHeader className="border-b border-slate-100 bg-white pb-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-600/20">
                      <Building2 className="h-3.5 w-3.5" />
                      BST · TECH-VOC
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setPreset('bst');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="text-xs font-semibold text-emerald-700 hover:underline"
                    >
                      Focus in 3D Preview ↗
                    </button>
                  </div>
                  <CardTitle className="mt-3 text-xl text-slate-900">
                    Balli School of Technology (BST)
                  </CardTitle>
                  <CardDescription className="text-slate-600">
                    Delivering Shielded Metal Arc Welding (SMAW NC II) and Automotive Servicing cohorts with laboratory scheduling and registrar dossier governance.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pt-4 text-sm text-slate-700">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <span className="flex items-center gap-2 text-xs">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" /> MIS 03-01 Digital Intake
                    </span>
                    <span className="flex items-center gap-2 text-xs">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Post-Confirmation ULI Gate
                    </span>
                    <span className="flex items-center gap-2 text-xs">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Admin Batch Scheduling
                    </span>
                    <span className="flex items-center gap-2 text-xs">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" /> 8-Requirement File Review
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card className="overflow-hidden border-slate-200 bg-white shadow-sm transition hover:border-emerald-300 hover:shadow-md">
                <CardHeader className="border-b border-slate-100 bg-white pb-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-600/20">
                      <GraduationCap className="h-3.5 w-3.5" />
                      MIF · AGRICULTURE
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setPreset('mif');
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="text-xs font-semibold text-emerald-700 hover:underline"
                    >
                      Focus in 3D Preview ↗
                    </button>
                  </div>
                  <CardTitle className="mt-3 text-xl text-slate-900">
                    Mamburao Integrated Farm (MIF)
                  </CardTitle>
                  <CardDescription className="text-slate-600">
                    Supporting Organic Agriculture Production NC II cohorts with field-ready offline login, Progress &amp; Achievement Charts, and calendar sync.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pt-4 text-sm text-slate-700">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <span className="flex items-center gap-2 text-xs">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Focal Progress Chart Tasks
                    </span>
                    <span className="flex items-center gap-2 text-xs">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Offline Field Schedules
                    </span>
                    <span className="flex items-center gap-2 text-xs">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Scoped Announcements
                    </span>
                    <span className="flex items-center gap-2 text-xs">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Digital System Account IDs
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Preserved 8 TESDA Documentation Photos Grid */}
            <div className="mt-14">
              <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 sm:text-xl">
                    Verified Institutional &amp; Workshop Documentation
                  </h3>
                  <p className="text-sm text-slate-600">
                    Training facilities and field operations supported across Occidental Mindoro campuses.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 text-xs font-medium text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <CloudOff className="h-4 w-4 text-emerald-600" /> Dexie.js Offline Queue
                  </span>
                  <span className="flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" /> Postgres RLS + Audit Trail
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Database className="h-4 w-4 text-emerald-600" /> Scoped Compliance
                  </span>
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {GALLERY_ITEMS.map((item) => (
                  <Card
                    key={item.title}
                    className="overflow-hidden border-slate-200 bg-white shadow-xs transition hover:border-emerald-300 hover:shadow-md"
                  >
                    <img
                      src={item.src}
                      alt={item.title}
                      className="h-44 w-full bg-slate-100 object-cover"
                      loading="eager"
                    />
                    <CardHeader className="p-4">
                      <CardTitle className="text-sm font-bold text-slate-900">{item.title}</CardTitle>
                      <CardDescription className="text-xs leading-relaxed text-slate-600">
                        {item.caption}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Stage 5 Section 2: Technology Stack Architecture */}
        <section id="technology" className="scroll-mt-20 border-t border-slate-200 bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <p className="text-xs font-bold tracking-[0.16em] text-emerald-700 uppercase">
                Technology Architecture
              </p>
              <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
                Built for Offline Reliability and Institutional Data Integrity
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Engineered as an offline-capable Progressive Web App backed by row-level PostgreSQL security — never sacrificing registrar governance when field internet drops.
              </p>
            </div>

            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {TECHNOLOGY_PILLARS.map((tech) => {
                const Icon = tech.icon;
                return (
                  <Card key={tech.title} className="border-slate-200 bg-[#F8FAFC] shadow-2xs">
                    <CardContent className="flex h-full flex-col justify-between p-5">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white text-emerald-700 ring-1 ring-emerald-600/20">
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                            {tech.badge}
                          </span>
                        </div>
                        <h3 className="mt-4 text-sm font-bold text-slate-900">{tech.title}</h3>
                        <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                          {tech.description}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Stage 5 Section 3: About TCTESDAConnect */}
        <section id="about" className="scroll-mt-20 border-t border-slate-200 bg-[#F8FAFC] py-16 sm:py-20">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-12 lg:items-center">
            <div className="space-y-4 lg:col-span-6">
              <p className="text-xs font-bold tracking-[0.16em] text-emerald-700 uppercase">
                About TCTESDAConnect
              </p>
              <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
                Designed Around Philippine TVET Operational Realities
              </h2>
              <p className="text-sm leading-relaxed text-slate-600">
                TCTESDAConnect streamlines every workflow required across accredited TESDA training centers — from digital MIS 03-01 (ver. 2021) learner profiling and documentary verification to post-confirmation ULI control, Focal Person competency charts, and synchronized announcements.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:col-span-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-bold text-emerald-700 uppercase">Role Separation</p>
                <p className="mt-1.5 text-sm font-bold text-slate-900">Clear Institutional Guardrails</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Admins manage batch scheduling; Focal Persons manage Progress &amp; Achievement Charts; Registrars and Admins verify 8 documentary requirements and encode TESDA Main ULIs after confirmation.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-bold text-emerald-700 uppercase">Shared-Device Safe</p>
                <p className="mt-1.5 text-sm font-bold text-slate-900">Opt-In Encrypted Offline Access</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  Scholars and staff can view cached schedules, announcements, personal documents, and MIS 03-01 forms offline with explicit PBKDF2 unlock protection and zero implicit background leaks.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Stage 5 Section 4: Institutional Closing CTA */}
        <section className="border-t border-slate-200 bg-white py-16">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <div className="flex flex-col items-start justify-between gap-6 rounded-3xl border border-emerald-200 bg-emerald-50/60 p-8 sm:flex-row sm:items-center sm:p-10">
              <div className="max-w-xl space-y-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-600/20">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Production Ready PWA Portal
                </span>
                <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
                  Ready to manage TESDA cohorts with confidence?
                </h2>
                <p className="text-sm text-slate-600">
                  Sign in as System Administrator, Registrar, Focal Person, or Scholar / Applicant to access your institutional workspace.
                </p>
              </div>

              <Button
                asChild
                size="lg"
                className="shrink-0 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 focus-visible:ring-emerald-600"
              >
                <Link to="/login" state={{ morphFromLaptop: true, preset }}>
                  Open Operations Portal <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-[#F8FAFC] px-6 py-8 text-center text-xs text-slate-500">
        <p className="font-semibold text-slate-800">
          TCTESDAConnect · Balli School of Technology (BST) &amp; Mamburao Integrated Farm (MIF) · Occidental Mindoro
        </p>
        <p className="mt-1">
          Offline-First Progressive Web Application · Powered by React, TypeScript, Tailwind CSS, GSAP, React Three Fiber &amp; Supabase.
        </p>
      </footer>
    </div>
  );
}
