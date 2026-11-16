-- Negative & Positive RLS Sanity Assertions (run via psql / Supabase CLI local test harness)
BEGIN;

-- Verify key tables have Row-Level Security enabled
DO $$
DECLARE
  missing_rls text;
BEGIN
  SELECT string_agg(tablename, ', ')
  INTO missing_rls
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN (
      'institutions', 'profiles', 'institution_user', 'courses', 'training_batches',
      'intake_periods', 'intake_course_quotas', 'learner_profiles', 'learner_documents',
      'enrollment_applications', 'enrollment_batch_forwardings', 'competency_progress',
      'competency_unit_reviews',
      'announcements', 'announcement_views', 'operational_documents', 'security_audit_logs',
      'offline_sync_mutations'
    )
    AND rowsecurity = false;

  IF missing_rls IS NOT NULL THEN
    RAISE EXCEPTION 'RLS NOT ENABLED on tables: %', missing_rls;
  END IF;
END $$;

-- Verify critical enforcement triggers exist
DO $$
DECLARE
  missing_triggers text;
BEGIN
  SELECT string_agg(req.tg, ', ')
  INTO missing_triggers
  FROM (VALUES
    ('trg_profiles_prevent_escalation'),
    ('trg_guard_locked_competency_progress'),
    ('trg_security_audit_logs_immutable'),
    ('trg_guard_competency_unit_structure_lock'),
    ('trg_guard_competency_task_structure_lock'),
    ('trg_guard_uli_assignment'),
    ('trg_guard_announcement_roles')
  ) AS req(tg)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_trigger t WHERE t.tgname = req.tg
  );

  IF missing_triggers IS NOT NULL THEN
    RAISE EXCEPTION 'Missing critical security triggers: %', missing_triggers;
  END IF;
END $$;

ROLLBACK;
