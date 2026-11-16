# Deployment & Data Migration Guide — TCTESDAConnect

## 1. Environment Variables (`frontend/.env.local`)

Copy `frontend/.env.example` to `frontend/.env.local` for local development or inject into **Cloudflare Pages** project settings (Production & Preview):

| Variable | Required | Exposure | Description |
| :--- | :---: | :---: | :--- |
| `VITE_SUPABASE_URL` | Yes | Public Client | Supabase project API URL (`https://<ref>.supabase.co`). |
| `VITE_SUPABASE_ANON_KEY` | Yes | Public Client | Supabase anon/publishable key. RLS protects all data. |
| `VITE_APP_NAME` | No | Public Client | Defaults to `TCTESDAConnect`. |
| `VITE_OFFLINE_MAX_TTL_HOURS` | No | Public Client | Shared-device offline session timeout window (default `12`). |
| `VITE_SENTRY_DSN` | No | Public Client | Optional Sentry DSN (disabled when empty). |

**Security Rule:** Never expose `SUPABASE_SERVICE_ROLE_KEY` in `frontend/` or Cloudflare Pages client variables. Set `SUPABASE_SERVICE_ROLE_KEY` strictly inside **Supabase Edge Function Secrets**.

---

## 2. Supabase Free Backend Setup

1. Link your Supabase project (`npx supabase link --project-ref <project-ref>`).
2. Push migrations in `supabase/migrations/` (`202611160001` through `202611160009`):
   ```bash
   npx supabase db push
   ```
3. Run non-secret reference seed (`BST` and `MIF` institutions + program catalog):
   ```bash
   psql "$SUPABASE_DB_URL" -f supabase/seed.sql
   ```
4. Deploy Edge Functions (`admin-user-management`, `offline-sync`):
   ```bash
   npx supabase functions deploy admin-user-management
   npx supabase functions deploy offline-sync
   ```
5. Verify RLS coverage via `supabase/tests/rls_verification.sql`.

---

## 3. Cloudflare Pages Deployment (Frontend PWA)

- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Root directory:** `frontend`
- **Node version:** `20` or `22`
- **SPA Routing:** Included via `frontend/public/_redirects` (`/* /index.html 200`).
- **Automated CI:** `.github/workflows/frontend-supabase.yml` runs `tsc`, `eslint`, `vitest`, and `vite build` on every push/PR touching `frontend/` or `supabase/`.

---

## 4. Legacy MySQL -> Supabase PostgreSQL ETL & Rollback Checklist

1. Place legacy Laravel application into maintenance mode and take a consistent MySQL backup (`mysqldump --single-transaction tesda_connect_v2 > backup_pre_cutover.sql`) plus an archive of `tesda-connect/storage/app/private/`.
2. Ignore stale `database/database.sqlite` (misses migration #33 and contains inverted `MIF=1, BST=2` IDs).
3. Run ETL mapping `institutions`, `profiles` (creating `auth.users` identities and mapping legacy `administrator` -> `system_administrator`), `courses`, `training_batches` (normalizing `'ongoing'` -> `'in_training'`), `learner_profiles`, `enrollment_applications`, `competency_*`, `attendance_records`, `training_certificates`, `announcements`, and `operational_documents` using `legacy_id` traceability columns.
4. Upload private files into matching private Supabase Storage buckets (`learner-documents`, `operational-documents`, `course-materials`, `announcement-attachments`, `forwarding-summaries`).
5. **Reconciliation Gate:** Confirm matching record counts, `scholar_id` uniqueness, `uli_number` uniqueness, and `certificate_number` integrity before switching DNS/traffic to Cloudflare Pages.
6. **Rollback:** Keep the legacy Laravel database snapshot untouched for 14–30 days; switch DNS / Cloudflare route back to Laravel immediately if critical issues arise.
