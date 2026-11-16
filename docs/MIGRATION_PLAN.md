# Migration & Modernization Plan — TCTESDAConnect

**Objective:** Incrementally migrate the existing Laravel 13 / Livewire 4 / MySQL application (`tesda-connect/`) to an offline-first **React + TypeScript + Vite + Tailwind + shadcn/ui + Dexie.js** SPA backed by **Supabase (PostgreSQL, Auth, Storage, Edge Functions, RLS)**, deployed to **Cloudflare Pages** with **GitHub Actions** QA gates — while keeping the legacy Laravel application intact and runnable side-by-side until production cutover.

---

## 1. Pre-Phase 2 Blockers & Decisions Required Before Scaffolding

Before running Phase 2 package installation or scaffolding the React/Supabase workspace:

1. **CRITICAL HARDWARE CONSTRAINT — `C:\` Free Disk Space (`~202.2 MB` free):**
   - Only `212,029,440` bytes remain free on `C:\`. Installing Node/React/shadcn/Dexie/Workbox/Supabase CLI/Vitest/Playwright browsers requires approximately **3–5 GB** of free disk space.
   - **Action Required:** Free disk space on `C:\` (or relocate npm cache/Playwright browsers to another drive with sufficient space) before executing Phase 2 `npm install` steps.
2. **Target Role Mapping (`institutional_administrator` and `trainer`):**
   - Existing codebase has **5 roles**: `administrator`, `registrar`, `focal_person`, `applicant`, `scholar`.
   - Target specification requests **System Administrator**, **Institutional Administrator**, **Registrar**, **Focal Person**, and **Trainer**.
   - **Action Required:** Confirm exact capabilities for `institutional_administrator` (scoped institutional oversight vs system admin) and `trainer` (competency scoring/attendance per assigned batch vs focal person oversight) so PostgreSQL RLS policies, batch-trainer join tables (`batch_trainers`), and React route guards reflect real policy.
3. **Batch Status Canonicalization (`ongoing` vs `in_training`):**
   - Standardize the conflicting Livewire batch statuses into one PostgreSQL constraint/enum (e.g., `upcoming`, `in_training`, `completed`, `cancelled`).
4. **Canonical Source Database Verification:**
   - Confirm whether live institutional data resides strictly in MySQL (`tesda_connect_v2`) and confirm `database/database.sqlite` can be deprecated/excluded from ETL (since `database.sqlite` misses migration #33 and has inverted `BST`/`MIF` IDs).

---

## 2. Target Repository & Co-Existence Structure

Keep `tesda-connect/` (legacy Laravel app) intact and operational during transition inside the Git repository (`c:\Users\delar\Downloads\tesda-connect\tesda-connect\`), introducing the modern workspace cleanly alongside it:

```text
c:\Users\delar\Downloads\tesda-connect\tesda-connect\
├── app/, routes/, resources/, database/   # Existing Laravel 13 app (preserved until cutover)
├── frontend/                              # New React + TypeScript + Vite + PWA app
│   ├── src/
│   │   ├── app/                           # Router, providers, query client, auth guard
│   │   ├── features/                      # Auth, Intake, Records, Batches, Competency, Attendance, Announcements, Reports, Admin, OfflineSync
│   │   ├── lib/
│   │   │   ├── supabase.ts
│   │   │   ├── db/dexie.ts                # Versioned IndexedDB schema
│   │   │   └── sync/                      # Custom TypeScript sync service, backoff, conflict detection
│   │   └── components/                    # shadcn/ui primitives + layout + Three.js hero
│   ├── tests/                             # Vitest + RTL unit/integration specs
│   └── e2e/                               # Playwright E2E + offline specs
├── supabase/
│   ├── migrations/                        # Versioned PostgreSQL DDL, functions, triggers, RLS + RBAC
│   ├── functions/                         # Edge Functions (idempotent sync, duplicate check, admin user provisioning, server report/cert actions)
│   ├── seed.sql                           # Deterministic dev fixture seed (non-production)
│   └── tests/                             # pgTAP / SQL RLS verification scripts
└── .github/workflows/                     # CI: TypeScript strict, ESLint, Vitest, Playwright, Supabase migration checks, Cloudflare Pages deploy
```

---

## 3. Target Dependency Baseline

- **Frontend Core & UI:** `react`, `react-dom`, `react-router-dom`, `typescript` (`strict: true`), `vite`, `@tailwindcss/vite` / `tailwindcss`, `shadcn/ui` primitives + `lucide-react`, `sonner` (notifications), `recharts` (dashboard analytics), `@fullcalendar/react` + `@fullcalendar/daygrid` + `@fullcalendar/timegrid` + `@fullcalendar/interaction` (training schedule calendar), `three` (`0.170.0` hero continuity).
- **State, Forms & Validation:** `@tanstack/react-query`, `zustand`, `react-hook-form`, `@hookform/resolvers`, `zod`.
- **Backend Client & Optional Monitoring:** `@supabase/supabase-js`, `@sentry/react` (optional — enabled only when `VITE_SENTRY_DSN` is configured).
- **Offline / PWA:** `vite-plugin-pwa`, `workbox-window`, `dexie`, `dexie-react-hooks`, custom TypeScript sync engine.
- **Reporting:** `exceljs`, `pdf-lib` (+ Supabase Edge Functions for server-enforced reporting where required).
- **QA:** `vitest`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `jsdom`, `fake-indexeddb`, `@playwright/test`, `eslint`.

> **Resolved 7-Role RBAC Superset:** Preserve all 5 legacy roles (`administrator` -> `system_administrator`, `registrar`, `focal_person`, `applicant`, `scholar`) alongside the modernized institutional hierarchy roles (`institutional_administrator` scoped via `institution_user`, and `trainer` scoped via `institution_user` + `batch_trainers`), all enforced at PostgreSQL RLS + Edge Function level.

---

## 4. Phased Implementation Sequence

### Phase A (Step 3): Project & Tooling Foundation
- Verify disk space cleared, initialize `frontend/` Vite + React + TS strict + Tailwind + shadcn/ui + ESLint + Vitest + Playwright.
- Initialize `supabase/` project migrations & local CLI workflow (`supabase start` or remote staging project).
- Configure `.env.example` strictly with public `VITE_SUPABASE_URL` & `VITE_SUPABASE_ANON_KEY` (never expose service-role keys to frontend).

### Phase B (Step 4): Supabase PostgreSQL Schema, RLS, Storage & Seed Data
- Author incremental SQL migrations in `supabase/migrations/` mapping all domain tables (Section 4 of `DATABASE_ANALYSIS.md`):
  - `institutions`, `profiles`, `user_roles`, `institution_user`, `courses`, `training_batches` (+ optional `batch_trainers`), `intake_periods`, `intake_course_quotas`.
  - `learner_profiles` (preserving MIS 03-01 columns + unique `uli_number`), `learner_documents`, `enrollment_applications` (`client_draft_id uuid UNIQUE`, `version int`), `enrollment_status_histories`, `enrollment_batch_forwardings`.
  - `competency_units`, `competency_tasks`, `competency_progress` (`version int`), `competency_unit_reviews`, `competency_report_submissions`, `attendance_records`, `training_certificates`, `course_materials`.
  - `announcements` (with working attachments & draft-offline protection), `announcement_views`, `operational_documents`, `outgoing_document_logs`, `offline_sync_mutations`, immutable `security_audit_logs`.
- Configure private Supabase Storage buckets (`learner-documents`, `operational-documents`, `course-materials`, `announcement-attachments`, `forwarding-summaries`) with RLS object policies scoped by role/institution/owner + short-lived signed URLs.
- Implement server-side RPCs & Edge Functions:
  - Transactional enrollment confirmation (`lock`/atomic sequence generation `{CODE}-{YYYY}-{0001}` + `applicant -> scholar` promotion).
  - Authoritative duplicate applicant detection (comparing normalized name, `birthdate`, `email`, `uli_number` — warning reviewers, **never auto-merging**).
  - Admin-only user creation/deactivation/role assignment (blocking self-role modification at DB trigger + RLS levels).

### Phase C (Step 5): Authentication, Session Policy & Role-Based UI Shell
- Implement Supabase Auth (email/password + MFA/passkey support as configured), forced password change flow (`force_password_change`), 90-day staff inactivity enforcement via scheduled Edge Function / `pg_cron`, and server-verified role claims.
- Port Three.js interactive landing hero & 8 verified `public/images/landing/` assets to React landing route (`/`), keeping non-sensitive public institution/course counts cleanly queried via safe public RPC/view without leaking user PII.
- Build non-collapsible flat sidebar navigation cleanly matching the approved layout fix (no broken dropdown triggers or hardcoded stats).

### Phase D (Step 6): Core Domain Modules
1. **Trainee Intake & Records:** 7-step TESDA MIS 03-01 wizard with React Hook Form + Zod, `client_draft_id` generation, IntakePeriod/Quota guards, conditional document upload, staff review/return/verify (100% completeness gate)/confirm, trainee profile search/filter/sort/pagination, ULI assignment, archival & CSV forwarding (`ExcelJS` / neutralized CSV).
2. **Training Operations:** Institutions, Courses, Batches (`in_training` canonical status), Month/Week Calendar overlap warnings, Duration Compliance (scoped properly to selected institution), Competency setup + lock rules, task progress scoring, unit verification locks, report submission pipeline, daily Attendance, Course Materials, and Certification eligibility + printing/PDF.
3. **Announcements & Focal Documents:** Draft/Scheduled/Published/Expired/Archived announcements with working Storage attachments, audience/role targeting, read tracking, Operational Document repository, Outgoing Document Logs.
4. **Reporting (`ExcelJS` + `pdf-lib`):** Trainee summaries, Batch summaries, Incomplete-record reports, Missing-document reports, Schedule reports, Institution summaries — strictly labeling offline-cached reports with sync timestamp & stale/offline watermarks.

### Phase E (Step 7): Offline-First Dexie.js Architecture & Sync Engine
- Implement versioned Dexie.js schema (`localDrafts`, `cachedAnnouncements`, `cachedSchedules`, `syncOutbox`, `syncMeta`, `conflicts`, `syncHistory`).
- Replace unencrypted `localStorage` trust and weak HTTP SHA-256 fallback with strict shared-device security:
  - Offline unlock limited strictly to active authenticated sessions cached within device-policy TTL + explicit device lock/clear-on-logout button purging PII stores cleanly.
  - Zero passwords or secrets stored in IndexedDB/localStorage.
- Implement foreground + event-driven Sync Engine:
  - `online`/`offline` listeners, startup sync, manual "Sync Now", exponential backoff with jitter, UUID `mutation_id` idempotency against `offline_sync_mutations`, per-operation error & partial-failure handling, optimistic `version` mismatch detection.
  - Interactive **Conflict Resolution UI**: side-by-side comparison of Local vs. Server values, highlighted changed fields, modified timestamps/actors, and explicit user actions (`Keep Local`, `Accept Server`, `Merge & Save`).

### Phase F (Steps 8–10): Testing, Data Migration, CI/CD & Cutover
- **Testing:** Vitest + React Testing Library unit/integration suites (verification completeness, Zod intake rules, conflict resolver, Dexie queue, CSV neutralization, RBAC components), Supabase pgTAP/SQL RLS negative tests, Playwright E2E including multi-step offline draft -> reconnect -> server conflict resolution tests.
- **Data ETL (`tesda_connect_v2` MySQL -> Supabase PostgreSQL):**
  1. Freeze writes / put Laravel app in maintenance window; take verified MySQL dump (`mysqldump --single-transaction`) + backup archive of `storage/app/private/*`.
  2. Run idempotent ETL script creating Supabase `auth.users` records (preserving emails, triggering secure password reset/onboarding or verifiable bcrypt migration via Supabase auth import if hash format supported; fallback forced reset cleanly), populating `profiles`/`user_roles` with deterministic UUID map (`legacy_id -> uuid`), importing institutions (`BST`, `MIF`), courses, batches, learner profiles, applications (`reference_no`, `scholar_id`, `uli_number`), histories, competency units/tasks/progress/reviews/reports, attendance, certificates, announcements, logs, and operational documents.
  3. Upload private files from `storage/app/private/*` into corresponding private Supabase Storage buckets matching migrated path keys.
  4. Reconcile source vs target row counts, unique identifier checksums (`scholar_id`, `uli_number`, `reference_no`, `certificate_number`), document counts, and sample smoke logins per role.
- **Rollback Plan:** Keep legacy Laravel codebase & pre-cutover MySQL dump + file snapshot untouched for 14–30 days post-cutover; Cloudflare Pages instant rollback + DNS/reverse-proxy pointer switch restores Laravel immediately if critical issues appear.
- **Deployment:** `.github/workflows/` running `tsc --noEmit`, `eslint`, `vitest`, `playwright`, Supabase migration check, deploying React `dist/` cleanly to Cloudflare Pages and applying Supabase migrations/Edge Functions cleanly.
