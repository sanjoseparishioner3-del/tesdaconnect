-- Batch management rules
--
--  * The Registrar creates batches (Administrators keep managing them). A batch has a school year and a
--    batch number (1 to 6 per course and school year). Its code is built by the database, for example
--    OAP-NCII-2026-B1 = course code + NC level + school year + batch number.
--  * A batch takes at most 25 scholars.
--  * When the Registrar confirms a scholar, the scholar is placed automatically in the first open batch of
--    their course (Batch 1, then Batch 2, ...). A full batch is closed to new scholars automatically.
--  * When the next batch starts to be used, the Registrar is asked to continue (error text starts with
--    BATCH_NEXT:). When every batch is full the confirmation is refused (error text starts with
--    ALL_BATCHES_FULL:) and the Registrar returns the form instead.
--  * A course with no batches at all can still be confirmed (nothing to assign yet).
-- Safe to run more than once.

ALTER TABLE public.training_batches
  ADD COLUMN IF NOT EXISTS school_year varchar(9),
  ADD COLUMN IF NOT EXISTS batch_number smallint;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'training_batches_batch_number_range') THEN
    ALTER TABLE public.training_batches
      ADD CONSTRAINT training_batches_batch_number_range CHECK (batch_number IS NULL OR batch_number BETWEEN 1 AND 6);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_training_batches_course_year_number
  ON public.training_batches (course_id, school_year, batch_number)
  WHERE school_year IS NOT NULL AND batch_number IS NOT NULL AND archived_at IS NULL;

-- ---------------------------------------------------------------------------
-- Code, name and size rules for batches that use the school year + number format
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_batch_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course public.courses%ROWTYPE;
  v_level text;
BEGIN
  IF NEW.school_year IS NULL OR NEW.batch_number IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.school_year !~ '^[0-9]{4}(-[0-9]{4})?$' THEN
    RAISE EXCEPTION 'Enter the school year like 2026 or 2026-2027.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_course FROM public.courses WHERE id = NEW.course_id;
  IF NOT FOUND OR v_course.institution_id <> NEW.institution_id THEN
    RAISE EXCEPTION 'That course does not belong to this campus.' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.capacity > 25 THEN
    RAISE EXCEPTION 'A batch can take at most 25 scholars.' USING ERRCODE = 'check_violation';
  END IF;

  v_level := regexp_replace(upper(COALESCE(v_course.qualification_level, '')), '[^A-Z0-9]', '', 'g');
  NEW.code := upper(v_course.code)
    || CASE WHEN v_level <> '' THEN '-' || v_level ELSE '' END
    || '-' || NEW.school_year || '-B' || NEW.batch_number;

  IF NEW.name IS NULL OR btrim(NEW.name) = '' THEN
    NEW.name := 'Batch ' || NEW.batch_number;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_batch_rules ON public.training_batches;
CREATE TRIGGER trg_apply_batch_rules
  BEFORE INSERT OR UPDATE OF school_year, batch_number, course_id, capacity ON public.training_batches
  FOR EACH ROW EXECUTE FUNCTION public.apply_batch_rules();

CREATE OR REPLACE FUNCTION public.guard_batch_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.enrollment_applications WHERE training_batch_id = OLD.id) THEN
    RAISE EXCEPTION 'This batch already has scholars and cannot be deleted.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_batch_delete ON public.training_batches;
CREATE TRIGGER trg_guard_batch_delete
  BEFORE DELETE ON public.training_batches
  FOR EACH ROW EXECUTE FUNCTION public.guard_batch_delete();

-- The Registrar creates batches. Update and delete stay with the Administrators.
DROP POLICY IF EXISTS "Registrars create training batches" ON public.training_batches;
CREATE POLICY "Registrars create training batches"
  ON public.training_batches FOR INSERT
  TO authenticated
  WITH CHECK (
    public.current_user_role() = 'registrar'
    AND public.has_institution_access(institution_id)
  );

-- ---------------------------------------------------------------------------
-- A batch can never hold more confirmed scholars than its capacity
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_batch_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_capacity integer;
  v_name text;
  v_count integer;
BEGIN
  IF NEW.training_batch_id IS NULL OR NEW.application_status <> 'confirmed' OR NEW.archived_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.application_status = 'confirmed' AND OLD.training_batch_id IS NOT DISTINCT FROM NEW.training_batch_id THEN
    RETURN NEW;
  END IF;

  SELECT capacity, name INTO v_capacity, v_name FROM public.training_batches WHERE id = NEW.training_batch_id FOR UPDATE;
  SELECT count(*) INTO v_count FROM public.enrollment_applications ea
  WHERE ea.training_batch_id = NEW.training_batch_id AND ea.application_status = 'confirmed'
    AND ea.archived_at IS NULL AND ea.id <> NEW.id;

  IF v_count >= v_capacity THEN
    RAISE EXCEPTION '% is full (% of % scholars).', v_name, v_count, v_capacity USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_batch_capacity ON public.enrollment_applications;
CREATE TRIGGER trg_guard_batch_capacity
  BEFORE INSERT OR UPDATE OF training_batch_id, application_status ON public.enrollment_applications
  FOR EACH ROW EXECUTE FUNCTION public.guard_batch_capacity();

-- ---------------------------------------------------------------------------
-- Confirm a scholar and place them in the first open batch of their course
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.confirm_enrollment_application(uuid);

CREATE OR REPLACE FUNCTION public.confirm_enrollment_application(p_application_id uuid, p_accept_next_batch boolean DEFAULT false)
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
  v_has_batches boolean := false;
  v_batch public.training_batches;
  v_batch_count integer;
  v_prev_name text;
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

  -- First come, first served: choose the first open batch of the scholar's course.
  IF v_app.course_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_app.course_id::text, 0));

    SELECT EXISTS (
      SELECT 1 FROM public.training_batches b
      WHERE b.institution_id = v_app.institution_id AND b.course_id = v_app.course_id
        AND b.archived_at IS NULL AND b.status IN ('upcoming', 'in_training')
    ) INTO v_has_batches;

    IF v_has_batches THEN
      SELECT b.* INTO v_batch
      FROM public.training_batches b
      WHERE b.institution_id = v_app.institution_id AND b.course_id = v_app.course_id
        AND b.archived_at IS NULL AND b.status IN ('upcoming', 'in_training')
        AND (
          SELECT count(*) FROM public.enrollment_applications ea
          WHERE ea.training_batch_id = b.id AND ea.application_status = 'confirmed' AND ea.archived_at IS NULL
        ) < b.capacity
      ORDER BY b.school_year DESC NULLS LAST, b.batch_number ASC NULLS LAST, b.created_at ASC
      LIMIT 1;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'ALL_BATCHES_FULL: Every open batch for this course is full. You cannot confirm more scholars now. Return this registration with a message to apply again when a new batch opens.';
      END IF;

      IF NOT p_accept_next_batch AND v_batch.batch_number IS NOT NULL THEN
        SELECT count(*) INTO v_batch_count FROM public.enrollment_applications ea
        WHERE ea.training_batch_id = v_batch.id AND ea.application_status = 'confirmed' AND ea.archived_at IS NULL;

        IF v_batch_count = 0 THEN
          SELECT b2.name INTO v_prev_name
          FROM public.training_batches b2
          WHERE b2.institution_id = v_batch.institution_id AND b2.course_id = v_batch.course_id
            AND b2.school_year IS NOT DISTINCT FROM v_batch.school_year
            AND b2.batch_number < v_batch.batch_number
            AND b2.archived_at IS NULL AND b2.status IN ('upcoming', 'in_training')
          ORDER BY b2.batch_number DESC LIMIT 1;

          IF v_prev_name IS NOT NULL THEN
            RAISE EXCEPTION 'BATCH_NEXT: % is full. Continue and assign this scholar to %?', v_prev_name, v_batch.name;
          END IF;
        END IF;
      END IF;
    END IF;
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
    scholar_id = v_scholar_id,
    training_batch_id = COALESCE(v_batch.id, training_batch_id)
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
      || CASE WHEN v_batch.id IS NOT NULL THEN ' and placed in ' || v_batch.code ELSE '' END
  );

  RETURN v_app;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_enrollment_application(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_enrollment_application(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- How full each batch is (staff only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_batch_fill(p_institution_id uuid DEFAULT NULL)
RETURNS TABLE (batch_id uuid, enrolled integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_active_user()
     OR public.current_user_role() NOT IN ('system_administrator', 'institutional_administrator', 'registrar', 'focal_person', 'trainer') THEN
    RAISE EXCEPTION 'Only staff can view batch numbers.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT b.id,
    (SELECT count(*)::integer FROM public.enrollment_applications ea
      WHERE ea.training_batch_id = b.id AND ea.application_status = 'confirmed' AND ea.archived_at IS NULL)
  FROM public.training_batches b
  WHERE public.has_institution_access(b.institution_id)
    AND (p_institution_id IS NULL OR b.institution_id = p_institution_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_batch_fill(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_batch_fill(uuid) TO authenticated;
