# Feature Inventory & Module Audit — TCTESDAConnect

**Scope:** All verified user-facing pages, controllers, workflows, permissions, and known defects across the **112 active Laravel routes** and **42 Livewire Volt components**.  
**Important Note on Unverified / Absent Roles:** Although the modernization brief references `System Administrator`, `Institutional Administrator`, `Registrar`, `Focal Person`, and `Trainer`, the current codebase implements only **five roles**: `administrator`, `registrar`, `focal_person`, `applicant`, and `scholar`. `institutional_administrator` and `trainer` do **not** exist in routes, middleware, models, or database constraints today.

---

## 1. Role & Access Control Matrix

| Module / Capability | `administrator` | `registrar` | `focal_person` | `applicant` | `scholar` | Notes & Verified Inconsistencies |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| Public Landing (`/`) | Public | Public | Public | Public | Public | Shows live DB stats + local-env quick-fill creds (`admin123`, `registrar123`) when `app()->environment('local')`. |
| Unified Dashboard (`/dashboard`) | Global KPIs | Institution Queue | Training Ops | Redirect/Basic | Redirect/Basic | Role-adaptive Livewire dashboard (`livewire/dashboard.blade.php`). |
| User Guide (`/user-guide`) | Read | Read | Read | Read | Read | Accessible to all active authenticated roles. |
| Account Settings (`/settings/*`) | Own | Own | Own | Own | Own | Profile, appearance, password, TOTP 2FA, WebAuthn passkeys. |
| Institution Management (`/system/institutions`, `/registrar/institutions`) | Full CRUD | Scoped CRUD | None | None | None | Overlapping UI routes under `system/` and `registrar/`. |
| Account Requests (`/system/account-requests`, `/registrar/account-requests`) | All | Institution-scoped | None | None | None | Registration approval workflow (`pending_approval` -> `active`). |
| Staff & User Accounts (`/system/accounts`, `/registrar/accounts`) | Full CRUD | Institution-scoped | None | None | None | `users` deletion fails if user uploaded `course_materials` (`restrictOnDelete`). |
| System Health, Backups & Audit Logs (`/system/health`, `/system/activity`) | Full | None | None | None | None | Backups fail on MySQL (`SqliteDatabaseBackup`); activity CSV lacks formula neutralization. |
| Intake Periods & Quotas (`/registrar/intake`, `/system/intake-summary`) | Read/Monitor | Institution CRUD | None | Enforced | Enforced | **Conflict:** `system/intake-summary` treats periods globally; `registrar/intake` scopes per institution. |
| Trainee Registration Wizard (`/registration`, `/learner/registration`) | None | Can create offline/staff intake in `/enrollments` | None | Submit 7-step | View | **Test mismatch:** `LearnerRegistrationWizardTest` checks Step 1 for `course_id` (now Step 5). |
| Enrollment Review & Confirmation (`/enrollments`) | **Read-Only** | Verify/Return/Confirm/Edit/Delete | View? | None | None | Confirms promote `applicant -> scholar` + generate `{CODE}-{YYYY}-{0001..}` `scholar_id`. |
| Trainee Records & ULI (`/registrar/student-records`, `/system/student-records`) | **Bypass!** (`system/student-records` shares same component without inner role guard) | Edit (with reason), Archive/Restore, ULI assign | None | None | None | `student-records` blocks edits on confirmed/scholar IDs; `enrollments` still lets Registrar edit confirmed rows. |
| Batch Forwarding (`/registrar/forward-batches`, `/system/forwarded-batches`) | Oversight view | Create & export CSV | None | None | None | Generates UTF-8 BOM CSV with formula neutralization. |
| Courses (`/system/courses`, `/focal/courses`) | Oversight CRUD | None | Scoped CRUD | None | None | Course archive + history tracking across duplicate views. |
| Training Batches & Calendar (`/system/batches`, `/system/calendar`, `/schedules`) | Batches & Calendar | None | Schedules | None | None | **Conflict:** `system/batches` uses `'ongoing'` (cap 65,535); `schedules` uses `'in_training'` (cap 500) + missing delete modal. |
| Duration Compliance (`/system/duration-compliance`) | Full | None | None | None | None | **Bug:** `$summary` totals ignore the `$institutionFilter`. |
| Competency Setup & Progress (`/competency-setup`, `/progress`, `/competency-progress`) | View/Edit | View | Score & Verify/Lock | None | None | Structural unit/task edits locked once progress or unit reviews exist; inline + bulk (`<=100`) task scoring. |
| Attendance & Certification (`/attendance`, `/certification`, `/certificates/{id}/print`) | Monitor | Monitor | Record & Issue | None | Own print | Certificates use `TC-{YYYY}-{ULID}` + HTML browser print; zero server PDF generation. |
| Learning Materials (`/learning/materials`, `/my-learning/materials`) | View/Manage | View/Manage | Manage `<=20 MB` | Read (course) | Read (course) | Served from private `local` disk (`CourseMaterialDownloadController`). |
| Focal Documents & Forms (`/focal/documents`, `/focal/forms`, `/focal/forms/{form}/*`) | View | View | Full CRUD + 9 templates | None | None | Operational doc queue works offline on `/focal/documents`; 9 CSV/HTML-print forms (`attendance_date` unvalidated -> 500). |
| Announcements (`/announcements`, `/learner/announcements`) | Create/Publish/All | Scoped | Read/Monitor | Read (`all`) | Read (`all`,`scholar`) | `attachment_*` columns exist in DB & download route, **unwired in Livewire save logic**. |
| Reports & Exports (`/reports`, `/reports/export/{type}`) | Export CSV | Export CSV | Export CSV | None | None | CSV-only (enrollment, competency, attendance) + HTML views. |
| Learner Portal (`/my-learning`, `/learner/*`) | None | None | None | Read | Full + `#scholar-id-card` | Contains ~260 lines dead `@if (false)` markup + 2 failing tests in `StudentScholarWorkspaceTest`. |
| Offline Workspace (`/offline.html`, `/offline-sync/*`) | Sync (`admin` snapshot) | Sync | Sync (docs & competency) | Snapshot only | Snapshot only | Read-only announcement/schedule snapshot + mark-read + competency queue + focal doc upload queue. **No offline enrollment drafts.** |

---

## 2. Detailed Module Inventory

### A. Landing Page & Public Authentication
- **Landing (`welcome.blade.php`, `resources/js/landing-3d.js`):** Interactive WebGL Three.js (`0.170.0`) hero animation, 8 local documentation photos (`public/images/landing/`), dynamic DB statistics (`institutions`, `courses`, `training_batches`, active counts), and quick demo credentials rendered automatically when `app()->environment('local')` (`admin123`, `registrar123`).
- **Authentication (Fortify + Passkeys):**
  - Email + password login (`/login`), registration (`/register`), forgot/reset password (`/forgot-password`, `/reset-password/{token}`), two-factor challenge (`/two-factor-challenge`), password confirmation (`/user/confirm-password`).
  - WebAuthn passkeys (`/passkeys/login*`, `/passkeys/confirm*`, `/user/passkeys*`, `/.well-known/passkey-endpoints`).
  - `/login` displays a shared-device **"Enable offline workspace on this device"** opt-in checkbox (checked/enabled by default unless cleared — shared-device risk).

### B. Dashboards & Navigation
- **Sidebar (`resources/views/layouts/app/sidebar.blade.php`):** Non-collapsible flat section navigation with `TC` branding, offline status widget (`Offline Access`), user identity card, and role-grouped links.
- **Role Dashboard (`livewire/dashboard.blade.php`):**
  - Shared KPI row (5 cards), batch enrollment bar chart, completeness donut chart, activity timeline, and live database-driven Batch Capacity Overview (`min(100, round(enrolled/capacity*100))`).
  - **Administrator Additions:** 6 global KPIs and BST vs. MIF completion comparison card.
  - **Focal Person Additions:** Confirmed trainees count, pending competency encodings, pending TESDA reports, up to 10 ready-for-scheduling trainees, 8 upcoming deadlines.
  - **Registrar Additions:** 15 recent submissions queue and pending staff/learner account requests.
- **Technical Debt:** Starter-kit `resources/views/dashboard.blade.php` and `layouts/app/header.blade.php` remain unused in repo.

### C. Trainee Intake & Registration (`learner/registration.blade.php`, `enrollments/index.blade.php`)
- **TESDA MIS 03-01 7-Step Wizard:**
  1. Address & Profile Location (`entry_date`, street/barangay/district/city/province/region, contact). *(Bug: `LearnerRegistrationWizardTest:32` fails because it still expects Step 1 to require `course_id`.)*
  2. Personal, Employment, Birthplace, Education & Guardian Details.
  3. Classifications checkboxes (including `'TVET Trainers'` classification option — **not** an auth role).
  4. Disability types & cause (`congenital|illness|injury`).
  5. Institution, Course & Scholarship Package selection (enforces open `IntakePeriod` & `IntakeCourseQuota` lock gates).
  6. Conditional Document Uploads (`<=5 MB` each across up to 6 categories: birth certificate, Form 137/TOR, ID photo, NCAE/NSAT, barangay/indigency clearance, valid ID — served privately via `LearnerDocumentController`).
  7. Review, `privacy_consent` toggle & final submission (`TC-YYYY-{RAND8}`, `EnrollmentVerificationService` computes 0–100% completeness).
- **Registrar Intake Review (`/enrollments`):**
  - Registrar can create intake records on behalf of learners, edit fields, approve/reject `learner_documents` with remarks, return applications (`returned`), verify (**requires 100% completeness gate**), confirm (`confirmed` — executes inside DB transaction with `lockForUpdate()`, promotes `applicant -> scholar`, generates sequential `{CODE}-{YYYY}-{0001..}` `scholar_id`, logs `EnrollmentStatusHistory`), or delete unconfirmed drafts.
  - Administrator views `/enrollments` in strict read-only oversight mode.

### D. Trainee Records, ULI & Forwarding (`/registrar/student-records`, `/registrar/forward-batches`)
- **Trainee Records (`registrar/student-records.blade.php`):**
  - Search, filter, sort, paginate (`15`/page), toggle Active vs. Archived views (`archived_at`), edit demographic/profile data with **mandatory change reason**, assign unique **ULI (`uli_number`)** with `uli_assigned_at` and `uli_assigned_by_user_id` audit fields.
  - **Discrepancy:** Route `/system/student-records` mounts this exact component; unlike `/enrollments`, `student-records.blade.php` does not lock out editing on role, allowing Administrators in `/system/student-records` to mutate records directly. Meanwhile, `student-records` blocks edits once `scholar_id` is issued, whereas `/enrollments` still permits editing confirmed records.
- **Batch Forwarding (`registrar/forward-batches.blade.php`, `EnrollmentBatchForwardingController`):**
  - Groups verified/confirmed enrollments by `(institution_id, course_id)`, assigns `reference_code` (`forwarding_id`), writes CSV summary stored privately on `local` disk with UTF-8 BOM + CSV formula-injection neutralization (`'`, `=`, `+`, `-`, `@`, tab/CR).

### E. Institutions, Courses, Batches & Training Schedules
- **Institutions (`system/institutions`, `registrar/institutions`):** Active/inactive flag (`is_active`), institutional codes (`BST`, `MIF`).
- **Courses (`system/courses`, `focal/courses`):** Code, name, qualification level (`NC I` / `NC II` / etc.), `training_hours`, description, requirements, `curriculum_reference`, `is_active`.
- **Batches & Schedules (`system/batches`, `system/calendar`, `schedules/index`):**
  - `training_batches` tracks `code`, `name`, `capacity`, `scheduled_hours`, `starts_at`, `ends_at`, `next_class_at`, `venue`, `status`.
  - **Data Integrity Bugs:**
    1. `system/batches` uses status `'ongoing'` and allows capacity up to `65535`; `schedules/index` uses status `'in_training'` and caps capacity at `500`.
    2. `schedules/index` references undefined property/state `deleteModalOpen`, breaking UI batch deletion.
    3. `schedules/index` lacks internal role assertions inside Livewire actions (relies purely on route middleware, though persistent middleware mitigates direct Livewire tampering).
    4. `system/duration-compliance`: summary card totals (`$summary`) do not apply `$institutionFilter`.

### F. Competency Progress, Attendance & Certification
- **Competency Setup (`/competency-setup`):** Defines `CompetencyUnit` (`unit_number`, `sort_order`) and `CompetencyTask` split into `chart_type` = `'progress'` vs. `'achievement'`. Once any `competency_progress` or `competency_unit_reviews` row exists for a unit/task, structural editing locks.
- **Progress Tracking (`/progress`, `/competency-progress`):**
  - Inline task status updates (`not_assessed|competent|not_yet_competent`) and bulk assessment (`<=100` tasks per request).
  - Unit verification & locking (`CompetencyUnitReview`, `is_locked = true`).
  - Report approval pipeline via `CompetencyReportWorkflow`: `draft -> reviewed -> finalized -> submitted` with `submission_reference`.
- **Attendance (`/attendance`):** Daily trainee status (`present|absent|late`) keyed uniquely on `(enrollment_application_id, attendance_date)`.
- **Certification (`/certification`, `/certificates/{id}/print`):**
  - `TrainingCompletionService` evaluates required competent units & reviews.
  - Issues unique `certificate_number` (`TC-{YYYY}-{ULID}`) with `issued_by_user_id` and `issued_at`.
  - Printing delegates to browser print stylesheet on `certificates.print` — **no cryptographic signature or library PDF (`pdf-lib`) file output**.

### G. Learning Materials, Operational Documents & Secretarial Forms
- **Course Materials (`/learning/materials`, `/my-learning/materials`):** Uploads `<=20 MB` stored privately (`CourseMaterialDownloadController`), toggleable `is_published`.
- **Operational Document Repository (`/focal/documents`, `OperationalDocumentController`):** Stores private files `<=10 MB` tagged by `category` (`attendance_sheet|assessment_form|photo|other`) and optionally linked to course, batch, or enrollment. Supports offline queued Blob upload via `POST /focal/documents/offline-upload`.
- **Outgoing Document Log & 9 Printable/CSV Forms (`/focal/forms`, `FocalAdminTaskController`):**
  - CRUD log (`outgoing_document_logs`: `document_type`, `reference_number`, `recipient`, `subject`, `sent_at`, `method`).
  - Generates 9 templates (`progress-chart-template`, `tesda-form-template`, `batch-summary`, `enrollment-summary`, `attendance-sheet`, `progress-report`, `trainee-roster`, `meeting-minutes-template`, `daily-time-record-template`). *(Bug: unvalidated `attendance_date` query param triggers a 500 error via `Carbon::parse()`.)*

### H. Announcements Module (`announcements/index`, `learner/announcements`)
- Audiences validated as `Rule::in(['all', 'scholar', 'focal_person'])`.
- Lifecycle: Draft (`published_at = null`), Scheduled (`published_at > now()`), Published, Expired (`expires_at <= now()`), Archived (`archived_at != null`), plus `deadline_at` tracking.
- Read/view receipts stored per user in `announcement_views` (`viewed_at`, `read_at`).
- **Unfinished Feature:** DB schema and `AnnouncementAttachmentController` support `attachment_path`/`attachment_name`/`attachment_mime`/`attachment_size`, **but `Announcement::$fillable` omits these columns and the Livewire UI has no attachment uploader**.

### I. Learner Portal (`/my-learning`, `/learner/*`)
- Pages: Portal (`portal.blade.php`), Requirements (`requirements`), Documents (`documents`), Learning Progress (`learning-progress`), Competency Progress (`competency-progress`), Attendance (`attendance`), Certification (`certification`), Announcements (`announcements`), plus printable `#scholar-id-card`.
- **Pre-existing Failures & Debt:** `portal.blade.php` contains ~260 lines of dead `@if (false)` markup; `StudentScholarWorkspaceTest` fails 2 assertions (`Unread Announcements` / `Your latest document review` UI regression) and `LearnerPortalTrainingProgressTest:82` fails on `learner.competency-progress`.

### J. Offline-First & PWA Capabilities (Current vs. Target Gap)

| Target Requirement (Phase 4) | Current State | Gap Severity |
| :--- | :--- | :--- |
| Service Worker App Shell + Assets | `public/service-worker.js` (`tesda-connect-shell-v3`) | Basic cache only; not Workbox-managed or Vite-hash precached |
| Versioned Dexie.js Local DB | Raw `indexedDB.open` across 3 fragmented DBs (`tesda-connect-offline-v1`, `tesda-connect-offline-queue`, `tesda-connect-v2-operational-documents`) | **Major rewrite** needed |
| Cached Announcements & Schedules | Stored in `snapshots` object store (`max 100` learners, unencrypted PII!) | Needs minimal authorized-only caching + cleanup on logout |
| Offline Trainee Intake Drafts | **Missing completely** | **Critical functional gap** |
| Offline Competency / Attendance / Doc Mutations | Competency single-select queue (`OfflineCompetencyProgressSyncController`) + Focal doc upload queue (`<=10 MB`, loads on `/focal/documents` only, no idempotency) + announcement mark-read | Needs unified idempotent Dexie mutation queue for ALL offline-capable forms |
| Exponential Backoff & Partial Recovery | Immediate retry on `online` / Sync Now; halts doc queue on 4xx | Needs per-item retry, backoff, status ledger |
| Conflict Resolution UI | **Banner only** (`Y-m-d H:i:s` second-granularity timestamp mismatch check on server) | Needs side-by-side field diff & manual keep-local / accept-server / merge UI |
