-- Phase B / Migration 0002: Courses, Intake Periods, Quotas, Training Batches & Trainer Assignments

CREATE TABLE public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id bigint UNIQUE,
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  code varchar(40) NOT NULL,
  name varchar(255) NOT NULL,
  qualification_level varchar(30),
  training_hours integer,
  description text,
  requirements text,
  curriculum_reference varchar(500),
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, code)
);

CREATE TRIGGER trg_courses_touch
  BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.touch_version_and_updated_at();

CREATE TABLE public.intake_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id bigint UNIQUE,
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  code varchar(40) NOT NULL UNIQUE,
  name varchar(120) NOT NULL,
  starts_at date NOT NULL,
  ends_at date NOT NULL,
  quota integer NOT NULL DEFAULT 100 CHECK (quota >= 0),
  is_locked boolean NOT NULL DEFAULT false,
  locked_at timestamptz,
  locked_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at >= starts_at)
);

CREATE INDEX idx_intake_periods_inst_dates ON public.intake_periods (institution_id, starts_at, ends_at);

CREATE TRIGGER trg_intake_periods_touch
  BEFORE UPDATE ON public.intake_periods
  FOR EACH ROW EXECUTE FUNCTION public.touch_version_and_updated_at();

CREATE TABLE public.intake_course_quotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id bigint UNIQUE,
  intake_period_id uuid NOT NULL REFERENCES public.intake_periods(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  quota integer NOT NULL DEFAULT 1 CHECK (quota >= 1),
  created_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (intake_period_id, course_id)
);

CREATE TABLE public.training_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id bigint UNIQUE,
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  code varchar(40) NOT NULL UNIQUE,
  name varchar(255) NOT NULL,
  capacity integer NOT NULL DEFAULT 25 CHECK (capacity BETWEEN 1 AND 5000),
  scheduled_hours integer CHECK (scheduled_hours IS NULL OR scheduled_hours >= 0),
  starts_at date,
  ends_at date,
  next_class_at timestamptz,
  venue varchar(255),
  status public.batch_status NOT NULL DEFAULT 'upcoming',
  archived_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at)
);

CREATE INDEX idx_training_batches_inst_status ON public.training_batches (institution_id, status);
CREATE INDEX idx_training_batches_next_class ON public.training_batches (next_class_at);

CREATE TRIGGER trg_training_batches_touch
  BEFORE UPDATE ON public.training_batches
  FOR EACH ROW EXECUTE FUNCTION public.touch_version_and_updated_at();

-- Explicit Trainer-to-Batch assignments supporting Trainer role scoping
CREATE TABLE public.batch_trainers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  training_batch_id uuid NOT NULL REFERENCES public.training_batches(id) ON DELETE CASCADE,
  trainer_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_lead boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (training_batch_id, trainer_user_id)
);

CREATE INDEX idx_batch_trainers_user ON public.batch_trainers (trainer_user_id);

-- Helper: returns true if user is assigned trainer for a batch OR scoped focal/registrar/admin
CREATE OR REPLACE FUNCTION public.can_manage_batch(target_batch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.training_batches tb
    WHERE tb.id = target_batch_id
      AND (
        public.is_system_admin()
        OR (
          public.current_user_role() IN ('institutional_administrator', 'focal_person')
          AND public.has_institution_access(tb.institution_id)
        )
        OR (
          public.current_user_role() = 'trainer'
          AND EXISTS (
            SELECT 1 FROM public.batch_trainers bt
            WHERE bt.training_batch_id = tb.id
              AND bt.trainer_user_id = auth.uid()
          )
        )
      )
  );
$$;

-- Helper: checks batch schedule overlaps in same institution & venue across active dates
CREATE OR REPLACE FUNCTION public.detect_batch_schedule_conflicts(
  p_institution_id uuid,
  p_venue varchar,
  p_starts_at date,
  p_ends_at date,
  p_exclude_batch_id uuid DEFAULT NULL
)
RETURNS TABLE (
  conflicting_batch_id uuid,
  conflicting_code varchar,
  conflicting_name varchar,
  starts_at date,
  ends_at date,
  venue varchar
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tb.id, tb.code, tb.name, tb.starts_at, tb.ends_at, tb.venue
  FROM public.training_batches tb
  WHERE tb.institution_id = p_institution_id
    AND tb.archived_at IS NULL
    AND tb.status IN ('upcoming', 'in_training')
    AND (p_exclude_batch_id IS NULL OR tb.id <> p_exclude_batch_id)
    AND p_venue IS NOT NULL AND length(trim(p_venue)) > 0
    AND lower(trim(COALESCE(tb.venue, ''))) = lower(trim(p_venue))
    AND tb.starts_at IS NOT NULL AND tb.ends_at IS NOT NULL
    AND daterange(tb.starts_at, tb.ends_at, '[]') && daterange(p_starts_at, p_ends_at, '[]');
$$;

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intake_course_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_trainers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated active users read courses"
  ON public.courses FOR SELECT
  TO authenticated
  USING (public.is_active_user() AND (is_active = true OR public.has_institution_access(institution_id)));

CREATE POLICY "Focal, institutional admin, and sysadmin manage courses"
  ON public.courses FOR ALL
  TO authenticated
  USING (
    public.is_system_admin()
    OR (
      public.current_user_role() IN ('institutional_administrator', 'focal_person')
      AND public.has_institution_access(institution_id)
    )
  )
  WITH CHECK (
    public.is_system_admin()
    OR (
      public.current_user_role() IN ('institutional_administrator', 'focal_person')
      AND public.has_institution_access(institution_id)
    )
  );

CREATE POLICY "Active users view intake periods"
  ON public.intake_periods FOR SELECT
  TO authenticated
  USING (public.is_active_user());

CREATE POLICY "Registrars and admins manage intake periods"
  ON public.intake_periods FOR ALL
  TO authenticated
  USING (
    public.is_system_admin()
    OR (
      public.current_user_role() IN ('institutional_administrator', 'registrar')
      AND public.has_institution_access(institution_id)
    )
  )
  WITH CHECK (
    public.is_system_admin()
    OR (
      public.current_user_role() IN ('institutional_administrator', 'registrar')
      AND public.has_institution_access(institution_id)
    )
  );

CREATE POLICY "Active users view course quotas"
  ON public.intake_course_quotas FOR SELECT
  TO authenticated
  USING (public.is_active_user());

CREATE POLICY "Registrars and admins manage course quotas"
  ON public.intake_course_quotas FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.intake_periods ip
      WHERE ip.id = intake_course_quotas.intake_period_id
        AND (
          public.is_system_admin()
          OR (
            public.current_user_role() IN ('institutional_administrator', 'registrar')
            AND public.has_institution_access(ip.institution_id)
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.intake_periods ip
      WHERE ip.id = intake_course_quotas.intake_period_id
        AND (
          public.is_system_admin()
          OR (
            public.current_user_role() IN ('institutional_administrator', 'registrar')
            AND public.has_institution_access(ip.institution_id)
          )
        )
    )
  );

CREATE POLICY "Active users view institutional schedules"
  ON public.training_batches FOR SELECT
  TO authenticated
  USING (public.is_active_user() AND (archived_at IS NULL OR public.has_institution_access(institution_id)));

CREATE POLICY "Focal, institutional admin, and sysadmin manage batches"
  ON public.training_batches FOR ALL
  TO authenticated
  USING (
    public.is_system_admin()
    OR (
      public.current_user_role() IN ('institutional_administrator', 'focal_person')
      AND public.has_institution_access(institution_id)
    )
  )
  WITH CHECK (
    public.is_system_admin()
    OR (
      public.current_user_role() IN ('institutional_administrator', 'focal_person')
      AND public.has_institution_access(institution_id)
    )
  );

CREATE POLICY "Scoped read of batch trainers"
  ON public.batch_trainers FOR SELECT
  TO authenticated
  USING (
    trainer_user_id = auth.uid()
    OR public.can_manage_batch(training_batch_id)
  );

CREATE POLICY "Focal and admins assign batch trainers"
  ON public.batch_trainers FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.training_batches tb
      WHERE tb.id = batch_trainers.training_batch_id
        AND (
          public.is_system_admin()
          OR (
            public.current_user_role() IN ('institutional_administrator', 'focal_person')
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
            public.current_user_role() IN ('institutional_administrator', 'focal_person')
            AND public.has_institution_access(tb.institution_id)
          )
        )
    )
  );
