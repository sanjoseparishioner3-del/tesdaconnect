-- Phase B / Migration 0003: Learner Profiles, Documents, Enrollment Applications, Forwarding & Safe Confirmation RPCs

CREATE TABLE public.learner_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id bigint UNIQUE,
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  uli_number varchar(40) UNIQUE,
  uli_assigned_at timestamptz,
  uli_assigned_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  entry_date date,
  last_name varchar(120) NOT NULL,
  first_name varchar(120) NOT NULL,
  middle_name varchar(120),
  extension_name varchar(20),
  address_line text,
  barangay varchar(120),
  district varchar(120),
  city_municipality varchar(120),
  province varchar(120),
  region varchar(120),
  contact_number varchar(30),
  nationality varchar(60),
  sex varchar(20),
  civil_status varchar(30),
  employment_status varchar(40),
  employment_type varchar(40),
  birthdate date,
  birthplace_city varchar(120),
  birthplace_province varchar(120),
  birthplace_region varchar(120),
  educational_attainment varchar(120),
  guardian_name varchar(255),
  guardian_address text,
  classifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  disability_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  disability_cause varchar(30),
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  scholarship_package varchar(120),
  privacy_consent boolean NOT NULL DEFAULT false,
  submitted_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_learner_profiles_inst_name ON public.learner_profiles (institution_id, lower(last_name), lower(first_name));

CREATE TRIGGER trg_learner_profiles_touch
  BEFORE UPDATE ON public.learner_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_version_and_updated_at();

CREATE TABLE public.learner_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id bigint UNIQUE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  learner_profile_id uuid REFERENCES public.learner_profiles(id) ON DELETE CASCADE,
  document_type varchar(50) NOT NULL,
  original_name varchar(255) NOT NULL,
  storage_path varchar(500) NOT NULL,
  mime_type varchar(100) NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  status public.document_status NOT NULL DEFAULT 'pending',
  reviewed_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_learner_documents_user_type ON public.learner_documents (user_id, document_type);

CREATE TABLE public.enrollment_batch_forwardings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id bigint UNIQUE,
  reference_code varchar(40) NOT NULL UNIQUE,
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
  training_batch_id uuid REFERENCES public.training_batches(id) ON DELETE SET NULL,
  forwarded_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  forwarded_at timestamptz NOT NULL DEFAULT now(),
  status varchar(40) NOT NULL DEFAULT 'ready_for_scheduling',
  application_count integer NOT NULL DEFAULT 0,
  summary_path varchar(500) NOT NULL,
  summary_filename varchar(255) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.enrollment_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id bigint UNIQUE,
  client_draft_id uuid UNIQUE DEFAULT gen_random_uuid(),
  reference_no varchar(40) NOT NULL UNIQUE,
  learner_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  training_batch_id uuid REFERENCES public.training_batches(id) ON DELETE SET NULL,
  forwarding_id uuid REFERENCES public.enrollment_batch_forwardings(id) ON DELETE SET NULL,
  learner_name varchar(255) NOT NULL,
  email varchar(255),
  contact_number varchar(30),
  application_status public.application_status NOT NULL DEFAULT 'draft',
  record_completeness smallint NOT NULL DEFAULT 0 CHECK (record_completeness BETWEEN 0 AND 100),
  submitted_at timestamptz,
  verified_at timestamptz,
  confirmed_at timestamptz,
  scholar_id varchar(40) UNIQUE,
  remarks text,
  archived_at timestamptz,
  archived_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  archive_reason text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_enrollment_apps_inst_status ON public.enrollment_applications (institution_id, application_status) WHERE archived_at IS NULL;
CREATE INDEX idx_enrollment_apps_learner ON public.enrollment_applications (learner_user_id);

CREATE TRIGGER trg_enrollment_applications_touch
  BEFORE UPDATE ON public.enrollment_applications
  FOR EACH ROW EXECUTE FUNCTION public.touch_version_and_updated_at();

CREATE TABLE public.enrollment_status_histories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id bigint UNIQUE,
  enrollment_application_id uuid REFERENCES public.enrollment_applications(id) ON DELETE SET NULL,
  reference_no varchar(40) NOT NULL,
  from_status varchar(30),
  to_status varchar(30) NOT NULL,
  actor_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_enrollment_hist_ref_created ON public.enrollment_status_histories (reference_no, created_at DESC);

-- Authoritative Duplicate Check (warning signal only — never auto-merges profiles)
CREATE OR REPLACE FUNCTION public.detect_duplicate_learner_candidates(
  p_institution_id uuid,
  p_first_name text,
  p_last_name text,
  p_birthdate date DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_uli_number text DEFAULT NULL,
  p_exclude_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  profile_id uuid,
  user_id uuid,
  full_name text,
  uli_number varchar,
  birthdate date,
  match_reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    lp.id,
    lp.user_id,
    trim(lp.first_name || ' ' || lp.last_name) AS full_name,
    lp.uli_number,
    lp.birthdate,
    CASE
      WHEN p_uli_number IS NOT NULL AND lp.uli_number = p_uli_number THEN 'Exact ULI number match'
      WHEN lower(trim(lp.first_name)) = lower(trim(p_first_name))
        AND lower(trim(lp.last_name)) = lower(trim(p_last_name))
        AND p_birthdate IS NOT NULL AND lp.birthdate = p_birthdate THEN 'Matching full name and birthdate'
      WHEN lower(trim(lp.first_name)) = lower(trim(p_first_name))
        AND lower(trim(lp.last_name)) = lower(trim(p_last_name)) THEN 'Similar full name (requires human review)'
      ELSE 'Matching email address'
    END AS match_reason
  FROM public.learner_profiles lp
  JOIN public.profiles pr ON pr.id = lp.user_id
  WHERE lp.institution_id = p_institution_id
    AND (p_exclude_user_id IS NULL OR lp.user_id <> p_exclude_user_id)
    AND (
      (p_uli_number IS NOT NULL AND lp.uli_number = p_uli_number)
      OR (p_email IS NOT NULL AND lower(trim(pr.email)) = lower(trim(p_email)))
      OR (lower(trim(lp.first_name)) = lower(trim(p_first_name)) AND lower(trim(lp.last_name)) = lower(trim(p_last_name)))
    )
  LIMIT 20;
$$;

-- Transactional Enrollment Confirmation RPC: 100% gate + lock + {CODE}-{YYYY}-{0001} generation
CREATE OR REPLACE FUNCTION public.confirm_enrollment_application(p_application_id uuid)
RETURNS public.enrollment_applications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.enrollment_applications;
  v_inst public.institutions;
  v_year text := to_char(now(), 'YYYY');
  v_prefix text;
  v_next_seq integer;
  v_scholar_id text;
  v_caller_role public.app_role;
BEGIN
  v_caller_role := public.current_user_role();
  IF v_caller_role NOT IN ('registrar', 'institutional_administrator', 'system_administrator') THEN
    RAISE EXCEPTION 'Forbidden: only Registrar or authorized Administrator may confirm enrollments.';
  END IF;

  SELECT * INTO v_app
  FROM public.enrollment_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Enrollment application not found.';
  END IF;

  IF NOT public.has_institution_access(v_app.institution_id) THEN
    RAISE EXCEPTION 'Forbidden: application belongs to another institution.';
  END IF;

  IF v_app.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Archived applications cannot be confirmed.';
  END IF;

  IF v_app.record_completeness < 100 OR v_app.application_status <> 'verified' THEN
    RAISE EXCEPTION 'Application must reach 100%% completeness and verified status before confirmation.';
  END IF;

  IF v_app.scholar_id IS NOT NULL THEN
    RETURN v_app;
  END IF;

  SELECT * INTO v_inst
  FROM public.institutions
  WHERE id = v_app.institution_id
  FOR UPDATE;

  v_prefix := upper(v_inst.code) || '-' || v_year || '-';

  SELECT COALESCE(MAX(CAST(substring(scholar_id FROM '[0-9]{4}$') AS integer)), 0) + 1
  INTO v_next_seq
  FROM public.enrollment_applications
  WHERE scholar_id LIKE v_prefix || '%';

  v_scholar_id := v_prefix || lpad(v_next_seq::text, 4, '0');

  UPDATE public.enrollment_applications
  SET
    application_status = 'confirmed',
    confirmed_at = now(),
    scholar_id = v_scholar_id
  WHERE id = v_app.id
  RETURNING * INTO v_app;

  -- Promote applicant role -> scholar automatically if still applicant
  UPDATE public.profiles
  SET role = 'scholar'
  WHERE id = v_app.learner_user_id
    AND role = 'applicant';

  INSERT INTO public.enrollment_status_histories (
    enrollment_application_id,
    reference_no,
    from_status,
    to_status,
    actor_user_id,
    reason
  ) VALUES (
    v_app.id,
    v_app.reference_no,
    'verified',
    'confirmed',
    auth.uid(),
    'Confirmed by Registrar with scholar ID ' || v_scholar_id
  );

  RETURN v_app;
END;
$$;

ALTER TABLE public.learner_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learner_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollment_batch_forwardings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollment_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollment_status_histories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Learners read and draft own profile"
  ON public.learner_profiles FOR ALL
  TO authenticated
  USING (user_id = auth.uid() AND public.is_active_user())
  WITH CHECK (user_id = auth.uid() AND public.is_active_user());

CREATE POLICY "Scoped staff read learner profiles"
  ON public.learner_profiles FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin()
    OR (
      public.current_user_role() IN ('institutional_administrator', 'registrar', 'focal_person')
      AND public.has_institution_access(institution_id)
    )
  );

CREATE POLICY "Registrars manage scoped learner profiles"
  ON public.learner_profiles FOR UPDATE
  TO authenticated
  USING (
    public.current_user_role() IN ('registrar', 'institutional_administrator', 'system_administrator')
    AND public.has_institution_access(institution_id)
  )
  WITH CHECK (
    public.current_user_role() IN ('registrar', 'institutional_administrator', 'system_administrator')
    AND public.has_institution_access(institution_id)
  );

CREATE POLICY "Learners manage own pending documents"
  ON public.learner_documents FOR ALL
  TO authenticated
  USING (user_id = auth.uid() AND public.is_active_user())
  WITH CHECK (user_id = auth.uid() AND public.is_active_user());

CREATE POLICY "Registrars review scoped learner documents"
  ON public.learner_documents FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.learner_profiles lp
      WHERE lp.id = learner_documents.learner_profile_id
        AND public.current_user_role() IN ('registrar', 'institutional_administrator', 'system_administrator')
        AND public.has_institution_access(lp.institution_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.learner_profiles lp
      WHERE lp.id = learner_documents.learner_profile_id
        AND public.current_user_role() IN ('registrar', 'institutional_administrator', 'system_administrator')
        AND public.has_institution_access(lp.institution_id)
    )
  );

CREATE POLICY "Learners read own enrollment applications"
  ON public.enrollment_applications FOR SELECT
  TO authenticated
  USING (learner_user_id = auth.uid() AND public.is_active_user());

CREATE POLICY "Learners insert or update own draft/returned applications"
  ON public.enrollment_applications FOR ALL
  TO authenticated
  USING (
    learner_user_id = auth.uid()
    AND public.is_active_user()
    AND application_status IN ('draft', 'returned')
    AND archived_at IS NULL
  )
  WITH CHECK (
    learner_user_id = auth.uid()
    AND public.is_active_user()
    AND application_status IN ('draft', 'submitted')
  );

CREATE POLICY "Scoped staff read enrollment applications"
  ON public.enrollment_applications FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin()
    OR (
      public.current_user_role() IN ('institutional_administrator', 'registrar', 'focal_person', 'trainer')
      AND public.has_institution_access(institution_id)
    )
  );

CREATE POLICY "Registrars verify and manage scoped applications"
  ON public.enrollment_applications FOR UPDATE
  TO authenticated
  USING (
    public.current_user_role() IN ('registrar', 'institutional_administrator', 'system_administrator')
    AND public.has_institution_access(institution_id)
  )
  WITH CHECK (
    public.current_user_role() IN ('registrar', 'institutional_administrator', 'system_administrator')
    AND public.has_institution_access(institution_id)
  );

CREATE POLICY "Registrars and admins read forwarding batches"
  ON public.enrollment_batch_forwardings FOR ALL
  TO authenticated
  USING (
    public.current_user_role() IN ('registrar', 'institutional_administrator', 'system_administrator')
    AND public.has_institution_access(institution_id)
  )
  WITH CHECK (
    public.current_user_role() IN ('registrar', 'institutional_administrator', 'system_administrator')
    AND public.has_institution_access(institution_id)
  );

CREATE POLICY "Authorized staff read enrollment status history"
  ON public.enrollment_status_histories FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.enrollment_applications ea
      WHERE ea.id = enrollment_status_histories.enrollment_application_id
        AND (
          ea.learner_user_id = auth.uid()
          OR public.has_institution_access(ea.institution_id)
        )
    )
  );
