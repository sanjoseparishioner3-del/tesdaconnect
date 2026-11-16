-- Phase B / Migration 0009: MIS 03-01 Full Fields, ULI Post-Confirmation Gate, Admin-Only Scheduling,
-- Focal-Only Competency Charts, Scoped Announcements, and Removal of Attendance & Certificates

-- 1. Complete MIS 03-01 (ver. 2021) profile fields on learner_profiles
ALTER TABLE public.learner_profiles
  ADD COLUMN IF NOT EXISTS email_or_facebook varchar(255),
  ADD COLUMN IF NOT EXISTS classification_other varchar(255),
  ADD COLUMN IF NOT EXISTS disability_other varchar(255),
  ADD COLUMN IF NOT EXISTS applicant_signature_name varchar(255),
  ADD COLUMN IF NOT EXISTS date_accomplished date,
  ADD COLUMN IF NOT EXISTS noted_by_name varchar(255),
  ADD COLUMN IF NOT EXISTS date_received date,
  ADD COLUMN IF NOT EXISTS id_picture_path varchar(500);

CREATE POLICY "Registrars and admins insert scoped learner profiles"
  ON public.learner_profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_system_admin()
    OR (
      public.current_user_role() IN ('registrar', 'institutional_administrator')
      AND public.has_institution_access(institution_id)
    )
  );

-- 2. Enforce strict ULI Rule: ONLY Admin or Registrar may input ULI, and ONLY AFTER enrollment is Confirmed
CREATE OR REPLACE FUNCTION public.guard_uli_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.app_role;
  v_is_confirmed boolean;
BEGIN
  IF auth.role() = 'service_role' OR current_user = 'postgres' OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF (TG_OP = 'INSERT' AND NEW.uli_number IS NOT NULL AND length(trim(NEW.uli_number)) > 0)
     OR (TG_OP = 'UPDATE' AND NEW.uli_number IS DISTINCT FROM OLD.uli_number) THEN
    v_role := public.current_user_role();
    IF v_role NOT IN ('system_administrator', 'institutional_administrator', 'registrar') THEN
      RAISE EXCEPTION 'Forbidden: only Administrators or Registrars may assign or edit ULI numbers.';
    END IF;

    IF NEW.uli_number IS NOT NULL AND length(trim(NEW.uli_number)) > 0 THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.enrollment_applications ea
        WHERE ea.learner_user_id = NEW.user_id
          AND ea.archived_at IS NULL
          AND ea.application_status = 'confirmed'
      ) INTO v_is_confirmed;

      IF NOT v_is_confirmed THEN
        RAISE EXCEPTION 'Forbidden: ULI issued by TESDA Main can only be encoded after the learner enrollment is Confirmed.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_uli_assignment
  BEFORE INSERT OR UPDATE ON public.learner_profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_uli_assignment();

-- 3. Expand learner_documents size cap (<= 10 MB) and allow scoped Registrars & Admins full view/upload/edit/download
DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT con.conname INTO v_conname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'learner_documents'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%size_bytes%';

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.learner_documents DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

ALTER TABLE public.learner_documents
  ADD CONSTRAINT learner_documents_size_bytes_check
  CHECK (size_bytes > 0 AND size_bytes <= 10485760);

DROP POLICY IF EXISTS "Registrars review scoped learner documents" ON public.learner_documents;
CREATE POLICY "Registrars and admins manage scoped learner documents"
  ON public.learner_documents FOR ALL
  TO authenticated
  USING (
    public.is_system_admin()
    OR (
      public.current_user_role() IN ('registrar', 'institutional_administrator')
      AND (
        EXISTS (
          SELECT 1 FROM public.learner_profiles lp
          WHERE (lp.id = learner_documents.learner_profile_id OR lp.user_id = learner_documents.user_id)
            AND public.has_institution_access(lp.institution_id)
        )
        OR EXISTS (
          SELECT 1 FROM public.enrollment_applications ea
          WHERE ea.learner_user_id = learner_documents.user_id
            AND ea.archived_at IS NULL
            AND public.has_institution_access(ea.institution_id)
        )
        OR EXISTS (
          SELECT 1 FROM public.institution_user iu
          WHERE iu.user_id = learner_documents.user_id
            AND public.has_institution_access(iu.institution_id)
        )
      )
    )
  )
  WITH CHECK (
    public.is_system_admin()
    OR (
      public.current_user_role() IN ('registrar', 'institutional_administrator')
      AND (
        EXISTS (
          SELECT 1 FROM public.learner_profiles lp
          WHERE (lp.id = learner_documents.learner_profile_id OR lp.user_id = learner_documents.user_id)
            AND public.has_institution_access(lp.institution_id)
        )
        OR EXISTS (
          SELECT 1 FROM public.enrollment_applications ea
          WHERE ea.learner_user_id = learner_documents.user_id
            AND ea.archived_at IS NULL
            AND public.has_institution_access(ea.institution_id)
        )
        OR EXISTS (
          SELECT 1 FROM public.institution_user iu
          WHERE iu.user_id = learner_documents.user_id
            AND public.has_institution_access(iu.institution_id)
        )
      )
    )
  );

CREATE POLICY "Registrars and admins upload scoped learner-documents objects"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'learner-documents'
    AND (
      public.is_system_admin()
      OR (
        public.current_user_role() IN ('institutional_administrator', 'registrar')
        AND public.has_institution_access(((storage.foldername(name))[1])::uuid)
      )
    )
  );

-- 4. Remove Attendance and Certificates modules from database
DROP TABLE IF EXISTS public.attendance_records CASCADE;
DROP TABLE IF EXISTS public.training_certificates CASCADE;
DROP TYPE IF EXISTS public.attendance_status CASCADE;
DROP TYPE IF EXISTS public.certificate_status CASCADE;

DO $$
DECLARE
  v_conname text;
BEGIN
  UPDATE public.operational_documents
  SET category = 'other'
  WHERE category = 'attendance_sheet';

  SELECT con.conname INTO v_conname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
  WHERE nsp.nspname = 'public'
    AND rel.relname = 'operational_documents'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%category%';

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.operational_documents DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

ALTER TABLE public.operational_documents
  ADD CONSTRAINT operational_documents_category_check
  CHECK (category IN ('registration_form', 'assessment_form', 'photo', 'other'));

-- 5. Restrict Competency Progress & Achievement Charts management STRICTLY to Focal Person (others read-only)
CREATE OR REPLACE FUNCTION public.can_access_enrollment_ops(p_enrollment_id uuid, p_write boolean DEFAULT false)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.enrollment_applications ea
    WHERE ea.id = p_enrollment_id
      AND (
        (NOT p_write AND ea.learner_user_id = auth.uid() AND public.is_active_user())
        OR (NOT p_write AND public.is_system_admin())
        OR (
          NOT p_write
          AND public.current_user_role() IN ('institutional_administrator', 'registrar', 'focal_person')
          AND public.has_institution_access(ea.institution_id)
        )
        OR (
          p_write
          AND public.current_user_role() = 'focal_person'
          AND public.has_institution_access(ea.institution_id)
        )
      )
  );
$$;

DROP POLICY IF EXISTS "Focal and admins manage competency units" ON public.competency_units;
CREATE POLICY "Only focal person manages competency units"
  ON public.competency_units FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = competency_units.course_id
        AND public.current_user_role() = 'focal_person'
        AND public.has_institution_access(c.institution_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = competency_units.course_id
        AND public.current_user_role() = 'focal_person'
        AND public.has_institution_access(c.institution_id)
    )
  );

DROP POLICY IF EXISTS "Focal and admins manage competency tasks" ON public.competency_tasks;
CREATE POLICY "Only focal person manages competency tasks"
  ON public.competency_tasks FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.competency_units cu
      JOIN public.courses c ON c.id = cu.course_id
      WHERE cu.id = competency_tasks.competency_unit_id
        AND public.current_user_role() = 'focal_person'
        AND public.has_institution_access(c.institution_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.competency_units cu
      JOIN public.courses c ON c.id = cu.course_id
      WHERE cu.id = competency_tasks.competency_unit_id
        AND public.current_user_role() = 'focal_person'
        AND public.has_institution_access(c.institution_id)
    )
  );

-- 6. Restrict Scheduling & Training Batch Management STRICTLY to Admins; Registrar/Focal/Students view only
DROP POLICY IF EXISTS "Focal, institutional admin, and sysadmin manage batches" ON public.training_batches;
CREATE POLICY "Only admins manage training batches"
  ON public.training_batches FOR ALL
  TO authenticated
  USING (
    public.is_system_admin()
    OR (
      public.current_user_role() = 'institutional_administrator'
      AND public.has_institution_access(institution_id)
    )
  )
  WITH CHECK (
    public.is_system_admin()
    OR (
      public.current_user_role() = 'institutional_administrator'
      AND public.has_institution_access(institution_id)
    )
  );

DROP POLICY IF EXISTS "Focal and admins assign batch trainers" ON public.batch_trainers;
CREATE POLICY "Only admins assign batch trainers"
  ON public.batch_trainers FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.training_batches tb
      WHERE tb.id = batch_trainers.training_batch_id
        AND (
          public.is_system_admin()
          OR (
            public.current_user_role() = 'institutional_administrator'
            AND public.has_institution_access(tb.institution_id)
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.training_batches tb
      WHERE tb.id = batch_trainers.training_batch_id
        AND (
          public.is_system_admin()
          OR (
            public.current_user_role() = 'institutional_administrator'
            AND public.has_institution_access(tb.institution_id)
          )
        )
    )
  );

-- 7. Announcements: Calendar schedule fields + Role Target Enforcement (Admin -> Scholar/Registrar/Focal; Registrar -> Focal/Scholar only)
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS target_roles text[] NOT NULL DEFAULT ARRAY['scholar', 'applicant', 'focal_person', 'registrar']::text[],
  ADD COLUMN IF NOT EXISTS announcement_type varchar(30) NOT NULL DEFAULT 'general' CHECK (announcement_type IN ('general', 'schedule', 'deadline')),
  ADD COLUMN IF NOT EXISTS event_date date,
  ADD COLUMN IF NOT EXISTS event_time varchar(60);

CREATE OR REPLACE FUNCTION public.guard_announcement_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.app_role;
BEGIN
  IF auth.role() = 'service_role' OR current_user = 'postgres' OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_role := public.current_user_role();
  IF v_role NOT IN ('system_administrator', 'institutional_administrator', 'registrar') THEN
    RAISE EXCEPTION 'Forbidden: only Administrators and Registrars can publish announcements.';
  END IF;

  IF NEW.target_roles IS NULL OR array_length(NEW.target_roles, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one announcement target audience role is required.';
  END IF;

  IF NOT (NEW.target_roles <@ ARRAY['scholar', 'applicant', 'focal_person', 'registrar']::text[]) THEN
    RAISE EXCEPTION 'Invalid target role in announcement.';
  END IF;

  IF v_role = 'registrar' THEN
    IF NOT (NEW.target_roles <@ ARRAY['scholar', 'applicant', 'focal_person']::text[]) THEN
      RAISE EXCEPTION 'Forbidden: Registrars may announce only to Focal Persons and Scholars/Students.';
    END IF;
    IF NEW.audience NOT IN ('scholar', 'focal_person') THEN
      NEW.audience := CASE
        WHEN 'scholar' = ANY(NEW.target_roles) OR 'applicant' = ANY(NEW.target_roles) THEN 'scholar'::public.announcement_audience
        ELSE 'focal_person'::public.announcement_audience
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_announcement_roles
  BEFORE INSERT OR UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.guard_announcement_roles();

DROP POLICY IF EXISTS "Authorized users read announcements matching audience and campus" ON public.announcements;
CREATE POLICY "Authorized users read announcements matching target roles and campus"
  ON public.announcements FOR SELECT
  TO authenticated
  USING (
    public.is_active_user() AND (
      public.is_system_admin()
      OR public.current_user_role() = 'institutional_administrator' AND (institution_id IS NULL OR public.has_institution_access(institution_id))
      OR (
        public.current_user_role() = 'registrar'
        AND (
          author_user_id = auth.uid()
          OR (
            is_draft = false
            AND archived_at IS NULL
            AND (institution_id IS NULL OR public.has_institution_access(institution_id))
            AND 'registrar' = ANY(target_roles)
          )
        )
      )
      OR (
        is_draft = false
        AND archived_at IS NULL
        AND published_at IS NOT NULL
        AND published_at <= now()
        AND (expires_at IS NULL OR expires_at > now())
        AND (
          institution_id IS NULL
          OR public.has_institution_access(institution_id)
          OR EXISTS (
            SELECT 1 FROM public.enrollment_applications ea
            WHERE ea.learner_user_id = auth.uid()
              AND ea.institution_id = announcements.institution_id
              AND ea.archived_at IS NULL
          )
        )
        AND (
          (public.current_user_role() IN ('scholar', 'applicant') AND ('scholar' = ANY(target_roles) OR 'applicant' = ANY(target_roles)))
          OR (public.current_user_role() = 'focal_person' AND 'focal_person' = ANY(target_roles))
        )
      )
    )
  );
