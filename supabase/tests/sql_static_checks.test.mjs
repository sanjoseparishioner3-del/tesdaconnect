import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../migrations');

test('SQL migrations enforce canonical enums, critical security triggers, and private buckets', async () => {
  const files = (await fs.readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  assert.equal(files.length, 9);

  const combined = (
    await Promise.all(files.map((f) => fs.readFile(path.join(migrationsDir, f), 'utf8')))
  ).join('\n');

  assert.ok(combined.includes('complete_own_password_change'), 'Expected self-service password rotation RPC');

  for (const role of [
    'system_administrator',
    'institutional_administrator',
    'registrar',
    'focal_person',
    'trainer',
    'applicant',
    'scholar',
  ]) {
    assert.ok(combined.includes(`'${role}'`), `Missing role enum value ${role}`);
  }

  for (const trigger of [
    'trg_profiles_prevent_escalation',
    'trg_guard_locked_competency_progress',
    'trg_security_audit_logs_immutable',
    'trg_guard_competency_unit_structure_lock',
    'trg_guard_competency_task_structure_lock',
    'trg_guard_uli_assignment',
    'trg_guard_announcement_roles',
  ]) {
    assert.ok(combined.includes(trigger), `Missing security trigger ${trigger}`);
  }

  assert.ok(files.at(-1)?.includes('domain_refinement_and_mis0301'), 'Expected final domain refinement migration');
  const latestSql = await fs.readFile(path.join(migrationsDir, files.at(-1)), 'utf8');
  assert.ok(latestSql.includes('DROP TABLE IF EXISTS public.attendance_records'), 'Expected attendance removal migration');
  assert.ok(latestSql.includes('DROP TABLE IF EXISTS public.training_certificates'), 'Expected certificates removal migration');

  for (const bucket of [
    'learner-documents',
    'operational-documents',
    'course-materials',
    'announcement-attachments',
    'forwarding-summaries',
  ]) {
    assert.ok(combined.includes(`'${bucket}', '${bucket}', false`), `Expected private bucket ${bucket}`);
  }
});
