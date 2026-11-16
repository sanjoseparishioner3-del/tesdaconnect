
<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        @include('partials.head')

        <style>
            .tesda-sidebar {
                /* Wider desktop rail, but never wider than the available viewport. */
                --sidebar-width: 19rem;
                --sidebar-width-collapsed: 4.25rem;
                width: min(19rem, calc(100vw - 1rem)) !important;
                max-width: calc(100vw - 1rem) !important;
                min-width: 0;
                height: 100dvh !important;
                max-height: 100dvh !important;
                display: flex !important;
                flex-direction: column !important;
                box-sizing: border-box;
                background: linear-gradient(180deg, #0c2352 0%, #102f68 55%, #091d45 100%) !important;
                color: #ffffff !important;
                overflow-x: hidden !important;
                overflow-y: hidden !important;
            }

            .tesda-sidebar,
            .tesda-sidebar * {
                box-sizing: border-box;
            }

            /* Only the main navigation scrolls cleanly; sections stay expanded with zero nested scrollbars. */
            .tesda-sidebar [data-flux-sidebar-nav] {
                flex: 1 1 auto !important;
                min-height: 0 !important;
                min-width: 0 !important;
                max-width: 100% !important;
                overflow-x: hidden !important;
                overflow-y: auto !important;
                scrollbar-width: thin;
                scrollbar-color: rgba(147, 197, 253, 0.45) transparent;
                overscroll-behavior: contain;
            }

            .tesda-sidebar [data-flux-sidebar-nav]::-webkit-scrollbar {
                width: 5px;
            }

            .tesda-sidebar [data-flux-sidebar-nav]::-webkit-scrollbar-track {
                background: transparent;
            }

            .tesda-sidebar [data-flux-sidebar-nav]::-webkit-scrollbar-thumb {
                background: rgba(147, 197, 253, 0.35);
                border-radius: 9999px;
            }

            .tesda-sidebar [data-flux-sidebar-nav]::-webkit-scrollbar-thumb:hover {
                background: rgba(147, 197, 253, 0.6);
            }

            .tesda-sidebar [data-flux-sidebar-group] {
                display: flex !important;
                flex-direction: column !important;
                gap: 0.2rem !important;
                min-width: 0 !important;
                max-width: 100% !important;
                overflow: visible !important;
                flex-shrink: 0 !important;
            }

            .tesda-sidebar [data-flux-sidebar-group] + [data-flux-sidebar-group] {
                margin-top: 0.85rem !important;
                padding-top: 0.85rem !important;
                border-top: 1px solid rgba(255, 255, 255, 0.1) !important;
            }

            /* Use the same typography for every role (administrator, registrar, focal person, learner). */
            .tesda-sidebar [data-flux-sidebar-item] {
                width: 100%;
                min-width: 0 !important;
                max-width: 100% !important;
                min-height: 2.35rem;
                padding: 0.5rem 0.75rem !important;
                border-radius: 0.75rem !important;
                white-space: normal !important;
                font-size: 0.875rem !important;
                line-height: 1.35 !important;
                font-weight: 500;
                transition: background-color 0.15s ease, color 0.15s ease, transform 0.15s ease;
            }

            .tesda-sidebar [data-flux-sidebar-item] > span:last-child {
                flex: 1 1 auto;
                min-width: 0;
                max-width: 100%;
                white-space: normal !important;
                overflow-wrap: anywhere;
                font-size: inherit !important;
                line-height: 1.35;
            }

            .tesda-sidebar [data-flux-sidebar-item] > svg,
            .tesda-sidebar [data-flux-sidebar-item] > span:first-child:has(svg) {
                flex-shrink: 0;
            }

            /* Group headings share clean, crisp styling across every role without truncation or overlap. */
            .tesda-sidebar [data-flux-sidebar-group-heading] {
                max-width: 100%;
                padding: 0 0.625rem 0.3rem !important;
                color: #7dd3fc !important;
                font-size: 0.72rem !important;
                line-height: 1.3 !important;
                font-weight: 800 !important;
                letter-spacing: 0.09em !important;
                text-transform: uppercase !important;
                white-space: normal !important;
                overflow-wrap: anywhere;
            }

            .tesda-sidebar .tesda-disabled-nav {
                width: 100%;
                min-width: 0;
                max-width: 100%;
                flex-wrap: wrap;
                overflow-wrap: anywhere;
                font-size: 0.875rem !important;
                line-height: 1.35 !important;
                font-weight: 600;
                color: rgba(234, 242, 255, 0.7) !important;
                cursor: not-allowed;
            }

            .tesda-sidebar .tesda-disabled-nav > span:first-of-type {
                flex: 1 1 7rem;
                min-width: 0;
                overflow-wrap: anywhere;
                line-height: 1.35;
            }

            .tesda-sidebar .tesda-unavailable-label {
                flex: 0 1 auto;
                max-width: 100%;
                white-space: normal !important;
                overflow-wrap: anywhere;
                margin-left: auto;
                color: #bfdbfe !important;
                font-size: 9px;
                line-height: 1.2;
                letter-spacing: 0.02em;
            }

            @media (max-width: 640px) {
                .tesda-sidebar {
                    --sidebar-width: 18rem;
                    width: min(18rem, calc(100vw - 0.75rem)) !important;
                    max-width: calc(100vw - 0.75rem) !important;
                }

                .tesda-sidebar [data-flux-sidebar-nav] {
                    padding-inline: 0.5rem;
                }

                .tesda-sidebar [data-flux-sidebar-group-heading] {
                    font-size: 0.72rem !important;
                }

                .tesda-sidebar .tesda-disabled-nav {
                    gap: 0.5rem;
                    padding-inline: 0.625rem;
                }

                .tesda-sidebar .tesda-unavailable-label {
                    font-size: 0.625rem;
                }
            }

            .tesda-sidebar [data-flux-sidebar-item],
            .tesda-sidebar [data-flux-sidebar-item] > *,
            .tesda-sidebar [data-flux-sidebar-item] svg {
                color: #e2ecff !important;
            }

            .tesda-sidebar [data-flux-sidebar-item]:hover {
                background-color: rgba(255, 255, 255, 0.14) !important;
                color: #ffffff !important;
            }

            .tesda-sidebar [data-flux-sidebar-item]:hover *,
            .tesda-sidebar [data-flux-sidebar-item]:hover svg {
                color: #ffffff !important;
            }

            .tesda-sidebar [data-flux-sidebar-item]:focus-visible {
                outline: 2px solid #ffffff !important;
                outline-offset: 2px;
            }

            .tesda-sidebar [data-flux-sidebar-item][data-current],
            .tesda-sidebar [data-flux-sidebar-item][aria-current="page"] {
                background-color: #ffffff !important;
                color: #102f68 !important;
                font-weight: 700 !important;
                box-shadow: 0 4px 12px rgba(5, 16, 40, 0.25);
            }

            .tesda-sidebar [data-flux-sidebar-item][data-current] *,
            .tesda-sidebar [data-flux-sidebar-item][data-current] svg,
            .tesda-sidebar [data-flux-sidebar-item][aria-current="page"] *,
            .tesda-sidebar [data-flux-sidebar-item][aria-current="page"] svg {
                color: #102f68 !important;
            }

            .tesda-sidebar .tesda-disabled-nav svg {
                color: rgba(191, 219, 254, 0.65) !important;
            }

            .tesda-sidebar .tesda-nav-subheading {
                color: #7dd3fc !important;
                letter-spacing: 0.1em;
                text-transform: uppercase;
            }

            .tesda-sidebar .tesda-brand-mark {
                background-color: #ffffff !important;
                color: #102f68 !important;
                border: 2px solid rgba(246, 169, 21, 0.78) !important;
                box-shadow: 0 4px 12px rgba(4, 15, 42, 0.28);
            }

            .tesda-sidebar .tesda-brand-name {
                color: #ffffff !important;
            }

            .tesda-sidebar .tesda-brand-accent {
                color: #f6a915 !important;
            }

            .tesda-sidebar .tesda-brand-subtitle {
                color: #bfdbfe !important;
            }

            .tesda-sidebar .tesda-user-name {
                color: #ffffff !important;
            }

            .tesda-sidebar .tesda-user-role {
                color: #bfdbfe !important;
            }

            .tesda-sidebar .tesda-logout {
                color: #ffffff !important;
            }

            .tesda-sidebar .tesda-logout:hover {
                background-color: rgba(255, 255, 255, 0.14) !important;
                color: #ffffff !important;
            }

            .tesda-sidebar .tesda-logout svg {
                color: inherit !important;
            }
        </style>
    </head>

    <body class="min-h-screen bg-slate-100 text-slate-900 antialiased">
        @php($user = auth()->user())

        <flux:sidebar
            sticky
            collapsible="mobile"
            class="tesda-sidebar border-e-0 shadow-xl shadow-slate-900/15"
        >
            <flux:sidebar.header class="shrink-0 border-b border-white/15 px-4 py-4">
                <a href="{{ route('dashboard') }}" class="flex items-center gap-3" wire:navigate>
                    <span class="tesda-brand-mark grid size-10 shrink-0 place-items-center rounded-full text-sm font-black tracking-tight">
                        TC
                    </span>

                    <span class="grid gap-0.5 leading-tight">
                        <span class="tesda-brand-name text-[15px] font-extrabold tracking-tight">
                            TESDA<span class="tesda-brand-accent">Connect</span>
                        </span>

                        <span class="tesda-brand-subtitle text-[11px] font-medium">
                            Training Operations
                        </span>
                    </span>
                </a>

                <flux:sidebar.collapse class="text-white lg:hidden" />
            </flux:sidebar.header>

            <flux:sidebar.nav class="min-w-0 max-w-full flex-1 min-h-0 overflow-x-hidden overflow-y-auto px-3 py-3.5">
                @if ($user->hasRole('administrator'))
                    <flux:sidebar.group heading="DASHBOARD" data-tesda-sidebar-group="dashboard">
                        <flux:sidebar.item
                            icon="home"
                            :href="route('dashboard') . '#system-overview'"
                            :current="request()->routeIs('dashboard')"
                            wire:navigate
                        >
                            System Overview
                        </flux:sidebar.item>
                        <flux:sidebar.item
                            icon="chart-bar"
                            :href="route('dashboard') . '#bst-mif-comparison'"
                            :current="false"
                            wire:navigate
                        >
                            BST ↔ MIF Comparison
                        </flux:sidebar.item>
                        <flux:sidebar.item
                            icon="clipboard-document-list"
                            :href="route('system.activity')"
                            :current="request()->routeIs('system.activity')"
                            wire:navigate
                        >
                            Activity Logs
                        </flux:sidebar.item>
                    </flux:sidebar.group>

                    <flux:sidebar.group heading="ENROLLMENT MONITORING" data-tesda-sidebar-group="enrollment">
                        <flux:sidebar.item
                            icon="clipboard-document-list"
                            :href="route('enrollments.index', ['status' => 'submitted'])"
                            :current="request()->routeIs('enrollments.index') && request()->query('status') === 'submitted'"
                            wire:navigate
                        >
                            Submissions
                        </flux:sidebar.item>
                        <flux:sidebar.item
                            icon="clipboard-document-list"
                            :href="route('enrollments.index', ['status' => 'confirmed'])"
                            :current="request()->routeIs('enrollments.index') && request()->query('status') === 'confirmed'"
                            wire:navigate
                        >
                            Verified Records
                        </flux:sidebar.item>
                        <flux:sidebar.item
                            icon="document-arrow-down"
                            :href="route('system.forwarded-batches')"
                            :current="request()->routeIs('system.forwarded-batches')"
                            wire:navigate
                        >
                            Forwarded Batches
                        </flux:sidebar.item>
                        <flux:sidebar.item
                            icon="chart-bar"
                            :href="route('system.intake-summary')"
                            :current="request()->routeIs('system.intake-summary')"
                            wire:navigate
                        >
                            Intake Summary
                        </flux:sidebar.item>
                    </flux:sidebar.group>

                    <flux:sidebar.group heading="SCHEDULING MANAGEMENT" data-tesda-sidebar-group="scheduling">
                        <flux:sidebar.item
                            icon="calendar-days"
                            :href="route('schedules.index')"
                            :current="request()->routeIs('schedules.*')"
                            wire:navigate
                        >
                            Create / Edit
                        </flux:sidebar.item>
                        <flux:sidebar.item
                            icon="calendar-days"
                            :href="route('system.calendar')"
                            :current="request()->routeIs('system.calendar')"
                            wire:navigate
                        >
                            Calendar
                        </flux:sidebar.item>
                        <flux:sidebar.item
                            icon="calendar-days"
                            :href="route('system.duration-compliance')"
                            :current="request()->routeIs('system.duration-compliance')"
                            wire:navigate
                        >
                            Duration Compliance
                        </flux:sidebar.item>
                        <flux:sidebar.item
                            icon="calendar-days"
                            :href="route('system.batches')"
                            :current="request()->routeIs('system.batches')"
                            wire:navigate
                        >
                            Batch Management
                        </flux:sidebar.item>
                        <flux:sidebar.item
                            icon="book-open"
                            :href="route('system.courses')"
                            :current="request()->routeIs('system.courses')"
                            wire:navigate
                        >
                            Course Setup
                        </flux:sidebar.item>
                        <flux:sidebar.item
                            icon="building-office-2"
                            :href="route('system.institutions')"
                            :current="request()->routeIs('system.institutions')"
                            wire:navigate
                        >
                            Institution Setup
                        </flux:sidebar.item>
                        <flux:sidebar.item
                            icon="clipboard-document-list"
                            :href="route('competencies.index')"
                            :current="request()->routeIs('competencies.*')"
                            wire:navigate
                        >
                            Competency Setup
                        </flux:sidebar.item>
                        <flux:sidebar.item
                            icon="clipboard-document-list"
                            :href="route('attendance.index')"
                            :current="request()->routeIs('attendance.*')"
                            wire:navigate
                        >
                            Attendance Management
                        </flux:sidebar.item>
                    </flux:sidebar.group>

                    <flux:sidebar.group heading="SYSTEM MONITORING" data-tesda-sidebar-group="system-monitoring">
                        <flux:sidebar.item
                            icon="users"
                            :href="route('system.accounts')"
                            :current="request()->routeIs('system.accounts')"
                            wire:navigate
                        >
                            Accounts
                        </flux:sidebar.item>
                        <flux:sidebar.item
                            icon="shield-check"
                            :href="route('system.activity')"
                            :current="request()->routeIs('system.activity')"
                            wire:navigate
                        >
                            Audit Logs
                        </flux:sidebar.item>
                        <flux:sidebar.item
                            icon="clipboard-document-list"
                            :href="route('announcements.index')"
                            :current="request()->routeIs('announcements.*')"
                            wire:navigate
                        >
                            Announcement Monitor
                        </flux:sidebar.item>
                        <flux:sidebar.item
                            icon="cog"
                            :href="route('system.health')"
                            :current="request()->routeIs('system.health')"
                            wire:navigate
                        >
                            Health
                        </flux:sidebar.item>
                    </flux:sidebar.group>

                    <flux:sidebar.group heading="REPORTS & OVERSIGHT" data-tesda-sidebar-group="reports">
                        <flux:sidebar.item
                            icon="chart-bar"
                            :href="route('progress.competency')"
                            :current="request()->routeIs('progress.competency')"
                            wire:navigate
                        >
                            Progress
                        </flux:sidebar.item>
                        <flux:sidebar.item
                            icon="academic-cap"
                            :href="route('progress.index')"
                            :current="request()->routeIs('progress.index')"
                            wire:navigate
                        >
                            Scholar Monitoring
                        </flux:sidebar.item>
                        <flux:sidebar.item
                            icon="academic-cap"
                            :href="route('certification.index')"
                            :current="request()->routeIs('certification.*')"
                            wire:navigate
                        >
                            Completion
                        </flux:sidebar.item>
                        <flux:sidebar.item
                            icon="chart-bar"
                            :href="route('reports.index')"
                            :current="request()->routeIs('reports.index')"
                            wire:navigate
                        >
                            Performance
                        </flux:sidebar.item>
                        <div class="tesda-nav-subheading px-2.5 pt-2.5 pb-1 text-[10px] font-extrabold">Export</div>
                        <flux:sidebar.item
                            icon="document-arrow-down"
                            :href="route('reports.export', ['type' => 'enrollments'])"
                            :current="false"
                        >
                            Enrollment CSV
                        </flux:sidebar.item>
                        <flux:sidebar.item
                            icon="document-arrow-down"
                            :href="route('reports.export', ['type' => 'competency-progress'])"
                            :current="false"
                        >
                            Competency CSV
                        </flux:sidebar.item>
                        <flux:sidebar.item
                            icon="document-arrow-down"
                            :href="route('reports.export', ['type' => 'attendance'])"
                            :current="false"
                        >
                            Attendance CSV
                        </flux:sidebar.item>
                    </flux:sidebar.group>
                @elseif ($user->hasRole('registrar'))
                    <flux:sidebar.group heading="DASHBOARD" data-tesda-sidebar-group="registrar-dashboard">
                        <flux:sidebar.item
                            icon="home"
                            :href="route('dashboard')"
                            :current="request()->routeIs('dashboard')"
                            wire:navigate
                        >
                            Dashboard &amp; Recent Submissions
                        </flux:sidebar.item>
                        <flux:sidebar.item
                            icon="users"
                            :href="route('registrar.account-requests')"
                            :current="request()->routeIs('registrar.account-requests')"
                            wire:navigate
                        >
                            Account Requests
                        </flux:sidebar.item>
                    </flux:sidebar.group>

                    <flux:sidebar.group heading="ENROLLMENT MANAGEMENT" data-tesda-sidebar-group="registrar-enrollment">
                        <flux:sidebar.item
                            icon="clipboard-document-list"
                            :href="route('enrollments.index')"
                            :current="request()->routeIs('enrollments.index')"
                            wire:navigate
                        >
                            Review / Verify / Confirm Enrollments
                        </flux:sidebar.item>
                        <flux:sidebar.item
                            icon="calendar-days"
                            :href="route('registrar.intake')"
                            :current="request()->routeIs('registrar.intake')"
                            wire:navigate
                        >
                            Intake Acceptance &amp; Quotas
                        </flux:sidebar.item>
                        <flux:sidebar.item
                            icon="document-arrow-down"
                            :href="route('registrar.forward-batches')"
                            :current="request()->routeIs('registrar.forward-batches')"
                            wire:navigate
                        >
                            Forward Confirmed Batch to Admin
                        </flux:sidebar.item>
                    </flux:sidebar.group>

                    <flux:sidebar.group heading="STUDENT RECORDS" data-tesda-sidebar-group="registrar-student-records">
                        <flux:sidebar.item
                            icon="users"
                            :href="route('registrar.student-records')"
                            :current="request()->routeIs('registrar.student-records')"
                            wire:navigate
                        >
                            Student Records (Search, Update &amp; Archive)
                        </flux:sidebar.item>
                    </flux:sidebar.group>

                    <flux:sidebar.group heading="ANNOUNCEMENTS" data-tesda-sidebar-group="registrar-announcements">
                        <flux:sidebar.item
                            icon="megaphone"
                            :href="route('announcements.index')"
                            :current="request()->routeIs('announcements.index')"
                            wire:navigate
                        >
                            Manage Announcements
                        </flux:sidebar.item>
                    </flux:sidebar.group>

                    <flux:sidebar.group heading="ACCOUNT MANAGEMENT" data-tesda-sidebar-group="registrar-account-management">
                        <flux:sidebar.item
                            icon="users"
                            :href="route('registrar.accounts')"
                            :current="request()->routeIs('registrar.accounts')"
                            wire:navigate
                        >
                            Staff Accounts (Passwords, Verification &amp; Status)
                        </flux:sidebar.item>
                    </flux:sidebar.group>

                    <flux:sidebar.group heading="INSTITUTIONS" data-tesda-sidebar-group="registrar-institutions">
                        <flux:sidebar.item
                            icon="building-office-2"
                            :href="route('registrar.institutions')"
                            :current="request()->routeIs('registrar.institutions')"
                            wire:navigate
                        >
                            Institution Records &amp; Side-by-Side Summary
                        </flux:sidebar.item>
                    </flux:sidebar.group>
                @elseif ($user->hasRole('focal_person'))
                    <flux:sidebar.group heading="DASHBOARD" data-tesda-sidebar-group="focal-dashboard">
                        <flux:sidebar.item icon="home" :href="route('dashboard')" :current="request()->routeIs('dashboard')" wire:navigate>
                            Dashboard &amp; Institution Overview
                        </flux:sidebar.item>
                    </flux:sidebar.group>

                    <flux:sidebar.group heading="COMPETENCY PROGRESS &amp; ACHIEVEMENT" data-tesda-sidebar-group="focal-competency">
                        <flux:sidebar.item icon="chart-bar" :href="route('progress.competency')" :current="request()->routeIs('progress.competency')" wire:navigate>
                            Progress Charts, Update, Review &amp; Submit Summary
                        </flux:sidebar.item>
                        <flux:sidebar.item icon="clipboard-document-list" :href="route('competencies.index')" :current="request()->routeIs('competencies.*')" wire:navigate>
                            Competency Units &amp; Tasks Setup
                        </flux:sidebar.item>
                        <flux:sidebar.item icon="chart-bar" :href="route('progress.index')" :current="request()->routeIs('progress.index')" wire:navigate>
                            Scholar Completion Overview
                        </flux:sidebar.item>
                    </flux:sidebar.group>

                    <flux:sidebar.group heading="COURSE MANAGEMENT" data-tesda-sidebar-group="focal-courses">
                        <flux:sidebar.item icon="book-open" :href="route('focal.courses')" :current="request()->routeIs('focal.courses')" wire:navigate>
                            Register, Update &amp; Archive Courses
                        </flux:sidebar.item>
                        <flux:sidebar.item icon="folder-open" :href="route('learning.materials')" :current="request()->routeIs('learning.materials')" wire:navigate>
                            Course Learning Materials
                        </flux:sidebar.item>
                    </flux:sidebar.group>

                    <flux:sidebar.group heading="CERTIFICATION MANAGEMENT" data-tesda-sidebar-group="focal-certification">
                        <flux:sidebar.item icon="academic-cap" :href="route('certification.index')" :current="request()->routeIs('certification.*')" wire:navigate>
                            Batch Certification &amp; Issue Certificate
                        </flux:sidebar.item>
                    </flux:sidebar.group>

                    <flux:sidebar.group heading="DOCUMENT &amp; ADMIN TASKS" data-tesda-sidebar-group="focal-documents">
                        <flux:sidebar.item icon="clipboard-document-list" :href="route('attendance.index')" :current="request()->routeIs('attendance.*')" wire:navigate>
                            Attendance Management
                        </flux:sidebar.item>
                        <flux:sidebar.item icon="folder-open" :href="route('focal.documents')" :current="request()->routeIs('focal.documents')" wire:navigate>
                            Upload / Download Document Library
                        </flux:sidebar.item>
                        <flux:sidebar.item icon="printer" :href="route('focal.forms')" :current="request()->routeIs('focal.forms*')" wire:navigate>
                            Generate Forms &amp; Secretarial Log
                        </flux:sidebar.item>
                        <flux:sidebar.item icon="calendar-days" :href="route('schedules.index')" :current="request()->routeIs('schedules.*')" wire:navigate>
                            Batch Scheduling
                        </flux:sidebar.item>
                    </flux:sidebar.group>

                    <flux:sidebar.group heading="REPORTS &amp; COMMUNICATION" data-tesda-sidebar-group="focal-reports">
                        <flux:sidebar.item icon="chart-bar" :href="route('reports.index')" :current="request()->routeIs('reports.index')" wire:navigate>
                            Reports &amp; Oversight
                        </flux:sidebar.item>
                        <flux:sidebar.item icon="megaphone" :href="route('announcements.index')" :current="request()->routeIs('announcements.index')" wire:navigate>
                            Announcements
                        </flux:sidebar.item>
                    </flux:sidebar.group>
                @elseif ($user->hasRole('applicant', 'scholar'))
                    <flux:sidebar.group heading="DASHBOARD" data-tesda-sidebar-group="learner-dashboard">
                        <flux:sidebar.item icon="home" :href="route('learner.portal')" :current="request()->routeIs('learner.portal')" wire:navigate>
                            Student / Scholar Dashboard
                        </flux:sidebar.item>
                        <flux:sidebar.item icon="chart-bar" :href="route('learner.learning-progress')" :current="request()->routeIs('learner.learning-progress')" wire:navigate>
                            Learning Progress
                        </flux:sidebar.item>
                        <flux:sidebar.item icon="academic-cap" :href="route('learner.competency-progress')" :current="request()->routeIs('learner.competency-progress')" wire:navigate>
                            Training Competency Progress
                        </flux:sidebar.item>
                        <flux:sidebar.item icon="clipboard-document-list" :href="route('learner.attendance')" :current="request()->routeIs('learner.attendance')" wire:navigate>
                            My Attendance
                        </flux:sidebar.item>
                        <flux:sidebar.item icon="academic-cap" :href="route('learner.certification')" :current="request()->routeIs('learner.certification')" wire:navigate>
                            Certification &amp; Completion
                        </flux:sidebar.item>
                        <flux:sidebar.item icon="document-text" :href="route('learner.documents')" :current="request()->routeIs('learner.documents')" wire:navigate>
                            My Documents
                        </flux:sidebar.item>
                        <flux:sidebar.item icon="megaphone" :href="route('learner.announcements')" :current="request()->routeIs('learner.announcements')" wire:navigate>
                            Announcements
                        </flux:sidebar.item>
                    </flux:sidebar.group>

                    <flux:sidebar.group heading="ENROLLMENT SUBMISSION" data-tesda-sidebar-group="learner-enrollment">
                        <flux:sidebar.item icon="document-text" :href="route('learner.requirements')" :current="request()->routeIs('learner.requirements')" wire:navigate>
                            View Requirements
                        </flux:sidebar.item>
                        <flux:sidebar.item icon="clipboard-document-list" :href="route('learner.registration')" :current="request()->routeIs('learner.registration')" wire:navigate>
                            Submit Enrollment / Registration Form
                        </flux:sidebar.item>
                    </flux:sidebar.group>
                @else
                    <flux:sidebar.group heading="MAIN MENU" data-tesda-sidebar-group="default-menu">
                        <flux:sidebar.item
                            icon="home"
                            :href="route('dashboard')"
                            :current="request()->routeIs('dashboard')"
                            wire:navigate
                        >
                            Dashboard
                        </flux:sidebar.item>
                    </flux:sidebar.group>
                @endif

                <div data-user-guide-sidebar class="mt-3 border-t border-white/10 pt-3">
                    <flux:sidebar.item
                        icon="book-open"
                        :href="route('user-guide')"
                        :current="request()->routeIs('user-guide')"
                        wire:navigate
                    >
                        User Guide &amp; Role Handbook
                    </flux:sidebar.item>
                </div>
            </flux:sidebar.nav>

            <div class="shrink-0 border-t border-white/15 bg-black/15 p-3 space-y-2.5">
                <div
                    class="rounded-xl border border-white/15 bg-white/[0.08] p-2.5 text-xs text-white"
                    x-data="{
                        showVerify: false,
                        pw: '',
                        msg: '',
                        busy: false,
                        async sync() {
                            this.busy = true;
                            await window.TesdaOffline?.syncNow?.(true);
                            this.busy = false;
                            this.msg = 'Synced for offline use.';
                        },
                        async saveOfflinePw() {
                            if (!this.pw) return;
                            this.busy = true;
                            this.msg = '';
                            const res = await window.TesdaOffline?.enrollCurrentPassword?.(this.pw);
                            this.busy = false;
                            this.msg = res?.message || 'Unable to verify password.';
                            if (res?.ok) {
                                this.pw = '';
                                this.showVerify = false;
                            }
                        }
                    }"
                >
                    <div class="flex items-center justify-between gap-2">
                        <span class="font-bold text-cyan-200">Offline Access</span>
                        <a href="{{ asset('offline.html') }}" class="rounded-md bg-white/15 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-white/25">Open</a>
                    </div>
                    <p data-tesda-offline-sidebar-status class="mt-1 text-[11px] leading-4 text-blue-100">Preparing offline cache…</p>
                    <div class="mt-2 flex flex-wrap gap-1.5">
                        <button type="button" x-on:click="sync()" x-bind:disabled="busy" class="rounded-lg bg-white/15 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-white/25 disabled:opacity-50">Sync now</button>
                        <button type="button" x-on:click="showVerify = !showVerify" class="rounded-lg border border-white/20 px-2.5 py-1 text-[11px] font-semibold text-blue-100 hover:bg-white/10">Offline login</button>
                    </div>
                    <div x-show="showVerify" x-cloak class="mt-2 space-y-1.5">
                        <input type="password" x-model="pw" placeholder="Confirm current password" class="w-full rounded-lg border border-white/20 bg-white px-2.5 py-1.5 text-xs text-slate-900">
                        <button type="button" x-on:click="saveOfflinePw()" x-bind:disabled="busy" class="w-full rounded-lg bg-teal-400 px-2.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-teal-300">Save offline sign-in</button>
                    </div>
                    <p x-show="msg" x-text="msg" x-cloak class="mt-1.5 text-[11px] text-teal-200"></p>
                </div>

                <div class="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/10 px-3 py-2.5">
                    <flux:avatar
                        :name="$user->name"
                        :initials="$user->initials()"
                        class="bg-cyan-400 text-[#102f68]"
                    />

                    <div class="min-w-0 flex-1">
                        <p class="tesda-user-name truncate text-sm font-semibold leading-tight">
                            {{ $user->name }}
                        </p>

                        <p class="tesda-user-role truncate text-xs leading-tight">
                            {{ $user->roleLabel() }}
                        </p>
                    </div>
                </div>

                <form method="POST" action="{{ route('logout') }}">
                    @csrf

                    <button
                        type="submit"
                        class="tesda-logout flex w-full items-center justify-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-sm font-semibold transition hover:bg-white/10"
                    >
                        <flux:icon icon="arrow-right-start-on-rectangle" class="size-4" />
                        Sign out
                    </button>
                </form>
            </div>
        </flux:sidebar>

        <flux:header class="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 shadow-sm backdrop-blur-md lg:px-7">
            <flux:sidebar.toggle class="lg:hidden" icon="bars-3" inset="left" />

            <div class="hidden items-center gap-2 text-sm text-slate-500 md:flex">
                <span>TESDAConnect</span>
                <span class="text-slate-300">/</span>
                <span class="font-semibold text-slate-700">
                    {{ $title ?? 'Dashboard' }}
                </span>
            </div>

            <flux:spacer />

            <a
                href="{{ asset('offline.html') }}"
                data-tesda-connection-pill
                title="View offline workspace"
                class="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 sm:gap-2 sm:px-3 sm:py-1.5"
            >
                <span data-tesda-connection-dot class="size-2 rounded-full bg-emerald-500"></span>
                <span data-tesda-connection-text>Online</span>
            </a>

            <a
                href="{{ route('profile.edit') }}"
                class="ml-3 flex items-center gap-2 rounded-xl p-1.5 transition hover:bg-slate-100"
                wire:navigate
            >
                <flux:avatar
                    :name="$user->name"
                    :initials="$user->initials()"
                    class="bg-cyan-500 text-white"
                />

                <span class="hidden text-left sm:grid">
                    <span class="text-sm font-semibold leading-tight">
                        {{ $user->name }}
                    </span>

                    <span class="text-xs text-slate-500">
                        {{ $user->roleLabel() }}
                    </span>
                </span>
            </a>
        </flux:header>

        {{ $slot }}

        @persist('toast')
            <flux:toast.group>
                <flux:toast />
            </flux:toast.group>
        @endpersist

        @include('layouts.app.partials.scroll-controls')
        @fluxScripts
    </body>
</html>
