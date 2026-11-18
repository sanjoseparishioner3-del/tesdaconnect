-- Findings of the row-level-security audit (supabase/scripts/rls-audit.mjs), run against the
-- live project with one demo account per role.
--
-- 1. enrollment_applications: a Trainer could read EVERY application of the campus (names,
--    emails, contact numbers of people who are not in any of their batches). Trainers now only
--    see applications assigned to a batch they teach.
-- 2. institution_user: any signed-in user, including an applicant, could list every campus
--    membership (all user ids). Learners now only see their own membership rows.
-- 3. security_audit_logs: any active user could insert audit events with a NULL actor, which
--    allows forged, anonymous-looking entries. The actor must now be the signed-in user
--    (every audit insert in the app already sets actor_user_id).
-- 4. Storage: the learner-documents bucket had no server-side limits, so the 10 MB / PDF-JPG-PNG
--    rule only existed in the browser. It is now enforced by Storage itself.

-- 1 ---------------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Scoped staff read enrollment applications" ON public.enrollment_applications;
CREATE POLICY "Scoped staff read enrollment applications"
  ON public.enrollment_applications FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin()
    OR (
      public.current_user_role() IN ('institutional_administrator', 'registrar', 'focal_person')
      AND public.has_institution_access(institution_id)
    )
    OR (
      public.current_user_role() = 'trainer'
      AND public.has_institution_access(institution_id)
      AND training_batch_id IN (
        SELECT bt.training_batch_id
        FROM public.batch_trainers bt
        WHERE bt.trainer_user_id = auth.uid()
      )
    )
  );

-- 2 ---------------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users read own institution memberships" ON public.institution_user;
CREATE POLICY "Users read own institution memberships"
  ON public.institution_user FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      public.current_user_role() IN ('institutional_administrator', 'registrar', 'focal_person', 'trainer')
      AND public.has_institution_access(institution_id)
    )
  );

-- 3 ---------------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated active users insert audit events" ON public.security_audit_logs;
CREATE POLICY "Authenticated active users insert audit events"
  ON public.security_audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_user()
    AND actor_user_id = auth.uid()
  );

-- 4 ---------------------------------------------------------------------------------------
UPDATE storage.buckets
SET file_size_limit = 10485760,
    allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png']
WHERE id = 'learner-documents';

UPDATE storage.buckets
SET file_size_limit = 10485760
WHERE id = 'announcement-attachments';
