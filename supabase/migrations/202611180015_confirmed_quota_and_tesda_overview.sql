-- Quota now counts CONFIRMED scholars (not submissions), and the registrar cannot confirm
-- more scholars than the quota. A scholar who backs out (archived) frees a slot.
--
--  * Scholars can still submit while the period is open, unlocked and not yet full of confirmed scholars.
--  * Confirming a scholar is blocked when the period quota (or the course limit) is already filled.
--    Locking a period does not stop the registrar from confirming scholars who already applied.
--  * When the last slot is confirmed the period locks itself, so no new submissions come in.
--  * Also adds: campus audit trail and the TESDA overview RPC (numbers only, no personal data).
-- Run AFTER 202611180014_add_tesda_viewer_role.sql. Safe to run more than once.

CREATE OR REPLACE FUNCTION public.intake_window_check(
  p_institution_id uuid,
  p_course_id uuid DEFAULT NULL,
  p_exclude_application_id uuid DEFAULT NULL,
  p_lock boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Manila')::date;
  v_period public.intake_periods%ROWTYPE;
  v_total_periods integer;
  v_used integer;
  v_course_quota integer;
  v_course_used integer;
  v_next public.intake_periods%ROWTYPE;
BEGIN
  SELECT count(*) INTO v_total_periods FROM public.intake_periods WHERE institution_id = p_institution_id;

  IF v_total_periods = 0 THEN
    RETURN jsonb_build_object('is_open', true, 'reason', 'no_periods');
  END IF;

  IF p_lock THEN
    SELECT * INTO v_period FROM public.intake_periods
    WHERE institution_id = p_institution_id AND v_today BETWEEN starts_at AND ends_at
    ORDER BY starts_at DESC LIMIT 1
    FOR UPDATE;
  ELSE
    SELECT * INTO v_period FROM public.intake_periods
    WHERE institution_id = p_institution_id AND v_today BETWEEN starts_at AND ends_at
    ORDER BY starts_at DESC LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    SELECT * INTO v_next FROM public.intake_periods
    WHERE institution_id = p_institution_id AND starts_at > v_today
    ORDER BY starts_at ASC LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'is_open', false, 'reason', 'not_started',
        'period_name', v_next.name, 'starts_at', v_next.starts_at, 'ends_at', v_next.ends_at,
        'message', format('Enrollment is closed. The next intake, %s, opens on %s.', v_next.name, to_char(v_next.starts_at, 'Mon DD, YYYY'))
      );
    END IF;
    RETURN jsonb_build_object(
      'is_open', false, 'reason', 'closed_dates',
      'message', 'Enrollment is closed. There is no open intake period right now.'
    );
  END IF;

  SELECT count(*) INTO v_used
  FROM public.enrollment_applications ea
  WHERE ea.institution_id = v_period.institution_id
    AND ea.archived_at IS NULL
    AND ea.application_status = 'confirmed'
    AND (p_exclude_application_id IS NULL OR ea.id <> p_exclude_application_id)
    AND (COALESCE(ea.submitted_at, ea.created_at) AT TIME ZONE 'Asia/Manila')::date BETWEEN v_period.starts_at AND v_period.ends_at;

  IF v_period.is_locked THEN
    RETURN jsonb_build_object(
      'is_open', false, 'reason', 'locked',
      'period_id', v_period.id, 'period_name', v_period.name,
      'starts_at', v_period.starts_at, 'ends_at', v_period.ends_at,
      'quota', v_period.quota, 'used', v_used, 'slots_left', GREATEST(v_period.quota - v_used, 0),
      'message', format('Enrollment for %s is closed by the registrar.', v_period.name)
    );
  END IF;

  IF v_used >= v_period.quota THEN
    RETURN jsonb_build_object(
      'is_open', false, 'reason', 'full',
      'period_id', v_period.id, 'period_name', v_period.name,
      'starts_at', v_period.starts_at, 'ends_at', v_period.ends_at,
      'quota', v_period.quota, 'used', v_used, 'slots_left', 0,
      'message', format('Enrollment for %s is full. All %s slots are taken.', v_period.name, v_period.quota)
    );
  END IF;

  IF p_course_id IS NOT NULL THEN
    SELECT q.quota INTO v_course_quota
    FROM public.intake_course_quotas q
    WHERE q.intake_period_id = v_period.id AND q.course_id = p_course_id;

    IF FOUND THEN
      SELECT count(*) INTO v_course_used
      FROM public.enrollment_applications ea
      WHERE ea.institution_id = v_period.institution_id
        AND ea.course_id = p_course_id
        AND ea.archived_at IS NULL
        AND ea.application_status = 'confirmed'
        AND (p_exclude_application_id IS NULL OR ea.id <> p_exclude_application_id)
        AND (COALESCE(ea.submitted_at, ea.created_at) AT TIME ZONE 'Asia/Manila')::date BETWEEN v_period.starts_at AND v_period.ends_at;

      IF v_course_used >= v_course_quota THEN
        RETURN jsonb_build_object(
          'is_open', false, 'reason', 'course_full',
          'period_id', v_period.id, 'period_name', v_period.name,
          'starts_at', v_period.starts_at, 'ends_at', v_period.ends_at,
          'quota', v_period.quota, 'used', v_used, 'slots_left', GREATEST(v_period.quota - v_used, 0),
          'message', 'The slots for the course you picked are full. Please choose another course or ask the registrar.'
        );
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'is_open', true, 'reason', 'open',
    'period_id', v_period.id, 'period_name', v_period.name,
    'starts_at', v_period.starts_at, 'ends_at', v_period.ends_at,
    'quota', v_period.quota, 'used', v_used, 'slots_left', v_period.quota - v_used
  );
END;
$$;

REVOKE ALL ON FUNCTION public.intake_window_check(uuid, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.intake_period_used(p_period_id uuid, p_course_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM public.intake_periods ip
  JOIN public.enrollment_applications ea ON ea.institution_id = ip.institution_id
  WHERE ip.id = p_period_id
    AND ea.archived_at IS NULL
    AND ea.application_status = 'confirmed'
    AND (p_course_id IS NULL OR ea.course_id = p_course_id)
    AND (COALESCE(ea.submitted_at, ea.created_at) AT TIME ZONE 'Asia/Manila')::date BETWEEN ip.starts_at AND ip.ends_at;
$$;

REVOKE ALL ON FUNCTION public.intake_period_used(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.auto_lock_full_intake_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period public.intake_periods%ROWTYPE;
  v_used integer;
  v_date date;
BEGIN
  IF NEW.application_status <> 'confirmed' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.application_status IS NOT DISTINCT FROM NEW.application_status THEN
    RETURN NEW;
  END IF;

  v_date := (COALESCE(NEW.submitted_at, NEW.created_at) AT TIME ZONE 'Asia/Manila')::date;

  SELECT * INTO v_period FROM public.intake_periods
  WHERE institution_id = NEW.institution_id AND v_date BETWEEN starts_at AND ends_at AND is_locked = false
  ORDER BY starts_at DESC LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_used
  FROM public.enrollment_applications ea
  WHERE ea.institution_id = v_period.institution_id
    AND ea.archived_at IS NULL
    AND ea.application_status = 'confirmed'
    AND (COALESCE(ea.submitted_at, ea.created_at) AT TIME ZONE 'Asia/Manila')::date BETWEEN v_period.starts_at AND v_period.ends_at;

  IF v_used >= v_period.quota THEN
    PERFORM set_config('app.intake_auto_lock', 'on', true);
    UPDATE public.intake_periods SET is_locked = true, locked_at = now(), locked_by_user_id = NULL WHERE id = v_period.id;
    PERFORM set_config('app.intake_auto_lock', 'off', true);
  END IF;

  RETURN NEW;
END;
$$;


-- ---------------------------------------------------------------------------
-- Confirmation check: is there still a free slot for this scholar?
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.intake_confirm_check(
  p_institution_id uuid,
  p_course_id uuid,
  p_exclude_application_id uuid,
  p_applied_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date date := (p_applied_at AT TIME ZONE 'Asia/Manila')::date;
  v_period public.intake_periods%ROWTYPE;
  v_used integer;
  v_course_quota integer;
  v_course_used integer;
BEGIN
  SELECT * INTO v_period FROM public.intake_periods
  WHERE institution_id = p_institution_id AND v_date BETWEEN starts_at AND ends_at
  ORDER BY starts_at DESC LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'no_period');
  END IF;

  SELECT count(*) INTO v_used
  FROM public.enrollment_applications ea
  WHERE ea.institution_id = v_period.institution_id
    AND ea.archived_at IS NULL
    AND ea.application_status = 'confirmed'
    AND ea.id <> p_exclude_application_id
    AND (COALESCE(ea.submitted_at, ea.created_at) AT TIME ZONE 'Asia/Manila')::date BETWEEN v_period.starts_at AND v_period.ends_at;

  IF v_used >= v_period.quota THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'full', 'message',
      format('The quota for %s is already full (%s of %s confirmed). Raise the quota, or wait until a scholar backs out and frees a slot.', v_period.name, v_used, v_period.quota));
  END IF;

  IF p_course_id IS NOT NULL THEN
    SELECT q.quota INTO v_course_quota FROM public.intake_course_quotas q
    WHERE q.intake_period_id = v_period.id AND q.course_id = p_course_id;
    IF FOUND THEN
      SELECT count(*) INTO v_course_used
      FROM public.enrollment_applications ea
      WHERE ea.institution_id = v_period.institution_id
        AND ea.course_id = p_course_id
        AND ea.archived_at IS NULL
        AND ea.application_status = 'confirmed'
        AND ea.id <> p_exclude_application_id
        AND (COALESCE(ea.submitted_at, ea.created_at) AT TIME ZONE 'Asia/Manila')::date BETWEEN v_period.starts_at AND v_period.ends_at;
      IF v_course_used >= v_course_quota THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'course_full', 'message',
          format('The limit for this course is already full (%s of %s confirmed) in %s.', v_course_used, v_course_quota, v_period.name));
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('allowed', true, 'reason', 'open');
END;
$$;

REVOKE ALL ON FUNCTION public.intake_confirm_check(uuid, uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_intake_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NEW.application_status = 'submitted' THEN
    IF TG_OP = 'UPDATE' AND OLD.application_status IN ('submitted', 'returned', 'verified', 'confirmed') THEN
      RETURN NEW;
    END IF;
    v_result := public.intake_window_check(NEW.institution_id, NEW.course_id, NEW.id, true);
    IF NOT (v_result->>'is_open')::boolean THEN
      RAISE EXCEPTION '%', v_result->>'message' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.application_status = 'confirmed' THEN
    IF TG_OP = 'UPDATE' AND OLD.application_status = 'confirmed' THEN
      RETURN NEW;
    END IF;
    v_result := public.intake_confirm_check(NEW.institution_id, NEW.course_id, NEW.id, COALESCE(NEW.submitted_at, NEW.created_at));
    IF NOT (v_result->>'allowed')::boolean THEN
      RAISE EXCEPTION '%', v_result->>'message' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_intake_window ON public.enrollment_applications;
CREATE TRIGGER trg_enforce_intake_window
  BEFORE INSERT OR UPDATE OF application_status ON public.enrollment_applications
  FOR EACH ROW EXECUTE FUNCTION public.enforce_intake_window();

-- The auto-lock trigger now has to react to confirmations.
DROP TRIGGER IF EXISTS trg_auto_lock_full_intake_period ON public.enrollment_applications;
CREATE TRIGGER trg_auto_lock_full_intake_period
  AFTER INSERT OR UPDATE OF application_status ON public.enrollment_applications
  FOR EACH ROW EXECUTE FUNCTION public.auto_lock_full_intake_period();

-- ---------------------------------------------------------------------------
-- Campus audit trail
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_institution_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_actor) THEN
    v_actor := NULL;
  END IF;
  INSERT INTO public.security_audit_logs (actor_user_id, institution_id, event, description, metadata)
  VALUES (
    v_actor, NEW.id,
    CASE WHEN TG_OP = 'INSERT' THEN 'institution.created'
         WHEN NEW.is_active AND NOT OLD.is_active THEN 'institution.activated'
         WHEN NOT NEW.is_active AND OLD.is_active THEN 'institution.deactivated'
         ELSE 'institution.updated' END,
    format('%s campus %s (%s)', CASE WHEN TG_OP = 'INSERT' THEN 'Created' ELSE 'Updated' END, NEW.name, NEW.code),
    jsonb_build_object('code', NEW.code, 'name', NEW.name, 'is_active', NEW.is_active)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_institution_change ON public.institutions;
CREATE TRIGGER trg_audit_institution_change
  AFTER INSERT OR UPDATE ON public.institutions
  FOR EACH ROW EXECUTE FUNCTION public.audit_institution_change();

-- ---------------------------------------------------------------------------
-- TESDA overview: numbers only, one row per training batch, no personal data.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_tesda_overview();
CREATE FUNCTION public.get_tesda_overview()
RETURNS TABLE (
  batch_id uuid,
  institution_code text,
  institution_name text,
  course_name text,
  batch_code text,
  batch_status text,
  starts_at date,
  ends_at date,
  enrolled integer,
  capacity integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_active_user()
     OR public.current_user_role() NOT IN ('system_administrator', 'tesda_viewer') THEN
    RAISE EXCEPTION 'Only TESDA viewers and system administrators can see this overview.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    b.id,
    i.code::text,
    i.name::text,
    c.name::text,
    b.code::text,
    b.status::text,
    b.starts_at,
    b.ends_at,
    (SELECT count(*)::integer FROM public.enrollment_applications ea
      WHERE ea.training_batch_id = b.id AND ea.application_status = 'confirmed' AND ea.archived_at IS NULL),
    b.capacity
  FROM public.training_batches b
  JOIN public.institutions i ON i.id = b.institution_id
  JOIN public.courses c ON c.id = b.course_id
  ORDER BY b.starts_at DESC NULLS LAST, i.code, c.name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_tesda_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tesda_overview() TO authenticated;
