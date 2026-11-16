# Database Architecture & Schema Analysis — TCTESDAConnect

**Source Inspections:** All **33 migration files** (`database/migrations/`), `config/database.php`, `.env.example`, `app/Models/*`, `database/seeders/*`, and file-level inspection of `database/database.sqlite` (`507,904` bytes).

---

## 1. Database Engine & Configuration Discrepancies

| Artifact | Configured Engine | Actual State & Impact |
| :--- | :--- | :--- |
| `.env.example` | `DB_CONNECTION=mysql` (`127.0.0.1:3306`, `tesda_connect_v2`, `root`) | Intended local/staging database engine. Live `.env` secrets/runtime state: **Unverified** (not inspected). |
| `config/database.php` | Fallback `'default' => env('DB_CONNECTION', 'sqlite')` | Defaults silently to SQLite if `.env` omits `DB_CONNECTION`; SQLite has `foreign_key_constraints: true`, `busy_timeout: null`, `transaction_mode: 'DEFERRED'`. |
| `phpunit.xml` | SQLite `:memory:` | All 173 Pest tests run on SQLite `:memory:`, masking MySQL-specific FK, `lockForUpdate()`, enum/collate, and `down()` index-drop errors. |
| `database/database.sqlite` | On-disk SQLite (`507,904` bytes) | **Drifted/Stale:** Missing migration #33 (`2026_11_11_000000_add_uli_assignment_tracking_to_learner_profiles`) and contains inverted institution IDs (`MIF=1, BST=2`) conflicting with seeders expecting `MIF=2`. |
| `SystemBackupArchive` / `SqliteDatabaseBackup` | SQLite file dump | Throws `RuntimeException` when running against MySQL (`tesda_connect_v2`). |

---

## 2. Complete Inventory of All 34 Existing Tables

### 2.1 Laravel Infrastructure & Auth Tables (`9` tables)
1. **`users`**: `id`, `name`, `username` (`string(50)`, nullable unique), `email` (unique), `email_verified_at`, `password`, `role` (`string(32)`, default `'scholar'`, indexed), `account_status` (`string(20)`, default `'active'`, indexed), `last_login_at`, `two_factor_secret`, `two_factor_recovery_codes`, `two_factor_confirmed_at`, `password_expiry_exempt` (`bool`, default `false`), `password_expires_at`, `force_password_change` (`bool`, default `false`), `remember_token`, timestamps.
2. **`password_reset_tokens`**: `email` (PK), `token`, `created_at`.
3. **`sessions`**: `id` (PK), `user_id` (indexed), `ip_address(45)`, `user_agent`, `payload` (`longText`), `last_activity` (indexed).
4. **`passkeys`**: `id`, `user_id -> users(id) CASCADE`, `name`, `credential_id` (unique), `credential` (`json`), `last_used_at`, timestamps.
5. **`cache`** & **`cache_locks`**: Laravel database cache tables (`key`, `value`/`owner`, `expiration`).
6. **`jobs`**, **`job_batches`**, **`failed_jobs`**: Laravel database queue runtime tables.

### 2.2 Institutional Structure & Access Control (`3` tables)
7. **`institutions`**: `id`, `code` (`string(10)`, unique — e.g., `BST`, `MIF`), `name`, `address`, `contact_email`, `contact_number(30)`, `is_active` (`bool`, default `true`), timestamps.
8. **`institution_user`**: `id`, `institution_id -> institutions(id) CASCADE`, `user_id -> users(id) CASCADE`, `is_primary` (`bool`, default `false`), timestamps, unique `(institution_id, user_id)`.
9. **`courses`**: `id`, `institution_id -> institutions(id) CASCADE`, `code(40)`, `name`, `qualification_level(30)`, `training_hours` (`smallint`), `is_active` (`bool`), `description` (`text`), `requirements` (`text`), `curriculum_reference(500)`, timestamps, unique `(institution_id, code)`.

### 2.3 Intake Quotas, Profiles, Enrollment & Forwarding (`8` tables)
10. **`intake_periods`**: `id`, `institution_id -> institutions(id) NULL ON DELETE`, `code(40)` (unique), `name(120)`, `starts_at`, `ends_at`, `quota`, `is_locked`, `locked_at`, `locked_by_user_id -> users(id) NULL ON DELETE`, `created_by_user_id -> users(id) NULL ON DELETE`, `notes`, timestamps, index `(institution_id, starts_at, ends_at)`.
11. **`intake_course_quotas`**: `id`, `intake_period_id -> intake_periods(id) CASCADE`, `course_id -> courses(id) CASCADE`, `quota`, `created_by_user_id -> users(id) NULL ON DELETE`, unique `(intake_period_id, course_id)`.
12. **`training_batches`**: `id`, `institution_id -> institutions(id) CASCADE`, `course_id -> courses(id) CASCADE`, `code(40)` (unique), `name`, `capacity` (`smallint`, default 25), `scheduled_hours` (`smallint`), `starts_at`, `ends_at`, `next_class_at`, `venue`, `status(30)` (default `'upcoming'`, indexed), timestamps.
13. **`learner_profiles`**: `id`, `user_id -> users(id) CASCADE` (unique `1:1`), `institution_id -> institutions(id) CASCADE`, `uli_number(40)` (unique via migration #33), `uli_assigned_at`, `uli_assigned_by_user_id -> users(id) NULL ON DELETE`, `entry_date`, `last_name`, `first_name`, `middle_name`, `extension_name(20)`, address columns (`address_line`, `barangay`, `district`, `city_municipality`, `province`, `region`), `contact_number(30)`, `nationality`, `sex(20)`, `civil_status(30)`, `employment_status(30)`, `employment_type(30)`, `birthdate`, birthplace columns, `educational_attainment`, `guardian_name`, `guardian_address`, `classifications` (`json`), `disability_types` (`json`), `disability_cause(30)`, `course_id -> courses(id) NULL ON DELETE`, `scholarship_package`, `privacy_consent` (`bool`), `submitted_at`, timestamps.
14. **`learner_documents`**: `id`, `user_id -> users(id) CASCADE`, `learner_profile_id -> learner_profiles(id) NULL ON DELETE`, `document_type(50)`, `original_name`, `path`, `mime_type(100)`, `size`, `status(30)` (default `'pending'`), `reviewed_by_user_id -> users(id) NULL ON DELETE`, `reviewed_at`, `remarks`, timestamps, index `(user_id, document_type)`.
15. **`enrollment_batch_forwardings`**: `id`, `reference_code(40)` (unique), `institution_id -> institutions(id) CASCADE`, `course_id -> courses(id) RESTRICT`, `training_batch_id -> training_batches(id) NULL ON DELETE`, `forwarded_by_user_id -> users(id) NULL ON DELETE`, `forwarded_at`, `status(40)` (`'ready_for_scheduling'`), `application_count`, `summary_path(500)`, `summary_filename(255)`, timestamps.
16. **`enrollment_applications`**: `id`, `reference_no(40)` (unique), `learner_user_id -> users(id) NULL ON DELETE`, `institution_id -> institutions(id) CASCADE`, `course_id -> courses(id) NULL ON DELETE`, `training_batch_id -> training_batches(id) NULL ON DELETE`, `forwarding_id -> enrollment_batch_forwardings(id) NULL ON DELETE`, `learner_name`, `email`, `contact_number(30)`, `application_status(30)` (default `'draft'`), `record_completeness` (`tinyint`, default 0), `submitted_at`, `verified_at`, `confirmed_at`, `scholar_id(40)` (unique), `remarks`, `archived_at` (indexed), `archived_by_user_id -> users(id) NULL ON DELETE`, `archive_reason`, timestamps.
17. **`enrollment_status_histories`**: `id`, `enrollment_application_id -> enrollment_applications(id) NULL ON DELETE`, `reference_no(40)` (indexed), `from_status(30)`, `to_status(30)`, `actor_user_id -> users(id) NULL ON DELETE`, `reason`, timestamps, index `(reference_no, created_at)`.

### 2.4 Competency, Attendance, Materials & Certification (`8` tables)
18. **`competency_units`**: `id`, `course_id -> courses(id) RESTRICT`, `unit_number` (`smallint`), `name(150)`, `sort_order` (`smallint`), timestamps, unique `(course_id, unit_number)`.
19. **`competency_tasks`**: `id`, `competency_unit_id -> competency_units(id) CASCADE`, `chart_type(30)`, `task_number`, `name(255)`, `sort_order`, timestamps, unique `(competency_unit_id, chart_type, task_number)`.
20. **`competency_progress`**: `id`, `enrollment_application_id -> enrollment_applications(id) CASCADE`, `competency_task_id -> competency_tasks(id) CASCADE`, `status(30)` (`'not_assessed'`), `remarks`, `assessed_by -> users(id) NULL ON DELETE`, `assessed_at`, timestamps, unique `(enrollment_application_id, competency_task_id)`.
21. **`competency_unit_reviews`**: `id`, `enrollment_application_id -> enrollment_applications(id) CASCADE`, `competency_unit_id -> competency_units(id) CASCADE`, `status(30)` (`'pending_review'`), `verified_by -> users(id) NULL ON DELETE`, `verified_at`, `is_locked` (`bool`), `remarks`, timestamps, unique `(enrollment_application_id, competency_unit_id)`.
22. **`competency_report_submissions`**: `id`, `enrollment_application_id -> enrollment_applications(id)` (unique), `status(30)` (`'draft'`), `reviewed_by`, `reviewed_at`, `finalized_by`, `finalized_at`, `submitted_by`, `submitted_at`, `submission_reference`, `remarks`, timestamps.
23. **`attendance_records`**: `id`, `enrollment_application_id -> enrollment_applications(id) CASCADE`, `attendance_date`, `status(20)`, `remarks`, `recorded_by_user_id -> users(id) NULL ON DELETE`, timestamps, unique `(enrollment_application_id, attendance_date)`.
24. **`training_certificates`**: `id`, `enrollment_application_id -> enrollment_applications(id) CASCADE` (unique), `certificate_number(80)` (unique), `status(30)` (`'not_completed'`), `pending_units` (`json`), `reason`, `issued_by_user_id -> users(id) NULL ON DELETE`, `issued_at`, timestamps.
25. **`course_materials`**: `id`, `course_id -> courses(id) CASCADE`, `uploaded_by_user_id -> users(id) RESTRICT`, `title(180)`, `description`, `original_name(255)`, `path(500)`, `mime_type(120)`, `size_bytes`, `is_published` (`bool`), timestamps, index `(course_id, is_published, created_at)`.

### 2.5 Announcements, Focal Operations, Audit & Offline Sync (`6` tables)
26. **`announcements`**: `id`, `institution_id -> institutions(id) NULL ON DELETE`, `author_user_id -> users(id) NULL ON DELETE`, `title`, `body`, `audience(30)` (`'all'`), `published_at`, `expires_at` (indexed), `archived_at` (indexed), `deadline_at` (indexed), `attachment_path(500)`, `attachment_name(255)`, `attachment_mime(100)`, `attachment_size`, timestamps.
27. **`announcement_views`**: `id`, `announcement_id -> announcements(id) CASCADE`, `user_id -> users(id) CASCADE`, `viewed_at`, `read_at`, timestamps, unique `(announcement_id, user_id)`.
28. **`operational_documents`**: `id`, `institution_id -> institutions(id) CASCADE`, `uploaded_by_user_id -> users(id) NULL ON DELETE`, `course_id`, `training_batch_id`, `enrollment_application_id` (nullable `nullOnDelete`), `category(50)`, `title(180)`, `original_name`, `path(500)`, `mime_type(100)`, `size`, `notes`, timestamps.
29. **`outgoing_document_logs`**: `id`, `institution_id -> institutions(id) CASCADE`, `logged_by_user_id -> users(id) NULL ON DELETE`, `document_type(60)`, `reference_number(100)`, `recipient(180)`, `subject(255)`, `sent_at`, `method(50)` (`'physical'`), `notes`, timestamps.
30. **`activity_logs`**: `id`, `user_id -> users(id) NULL ON DELETE`, `institution_id -> institutions(id) NULL ON DELETE`, `event(100)`, `description`, `metadata` (`json`), timestamps (+ composite indexes from migration `2026_10_12_181220`).
31. **`offline_sync_mutations`**: `id`, `user_id -> users(id) CASCADE`, `mutation_id` (`uuid`), `operation(80)`, `payload_hash(char 64)`, `result` (`json`), `processed_at`, timestamps, unique `(user_id, mutation_id)`.

*(Count breakdown: 9 infra/auth + 3 institutional + 8 intake/profile/enrollment/forwarding + 8 competency/attendance/cert/materials + 6 announcements/docs/audit/sync = **34 tables** total across 33 migrations.)*

---

## 3. Verified Schema Defects, FK Conflicts & Technical Debt

1. **Referential Cascade vs. Restrict Deadlocks:**
   - `courses` has `institution_id -> CASCADE`, yet `competency_units.course_id` and `enrollment_batch_forwardings.course_id` specify **`restrictOnDelete()`**. Deleting an institution attempts to cascade-delete its courses, triggering an SQL integrity error whenever competency units or forwardings exist.
   - `course_materials.uploaded_by_user_id` specifies **`restrictOnDelete()`**, blocking user deletion (`delete-user-modal` or admin removal) when that user uploaded learning files.
2. **Nullable `learner_user_id` Orphaning PII:** `enrollment_applications.learner_user_id` uses `nullOnDelete()`, leaving unlinked PII (`learner_name`, `email`, `contact_number`) behind when a user deletes their own account, while orphaned files on disk are not cleaned up.
3. **Missing `$fillable` / `$casts` in Eloquent Models:** Identified fields written/used in DB that lack consistent model fillable/cast declarations include `TrainingBatch.scheduled_hours`, `User.last_login_at`, `LearnerProfile.uli_assigned_*`, and `Announcement.attachment_*`.
4. **No Optimistic Concurrency / Version Tokens:** Only `competency_progress.updated_at` (`Y-m-d H:i:s` 1-second resolution) is checked during offline sync; there is no integer `version` / `lock_version` column on `enrollment_applications`, `learner_profiles`, `announcements`, `training_batches`, or `attendance_records`.
5. **`archived_at` Scope Leaks:** Because `archived_at` is managed manually instead of a global soft-delete scope, several dashboard widgets, quota counters, and institution summary queries omit `whereNull('archived_at')`, over-counting archived trainee applications.
6. **MySQL Rollback Defect:** Migration `2026_10_16_030000_add_registrar_workflow_features` creates composite FK-backed indexes whose `down()` method fails under MySQL error `1553` unless foreign keys are dropped first.
7. **Database Seeder Bugs:**
   - `DemoDataSeeder` embeds plaintext test passwords in code.
   - `CoursesSeeder` hardcodes `INSTITUTION_ID = 2` (assuming `MIF`) and mixes `NC I` vs `NC II` qualification assumptions; fails or seeds wrong institution when IDs invert (`MIF=1` in stale SQLite DB).
   - `CompetencyUnitsAndTasksSeeder` contains duplicate task logic and references undefined `self::COURSE_ID`.
   - `OrganicAgricultureCompetencyTaskSeeder` is unregistered from `DatabaseSeeder`.

---

## 4. Target Supabase PostgreSQL Mapping & Classification

| Current Table(s) | Target Action | Target PostgreSQL Table / Replacement | Notes & Hardening Changes |
| :--- | :--- | :--- | :--- |
| `users`, `password_reset_tokens`, `sessions`, `passkeys` | **Replace + Profile Table** | Supabase `auth.users` + `public.profiles` + `public.user_roles` | Move auth, TOTP MFA, WebAuthn, password reset, and JWT sessions to Supabase Auth. Keep `public.profiles` (`id uuid PK -> auth.users(id)`, `username`, `role`, `account_status`, `force_password_change`, `last_login_at`). Prevent self-role updates via RLS/Trigger. |
| `cache`, `cache_locks`, `jobs`, `job_batches`, `failed_jobs` | **Drop** | *(Not migrated)* | Handled by Supabase platform / Edge Functions / TanStack Query caching. |
| `institutions`, `institution_user`, `courses`, `training_batches` | **Migrate + Normalize** | Same table names (`uuid` PKs + `legacy_id` ETL column) | Enforce Postgres `CHECK`/enum constraints on `training_batches.status` (unify `'ongoing'` vs `'in_training'`), add `version int default 1`, add trainer assignment relation if `trainer` role is confirmed. |
| `intake_periods`, `intake_course_quotas` | **Migrate + Clarify Scope** | Same table names | Make `institution_id NOT NULL` (or explicitly global vs scoped rule) and add RLS by institution. |
| `learner_profiles`, `learner_documents`, `enrollment_applications`, `enrollment_status_histories`, `enrollment_batch_forwardings` | **Migrate + Harden** | Same table names + `client_draft_id uuid UNIQUE` | Add idempotent `client_draft_id` for offline intake drafts, `version int`, `archived_at` default views/RLS filter, server duplicate-check RPC (name+birthdate+email warning without auto-merging). Move binary files to private Supabase Storage buckets. |
| `competency_units`, `competency_tasks`, `competency_progress`, `competency_unit_reviews`, `competency_report_submissions` | **Migrate + Add `version`** | Same table names | Replace `restrictOnDelete` clashes with safe archive flags; add `version int` for deterministic offline conflict checks; enforce workflow state transitions in PostgreSQL trigger/RPC. |
| `attendance_records`, `training_certificates`, `course_materials`, `operational_documents`, `outgoing_document_logs` | **Migrate + Storage Migration** | Same table names | Point `path` columns to private Supabase Storage paths (`course-materials`, `operational-documents`, `learner-documents`, `announcement-attachments`). Replace HTML cert print with verified data + `pdf-lib` client/Edge export. |
| `announcements`, `announcement_views` | **Migrate + Fix Attachments** | Same table names | Wire attachment metadata cleanly to private Storage bucket `announcement-attachments`; track offline-created drafts safely (`is_draft = true`) until synced online. |
| `offline_sync_mutations`, `activity_logs` | **Keep & Strengthen** | `offline_sync_mutations` (`(user_id, mutation_id)` PK/UNIQUE) + immutable `security_audit_logs` | Partition or index `activity_logs` / `security_audit_logs`; make append-only via `INSERT` RLS + Edge Function / DB triggers for sensitive role/status/ULI/confirmation operations. |
