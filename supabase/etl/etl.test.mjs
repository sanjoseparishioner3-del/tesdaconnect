import assert from 'node:assert/strict';
import test from 'node:test';
import {
  detectDuplicateProfileWarnings,
  mapLegacyBatchStatus,
  mapLegacyRole,
  transformLegacyDataset,
} from './migrate_mysql_to_supabase.mjs';

test('maps legacy administrator role and ongoing batch status canonically', () => {
  assert.equal(mapLegacyRole('administrator'), 'system_administrator');
  assert.equal(mapLegacyRole('registrar'), 'registrar');
  assert.equal(mapLegacyBatchStatus('ongoing'), 'in_training');
  assert.equal(mapLegacyBatchStatus('completed'), 'completed');
});

test('flags potential duplicate learner profiles for manual review without auto-merging', () => {
  const warnings = detectDuplicateProfileWarnings([
    { id: 101, institution_id: 1, first_name: 'Maria', last_name: 'Santos', birthdate: '2001-05-14' },
    { id: 205, institution_id: 1, first_name: 'maria', last_name: 'santos', birthdate: '2001-05-14' },
  ]);

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].existingLegacyId, 101);
  assert.equal(warnings[0].candidateLegacyId, 205);

  const transformed = transformLegacyDataset({
    institutions: [{ id: 1, code: 'bst', name: 'Balli School of Technology' }],
    users: [{ id: 5, email: 'Admin@BST.EDU.PH', name: 'Admin', role: 'administrator' }],
    training_batches: [{ id: 10, institution_id: 1, course_id: 1, code: 'BST-01', name: 'Batch 1', status: 'ongoing' }],
    learner_profiles: [
      { id: 101, user_id: 10, institution_id: 1, first_name: 'Maria', last_name: 'Santos', birthdate: '2001-05-14' },
      { id: 205, user_id: 11, institution_id: 1, first_name: 'maria', last_name: 'santos', birthdate: '2001-05-14' },
    ],
  });

  assert.equal(transformed.users[0].role, 'system_administrator');
  assert.equal(transformed.users[0].force_password_change, true);
  assert.equal(transformed.trainingBatches[0].status, 'in_training');
  assert.equal(transformed.learnerProfiles.length, 2);
  assert.equal(transformed.duplicateWarnings.length, 1);
});
