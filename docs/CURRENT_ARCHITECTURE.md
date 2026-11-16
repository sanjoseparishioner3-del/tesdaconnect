# Current Architecture Analysis — TCTESDAConnect

**Inspection Baseline:** Phase 1 Complete Codebase Analysis (no existing application source modified or overwritten)  
**Repository / Laravel App Root:** `tesda-connect/`  
**Primary Institutional Domain:** TESDA Training Operations Workflow Support covering **Balli School of Technology (`BST`)** and **Mamburao Integrated Farm (`MIF`)**

---

## 1. Executive Summary

`TCTESDAConnect` is a monolithic, server-rendered **Laravel 13 + Livewire 4 / Volt + Flux UI Pro** web application with supplemental vanilla JavaScript offline/PWA modules (`public/service-worker.js`, `public/offline-app.js`, `public/offline-competency-sync.js`, `public/offline-operational-documents.js`). It is **not** a decoupled SPA/API system: business logic, validation, authorization checks, queries, and HTML rendering are tightly co-located inside **42 Livewire Volt single-file components** under `resources/views/livewire/`, **11 specialized HTTP controllers**, and **9 domain support classes** under `app/Support/`.

| Category | Current State | Migration Disposition |
| :--- | :--- | :--- |
| Frontend UI | Livewire 4 Volt SFCs + Blade + Flux Free/Pro + Tailwind CSS v4 + Alpine.js | **Rewrite** to React + TypeScript + Vite + Tailwind + shadcn/ui + React Hook Form + Zod + TanStack Query |
| Public Landing 3D Scene | Local Three.js `0.170.0` (`resources/js/vendor/three.module.min.js`) + `resources/js/landing-3d.js` + 8 local TESDA/agri images | **Reuse / Adapt** 3D canvas logic & local media assets into React component |
| Backend / API | Monolithic Laravel controllers/Volt actions (`routes/web.php`, no `routes/api.php`) | **Migrate** to Supabase (PostgreSQL + RLS + Supabase Auth + Storage + Edge Functions) |
| Database Runtime | MySQL (`.env.example`) vs. SQLite `:memory:` (`phpunit.xml`) vs. default `'sqlite'` (`config/database.php`) + stale `database/database.sqlite` | **Migrate** schema & validated data cleanly to PostgreSQL with normalized FKs, RLS, and versioned migrations |
| Offline / PWA | Service Worker (`tesda-connect-shell-v3`) + raw IndexedDB (`tesda-connect-offline-v1`, `tesda-connect-offline-queue`, `tesda-connect-v2-operational-documents`) + PBKDF2/HTTP SHA-256 fallback | **Rewrite** cleanly to Dexie.js + Workbox/Vite PWA + strict shared-device security + conflict resolution UI |
| Reporting / Exports | Streamed CSV exports + printable HTML views (browser "Print to PDF"); SQLite-only `.zip`/`.sqlite` backups | **Rewrite** client/server reporting using `ExcelJS` + `pdf-lib` and Supabase Storage/Edge Functions |

---

## 2. Technology Stack Inventory (18-Point Technical Audit)

### 2.1 Frontend Framework & Libraries (`package.json`, `vite.config.js`, `resources/`)

- **Asset Pipeline:** `vite-plus` (`1.3.0`, `@voidzero-dev/vite-plus-core@1.3.0`) configured via `vite.config.js` with `laravel-vite-plugin` (`^3.1`), `@tailwindcss/vite` (`^4.1.11`), and `tailwindcss` (`^4.0.7`).
- **Fonts:** Bunny Fonts preset (`Instrument Sans`, weights 400, 500, 600) declared in `vite.config.js`.
- **UI Layer:** Server-rendered Blade + Livewire `v4.4.8` + Livewire Volt `v1.11.2` + Blaze `^1.0` + Chisel `^0.1.0` + Flux UI `v2.21.0` + **private commercial Flux Pro `^2.20` (`2.21.0` via `https://composer.fluxui.dev`)** + bundled Alpine.js.
- **JavaScript Modules:**
  - `resources/js/app.js` (**0 bytes**, effectively empty).
  - `resources/js/passkeys.js` + `@laravel/passkeys` (`^0.2.0`) for WebAuthn browser ceremonies.
  - `resources/js/landing-3d.js` + vendored `resources/js/vendor/three.module.min.js` (**Three.js `0.170.0`**) powering the interactive 3D landing hero.
  - Vanilla browser scripts directly under `public/`: `pwa-register.js`, `offline-app.js`, `offline-competency-sync.js`, `offline-operational-documents.js`, `service-worker.js`, `offline.html`, `manifest.webmanifest`.
- **Vite/Vitest Stub:** `vite.config.js` defines `test: { clearMocks: false }`, but **0 JavaScript/TypeScript test files** exist.
- **Engine Constraints (`package.json`):** `devEngines` specifies `npm@12.2.0` (`onFail: download`), whereas the local workstation runs `npm 11.17.0` cleanly using `.\node_modules\.bin\vp.cmd build` when needed.

### 2.2 Backend Framework & Architecture (`composer.json`, `bootstrap/`, `app/`)

- **Core Runtime:** PHP `^8.3` (`vendor/composer/platform_check.php` enforces `>= 8.4.1`), Laravel Framework `^13.17` (`v13.42.0`), Laravel Fortify `^1.37.2` (`v1.42.0`), `laravel/passkeys` (`v0.2.1` + `web-auth/webauthn-lib 5.3.12`), `concurrently: ^10.0.3`.
- **HTTP Entrypoint & Middleware (`bootstrap/app.php`):**
  - Loads `routes/web.php`, `routes/console.php`, and health check `/up`.
  - Registers aliases `active` (`App\Http\Middleware\EnsureActiveAccount`) and `role` (`App\Http\Middleware\EnsureRole`).
  - Forces JSON exception responses for `api/*` or `expectsJson()`.
  - Registers persistent Livewire middleware `[EnsureActiveAccount::class, EnsureRole::class]` in `App\Providers\AppServiceProvider`.
- **Application Layer Breakdown (`app/`):**
  - **Fortify Actions (`2`):** `CreateNewUser`, `ResetUserPassword` (+ concerns `PasswordValidationRules`, `ProfileValidationRules`).
  - **Controllers (`12` total = `Controller` + `11` endpoints):** `AnnouncementAttachmentController`, `CourseMaterialDownloadController`, `EnrollmentBatchForwardingController`, `FocalAdminTaskController`, `LearnerDocumentController`, `OfflineCompetencyProgressSyncController`, `OfflineWorkspaceController`, `OperationalDocumentController`, `ReportExportController`, `TrainingCertificateController`, `Admin\DownloadSystemBackupController`.
  - **Models (`24`):** `ActivityLog`, `Announcement`, `AnnouncementView`, `AttendanceRecord`, `CompetencyProgress`, `CompetencyReportSubmission`, `CompetencyTask`, `CompetencyUnit`, `CompetencyUnitReview`, `Course`, `CourseMaterial`, `EnrollmentApplication`, `EnrollmentBatchForwarding`, `EnrollmentStatusHistory`, `Institution`, `IntakeCourseQuota`, `IntakePeriod`, `LearnerDocument`, `LearnerProfile`, `OperationalDocument`, `OutgoingDocumentLog`, `TrainingBatch`, `TrainingCertificate`, `User`.
  - **Support Services (`9`):** `ActivityLogger`, `AuditLogPresenter`, `CompetencyReportWorkflow`, `EnrollmentStatusRecorder`, `EnrollmentVerificationService`, `InstitutionScope`, `SqliteDatabaseBackup`, `SystemBackupArchive`, `TrainingCompletionService`.
  - **Console Commands (`routes/console.php`):** `inspire` and `accounts:lock-inactive-staff` (scheduled `dailyAt('02:00')->withoutOverlapping()`).
- **API Style:** There is **no `routes/api.php`**. Only **5 JSON/HTTP endpoints** behave like REST/AJAX endpoints (`offline-sync/snapshot`, `offline-sync/verify-password`, `offline-sync/announcements/mark-read`, `offline-sync/competency-progress`, `focal/documents/offline-upload`), plus `/livewire-{hash8}/*` and `.well-known/passkey-endpoints`.

### 2.3 Database Engine & Schema

- **Dual/Conflicting Engine Configuration (`config/database.php`, `.env.example`, `phpunit.xml`):**
  - `config/database.php` defaults to `'sqlite'`.
  - `.env.example` configures **MySQL** (`DB_CONNECTION=mysql`, `127.0.0.1:3306`, `DB_DATABASE=tesda_connect_v2`, `DB_USERNAME=root`).
  - `phpunit.xml` forces SQLite `:memory:` during test runs.
  - A stale `database/database.sqlite` (`507,904` bytes) exists on disk with **32 of 33** migrations applied (missing `2026_11_11_000000_add_uli_assignment_tracking_to_learner_profiles`) and inverted institution IDs (`MIF=1, BST=2`) vs. seeders that hardcode `institution_id = 2` expecting `MIF`.
  - `SystemBackupArchive` and `SqliteDatabaseBackup` hardcode SQLite file copying and fail with `RuntimeException` when running on MySQL.
- **Schema Size:** **34 application tables** across **33 migration files** (plus Laravel `migrations`). *(Full schema details in `docs/DATABASE_ANALYSIS.md`.)*

### 2.4 Authentication & Authorization (`config/fortify.php`, `routes/`, `app/Http/Middleware/`)

- **Authentication Mechanism:** Laravel Fortify session cookie auth (`guard: web`, `username: email`, `SESSION_DRIVER=database`, lifetime `120` minutes, unencrypted in `.env.example`, `BCRYPT_ROUNDS=12`).
- **Enabled Fortify Features:** `registration()`, `resetPasswords()`, `twoFactorAuthentication(['confirm' => true, 'confirmPassword' => true])`, `passkeys(['confirmPassword' => true])`.
- **Disabled Features:** `emailVerification()` is commented out in `config/fortify.php`.
- **Password Policy & Account Status:** `users.account_status` (`active|inactive|pending_approval`), `last_login_at`, `force_password_change`, `password_expires_at`, `password_expiry_exempt`.
- **Authorization Mechanism:** Role column (`users.role`) enforced by `EnsureRole` middleware and per-component checks + institution scoping via `InstitutionScope::idsFor(User $user)` (`institution_user` pivot). Notice **no Laravel Policies/Gates** are used consistently; authorization is spread across route middleware and inline controller/Livewire assertions.

### 2.5 Pages, Routes, Dashboards & Components (`php artisan route:list`)

- **Total Registered Routes:** **112 routes** (18 custom controller/redirect routes via `--except-vendor` + Volt page routes, Fortify auth routes, Passkey WebAuthn endpoints, Livewire runtime routes, and Flux asset routes).
- **View Inventory (`resources/`):** **96 files** total (`5` CSS/JS/font entries + `91` Blade/Volt templates):
  - **42 Volt/Livewire component pages** under `resources/views/livewire/`.
  - **7 paired settings views** in `resources/views/pages/settings/` with duplicate `#U26a1*` and `⚡*` filenames (`profile`, `appearance`, `security`, `delete-user-modal`, `two-factor-recovery-codes`, etc. — technical debt).
  - **Unused starter-kit remnants:** `resources/views/dashboard.blade.php`, `resources/views/layouts/app/header.blade.php`, and ~260 lines of dead `@if (false)` markup in `resources/views/livewire/learner/portal.blade.php`.
- **Route Groups:**
  - `routes/web.php`: Landing (`/`), `registration` alias, `dashboard`, `user-guide`, `enrollments`, `competency-setup`, `progress`, `competency-progress`, `schedules`, `attendance`, `certification`, `announcements`, `reports`, `learning/materials`, file downloads (`learner-documents`, `course-materials`, `certificates/{certificate}/print`, `announcements/{announcement}/attachment`, `reports/export/{type}`).
  - `routes/admin-oversight.php`: `system/{institutions,accounts,account-requests,courses,batches,calendar,intake-summary,duration-compliance,forwarded-batches,student-records,activity,health}` + `system/backups/{filename}/download` + `registrar/{account-requests,accounts,institutions,intake,student-records,forward-batches}` + `enrollment-forwardings/{forwarding}/summary`.
  - `routes/focal-person.php`: `focal/{courses,documents,forms}` + `focal/forms/{form}/{download,print}` + `operational-documents/{document}/download`.
  - `routes/student.php`: `my-learning`, `my-learning/materials`, `learner/{registration,portal,requirements,documents,learning-progress,training-competency-progress,attendance,certification-completion,announcements}`. *(Notice `/my-learning` and `/learner/portal` share `learner.portal` naming overlap / route duplication.)*
  - `routes/offline-sync.php`: 5 offline-sync & offline-upload endpoints.
  - `routes/settings.php`: `settings` redirect + `settings/{profile,appearance,security}` + `.well-known/passkey-endpoints`.

### 2.6 Business Logic & Domain Modules

- Verified domain workflows include:
  - 7-step TESDA MIS 03-01 Learner Registration & `EnrollmentVerificationService` record completeness scoring.
  - `IntakePeriod` & `IntakeCourseQuota` lock enforcement + atomic scholar ID generation (`{CODE}-{YYYY}-{0001..}`) via DB transactions + `lockForUpdate()`.
  - `CompetencyReportWorkflow` (`draft -> reviewed -> finalized -> submitted`) + unit review locking + dual `progress`/`achievement` chart task assessment.
  - `TrainingCompletionService` certification eligibility gate & `TC-{YYYY}-{ULID}` certificate issuance.
  - Registrar ULI tracking, archived-record audit reason enforcement, and UTF-8 CSV batch forwarding (`EnrollmentBatchForwardingController`).
  - Focal Person operational document repository (`<=10 MB`), outgoing document logs, and 9 TESDA/secretarial printable/CSV forms (`FocalAdminTaskController`).

### 2.7 User Roles & Permissions Summary

The codebase implements **5 concrete roles**:
1. `administrator` (System Administrator — cross-institution oversight, system health/backups, account provisioning, audit logs, institutional CRUD; intentionally read-only on certain intake actions while overriding others).
2. `registrar` (Registrar — intake verification/return/confirmation, trainee record maintenance, ULI assignment, forwarding batches, institution-scoped account requests & announcements).
3. `focal_person` (Focal Person — course management, training schedules, task competency assessment, unit review, attendance, certification, operational documents, outgoing doc log, reporting).
4. `applicant` (Prospective trainee — registration wizard, requirements/documents, announcements, read-only learning progress/portal before confirmation).
5. `scholar` (Confirmed trainee — learner portal, course materials, attendance, competency progress, certification view, printable `#scholar-id-card`).

> **GAP / UNVERIFIED TARGET ROLES:** The Phase 3 migration prompt lists **Institutional Administrator** and **Trainer** alongside System Administrator, Registrar, and Focal Person. **Neither `institutional_administrator` nor `trainer` exists in `users.role`, `EnsureRole`, seeders, or routes today.** Only a checkbox classification label `'TVET Trainers'` exists in Step 3 of learner registration. Product owners must confirm how `institutional_administrator` and `trainer` map to existing `administrator`/`focal_person` permissions before Supabase RLS rules are finalized.

### 2.8 Offline / PWA Functionality

- Registered via `public/pwa-register.js` (`public/service-worker.js`, cache key `tesda-connect-shell-v3`).
- Offline portal (`public/offline.html` + `public/offline-app.js`):
  - Caches snapshots per user (`tesda-connect-offline-v1` IndexedDB: `accounts`, `snapshots`, `outbox`).
  - Stores offline credential verifiers via WebCrypto PBKDF2-HMAC-SHA256 (100,000 iterations) on HTTPS/localhost, or degrades to **4,000-iteration pure-JS SHA-256** on plain HTTP.
  - Supports **announcement read-receipt outbox**, **competency task status queue** (`tesda-connect-offline-queue`, idempotent via `offline_sync_mutations.mutation_id` + naive timestamp conflict check), and **focal document upload queue** (`tesda-connect-v2-operational-documents`, Blob queue `<=10 MB`).
- **Missing offline requirements from target spec:** No offline trainee registration drafts, no side-by-side field-level conflict resolution drawer, no automatic logout purge of PII snapshots on shared devices.

### 2.9 Reporting, File Storage, Deployment & Third-Party Dependencies

- **Reporting:** Browser print views (`window.print()`) + PHP `fputcsv()` UTF-8 exports (`ReportExportController`, `FocalAdminTaskController`, `EnrollmentBatchForwardingController`, `system/activity`). **No `ExcelJS`, `.xlsx`, `pdf-lib`, DomPDF, or Snappy libraries exist.**
- **Storage (`config/filesystems.php`):** Default `local` disk points to `storage/app/private` (`serve: true`); `public` disk symlink (`public/storage`) is absent; `s3` is configured in Laravel defaults but unused.
- **Deployment / CI (`github/`):**
  - `.github/workflows/tests.yml`: runs `ubuntu-latest`, PHP `8.3`, Node `22`, `composer setup`, and `composer ci:check` (`pint --test`, `phpstan`, `artisan test`). Fails without valid Flux Pro composer authentication in `auth.json` / secrets.
  - `.github/dependabot.yml` enabled.
  - Leftover patch script `tools/Apply-StudentScholar-Workspace.ps1`, root `README.md` (`Panel Revision Patch 2`), and `README.txt` (`ULI Management implementation patch`).
  - **Third-Party Integrations:** Only private Composer repository `https://composer.fluxui.dev` (`flux-pro`), Bunny Fonts, and `@laravel/passkeys` (`web-auth/webauthn-lib`). `.env.example` sets `MAIL_MAILER=log`. Live production `.env` secrets and external hosting configs are **Unverified**.

---

## 3. Baseline Verification & Environment Measurements

Measured directly on the workspace workstation during Phase 1:

| Check | Outcome | Exact Finding |
| :--- | :--- | :--- |
| **Composer / PHP Runtime** | Warning / Version Split | Default shell `php` is `8.2.12` (blocked by `platform_check.php` needing `>= 8.4.1`); runnable PHP binary at `AppData\Local\Programs\PHP\current\php.exe` (`8.5.11`). |
| **Disk Space (`C:\`)** | **CRITICAL BLOCKER** | **`212,029,440` bytes (~202.2 MB) free** out of `239,304,359,936` bytes (~222.87 GB). Insufficient for React/Vite/Supabase/Playwright installs (~3–4 GB needed) until disk space is cleared. |
| **Laravel Pint (`vendor\bin\pint --test`)** | **FAIL** | **53 files** fail formatting checks across `app/`, `bootstrap/`, `config/`, `database/`, `routes/`, and `tests/`. |
| **Larastan / PHPStan (`phpstan.neon`, Level 7)** | **FAIL** | **140 errors** (`AnnouncementAttachmentController` date/bool checks, missing return types, untyped Eloquent model properties, `EnsureRole` PHPDoc mismatch, `OfflineCompetencyProgressSyncController` union types, missing generic relation types). Note: `phpstan.neon` **excludes `resources/views/livewire/`**, leaving all 42 Volt components unchecked. |
| **Pest / PHPUnit (`artisan test`, SQLite `:memory:`)** | **FAIL (Pre-existing)** | **173 runtime tests: 164 passed, 4 failed, 5 skipped** (`727` assertions, `33.31s`). Fails in `LearnerPortalTrainingProgressTest:82`, `LearnerRegistrationWizardTest:32` (checks Step 1 for `course_id`, which moved to Step 5), `StudentScholarWorkspaceTest:91`, `StudentScholarWorkspaceTest:219`. Skips via `SystemBackupArchiveTest` (`zip`/`sqlite` gate) and `TestCase::skipIfFortifyFeatureNotEnabled` (`emailVerification` disabled). |
| **Vitest / JS Tests** | **None (0)** | Only config stub in `vite.config.js`; zero JS test suites exist. |

---

## 4. Reuse vs. Refactor vs. Migration Classification Matrix

| Asset / Module | Classification | Rationale & Action |
| :--- | :--- | :--- |
| `resources/js/landing-3d.js`, `three.module.min.js`, `public/images/landing/*` | **Reuse (with adaptation)** | Wrap interactive Three.js hero cleanly inside a React component with WebGL fallback & responsive teardown; retain verified TESDA/agri photos. |
| Domain validation & scoring rules (`EnrollmentVerificationService`, `TrainingCompletionService`, `CompetencyReportWorkflow`, CSV formula escaping) | **Reuse (port to TypeScript/Zod & PostgreSQL/Edge Functions)** | Preserve verified MIS 03-01 rules, 100% gate, workflow state machine (`draft -> reviewed -> finalized -> submitted`), and `TC-{YYYY}-{ULID}` / `{CODE}-{YYYY}-{0001}` conventions. |
| `routes/admin-oversight.php` duplicate course/batch/records UIs (`system/*` vs `registrar/*` vs `focal/*` vs `schedules`) | **Refactor & Consolidate** | Unify diverging status enums (`ongoing` vs `in_training`), global vs institution `IntakePeriod` semantics, broken `deleteModalOpen`, and conflicting edit guards on confirmed records. |
| Livewire Volt SFCs (42 files + 7 `#U26a1*` duplicates), Flux Pro UI, `@if (false)` dead code | **Rewrite (Retire in target)** | Replace server-coupled Volt/Flux Pro views with React + TypeScript + shadcn/ui + Lucide React; remove commercial `flux-pro` dependency. |
| Fortify + Passkeys + `EnsureActiveAccount` + custom `offline-app.js` / raw IDB | **Rewrite / Replace** | Migrate auth to Supabase Auth + PostgreSQL RLS + `user_roles`/`institution_user` tables + Edge Functions; replace unencrypted IDB/SHA-256 offline auth with Dexie.js + Workbox + secure shared-device policy. |
| CSV-only exports & SQLite backup (`ReportExportController`, `SqliteDatabaseBackup`) | **Replace** | Replace raw CSV/print HTML with client/Edge `ExcelJS` + `pdf-lib` generators; replace SQLite file backup with Supabase PITR / `pg_dump` workflows. |
