-- Phase B / Migration 0004: Competency Setup, Progress, Attendance, Course Materials & Certification

CREATE TABLE public.competency_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id bigint UNIQUE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE RESTRICT,
  unit_number smallint NOT NULL CHECK (unit_number > 0),
  name varchar(150) NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, unit_number)
);

CREATE INDEX idx_competency_units_course_sort ON public.competency_units (course_id, sort_order);

CREATE TABLE public.competency_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id bigint UNIQUE,
  competency_unit_id uuid NOT NULL REFERENCES public.competency_units(id) ON DELETE CASCADE,
  chart_type varchar(30) NOT NULL CHECK (chart_type IN ('progress', 'achievement')),
  task_number smallint NOT NULL CHECK (task_number > 0),
  name varchar(255) NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competency_unit_id, chart_type, task_number)
);

CREATE TABLE public.competency_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id bigint UNIQUE,
  enrollment_application_id uuid NOT NULL REFERENCES public.enrollment_applications(id) ON DELETE CASCADE,
  competency_task_id uuid NOT NULL REFERENCES public.competency_tasks(id) ON DELETE CASCADE,
  status public.competency_status NOT NULL DEFAULT 'not_assessed',
  remarks text,
  assessed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assessed_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_application_id, competency_task_id)
);

CREATE INDEX idx_competency_progress_status ON public.competency_progress (status, assessed_at);

CREATE TRIGGER trg_competency_progress_touch
  BEFORE UPDATE ON public.competency_progress
  FOR EACH ROW EXECUTE FUNCTION public.touch_version_and_updated_at();

CREATE TABLE public.competency_unit_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id bigint UNIQUE,
  enrollment_application_id uuid NOT NULL REFERENCES public.enrollment_applications(id) ON DELETE CASCADE,
  competency_unit_id uuid NOT NULL REFERENCES public.competency_units(id) ON DELETE CASCADE,
  status public.unit_review_status NOT NULL DEFAULT 'pending_review',
  verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  verified_at timestamptz,
  is_locked boolean NOT NULL DEFAULT false,
  remarks text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_application_id, competency_unit_id)
);

CREATE TRIGGER trg_competency_unit_reviews_touch
  BEFORE UPDATE ON public.competency_unit_reviews
  FOR EACH ROW EXECUTE FUNCTION public.touch_version_and_updated_at();

-- Prevent competency task updates when parent unit review is locked
CREATE OR REPLACE FUNCTION public.guard_locked_competency_progress()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_unit_id uuid;
  v_locked boolean;
BEGIN
  SELECT competency_unit_id INTO v_unit_id
  FROM public.competency_tasks
  WHERE id = NEW.competency_task_id;

  SELECT is_locked INTO v_locked
  FROM public.competency_unit_reviews
  WHERE enrollment_application_id = NEW.enrollment_application_id
    AND competency_unit_id = v_unit_id;

  IF COALESCE(v_locked, false) THEN
    RAISE EXCEPTION 'Competency unit review is locked for this trainee and cannot be modified.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_locked_competency_progress
  BEFORE INSERT OR UPDATE ON public.competency_progress
  FOR EACH ROW EXECUTE FUNCTION public.guard_locked_competency_progress();

CREATE TABLE public.competency_report_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id bigint UNIQUE,
  enrollment_application_id uuid NOT NULL UNIQUE REFERENCES public.enrollment_applications(id) ON DELETE CASCADE,
  status public.report_submission_status NOT NULL DEFAULT 'draft',
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  finalized_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  finalized_at timestamptz,
  submitted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  submitted_at timestamptz,
  submission_reference varchar(100),
  remarks text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_competency_report_submissions_touch
  BEFORE UPDATE ON public.competency_report_submissions
  FOR EACH ROW EXECUTE FUNCTION public.touch_version_and_updated_at();

CREATE TABLE public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id bigint UNIQUE,
  enrollment_application_id uuid NOT NULL REFERENCES public.enrollment_applications(id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  status public.attendance_status NOT NULL,
  remarks text,
  recorded_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_application_id, attendance_date)
);

CREATE INDEX idx_attendance_date_status ON public.attendance_records (attendance_date, status);

CREATE TRIGGER trg_attendance_records_touch
  BEFORE UPDATE ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.touch_version_and_updated_at();

CREATE TABLE public.training_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id bigint UNIQUE,
  enrollment_application_id uuid NOT NULL UNIQUE REFERENCES public.enrollment_applications(id) ON DELETE CASCADE,
  certificate_number varchar(80) UNIQUE,
  status public.certificate_status NOT NULL DEFAULT 'not_completed',
  pending_units jsonb NOT NULL DEFAULT '[]'::jsonb,
  reason text,
  issued_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.course_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id bigint UNIQUE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  uploaded_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  title varchar(180) NOT NULL,
  description text,
  original_name varchar(255) NOT NULL,
  storage_path varchar(500) NOT NULL,
  mime_type varchar(120),
  size_bytes bigint NOT NULL DEFAULT 0 CHECK (size_bytes >= 0 AND size_bytes <= 20971520),
  is_published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_course_materials_vis ON public.course_materials (course_id, is_published, created_at DESC);

-- Helper checking if user can access a specific trainee's instructional/assessment records
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
        OR public.is_system_admin()
        OR (
          public.current_user_role() IN ('institutional_administrator', 'focal_person')
          AND public.has_institution_access(ea.institution_id)
        )
        OR (
          NOT p_write
          AND public.current_user_role() = 'registrar'
          AND public.has_institution_access(ea.institution_id)
        )
        OR (
          public.current_user_role() = 'trainer'
          AND ea.training_batch_id IS NOT NULL
          AND public.can_manage_batch(ea.training_batch_id)
        )
      )
  );
$$;

ALTER TABLE public.competency_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competency_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competency_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competency_unit_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competency_report_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active users view competency units"
  ON public.competency_units FOR SELECT
  TO authenticated
  USING (public.is_active_user());

CREATE POLICY "Focal and admins manage competency units"
  ON public.competency_units FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = competency_units.course_id
        AND (
          public.is_system_admin()
          OR (
            public.current_user_role() IN ('institutional_administrator', 'focal_person')
            AND public.has_institution_access(c.institution_id)
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = competency_units.course_id
        AND (
          public.is_system_admin()
          OR (
            public.current_user_role() IN ('institutional_administrator', 'focal_person')
            AND public.has_institution_access(c.institution_id)
          )
        )
    )
  );

CREATE POLICY "Active users view competency tasks"
  ON public.competency_tasks FOR SELECT
  TO authenticated
  USING (public.is_active_user());

CREATE POLICY "Focal and admins manage competency tasks"
  ON public.competency_tasks FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.competency_units cu
      JOIN public.courses c ON c.id = cu.course_id
      WHERE cu.id = competency_tasks.competency_unit_id
        AND (
          public.is_system_admin()
          OR (
            public.current_user_role() IN ('institutional_administrator', 'focal_person')
            AND public.has_institution_access(c.institution_id)
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.competency_units cu
      JOIN public.courses c ON c.id = cu.course_id
      WHERE cu.id = competency_tasks.competency_unit_id
        AND (
          public.is_system_admin()
          OR (
            public.current_user_role() IN ('institutional_administrator', 'focal_person')
            AND public.has_institution_access(c.institution_id)
          )
        )
    )
  );

CREATE POLICY "Scoped read competency progress"
  ON public.competency_progress FOR SELECT
  TO authenticated
  USING (public.can_access_enrollment_ops(enrollment_application_id, false));

CREATE POLICY "Trainers and focal update competency progress"
  ON public.competency_progress FOR ALL
  TO authenticated
  USING (public.can_access_enrollment_ops(enrollment_application_id, true))
  WITH CHECK (public.can_access_enrollment_ops(enrollment_application_id, true));

CREATE POLICY "Scoped read unit reviews"
  ON public.competency_unit_reviews FOR SELECT
  TO authenticated
  USING (public.can_access_enrollment_ops(enrollment_application_id, false));

CREATE POLICY "Focal and admins manage unit reviews"
  ON public.competency_unit_reviews FOR ALL
  TO authenticated
  USING (public.can_access_enrollment_ops(enrollment_application_id, true))
  WITH CHECK (public.can_access_enrollment_ops(enrollment_application_id, true));

CREATE POLICY "Scoped read competency report submissions"
  ON public.competency_report_submissions FOR SELECT
  TO authenticated
  USING (public.can_access_enrollment_ops(enrollment_application_id, false));

CREATE POLICY "Focal and admins manage report submissions"
  ON public.competency_report_submissions FOR ALL
  TO authenticated
  USING (public.can_access_enrollment_ops(enrollment_application_id, true))
  WITH CHECK (public.can_access_enrollment_ops(enrollment_application_id, true));

CREATE POLICY "Scoped read attendance records"
  ON public.attendance_records FOR SELECT
  TO authenticated
  USING (public.can_access_enrollment_ops(enrollment_application_id, false));

CREATE POLICY "Trainers and focal record attendance"
  ON public.attendance_records FOR ALL
  TO authenticated
  USING (public.can_access_enrollment_ops(enrollment_application_id, true))
  WITH CHECK (public.can_access_enrollment_ops(enrollment_application_id, true));

CREATE POLICY "Scoped read training certificates"
  ON public.training_certificates FOR SELECT
  TO authenticated
  USING (public.can_access_enrollment_ops(enrollment_application_id, false));

CREATE POLICY "Focal and admins manage certificates"
  ON public.training_certificates FOR ALL
  TO authenticated
  USING (public.can_access_enrollment_ops(enrollment_application_id, true))
  WITH CHECK (public.can_access_enrollment_ops(enrollment_application_id, true));

CREATE POLICY "Learners read published materials for own course; staff read institutional"
  ON public.course_materials FOR SELECT
  TO authenticated
  USING (
    public.is_active_user() AND (
      EXISTS (
        SELECT 1 FROM public.courses c
        WHERE c.id = course_materials.course_id
          AND public.has_institution_access(c.institution_id)
          AND public.current_user_role() IN ('system_administrator', 'institutional_administrator', 'focal_person', 'trainer', 'registrar')
      )
      OR (
        is_published = true
        AND EXISTS (
          SELECT 1 FROM public.enrollment_applications ea
          WHERE ea.learner_user_id = auth.uid()
            AND ea.course_id = course_materials.course_id
            AND ea.archived_at IS NULL
            AND ea.application_status IN ('verified', 'confirmed')
        )
      )
    )
  );

CREATE POLICY "Focal, trainers, and admins manage course materials"
  ON public.course_materials FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = course_materials.course_id
        AND (
          public.is_system_admin()
          OR (
            public.current_user_role() IN ('institutional_administrator', 'focal_person', 'trainer')
            AND public.has_institution_access(c.institution_id)
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = course_materials.course_id
        AND (
          public.is_system_admin()
          OR (
            public.current_user_role() IN ('institutional_administrator', 'focal_person', 'trainer')
            AND public.has_institution_access(c.institution_id)
          )
        )
    )
  );
