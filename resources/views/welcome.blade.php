<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" class="scroll-smooth bg-[#031826]">
    <head>
        @include('partials.head', ['title' => 'TESDAConnect — 3D Training Operations Portal'])
        <style>
            .tesda-tilt-card {
                position: relative;
                transform-style: preserve-3d;
                transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 220ms ease;
                will-change: transform;
            }
            .tesda-tilt-card::after {
                content: '';
                position: absolute;
                inset: 0;
                border-radius: inherit;
                pointer-events: none;
                opacity: 0;
                transition: opacity 220ms ease;
                background: radial-gradient(420px circle at var(--mx, 50%) var(--my, 50%), rgba(94, 234, 212, 0.18), transparent 55%);
            }
            .tesda-tilt-card:hover::after {
                opacity: 1;
            }
            .tesda-tilt-elevate {
                transform: translateZ(24px);
            }
            @media (prefers-reduced-motion: reduce) {
                .tesda-tilt-card,
                .tesda-tilt-card::after {
                    transition: none !important;
                    transform: none !important;
                }
            }
        </style>
    </head>
    <body class="min-h-screen bg-[#031826] text-white antialiased selection:bg-teal-400 selection:text-slate-950" data-tesda-landing>
        @php
            $traineeCount = \App\Models\EnrollmentApplication::count();
            $batchCount = \App\Models\TrainingBatch::whereIn('status', ['upcoming', 'in_training'])->count();
            $courseCount = \App\Models\Course::where('is_active', true)->count();

            $documentationPhotos = [
                [
                    'src' => asset('images/landing/tesda-main-plaza.jpg'),
                    'category' => 'digital',
                    'tag' => 'TESDA Institutional',
                    'title' => 'TESDA Central Complex & Official Seal Plaza',
                    'desc' => 'Field documentation featuring TESDA trainees, assessors, and staff in front of the TESDA administration complex.',
                    'credit' => 'Presidential Communications Office · Public Domain (Wikimedia Commons)',
                ],
                [
                    'src' => asset('images/landing/tesda-welding-workshop.jpg'),
                    'category' => 'workshops',
                    'tag' => 'SMAW / Welding',
                    'title' => 'Practical Welding Working Area & Safety Booths',
                    'desc' => 'Hands-on TESDA welding stations equipped with safety curtains, PPE helmets, and industrial welding power units.',
                    'credit' => 'Presidential Communications Office · Public Domain (Wikimedia Commons)',
                ],
                [
                    'src' => asset('images/landing/tesda-vr-welding-lab.jpg'),
                    'category' => 'workshops',
                    'tag' => 'VRTEX 360+ Simulator',
                    'title' => 'Virtual Welding Simulation & Position Assessment',
                    'desc' => 'Trainees practicing flat, horizontal, vertical, and overhead weld joints using virtual reality simulation equipment.',
                    'credit' => 'Presidential Communications Office · Public Domain (Wikimedia Commons)',
                ],
                [
                    'src' => asset('images/landing/tesda-organic-farm.jpg'),
                    'category' => 'agriculture',
                    'tag' => 'Organic Agriculture NC II',
                    'title' => 'Organic Composting & Vegetable Bed Management',
                    'desc' => 'Applied Philippine organic crop cultivation, soil enrichment, and sustainable farm input management.',
                    'credit' => 'AusAID / PACAP · CC BY 2.0 (Wikimedia Commons)',
                ],
                [
                    'src' => asset('images/landing/tesda-plumbing-assessment.jpg'),
                    'category' => 'workshops',
                    'tag' => 'Plumbing & Pipe Fusion',
                    'title' => 'Technical Pipe Joining & PPE Inspection Station',
                    'desc' => 'Competency practice on pressurized piping assembly with full occupational safety helmets, goggles, and high-visibility gear.',
                    'credit' => 'Presidential Communications Office · Public Domain (Wikimedia Commons)',
                ],
                [
                    'src' => asset('images/landing/tesda-automotive-shop.jpg'),
                    'category' => 'workshops',
                    'tag' => 'Automotive Servicing',
                    'title' => 'Engine Diagnostics & Under-Hood Practical Bay',
                    'desc' => 'Scholars performing supervised automotive preventive maintenance and component inspection inside the workshop bay.',
                    'credit' => 'Presidential Communications Office · Public Domain (Wikimedia Commons)',
                ],
                [
                    'src' => asset('images/landing/tesda-digital-lab.jpg'),
                    'category' => 'digital',
                    'tag' => 'ICT & Computer Lab',
                    'title' => 'Digital Literacy & Workstation Competency Lab',
                    'desc' => 'Computer-assisted instruction and digital competency verification for modern technical-vocational learners.',
                    'credit' => 'Presidential Communications Office · Public Domain (Wikimedia Commons)',
                ],
                [
                    'src' => asset('images/landing/tesda-organic-crops.jpg'),
                    'category' => 'agriculture',
                    'tag' => 'Integrated Farm Plots',
                    'title' => 'Trellis Crop Rows & Upland Farm Production',
                    'desc' => 'Field cultivation layout supporting hands-on agri-entrepreneurship and integrated farm competency modules.',
                    'credit' => 'AusAID / PACAP · CC BY 2.0 (Wikimedia Commons)',
                ],
            ];
        @endphp

        <div class="relative overflow-hidden bg-[radial-gradient(circle_at_75%_20%,rgba(20,184,166,0.20),transparent_42%),radial-gradient(circle_at_15%_75%,rgba(245,158,11,0.12),transparent_40%),linear-gradient(155deg,#031826_0%,#052e34_50%,#031826_100%)]">
            {{-- Interactive Three.js 3D WebGL Backdrop --}}
            <canvas
                data-tesda-3d-canvas
                class="absolute inset-0 z-0 h-full w-full cursor-grab touch-pan-y"
                aria-label="Interactive 3D visualization of TESDAConnect operations between Balli School of Technology and Mamburao Integrated Farm"
            ></canvas>

            {{-- Graceful fallback grid if WebGL is disabled --}}
            <div data-3d-fallback class="pointer-events-none absolute inset-0 z-0 hidden opacity-25 [background-image:linear-gradient(rgba(94,234,212,.3)_1px,transparent_1px),linear-gradient(90deg,rgba(94,234,212,.3)_1px,transparent_1px)] [background-size:72px_72px]"></div>

            {{-- Soft readability vignette over left copy --}}
            <div class="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-r from-[#031826]/90 via-[#031826]/55 to-transparent lg:via-[#031826]/40"></div>

            {{-- Sticky Top Navbar --}}
            <header class="relative z-20 border-b border-white/10 bg-[#02121d]/75 px-4 py-3.5 backdrop-blur-xl sm:px-6 lg:px-10">
                <div class="mx-auto flex max-w-7xl items-center justify-between gap-4">
                    <a href="{{ route('home') }}" class="flex items-center gap-3">
                        <span class="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-teal-400 to-cyan-500 text-xs font-black text-slate-950 shadow-lg shadow-teal-500/25">TC</span>
                        <div>
                            <span class="block text-lg font-extrabold tracking-tight leading-none">TESDA<span class="text-teal-400">Connect</span></span>
                            <span class="mt-0.5 block text-[10px] font-semibold tracking-widest text-teal-200/70 uppercase">BST · MIF Training Ops</span>
                        </div>
                    </a>

                    <nav class="hidden items-center gap-6 text-sm font-medium text-teal-50/80 md:flex">
                        <a href="#programs" class="transition hover:text-teal-300">Institutions</a>
                        <a href="#documentation" class="transition hover:text-teal-300">TESDA Gallery</a>
                        <a href="#features" class="transition hover:text-teal-300">Workflow</a>
                        <a href="{{ asset('offline.html') }}" class="transition hover:text-amber-300">Offline Mode</a>
                    </nav>

                    <div class="flex items-center gap-2.5">
                        <span class="hidden items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-200 sm:inline-flex">
                            <span class="size-2 rounded-full bg-emerald-400 animate-pulse"></span>
                            PWA Offline Ready
                        </span>
                        @auth
                            <flux:button variant="primary" :href="route('dashboard')" wire:navigate>Dashboard →</flux:button>
                        @else
                            <a href="{{ route('register') }}" class="hidden rounded-lg border border-white/20 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-white/10 sm:inline-flex" wire:navigate>Register</a>
                            <flux:button variant="primary" :href="route('login')" wire:navigate>Sign in →</flux:button>
                        @endauth
                    </div>
                </div>
            </header>

            {{-- Hero Section (Copy Left + Open Interactive 3D Stage Right) --}}
            <section class="pointer-events-none relative z-10 mx-auto grid max-w-7xl gap-10 px-4 pt-12 pb-16 sm:px-6 lg:min-h-[640px] lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:px-10 lg:py-20">
                <div class="pointer-events-auto max-w-2xl">
                    <div class="inline-flex flex-wrap items-center gap-2 rounded-full border border-teal-300/30 bg-[#052930]/80 px-4 py-1.5 text-[11px] font-bold tracking-[.14em] text-teal-300 uppercase backdrop-blur">
                        <span class="size-2 rounded-full bg-amber-400"></span>
                        Mamburao Integrated Farm · Balli School of Technology
                    </div>

                    <h1 class="mt-6 text-4xl font-black leading-[0.98] tracking-tight sm:text-6xl lg:text-[4.25rem]">
                        Next-Gen <span class="bg-gradient-to-r from-teal-300 via-cyan-300 to-amber-300 bg-clip-text text-transparent">TESDA</span><br>
                        Training Operations
                    </h1>

                    <p class="mt-5 max-w-xl text-base leading-7 text-teal-50/80 sm:text-lg sm:leading-8">
                        An offline-capable Progressive Web App supporting digital learner intake, schedule coordination, competency progress tracking, and real-time report readiness across Mamburao’s partner training centers.
                    </p>

                    <div class="mt-8 flex flex-wrap items-center gap-3">
                        @auth
                            <flux:button variant="primary" size="base" class="h-12 px-6 text-base shadow-lg shadow-teal-500/20" :href="route('dashboard')" wire:navigate>Open workspace →</flux:button>
                        @else
                            <flux:button variant="primary" size="base" class="h-12 px-6 text-base shadow-lg shadow-teal-500/20" :href="route('login')" wire:navigate>Sign in to portal →</flux:button>
                            <a href="{{ route('register') }}" class="inline-flex h-12 items-center rounded-lg border border-amber-300/40 bg-amber-300/15 px-5 text-sm font-bold text-amber-200 backdrop-blur transition hover:bg-amber-300/25" wire:navigate>Enroll as applicant</a>
                        @endauth
                        <a href="#documentation" class="inline-flex h-12 items-center rounded-lg border border-white/20 bg-white/5 px-5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/15">View TESDA photos ↓</a>
                    </div>

                    {{-- Live Database Metrics --}}
                    <div class="mt-10 grid max-w-xl grid-cols-2 gap-4 border-t border-white/15 pt-6 sm:grid-cols-4">
                        <div class="rounded-xl border border-white/10 bg-[#041d2b]/70 p-3 backdrop-blur">
                            <p class="text-2xl font-black text-teal-300 sm:text-3xl">{{ $traineeCount }}</p>
                            <p class="mt-1 text-[10px] font-bold tracking-wider text-teal-50/60 uppercase">Enrolled Records</p>
                        </div>
                        <div class="rounded-xl border border-white/10 bg-[#041d2b]/70 p-3 backdrop-blur">
                            <p class="text-2xl font-black text-cyan-300 sm:text-3xl">{{ $batchCount }}</p>
                            <p class="mt-1 text-[10px] font-bold tracking-wider text-teal-50/60 uppercase">Active Batches</p>
                        </div>
                        <div class="rounded-xl border border-white/10 bg-[#041d2b]/70 p-3 backdrop-blur">
                            <p class="text-2xl font-black text-amber-300 sm:text-3xl">{{ $courseCount }}</p>
                            <p class="mt-1 text-[10px] font-bold tracking-wider text-teal-50/60 uppercase">TESDA Courses</p>
                        </div>
                        <div class="rounded-xl border border-white/10 bg-[#041d2b]/70 p-3 backdrop-blur">
                            <p class="text-2xl font-black text-emerald-300 sm:text-3xl">Offline</p>
                            <p class="mt-1 text-[10px] font-bold tracking-wider text-teal-50/60 uppercase">PWA Login Ready</p>
                        </div>
                    </div>
                </div>

                {{-- Interactive 3D HUD Controls on Right Stage (leaves 3D WebGL centerpiece open) --}}
                <div class="pointer-events-none flex min-h-[340px] flex-col justify-between gap-4 lg:min-h-[470px]">
                    <div class="flex justify-end">
                        <div class="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-cyan-300/25 bg-[#031826]/75 px-3.5 py-1.5 text-xs font-medium text-cyan-200 shadow-lg backdrop-blur-md">
                            <span class="size-2 rounded-full bg-cyan-400"></span>
                            Interactive 3D WebGL · Drag anywhere to rotate
                        </div>
                    </div>

                    <div class="pointer-events-auto mt-auto rounded-2xl border border-white/15 bg-[#031826]/75 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl">
                        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                            <div>
                                <p class="text-[10px] font-bold tracking-[0.18em] text-teal-300 uppercase">3D Operations Camera Focus</p>
                                <p data-scene-preset-status class="mt-0.5 text-xs font-semibold text-white/90">TESDAConnect Unified Core · BST &amp; MIF Live Sync</p>
                            </div>
                            <span class="rounded-full bg-emerald-400/15 px-2.5 py-1 text-[10px] font-bold text-emerald-300">60 FPS WebGL</span>
                        </div>

                        <div class="mt-3 flex flex-wrap gap-2">
                            <button type="button" data-scene-preset="core" aria-pressed="true" class="rounded-lg border border-teal-300 bg-teal-400 px-3 py-1.5 text-xs font-bold text-slate-950 transition">Unified Core</button>
                            <button type="button" data-scene-preset="mif" aria-pressed="false" class="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-teal-100 transition hover:bg-white/20">MIF Farm Node</button>
                            <button type="button" data-scene-preset="bst" aria-pressed="false" class="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-teal-100 transition hover:bg-white/20">BST Tech Node</button>
                            <button type="button" data-scene-preset="sync" aria-pressed="false" class="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-teal-100 transition hover:bg-white/20">Offline Sync</button>
                        </div>

                        <div class="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                            <div class="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
                                <span class="block text-teal-200/60">Sync Engine</span>
                                <span class="font-bold text-teal-300">IndexedDB Active</span>
                            </div>
                            <div class="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
                                <span class="block text-teal-200/60">Data Rule</span>
                                <span class="font-bold text-amber-300">Scope Isolated</span>
                            </div>
                            <div class="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2">
                                <span class="block text-teal-200/60">Mobile Mode</span>
                                <span class="font-bold text-cyan-300">Offline Shell</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>

        {{-- Partner Institutions (3D Tilt Cards with Real Field Imagery) --}}
        <section id="programs" class="border-t border-white/10 bg-gradient-to-b from-[#041d34] to-[#071f44] px-4 py-16 sm:px-6 lg:px-10">
            <div class="mx-auto max-w-7xl">
                <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                    <div>
                        <p class="text-xs font-bold tracking-[.2em] text-cyan-300 uppercase">Partner Training Institutions</p>
                        <h2 class="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Two campuses, one unified workflow.</h2>
                    </div>
                    <p class="max-w-xl text-sm leading-6 text-blue-100/75">
                        Dedicated institution isolation keeps scholar intakes, batch rosters, attendance records, and TESDA reporting clean for both Mamburao centers.
                    </p>
                </div>

                <div class="mt-10 grid gap-6 md:grid-cols-2">
                    <article data-3d-tilt class="tesda-tilt-card group overflow-hidden rounded-3xl border border-teal-300/25 bg-[#092742]/90 shadow-2xl shadow-black/30">
                        <div class="relative h-52 overflow-hidden">
                            <img
                                src="{{ asset('images/landing/tesda-organic-farm.jpg') }}"
                                alt="Organic farming field preparation representing Mamburao Integrated Farm"
                                loading="lazy"
                                class="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                            >
                            <div class="absolute inset-0 bg-gradient-to-t from-[#092742] via-[#092742]/30 to-transparent"></div>
                            <span class="tesda-tilt-elevate absolute top-4 left-4 inline-flex items-center gap-1.5 rounded-full border border-teal-300/40 bg-[#031826]/80 px-3 py-1 text-xs font-extrabold tracking-wider text-teal-300 backdrop-blur">MIF · AGRICULTURE</span>
                        </div>
                        <div class="p-6 pt-2">
                            <h3 class="text-2xl font-black text-white">Mamburao Integrated Farm</h3>
                            <p class="mt-2 text-sm leading-6 text-blue-100/75">
                                Delivering TESDA agricultural qualifications including Organic Agriculture Production NC II, farm plot management, and scholarship tracking in Occidental Mindoro.
                            </p>
                            <ul class="mt-4 grid gap-2 text-sm text-teal-50/90 sm:grid-cols-2">
                                <li class="flex items-center gap-2"><span class="size-1.5 rounded-full bg-teal-400"></span> Learner registration &amp; docs</li>
                                <li class="flex items-center gap-2"><span class="size-1.5 rounded-full bg-teal-400"></span> Competency progress logs</li>
                                <li class="flex items-center gap-2"><span class="size-1.5 rounded-full bg-teal-400"></span> Offline farm-site schedule view</li>
                                <li class="flex items-center gap-2"><span class="size-1.5 rounded-full bg-teal-400"></span> Training certificates &amp; ULI</li>
                            </ul>
                            <div class="mt-6 flex flex-wrap gap-3">
                                <a href="{{ route('login') }}" class="inline-flex items-center rounded-xl bg-teal-400 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-teal-300" wire:navigate>Continue to MIF portal →</a>
                            </div>
                        </div>
                    </article>

                    <article data-3d-tilt class="tesda-tilt-card group overflow-hidden rounded-3xl border border-amber-300/25 bg-[#092742]/90 shadow-2xl shadow-black/30">
                        <div class="relative h-52 overflow-hidden">
                            <img
                                src="{{ asset('images/landing/tesda-welding-workshop.jpg') }}"
                                alt="TESDA practical welding workshop representing Balli School of Technology"
                                loading="lazy"
                                class="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                            >
                            <div class="absolute inset-0 bg-gradient-to-t from-[#092742] via-[#092742]/30 to-transparent"></div>
                            <span class="tesda-tilt-elevate absolute top-4 left-4 inline-flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-[#031826]/80 px-3 py-1 text-xs font-extrabold tracking-wider text-amber-300 backdrop-blur">BST · TECH-VOC</span>
                        </div>
                        <div class="p-6 pt-2">
                            <h3 class="text-2xl font-black text-white">Balli School of Technology</h3>
                            <p class="mt-2 text-sm leading-6 text-blue-100/75">
                                Coordinating technical-vocational batches, laboratory schedules, assessment readiness, and trainee oversight for accredited trades and technical skills.
                            </p>
                            <ul class="mt-4 grid gap-2 text-sm text-amber-50/90 sm:grid-cols-2">
                                <li class="flex items-center gap-2"><span class="size-1.5 rounded-full bg-amber-400"></span> Registrar batch intake</li>
                                <li class="flex items-center gap-2"><span class="size-1.5 rounded-full bg-amber-400"></span> Duration &amp; calendar tracking</li>
                                <li class="flex items-center gap-2"><span class="size-1.5 rounded-full bg-amber-400"></span> Offline announcements access</li>
                                <li class="flex items-center gap-2"><span class="size-1.5 rounded-full bg-amber-400"></span> Focal person operations</li>
                            </ul>
                            <div class="mt-6 flex flex-wrap gap-3">
                                <a href="{{ route('login') }}" class="inline-flex items-center rounded-xl bg-amber-300 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-amber-200" wire:navigate>Continue to BST portal →</a>
                            </div>
                        </div>
                    </article>
                </div>
            </div>
        </section>

        {{-- Real TESDA Documentation Photo Gallery (3D Tilt + Interactive Filter + Lightbox) --}}
        <section id="documentation" class="border-t border-white/10 bg-[#061835] px-4 py-16 sm:px-6 lg:px-10">
            <div class="mx-auto max-w-7xl">
                <div class="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p class="text-xs font-bold tracking-[.2em] text-teal-300 uppercase">TESDA Field &amp; Workshop Documentation</p>
                        <h2 class="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Real TESDA training &amp; skills operations.</h2>
                        <p class="mt-2 max-w-2xl text-sm leading-6 text-blue-100/75">
                            Public-domain TESDA center documentation and Philippine organic farming field references. Click any photo to inspect it in full view.
                        </p>
                    </div>

                    <div class="flex flex-wrap gap-2" role="group" aria-label="Filter TESDA documentation photos">
                        <button type="button" data-doc-filter="all" aria-pressed="true" class="rounded-full border border-teal-300 bg-teal-400 px-4 py-1.5 text-xs font-bold text-slate-950 transition">All ({{ count($documentationPhotos) }})</button>
                        <button type="button" data-doc-filter="workshops" aria-pressed="false" class="rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold text-blue-100 transition hover:bg-white/15">Workshops &amp; Trades</button>
                        <button type="button" data-doc-filter="agriculture" aria-pressed="false" class="rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold text-blue-100 transition hover:bg-white/15">Organic Agriculture</button>
                        <button type="button" data-doc-filter="digital" aria-pressed="false" class="rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-semibold text-blue-100 transition hover:bg-white/15">Centers &amp; ICT</button>
                    </div>
                </div>

                <div class="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    @foreach ($documentationPhotos as $photo)
                        <button
                            type="button"
                            data-3d-tilt
                            data-doc-card
                            data-doc-category="{{ $photo['category'] }}"
                            data-doc-src="{{ $photo['src'] }}"
                            data-doc-tag="{{ $photo['tag'] }}"
                            data-doc-title="{{ $photo['title'] }}"
                            data-doc-desc="{{ $photo['desc'] }}"
                            data-doc-credit="{{ $photo['credit'] }}"
                            class="tesda-tilt-card group flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b234a] text-left shadow-xl shadow-black/25 focus:outline-none focus:ring-2 focus:ring-teal-400"
                        >
                            <div class="relative aspect-[4/3] w-full overflow-hidden bg-slate-900">
                                <img
                                    src="{{ $photo['src'] }}"
                                    alt="{{ $photo['title'] }}"
                                    loading="lazy"
                                    class="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                                >
                                <div class="absolute inset-0 bg-gradient-to-t from-[#0b234a] via-transparent to-transparent opacity-80"></div>
                                <span class="tesda-tilt-elevate absolute top-3 left-3 rounded-full border border-white/20 bg-[#031826]/80 px-2.5 py-1 text-[10px] font-bold tracking-wide text-teal-300 backdrop-blur">
                                    {{ $photo['tag'] }}
                                </span>
                                <span class="absolute right-3 bottom-3 rounded-lg bg-black/55 px-2 py-1 text-[10px] font-semibold text-white/90 opacity-0 backdrop-blur transition group-hover:opacity-100">
                                    Click to enlarge ↗
                                </span>
                            </div>
                            <div class="flex flex-1 flex-col p-4">
                                <h3 class="text-sm font-bold leading-snug text-white group-hover:text-teal-300 transition">{{ $photo['title'] }}</h3>
                                <p class="mt-1.5 text-xs leading-relaxed text-blue-100/70">{{ $photo['desc'] }}</p>
                                <p class="mt-auto pt-3 text-[10px] font-medium text-teal-200/50">{{ $photo['credit'] }}</p>
                            </div>
                        </button>
                    @endforeach
                </div>
            </div>
        </section>

        {{-- Core Platform Features & Offline PWA Architecture --}}
        <section id="features" class="border-t border-white/10 bg-[#081d45] px-4 py-16 sm:px-6 lg:px-10">
            <div class="mx-auto max-w-7xl">
                <div class="max-w-2xl">
                    <p class="text-xs font-bold tracking-[.2em] text-cyan-300 uppercase">One Connected Workspace</p>
                    <h2 class="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Built around the TESDA training flow.</h2>
                </div>

                <div class="mt-9 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                    @foreach ([
                        ['01', 'Trainee Intake & Docs', 'Step-by-step learner registration, document review statuses, ULI tracking, and double-enrollment guards.'],
                        ['02', 'Offline Login & PWA Shell', 'Installable on Android phones with IndexedDB credential caching so scholars can sign in and view announcements offline.'],
                        ['03', 'Schedule & Batches', 'Coordinate training orientations, class venues, deadlines, and training hour compliance across centers.'],
                        ['04', 'Competency & Attendance', 'Record progress charts, unit reviews, and daily practical attendance even during weak field connectivity.'],
                        ['05', 'Report Readiness', 'Identify incomplete records, pending submissions, and forwarded batches before regional reporting deadlines.'],
                        ['06', 'Role-Based Access', 'Scoped dashboards for Applicants/Scholars, Focal Persons, Registrars, and System Administrators.'],
                    ] as [$num, $heading, $body])
                        <article data-3d-tilt class="tesda-tilt-card rounded-2xl border border-white/10 bg-white p-6 text-slate-900 shadow-xl shadow-black/15">
                            <span class="tesda-tilt-elevate inline-flex rounded-xl bg-teal-50 px-3 py-1.5 text-xs font-black tracking-wider text-teal-700">MODULE {{ $num }}</span>
                            <h3 class="mt-4 text-lg font-extrabold text-slate-900">{{ $heading }}</h3>
                            <p class="mt-2 text-sm leading-6 text-slate-600">{{ $body }}</p>
                        </article>
                    @endforeach
                </div>

                @if (app()->environment('local'))
                    <div class="mt-10 flex flex-col gap-3 rounded-2xl border border-teal-300/25 bg-[#04142d] p-5 text-sm text-blue-100 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <strong class="text-teal-300">Local Demo Access:</strong>
                            Admin <code class="rounded bg-white/10 px-1.5 py-0.5 text-xs">admin@tesdaconnect.test</code> / <code class="rounded bg-white/10 px-1.5 py-0.5 text-xs">admin123</code> ·
                            Registrar <code class="rounded bg-white/10 px-1.5 py-0.5 text-xs">registrar@tesdaconnect.test</code> / <code class="rounded bg-white/10 px-1.5 py-0.5 text-xs">registrar123</code>
                        </div>
                        <a href="{{ asset('offline.html') }}" class="inline-flex shrink-0 items-center justify-center rounded-lg border border-teal-400/40 bg-teal-400/10 px-4 py-2 text-xs font-bold text-teal-300 transition hover:bg-teal-400/20">
                            Test Offline Workspace ↗
                        </a>
                    </div>
                @endif
            </div>
        </section>

        <footer class="border-t border-white/10 bg-[#031126] px-6 py-7 text-center text-xs text-blue-200/65">
            <p class="font-semibold text-blue-100/80">TESDAConnect · Balli School of Technology &amp; Mamburao Integrated Farm · Occidental Mindoro</p>
            <p class="mt-1.5 text-[11px] text-blue-200/50">Documentation Photos: Philippine Presidential Communications Office (Public Domain) &amp; AusAID/PACAP Organic Farming Archives (CC BY 2.0) via Wikimedia Commons.</p>
        </footer>

        {{-- Fullscreen Documentation Lightbox Modal --}}
        <div id="tesda-doc-lightbox" class="fixed inset-0 z-50 hidden items-center justify-center bg-slate-950/90 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="TESDA Documentation Photo Viewer">
            <div class="relative w-full max-w-4xl overflow-hidden rounded-3xl border border-white/15 bg-[#071c36] shadow-2xl">
                <div class="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
                    <div class="flex items-center gap-3">
                        <span data-lb-tag class="rounded-full bg-teal-400/15 px-3 py-1 text-xs font-bold text-teal-300"></span>
                        <span data-lb-count class="text-xs font-semibold text-blue-200/70"></span>
                    </div>
                    <button type="button" data-lb-close class="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-white/15">Close ✕</button>
                </div>
                <div class="relative bg-black/50">
                    <img data-lb-img src="" alt="" class="max-h-[62vh] w-full object-contain mx-auto">
                    <button type="button" data-lb-prev aria-label="Previous photo" class="absolute top-1/2 left-3 -translate-y-1/2 rounded-full border border-white/20 bg-slate-950/75 px-3.5 py-2 text-sm font-bold text-white backdrop-blur transition hover:bg-teal-500 hover:text-slate-950">←</button>
                    <button type="button" data-lb-next aria-label="Next photo" class="absolute top-1/2 right-3 -translate-y-1/2 rounded-full border border-white/20 bg-slate-950/75 px-3.5 py-2 text-sm font-bold text-white backdrop-blur transition hover:bg-teal-500 hover:text-slate-950">→</button>
                </div>
                <div class="p-5">
                    <h3 data-lb-title class="text-lg font-extrabold text-white"></h3>
                    <p data-lb-desc class="mt-1.5 text-sm leading-relaxed text-blue-100/80"></p>
                    <p data-lb-credit class="mt-2.5 text-xs font-medium text-teal-200/60"></p>
                </div>
            </div>
        </div>

        @vite(['resources/js/landing-3d.js'])
        @fluxScripts
    </body>
</html>
