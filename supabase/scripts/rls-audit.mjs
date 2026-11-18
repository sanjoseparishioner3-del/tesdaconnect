#!/usr/bin/env node
/**
 * Row-level-security audit: signs in as each demo role and reports, for every table,
 *   - how many rows the role can READ (head count through the real REST API), and
 *   - whether the role may INSERT (a deliberately invalid probe row is sent: RLS is
 *     evaluated before NOT NULL / FK constraints, so HTTP 403/42501 = denied and any other
 *     error (23xxx) = RLS allowed it and only the constraint stopped it. Nothing is written).
 *
 * Only the publishable key and demo user passwords are used; no service key is needed.
 *
 *   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
 *   node supabase/scripts/rls-audit.mjs ../demo-credentials.txt
 *
 * Credentials file: lines of "<role> <email> <password>" (as printed by seed-demo-accounts.mjs).
 */
import fs from 'node:fs';
import process from 'node:process';

export const TABLES = [
  'institutions', 'institution_user', 'profiles', 'courses', 'training_batches', 'batch_trainers',
  'intake_periods', 'intake_course_quotas', 'learner_profiles', 'learner_documents',
  'enrollment_applications', 'enrollment_batch_forwardings', 'enrollment_status_histories',
  'competency_units', 'competency_tasks', 'competency_progress', 'competency_unit_reviews',
  'competency_report_submissions', 'announcements', 'announcement_views', 'operational_documents',
  'outgoing_document_logs', 'offline_sync_mutations', 'security_audit_logs', 'course_materials',
];

const ROLES = ['applicant', 'trainer', 'focal_person', 'registrar', 'institutional_administrator', 'system_administrator'];

const url = process.env.SUPABASE_URL;
const pub = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!url || !pub) {
  console.error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.');
  process.exit(1);
}
const credFile = process.argv[2];
const creds = fs
  .readFileSync(credFile, 'utf8')
  .split('\n')
  .map((l) => l.trim().split(/\s+/))
  .filter((p) => p.length === 3);

async function login(role) {
  const c = creds.find((p) => p[0] === role);
  if (!c) return null;
  const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: pub, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: c[1], password: c[2] }),
  });
  const t = await r.json();
  return t.access_token ?? null;
}

async function count(table, token) {
  const r = await fetch(`${url}/rest/v1/${table}?select=*&limit=0`, {
    headers: { apikey: pub, Authorization: `Bearer ${token ?? pub}`, Prefer: 'count=exact', Range: '0-0' },
  });
  if (!r.ok) return `ERR${r.status}`;
  const range = r.headers.get('content-range') ?? '*/0';
  return range.split('/')[1];
}

async function insertProbe(table, token) {
  const r = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: { apikey: pub, Authorization: `Bearer ${token ?? pub}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({}),
  });
  if (r.status < 300) return 'WROTE!'; // should never happen with an empty row, flag loudly
  const body = await r.json().catch(() => ({}));
  const code = String(body.code ?? r.status);
  if (code === '42501' || r.status === 403) return 'deny';
  if (r.status === 401) return 'deny';
  return `allow(${code})`;
}

const tokens = { anon: null };
for (const role of ROLES) tokens[role] = await login(role);

const pad = (s, n) => String(s).padEnd(n);
const cols = ['anon', ...ROLES];
console.log(pad('table', 32) + cols.map((c) => pad(c.replace('institutional_administrator', 'inst_admin').replace('system_administrator', 'sysadmin'), 12)).join(''));
const findings = [];
for (const table of TABLES) {
  const reads = [];
  const writes = [];
  for (const c of cols) {
    if (c !== 'anon' && !tokens[c]) {
      reads.push('n/a');
      writes.push('n/a');
      continue;
    }
    reads.push(await count(table, tokens[c]));
    writes.push(await insertProbe(table, tokens[c]));
  }
  console.log(pad(table, 32) + reads.map((v) => pad(v, 12)).join('') + '  READ');
  console.log(pad('', 32) + writes.map((v) => pad(v, 12)).join('') + '  INSERT');
  if (reads[0] !== '0' && !String(reads[0]).startsWith('ERR')) findings.push(`anonymous can read ${table} (${reads[0]} rows)`);
  if (writes[0] !== 'deny') findings.push(`anonymous insert not denied on ${table}: ${writes[0]}`);
  writes.forEach((w, i) => {
    if (w === 'WROTE!') findings.push(`${cols[i]} WROTE an empty row to ${table}`);
  });
}
console.log('\nFindings:');
console.log(findings.length ? findings.map((f) => ' - ' + f).join('\n') : ' none from the automatic checks');
