#!/usr/bin/env node
/**
 * TCTESDAConnect Legacy MySQL (tesda_connect_v2) -> Supabase ETL Tool
 *
 * Safe by default (--dry-run). Zero third-party Node dependencies (Node >= 18).
 * Usage:
 *   node supabase/etl/migrate_mysql_to_supabase.mjs --source ./mysql-export.json --dry-run
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node supabase/etl/migrate_mysql_to_supabase.mjs --source ./mysql-export.json --storage-dir ../storage/app/private --apply
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

export function mapLegacyRole(role) {
  if (!role) return 'applicant';
  if (role === 'administrator') return 'system_administrator';
  const valid = new Set([
    'system_administrator',
    'institutional_administrator',
    'registrar',
    'focal_person',
    'trainer',
    'applicant',
    'scholar',
  ]);
  return valid.has(role) ? role : 'applicant';
}

export function mapLegacyBatchStatus(status) {
  if (!status) return 'upcoming';
  if (status === 'ongoing') return 'in_training';
  const valid = new Set(['upcoming', 'in_training', 'completed', 'cancelled']);
  return valid.has(status) ? status : 'upcoming';
}

export function detectDuplicateProfileWarnings(learnerProfiles) {
  const seen = new Map();
  const warnings = [];
  for (const row of learnerProfiles) {
    const key = [
      String(row.institution_id ?? '').trim(),
      String(row.first_name ?? '').trim().toLowerCase(),
      String(row.last_name ?? '').trim().toLowerCase(),
      String(row.birthdate ?? '').trim(),
    ].join('|');
    const existing = seen.get(key);
    if (existing) {
      warnings.push({
        type: 'potential_duplicate_learner',
        message: 'Name + birthdate match found across distinct legacy IDs. Preserving both records without auto-merge.',
        existingLegacyId: existing.id,
        candidateLegacyId: row.id,
        name: `${row.first_name} ${row.last_name}`,
      });
    } else {
      seen.set(key, row);
    }
  }
  return warnings;
}

export function transformLegacyDataset(raw) {
  const institutions = (raw.institutions ?? []).map((i) => ({
    legacy_id: i.id,
    code: String(i.code).trim().toUpperCase(),
    name: String(i.name).trim(),
    address: i.address ?? null,
    contact_email: i.contact_email ?? null,
    contact_number: i.contact_number ?? null,
    is_active: i.is_active ?? true,
  }));

  const users = (raw.users ?? []).map((u) => ({
    legacy_id: u.id,
    email: String(u.email).trim().toLowerCase(),
    full_name: String(u.name ?? u.full_name ?? u.email).trim(),
    username: u.username ?? null,
    role: mapLegacyRole(u.role),
    account_status: u.account_status ?? (u.is_active === false ? 'inactive' : 'active'),
    force_password_change: u.force_password_change ?? true,
    last_login_at: u.last_login_at ?? null,
  }));

  const courses = (raw.courses ?? []).map((c) => ({
    legacy_id: c.id,
    legacy_institution_id: c.institution_id,
    code: String(c.code).trim().toUpperCase(),
    name: String(c.name).trim(),
    qualification_level: c.qualification_level ?? null,
    training_hours: c.training_hours ?? null,
    is_active: c.is_active ?? true,
  }));

  const trainingBatches = (raw.training_batches ?? []).map((b) => ({
    legacy_id: b.id,
    legacy_institution_id: b.institution_id,
    legacy_course_id: b.course_id,
    code: String(b.code).trim(),
    name: String(b.name).trim(),
    capacity: Number(b.capacity ?? 25),
    starts_at: b.starts_at ?? null,
    ends_at: b.ends_at ?? null,
    venue: b.venue ?? null,
    status: mapLegacyBatchStatus(b.status),
  }));

  const learnerProfiles = (raw.learner_profiles ?? []).map((lp) => ({
    legacy_id: lp.id,
    legacy_user_id: lp.user_id,
    legacy_institution_id: lp.institution_id,
    uli_number: lp.uli_number ? String(lp.uli_number).trim() : null,
    first_name: String(lp.first_name).trim(),
    last_name: String(lp.last_name).trim(),
    birthdate: lp.birthdate ?? null,
  }));

  const enrollmentApplications = (raw.enrollment_applications ?? []).map((ea) => ({
    legacy_id: ea.id,
    reference_no: String(ea.reference_no).trim(),
    legacy_learner_user_id: ea.user_id ?? ea.learner_user_id,
    legacy_institution_id: ea.institution_id,
    legacy_course_id: ea.course_id ?? null,
    legacy_batch_id: ea.training_batch_id ?? null,
    learner_name: String(ea.learner_name).trim(),
    application_status: ea.application_status ?? 'draft',
    record_completeness: Number(ea.record_completeness ?? 0),
    scholar_id: ea.scholar_id ?? null,
  }));

  const duplicateWarnings = detectDuplicateProfileWarnings(raw.learner_profiles ?? []);

  return {
    institutions,
    users,
    courses,
    trainingBatches,
    learnerProfiles,
    enrollmentApplications,
    duplicateWarnings,
  };
}

async function supabaseRestUpsert(baseUrl, serviceKey, table, rows, onConflict) {
  if (rows.length === 0) return [];
  const res = await fetch(`${baseUrl}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`PostgREST upsert failed on ${table} (${res.status}): ${body}`);
  }
  return res.json();
}

async function ensureAuthUsers(baseUrl, serviceKey, users) {
  const idByEmail = new Map();
  for (const user of users) {
    const createRes = await fetch(`${baseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: user.email,
        email_confirm: true,
        user_metadata: { full_name: user.full_name, legacy_id: user.legacy_id },
      }),
    });

    if (createRes.ok) {
      const created = await createRes.json();
      idByEmail.set(user.email, created.id);
      continue;
    }

    const listRes = await fetch(
      `${baseUrl}/auth/v1/admin/users?page=1&per_page=50`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      },
    );
    if (listRes.ok) {
      const listed = await listRes.json();
      const match = (listed.users ?? []).find((u) => String(u.email).toLowerCase() === user.email);
      if (match) idByEmail.set(user.email, match.id);
    }
  }
  return idByEmail;
}

async function uploadPrivateStorageObjects(baseUrl, serviceKey, storageDir, documents) {
  let uploaded = 0;
  for (const doc of documents) {
    if (!doc.bucket || !doc.storage_path) continue;
    const localFile = path.join(storageDir, doc.storage_path);
    try {
      const bytes = await fs.readFile(localFile);
      const res = await fetch(`${baseUrl}/storage/v1/object/${doc.bucket}/${doc.storage_path}`, {
        method: 'POST',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': doc.mime_type ?? 'application/octet-stream',
          'x-upsert': 'true',
        },
        body: bytes,
      });
      if (res.ok) uploaded += 1;
    } catch {
      // Missing local artifact is recorded in reconciliation counts rather than aborting batch
    }
  }
  return uploaded;
}

async function loadInputJson(sourcePath) {
  const stat = await fs.stat(sourcePath);
  if (stat.isFile()) {
    const content = await fs.readFile(sourcePath, 'utf8');
    return JSON.parse(content);
  }
  const combined = {};
  for (const key of ['institutions', 'users', 'courses', 'training_batches', 'learner_profiles', 'enrollment_applications', 'storage_objects']) {
    const file = path.join(sourcePath, `${key}.json`);
    try {
      combined[key] = JSON.parse(await fs.readFile(file, 'utf8'));
    } catch {
      combined[key] = [];
    }
  }
  return combined;
}

function parseArgs(argv) {
  const args = { source: '', storageDir: '', apply: false };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--source') args.source = argv[++i] ?? '';
    else if (token === '--storage-dir') args.storageDir = argv[++i] ?? '';
    else if (token === '--apply') args.apply = true;
    else if (token === '--dry-run') args.apply = false;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.source) {
    console.error('Missing --source <export.json or export-directory>');
    process.exitCode = 1;
    return;
  }

  const raw = await loadInputJson(path.resolve(args.source));
  const transformed = transformLegacyDataset(raw);

  const report = {
    mode: args.apply ? 'APPLY' : 'DRY_RUN',
    sourceCounts: {
      institutions: (raw.institutions ?? []).length,
      users: (raw.users ?? []).length,
      courses: (raw.courses ?? []).length,
      training_batches: (raw.training_batches ?? []).length,
      learner_profiles: (raw.learner_profiles ?? []).length,
      enrollment_applications: (raw.enrollment_applications ?? []).length,
      storage_objects: (raw.storage_objects ?? []).length,
    },
    transformedCounts: {
      institutions: transformed.institutions.length,
      users: transformed.users.length,
      courses: transformed.courses.length,
      training_batches: transformed.trainingBatches.length,
      learner_profiles: transformed.learnerProfiles.length,
      enrollment_applications: transformed.enrollmentApplications.length,
    },
    duplicateWarnings: transformed.duplicateWarnings,
    appliedCounts: null,
  };

  if (!args.apply) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('--apply requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
  }

  const upsertedInsts = await supabaseRestUpsert(supabaseUrl, serviceKey, 'institutions', transformed.institutions, 'code');
  const instMap = new Map(upsertedInsts.map((r) => [r.legacy_id, r.id]));

  const authIdsByEmail = await ensureAuthUsers(supabaseUrl, serviceKey, transformed.users);
  const profileRows = transformed.users
    .filter((u) => authIdsByEmail.has(u.email))
    .map((u) => ({
      id: authIdsByEmail.get(u.email),
      legacy_id: u.legacy_id,
      email: u.email,
      full_name: u.full_name,
      username: u.username,
      role: u.role,
      account_status: u.account_status,
      force_password_change: u.force_password_change,
      last_login_at: u.last_login_at,
    }));
  const upsertedProfiles = await supabaseRestUpsert(supabaseUrl, serviceKey, 'profiles', profileRows, 'email');
  const userMap = new Map(upsertedProfiles.map((r) => [r.legacy_id, r.id]));

  const courseRows = transformed.courses
    .filter((c) => instMap.has(c.legacy_institution_id))
    .map((c) => ({
      legacy_id: c.legacy_id,
      institution_id: instMap.get(c.legacy_institution_id),
      code: c.code,
      name: c.name,
      qualification_level: c.qualification_level,
      training_hours: c.training_hours,
      is_active: c.is_active,
    }));
  const upsertedCourses = await supabaseRestUpsert(supabaseUrl, serviceKey, 'courses', courseRows, 'legacy_id');
  const courseMap = new Map(upsertedCourses.map((r) => [r.legacy_id, r.id]));

  const batchRows = transformed.trainingBatches
    .filter((b) => instMap.has(b.legacy_institution_id) && courseMap.has(b.legacy_course_id))
    .map((b) => ({
      legacy_id: b.legacy_id,
      institution_id: instMap.get(b.legacy_institution_id),
      course_id: courseMap.get(b.legacy_course_id),
      code: b.code,
      name: b.name,
      capacity: b.capacity,
      starts_at: b.starts_at,
      ends_at: b.ends_at,
      venue: b.venue,
      status: b.status,
    }));
  const upsertedBatches = await supabaseRestUpsert(supabaseUrl, serviceKey, 'training_batches', batchRows, 'code');
  const batchMap = new Map(upsertedBatches.map((r) => [r.legacy_id, r.id]));

  const learnerRows = transformed.learnerProfiles
    .filter((lp) => userMap.has(lp.legacy_user_id) && instMap.has(lp.legacy_institution_id))
    .map((lp) => ({
      legacy_id: lp.legacy_id,
      user_id: userMap.get(lp.legacy_user_id),
      institution_id: instMap.get(lp.legacy_institution_id),
      uli_number: lp.uli_number,
      first_name: lp.first_name,
      last_name: lp.last_name,
      birthdate: lp.birthdate,
    }));
  const upsertedLearners = await supabaseRestUpsert(supabaseUrl, serviceKey, 'learner_profiles', learnerRows, 'user_id');

  const appRows = transformed.enrollmentApplications
    .filter((ea) => userMap.has(ea.legacy_learner_user_id) && instMap.has(ea.legacy_institution_id))
    .map((ea) => ({
      legacy_id: ea.legacy_id,
      reference_no: ea.reference_no,
      learner_user_id: userMap.get(ea.legacy_learner_user_id),
      institution_id: instMap.get(ea.legacy_institution_id),
      course_id: ea.legacy_course_id ? (courseMap.get(ea.legacy_course_id) ?? null) : null,
      training_batch_id: ea.legacy_batch_id ? (batchMap.get(ea.legacy_batch_id) ?? null) : null,
      learner_name: ea.learner_name,
      application_status: ea.application_status,
      record_completeness: ea.record_completeness,
      scholar_id: ea.scholar_id,
    }));
  const upsertedApps = await supabaseRestUpsert(supabaseUrl, serviceKey, 'enrollment_applications', appRows, 'reference_no');

  let storageUploaded = 0;
  if (args.storageDir && (raw.storage_objects ?? []).length > 0) {
    storageUploaded = await uploadPrivateStorageObjects(
      supabaseUrl,
      serviceKey,
      path.resolve(args.storageDir),
      raw.storage_objects,
    );
  }

  report.appliedCounts = {
    institutions: upsertedInsts.length,
    profiles: upsertedProfiles.length,
    users_linked: userMap.size,
    courses: upsertedCourses.length,
    training_batches: upsertedBatches.length,
    learner_profiles: upsertedLearners.length,
    enrollment_applications: upsertedApps.length,
    storage_uploaded: storageUploaded,
  };

  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('migrate_mysql_to_supabase.mjs')) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
