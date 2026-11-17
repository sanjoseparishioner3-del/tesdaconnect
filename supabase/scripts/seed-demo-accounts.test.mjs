import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import {
  DEMO_ACCOUNTS,
  demoEmail,
  generateDemoPassword,
  main,
  parseArgs,
} from './seed-demo-accounts.mjs';

test('generates strong random passwords with every character class', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) {
    const pw = generateDemoPassword();
    assert.equal(pw.length, 16);
    assert.match(pw, /[A-Z]/);
    assert.match(pw, /[a-z]/);
    assert.match(pw, /[0-9]/);
    assert.match(pw, /[!@#$%&*?]/);
    assert.doesNotMatch(pw, /[O0Il1]/);
    seen.add(pw);
  }
  assert.equal(seen.size, 200);
});

test('covers every application role exactly once and builds demo emails', () => {
  const roles = DEMO_ACCOUNTS.map((a) => a.role).sort();
  assert.deepEqual(roles, [
    'applicant',
    'focal_person',
    'institutional_administrator',
    'registrar',
    'scholar',
    'system_administrator',
    'trainer',
  ]);
  assert.equal(demoEmail('registrar'), 'demo.registrar@tesda-connect.local');
  assert.equal(demoEmail('scholar', 'Example.ORG'), 'demo.scholar@example.org');
});

test('parses options and rejects unknown ones', () => {
  assert.deepEqual(parseArgs([]), {
    apply: false,
    resetPasswords: false,
    deactivate: false,
    sampleData: true,
    emailDomain: 'tesda-connect.local',
  });
  assert.equal(parseArgs(['--apply', '--email-domain', 'demo.org']).emailDomain, 'demo.org');
  assert.throws(() => parseArgs(['--email-domain']), /needs a domain/);
  assert.throws(() => parseArgs(['--nope']), /Unknown option/);
});

// ---- --apply against a fake Supabase (GoTrue admin + PostgREST) ----

const realFetch = globalThis.fetch;
const realLog = console.log;
let calls;
let users;
let logs;

function fakeSupabase() {
  calls = [];
  users = [];
  logs = [];
  console.log = (...parts) => logs.push(parts.join(' '));
  process.env.SUPABASE_URL = 'https://fake.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';

  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method: init.method, path: u.pathname, search: u.search, body, headers: init.headers });
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

    if (u.pathname === '/auth/v1/admin/users' && init.method === 'GET') return json({ users });
    if (u.pathname === '/auth/v1/admin/users' && init.method === 'POST') {
      const user = { id: `uid-${users.length + 1}`, email: body.email };
      users.push(user);
      return json(user);
    }
    if (u.pathname.startsWith('/auth/v1/admin/users/') && init.method === 'PUT') return json({ id: u.pathname.split('/').pop() });
    if (u.pathname === '/rest/v1/institutions') return json([{ id: 'inst-bst', code: 'BST' }, { id: 'inst-mif', code: 'MIF' }]);
    if (u.pathname === '/rest/v1/courses') return json([{ id: 'course-smaw', code: 'SMAW-NCII' }]);
    if (u.pathname.startsWith('/rest/v1/') && init.method === 'POST') {
      return json(body.map((row, i) => ({ id: `${u.pathname.split('/').pop()}-${i}`, ...row })), 201);
    }
    if (u.pathname === '/rest/v1/profiles' && init.method === 'PATCH') return json([{}, {}, {}]);
    return json({ message: `unexpected ${init.method} ${u.pathname}` }, 500);
  };
}

beforeEach(fakeSupabase);
afterEach(() => {
  globalThis.fetch = realFetch;
  console.log = realLog;
});

test('--apply creates one active account per role with a profile and campus link', async () => {
  await main(['--apply']);

  const created = calls.filter((c) => c.path === '/auth/v1/admin/users' && c.method === 'POST');
  assert.equal(created.length, DEMO_ACCOUNTS.length);
  for (const c of created) {
    assert.equal(c.body.email_confirm, true);
    assert.equal(c.body.password.length, 16);
    assert.equal(c.headers.Authorization, 'Bearer service-role-test-key');
  }

  const profiles = calls.filter((c) => c.path === '/rest/v1/profiles' && c.method === 'POST').map((c) => c.body[0]);
  assert.equal(profiles.length, DEMO_ACCOUNTS.length);
  assert.ok(profiles.every((p) => p.account_status === 'active' && p.force_password_change === false));
  assert.deepEqual(profiles.map((p) => p.role).sort(), DEMO_ACCOUNTS.map((a) => a.role).sort());

  const links = calls.filter((c) => c.path === '/rest/v1/institution_user').map((c) => c.body[0]);
  const sysadminLinks = links.filter((l) => l.user_id === profiles.find((p) => p.role === 'system_administrator').id);
  assert.deepEqual(sysadminLinks.map((l) => [l.institution_id, l.is_primary]), [['inst-bst', true], ['inst-mif', false]]);

  // Sample data written with idempotent upsert keys.
  const tables = new Set(calls.filter((c) => c.method === 'POST' && c.path.startsWith('/rest/v1/')).map((c) => `${c.path}${c.search}`));
  assert.ok(tables.has('/rest/v1/training_batches?on_conflict=code'));
  assert.ok(tables.has('/rest/v1/enrollment_applications?on_conflict=reference_no'));
  assert.ok(tables.has('/rest/v1/announcements?on_conflict=client_draft_id'));

  // Passwords are printed once for the operator.
  const passwords = created.map((c) => c.body.password);
  assert.ok(passwords.every((pw) => logs.some((line) => line.includes(pw))));
});

test('re-running keeps existing accounts and passwords unless --reset-passwords', async () => {
  await main(['--apply', '--no-sample-data']);
  calls = [];
  await main(['--apply', '--no-sample-data']);
  assert.equal(calls.filter((c) => c.path === '/auth/v1/admin/users' && c.method === 'POST').length, 0);
  assert.equal(calls.filter((c) => c.method === 'PUT').length, 0);
  assert.ok(logs.some((line) => line.includes('(unchanged)')));

  calls = [];
  await main(['--apply', '--no-sample-data', '--reset-passwords']);
  assert.equal(calls.filter((c) => c.method === 'PUT').length, DEMO_ACCOUNTS.length);
});

test('--deactivate only switches the demo profiles to inactive', async () => {
  await main(['--apply', '--deactivate']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'PATCH');
  assert.deepEqual(calls[0].body, { account_status: 'inactive' });
  assert.match(decodeURIComponent(calls[0].search), /demo\.sysadmin@tesda-connect\.local/);
});
