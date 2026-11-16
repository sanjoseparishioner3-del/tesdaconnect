# Data Preservation & Migration Tooling (Legacy MySQL -> Supabase PostgreSQL)

## Scope & Rules
- Source database: MySQL `tesda_connect_v2` (configured in root `.env.example`).
- Legacy `database/database.sqlite` (`507,904` bytes) is intentionally excluded because it misses migration `2026_11_11_000000_add_uli_assignment_tracking_to_learner_profiles` and contains inverted institution IDs (`MIF=1, BST=2`).
- Never auto-merge trainee records during ETL; preserve exact `reference_no`, `scholar_id`, `uli_number`, and `certificate_number` identifiers with `legacy_id` traceability columns.

## Mapping Rules Enforced During ETL
1. **Roles:** Legacy `users.role = 'administrator'` -> PostgreSQL `'system_administrator'`; `registrar`, `focal_person`, `applicant`, and `scholar` preserve exact names.
2. **Batch Status:** Legacy `training_batches.status = 'ongoing'` -> canonical `'in_training'`.
3. **Storage Objects:** Binary files under `tesda-connect/storage/app/private/` transfer to matching private Supabase Storage buckets (`learner-documents`, `operational-documents`, `course-materials`, `announcement-attachments`, `forwarding-summaries`) retaining database `storage_path` references.
4. **Password Reset Safety:** Migrated accounts without verified modern passwords are flagged `force_password_change = true` on import.

## CLI Execution (`migrate_mysql_to_supabase.mjs`)
- **Dry Run (transform validation & non-auto-merge duplicate warnings):**
  ```bash
  node supabase/etl/migrate_mysql_to_supabase.mjs --source ./mysql-export.json --dry-run
  ```
- **Live Apply (requires `SUPABASE_URL` & `SUPABASE_SERVICE_ROLE_KEY`):**
  ```bash
  node supabase/etl/migrate_mysql_to_supabase.mjs --source ./mysql-export.json --storage-dir ../storage/app/private --apply
  ```
