# ULI Management implementation patch

This patch adds Registrar + Administrator ULI assignment to the existing Master Student List.

## Included
- `resources/views/livewire/learner/registration.blade.php` — registration form without learner-entered ULI.
- `resources/views/livewire/registrar/student-records.blade.php`
  - Assign ULI action and modal.
  - ULI status and displayed number.
  - Role checks in both Livewire actions.
  - Duplicate validation and activity log with old/new ULI, actor, timestamp, and an optional reason/reference.
- `database/migrations/2026_11_11_000000_add_uli_assignment_tracking_to_learner_profiles.php`
  - Adds assignment timestamp and assigned-by user.
  - Adds unique constraint to `uli_number`.
- `routes/web.php`
  - Adds `/system/student-records` for Administrator, reusing the same records screen.
  - Existing `/registrar/student-records` remains Registrar-only.

## Install
1. Back up the existing files.
2. Copy the included files to the matching project paths, merging the added route into your current `routes/web.php` if that file has changed since this source export.
3. Run:
   `php artisan migrate`
4. Clear caches:
   `php artisan optimize:clear`

## Access
- Registrar: `/registrar/student-records`
- Administrator: `/system/student-records`

The current screen limits staff records to their assigned institutions; `InstitutionScope` returns all institutions for Administrator.
The ULI is stored in the existing `learner_profiles.uli_number` column. The migration adds audit metadata and uniqueness.

## Important notes
- Existing duplicate non-empty ULI values must be resolved before running the migration's unique index.
- The UI action is available for enrollment records that have a linked learner account/profile.
- Activity log records assignment/update reason, previous and new ULI, learner profile ID, actor (via activity_logs.user_id), and time (activity_logs timestamps).
- Test the role access and save flow in a development database before production deployment.
