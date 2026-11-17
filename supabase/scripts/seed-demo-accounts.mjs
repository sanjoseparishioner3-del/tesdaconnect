#!/usr/bin/env node
/**
 * TCTESDAConnect demo accounts: one real Supabase Auth account per role, plus a little
 * sample data (training batch, scholar enrollment, announcement) so every workspace has
 * something to show during a demo.
 *
 * - Safe by default: without --apply it only prints the plan.
 * - Passwords are random, generated on each run that creates or resets an account, and
 *   printed ONCE to this terminal. They are never stored in code or in the repository.
 * - Idempotent: re-running keeps existing accounts (and their passwords) unless
 *   --reset-passwords is given.
 * - After the demo, run with --deactivate to switch every demo account to inactive.
 *
 * Requirements: Node >= 18, the migrations and supabase/seed.sql already applied
 * (institutions BST/MIF and courses), and the project's SERVICE ROLE key. Never put the
 * service role key in the frontend or commit it.
 *
 * Usage (PowerShell):
 *   $env:SUPABASE_URL="https://<ref>.supabase.co"; $env:SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
 *   node supabase/scripts/seed-demo-accounts.mjs                    # dry run (plan only)
 *   node supabase/scripts/seed-demo-accounts.mjs --apply            # create accounts + sample data
 *   node supabase/scripts/seed-demo-accounts.mjs --apply --reset-passwords
 *   node supabase/scripts/seed-demo-accounts.mjs --apply --deactivate
 *
 * Options:
 *   --email-domain <domain>   default: tesda-connect.local  (e.g. demo.registrar@tesda-connect.local)
 *   --no-sample-data          only create the accounts
 */

import crypto from 'node:crypto';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const DEFAULT_EMAIL_DOMAIN = 'tesda-connect.local';

/** One account per application role. `institutions[0]` is the primary campus. */
export const DEMO_ACCOUNTS = [
  { key: 'sysadmin', role: 'system_administrator', fullName: 'Demo System Administrator', institutions: ['BST', 'MIF'] },
  { key: 'instadmin', role: 'institutional_administrator', fullName: 'Demo Institutional Administrator', institutions: ['BST'] },
  { key: 'registrar', role: 'registrar', fullName: 'Demo Registrar', institutions: ['BST'] },
  { key: 'focal', role: 'focal_person', fullName: 'Demo Focal Person', institutions: ['BST'] },
  { key: 'trainer', role: 'trainer', fullName: 'Demo Trainer', institutions: ['BST'] },
  { key: 'scholar', role: 'scholar', fullName: 'Juan Demo Dela Cruz', institutions: ['BST'] },
  { key: 'applicant', role: 'applicant', fullName: 'Maria Demo Santos', institutions: ['BST'] },
];

// Fixed identifiers make the sample data idempotent (upserts hit the same rows on re-runs).
export const DEMO_BATCH_CODE = 'DEMO-SMAW-B1';
export const DEMO_SCHOLAR_REFERENCE = 'DEMO-2026-0001';
export const DEMO_APPLICANT_REFERENCE = 'DEMO-2026-0002';
export const DEMO_ANNOUNCEMENT_DRAFT_ID = 'd3e0a000-0000-4000-8000-00000000a001';

export function demoEmail(key, domain = DEFAULT_EMAIL_DOMAIN) {
  return `demo.${key}@${domain}`.toLowerCase();
}

const PASSWORD_SETS = {
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  lower: 'abcdefghijkmnopqrstuvwxyz',
  digit: '23456789',
  symbol: '!@#$%&*?',
};

/** Random 16-character password with upper, lower, digit and symbol; no look-alike characters. */
export function generateDemoPassword(length = 16) {
  const all = Object.values(PASSWORD_SETS).join('');
  const pick = (set) => set[crypto.randomInt(set.length)];
  const chars = Object.values(PASSWORD_SETS).map(pick);
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export function parseArgs(argv) {
  const args = {
    apply: false,
    resetPasswords: false,
    deactivate: false,
    sampleData: true,
    emailDomain: DEFAULT_EMAIL_DOMAIN,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--reset-passwords') args.resetPasswords = true;
    else if (arg === '--deactivate') args.deactivate = true;
    else if (arg === '--no-sample-data') args.sampleData = false;
    else if (arg === '--email-domain') {
      const value = argv[i + 1];
      if (!value || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value)) throw new Error('--email-domain needs a domain like example.org');
      args.emailDomain = value.toLowerCase();
      i += 1;
    } else throw new Error(`Unknown option: ${arg}`);
  }
  return args;
}

function createApi(url, serviceKey) {
  const base = url.replace(/\/$/, '');
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  async function request(method, path, body, extraHeaders = {}) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { ...headers, ...extraHeaders },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const message = data?.msg ?? data?.message ?? data?.error_description ?? data?.error ?? text;
      throw new Error(`${method} ${path} failed (${res.status}): ${message}`);
    }
    return data;
  }

  return {
    async listAllUsers() {
      const users = [];
      for (let page = 1; page <= 50; page += 1) {
        const data = await request('GET', `/auth/v1/admin/users?page=${page}&per_page=200`);
        const batch = data?.users ?? [];
        users.push(...batch);
        if (batch.length < 200) break;
      }
      return users;
    },
    createUser: (email, password, fullName) =>
      request('POST', '/auth/v1/admin/users', {
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, demo_account: true },
      }),
    updatePassword: (id, password) => request('PUT', `/auth/v1/admin/users/${id}`, { password }),
    select: (table, query) => request('GET', `/rest/v1/${table}?${query}`),
    // One request per row: PostgREST bulk inserts require every row to have the same keys.
    async upsert(table, rows, onConflict) {
      const saved = [];
      for (const row of rows) {
        const res = await request('POST', `/rest/v1/${table}?on_conflict=${onConflict}`, [row], {
          Prefer: 'resolution=merge-duplicates,return=representation',
        });
        saved.push(...(res ?? []));
      }
      return saved;
    },
    update: (table, query, patch) =>
      request('PATCH', `/rest/v1/${table}?${query}`, patch, { Prefer: 'return=representation' }),
  };
}

async function loadReferenceData(api) {
  const institutions = await api.select('institutions', 'select=id,code&code=in.(BST,MIF)');
  const byCode = Object.fromEntries(institutions.map((i) => [i.code, i.id]));
  if (!byCode.BST || !byCode.MIF) {
    throw new Error('Institutions BST and MIF were not found. Apply the migrations and supabase/seed.sql first.');
  }
  const courses = await api.select('courses', `select=id,code&institution_id=eq.${byCode.BST}&code=eq.SMAW-NCII`);
  return { institutionIds: byCode, smawCourseId: courses[0]?.id ?? null };
}

async function upsertAccounts(api, args, refs) {
  const existingByEmail = new Map(
    (await api.listAllUsers()).map((u) => [String(u.email ?? '').toLowerCase(), u]),
  );
  const results = [];

  for (const account of DEMO_ACCOUNTS) {
    const email = demoEmail(account.key, args.emailDomain);
    let user = existingByEmail.get(email);
    let password = null;

    if (!user) {
      password = generateDemoPassword();
      user = await api.createUser(email, password, account.fullName);
    } else if (args.resetPasswords) {
      password = generateDemoPassword();
      await api.updatePassword(user.id, password);
    }

    await api.upsert(
      'profiles',
      [
        {
          id: user.id,
          email,
          full_name: account.fullName,
          username: `demo_${account.key}`,
          role: account.role,
          account_status: 'active',
          password_expiry_exempt: true,
          password_expires_at: null,
          force_password_change: false,
        },
      ],
      'id',
    );

    await api.upsert(
      'institution_user',
      account.institutions.map((code, index) => ({
        institution_id: refs.institutionIds[code],
        user_id: user.id,
        is_primary: index === 0,
      })),
      'institution_id,user_id',
    );

    results.push({ ...account, email, userId: user.id, password });
  }

  return results;
}

function isoDate(daysFromToday) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

function nextClassAt() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  return d.toISOString();
}

async function upsertSampleData(api, refs, accounts) {
  const byKey = Object.fromEntries(accounts.map((a) => [a.key, a]));
  const bst = refs.institutionIds.BST;
  if (!refs.smawCourseId) {
    console.warn('  ! Course SMAW-NCII not found for BST; skipping sample batch and enrollments.');
    return;
  }

  const [batch] = await api.upsert(
    'training_batches',
    [
      {
        institution_id: bst,
        course_id: refs.smawCourseId,
        code: DEMO_BATCH_CODE,
        name: 'SMAW NC II - Demo Batch 1',
        capacity: 25,
        scheduled_hours: 268,
        starts_at: isoDate(-14),
        ends_at: isoDate(60),
        next_class_at: nextClassAt(),
        venue: 'BST Welding Shop',
        status: 'in_training',
      },
    ],
    'code',
  );

  await api.upsert(
    'batch_trainers',
    [{ training_batch_id: batch.id, trainer_user_id: byKey.trainer.userId, is_lead: true }],
    'training_batch_id,trainer_user_id',
  );

  await api.upsert(
    'learner_profiles',
    [
      {
        user_id: byKey.scholar.userId,
        institution_id: bst,
        last_name: 'Dela Cruz',
        first_name: 'Juan',
        middle_name: 'Demo',
        city_municipality: 'San Jose',
        province: 'Occidental Mindoro',
        region: 'MIMAROPA',
        nationality: 'Filipino',
        sex: 'Male',
        civil_status: 'Single',
        educational_attainment: 'High School Graduate',
        course_id: refs.smawCourseId,
        scholarship_package: 'TWSP',
        privacy_consent: true,
        submitted_at: new Date().toISOString(),
      },
      {
        user_id: byKey.applicant.userId,
        institution_id: bst,
        last_name: 'Santos',
        first_name: 'Maria',
        middle_name: 'Demo',
        city_municipality: 'San Jose',
        province: 'Occidental Mindoro',
        region: 'MIMAROPA',
        nationality: 'Filipino',
        sex: 'Female',
        course_id: refs.smawCourseId,
        privacy_consent: true,
      },
    ],
    'user_id',
  );

  const now = new Date().toISOString();
  await api.upsert(
    'enrollment_applications',
    [
      {
        reference_no: DEMO_SCHOLAR_REFERENCE,
        learner_user_id: byKey.scholar.userId,
        institution_id: bst,
        course_id: refs.smawCourseId,
        training_batch_id: batch.id,
        learner_name: byKey.scholar.fullName,
        email: byKey.scholar.email,
        application_status: 'confirmed',
        record_completeness: 100,
        submitted_at: now,
        verified_at: now,
        confirmed_at: now,
        remarks: 'Demo enrollment (sample data).',
      },
      {
        reference_no: DEMO_APPLICANT_REFERENCE,
        learner_user_id: byKey.applicant.userId,
        institution_id: bst,
        course_id: refs.smawCourseId,
        learner_name: byKey.applicant.fullName,
        email: byKey.applicant.email,
        application_status: 'draft',
        record_completeness: 40,
        remarks: 'Demo application in progress (sample data).',
      },
    ],
    'reference_no',
  );

  await api.upsert(
    'announcements',
    [
      {
        client_draft_id: DEMO_ANNOUNCEMENT_DRAFT_ID,
        institution_id: bst,
        author_user_id: byKey.sysadmin.userId,
        title: 'Welcome to TESDA Connect (demo)',
        body: 'Sample announcement for the demo. Scholars can read this offline once synced.',
        audience: 'scholar',
        target_roles: ['scholar', 'applicant', 'focal_person', 'registrar'],
        announcement_type: 'general',
        is_draft: false,
        published_at: now,
      },
    ],
    'client_draft_id',
  );
}

async function deactivateAccounts(api, args) {
  const emails = DEMO_ACCOUNTS.map((a) => demoEmail(a.key, args.emailDomain));
  const updated = await api.update(
    'profiles',
    `email=in.(${emails.map((e) => `"${e}"`).join(',')})`,
    { account_status: 'inactive' },
  );
  console.log(`Deactivated ${updated?.length ?? 0} demo account(s). They can no longer sign in (online or offline after their next online check).`);
}

function printPlan(args) {
  console.log(`Demo accounts (${args.apply ? 'APPLY' : 'DRY RUN'}):`);
  for (const a of DEMO_ACCOUNTS) {
    console.log(`  - ${demoEmail(a.key, args.emailDomain).padEnd(42)} ${a.role.padEnd(28)} ${a.institutions.join(', ')}`);
  }
  if (args.sampleData && !args.deactivate) {
    console.log(`  + sample data: batch ${DEMO_BATCH_CODE}, scholar enrollment ${DEMO_SCHOLAR_REFERENCE} (confirmed),`);
    console.log(`    applicant draft ${DEMO_APPLICANT_REFERENCE}, trainer assignment, one published announcement`);
  }
}

function printCredentials(results) {
  console.log('\nDemo credentials. Copy them now: passwords are shown only this once.');
  console.log('(Accounts that already existed keep their password; use --reset-passwords to issue new ones.)\n');
  for (const r of results) {
    console.log(`  ${r.role.padEnd(28)} ${r.email.padEnd(42)} ${r.password ?? '(unchanged)'}`);
  }
  console.log('\nAfter the demo:  node supabase/scripts/seed-demo-accounts.mjs --apply --deactivate');
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  printPlan(args);
  if (!args.apply) {
    console.log('\nDry run only. Re-run with --apply to write to Supabase.');
    return;
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service role key, not the anon key).');
  }
  const api = createApi(url, serviceKey);

  if (args.deactivate) {
    await deactivateAccounts(api, args);
    return;
  }

  const refs = await loadReferenceData(api);
  const results = await upsertAccounts(api, args, refs);
  if (args.sampleData) {
    console.log('\nWriting sample data...');
    await upsertSampleData(api, refs, results);
  }
  printCredentials(results);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`\nError: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  });
}
