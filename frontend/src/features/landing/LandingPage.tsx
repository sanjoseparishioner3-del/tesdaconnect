import React from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  CloudOff,
  FileSpreadsheet,
  GraduationCap,
  ShieldCheck,
  Smartphone,
  UserCheck,
  Users,
  Wifi,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { LaptopMorphShowcase } from '@/components/landing/LaptopMorphShowcase';
import { InstallAppButton } from '@/components/pwa/PwaInstallBanner';
import { Button } from '@/components/ui/button';
import type { HeroPresetKey } from '@/lib/landing/laptopMetrics';

const GALLERY_ITEMS = [
  { src: '/images/landing/tesda-main-plaza.jpg', title: 'Institutional operations', caption: 'Enrollment, verification and records for both campuses.' },
  { src: '/images/landing/tesda-welding-workshop.jpg', title: 'Welding (SMAW) workshop', caption: 'Competency checks and progress tracking for trainees.' },
  { src: '/images/landing/tesda-organic-farm.jpg', title: 'Mamburao Integrated Farm', caption: 'Field schedules and progress charts for agriculture programs.' },
  { src: '/images/landing/tesda-digital-lab.jpg', title: 'Digital and assessment labs', caption: 'Work saved on the device and sent when you are back online.' },
  { src: '/images/landing/tesda-automotive-shop.jpg', title: 'Automotive servicing', caption: 'Batch schedules and practical assessments.' },
  { src: '/images/landing/tesda-organic-crops.jpg', title: 'Organic agriculture', caption: 'Crop module tasks verified by Focal Persons.' },
  { src: '/images/landing/tesda-plumbing-assessment.jpg', title: 'Trade assessments', caption: 'Unit reviews toward qualification readiness.' },
  { src: '/images/landing/tesda-vr-welding-lab.jpg', title: 'Simulation and modern labs', caption: 'Safe practice before live workshop testing.' },
];

const BENEFITS = [
  {
    title: 'Works without signal',
    description: 'Sign in once, then keep reading schedules, announcements and your documents with no internet.',
    icon: CloudOff,
  },
  {
    title: 'Sends itself later',
    description: 'Forms and files you submit offline wait on your phone and upload automatically when you reconnect.',
    icon: Wifi,
  },
  {
    title: 'Private and secure',
    description: 'Each person only sees what their role allows, and each campus keeps its own records.',
    icon: ShieldCheck,
  },
  {
    title: 'Official forms and reports',
    description: 'Fill in and print the MIS 03-01 form, your digital ID and Excel or PDF reports.',
    icon: FileSpreadsheet,
  },
];

const OFFLINE_STEPS = [
  { step: '1', title: 'Sign in once', text: 'Use the internet the first time on each device.' },
  { step: '2', title: 'Keep working', text: 'Open the app, fill in forms and add documents even with no signal.' },
  { step: '3', title: 'It syncs by itself', text: 'Everything is sent as soon as you are back online.' },
];

const ROLES = [
  { title: 'Scholars and applicants', icon: GraduationCap, text: 'Register, upload requirements, see your schedule and carry your digital ID.' },
  { title: 'Registrars', icon: UserCheck, text: 'Verify documents, confirm enrollments and encode ULI after confirmation.' },
  { title: 'Focal Persons and trainers', icon: Users, text: 'Track progress and achievement charts and manage learning materials.' },
  { title: 'Administrators', icon: Building2, text: 'Schedule batches, publish announcements and manage accounts and reports.' },
];

/** Fades sections in as they enter the screen (skipped when the user prefers reduced motion). */
function useRevealOnScroll(rootRef: React.RefObject<HTMLElement | null>) {
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return undefined;
    }
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      gsap.set('.reveal', { opacity: 0, y: 28 });
      ScrollTrigger.batch('.reveal', {
        start: 'top 90%',
        once: true,
        onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 0.6, stagger: 0.08, ease: 'power3.out', overwrite: true }),
      });
    }, root);
    return () => ctx.revert();
  }, [rootRef]);
}

export function LandingPage() {
  const [preset, setPreset] = React.useState<HeroPresetKey>('core');
  const lowerRef = React.useRef<HTMLDivElement | null>(null);
  useRevealOnScroll(lowerRef);

  return (
    <div className="min-h-screen bg-white text-[#0F172A] selection:bg-emerald-600 selection:text-white">
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
            <a href="#morph-modules-section" className="transition hover:text-emerald-700">Features</a>
            <a href="#institutions" className="transition hover:text-emerald-700">Campuses</a>
            <a href="#offline" className="transition hover:text-emerald-700">Offline</a>
            <a href="#about" className="transition hover:text-emerald-700">Who it is for</a>
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
        {/* Real 3D laptop driven by GSAP: pinned scroll story on desktop, sticky scroll story on phones. */}
        <LaptopMorphShowcase activePreset={preset} onSelectPreset={setPreset} />

        <div ref={lowerRef}>
          {/* Campuses */}
          <section id="institutions" className="scroll-mt-16 border-t border-slate-200 bg-[#F8FAFC] px-4 py-12 sm:px-6 sm:py-16">
            <div className="mx-auto max-w-7xl">
              <p className="reveal text-xs font-bold tracking-[0.16em] text-emerald-700 uppercase">Campuses</p>
              <h2 className="reveal mt-2 max-w-2xl text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
                Two campuses in Occidental Mindoro, one system
              </h2>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {[
                  {
                    icon: Building2,
                    tag: 'BST · Tech-Voc',
                    name: 'Balli School of Technology',
                    text: 'Welding (SMAW NC II) and Automotive Servicing, with workshop schedules and registrar records.',
                    points: ['Digital MIS 03-01 registration', 'Document checklist and review', 'Batch scheduling'],
                  },
                  {
                    icon: GraduationCap,
                    tag: 'MIF · Agriculture',
                    name: 'Mamburao Integrated Farm',
                    text: 'Organic Agriculture Production NC II, with field schedules that work offline.',
                    points: ['Progress and achievement charts', 'Offline field schedules', 'Digital scholar ID'],
                  },
                ].map((c) => (
                  <article key={c.name} className="reveal rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-600/20">
                      <c.icon className="h-3.5 w-3.5" aria-hidden="true" />
                      {c.tag}
                    </span>
                    <h3 className="mt-3 text-lg font-bold text-slate-900">{c.name}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">{c.text}</p>
                    <ul className="mt-3 space-y-1.5">
                      {c.points.map((pt) => (
                        <li key={pt} className="flex items-center gap-2 text-sm text-slate-700">
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" /> {pt}
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>

              {/* Facilities: swipeable on phones, grid on larger screens */}
              <h3 className="reveal mt-10 text-lg font-bold text-slate-900">Our training facilities</h3>
              <div className="reveal -mx-4 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4 [&::-webkit-scrollbar]:hidden">
                {GALLERY_ITEMS.map((item) => (
                  <figure key={item.title} className="w-[76%] shrink-0 snap-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:w-auto">
                    <img
                      src={item.src}
                      alt={item.title}
                      width={640}
                      height={400}
                      loading="lazy"
                      decoding="async"
                      className="h-40 w-full bg-slate-100 object-cover sm:h-44"
                    />
                    <figcaption className="p-3.5">
                      <p className="text-sm font-bold text-slate-900">{item.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{item.caption}</p>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </section>

          {/* Offline */}
          <section id="offline" className="scroll-mt-16 border-t border-slate-200 bg-white px-4 py-12 sm:px-6 sm:py-16">
            <div className="mx-auto max-w-7xl">
              <p className="reveal text-xs font-bold tracking-[0.16em] text-emerald-700 uppercase">Built for the field</p>
              <h2 className="reveal mt-2 max-w-2xl text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
                Reliable even when the internet is not
              </h2>

              <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                {BENEFITS.map((b) => (
                  <article key={b.title} className="reveal rounded-2xl border border-slate-200 bg-[#F8FAFC] p-3.5 sm:p-5">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white text-emerald-700 ring-1 ring-emerald-600/20">
                      <b.icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <h3 className="mt-3 text-sm font-bold text-slate-900">{b.title}</h3>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-slate-600 sm:text-xs">{b.description}</p>
                  </article>
                ))}
              </div>

              <ol className="mt-8 grid gap-3 sm:grid-cols-3">
                {OFFLINE_STEPS.map((s) => (
                  <li key={s.step} className="reveal flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">{s.step}</span>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{s.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{s.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* Who it is for */}
          <section id="about" className="scroll-mt-16 border-t border-slate-200 bg-[#F8FAFC] px-4 py-12 sm:px-6 sm:py-16">
            <div className="mx-auto max-w-7xl">
              <p className="reveal text-xs font-bold tracking-[0.16em] text-emerald-700 uppercase">Who it is for</p>
              <h2 className="reveal mt-2 max-w-2xl text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
                One workspace for everyone in the training cycle
              </h2>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {ROLES.map((r) => (
                  <article key={r.title} className="reveal rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/15">
                      <r.icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <h3 className="mt-3 text-sm font-bold text-slate-900">{r.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">{r.text}</p>
                  </article>
                ))}
              </div>
            </div>
          </section>

          {/* Closing call to action */}
          <section className="border-t border-slate-200 bg-white px-4 py-12 sm:px-6 sm:py-16">
            <div className="reveal mx-auto flex max-w-5xl flex-col items-start gap-5 rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 sm:flex-row sm:items-center sm:justify-between sm:p-9">
              <div className="max-w-xl">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-600/20">
                  <Smartphone className="h-3.5 w-3.5" aria-hidden="true" /> Install it on your phone
                </span>
                <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900">Ready to get started?</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                  Sign in as a scholar, applicant, registrar, Focal Person, trainer or administrator to open your workspace.
                </p>
              </div>
              <Button
                asChild
                size="lg"
                className="h-12 w-full shrink-0 bg-emerald-600 text-white shadow-lg shadow-emerald-600/25 hover:bg-emerald-700 sm:w-auto"
              >
                <Link to="/login" state={{ morphFromLaptop: true, preset }}>
                  Sign in <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </section>
        </div>
      </main>

      <footer className="border-t border-slate-200 bg-[#F8FAFC] px-6 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] text-center text-xs text-slate-500">
        <p className="font-semibold text-slate-800">
          TCTESDAConnect · Balli School of Technology (BST) &amp; Mamburao Integrated Farm (MIF) · Occidental Mindoro
        </p>
        <p className="mt-1">Installable app that works offline.</p>
      </footer>
    </div>
  );
}
