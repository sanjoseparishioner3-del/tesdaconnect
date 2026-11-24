-- Enforce enrollment intake periods and quotas.
--
-- Before this migration, intake periods and quotas were informational only: a scholar could submit
-- after the period ended, after the registrar locked it, or after every slot was taken.
--
-- Rules (defaults):
--  * A campus with NO intake periods at all keeps enrollment open (nothing to enforce).
--  * A campus WITH periods accepts new submissions only while today (Asia/Manila) falls inside an
--    unlocked period that still has free slots.
--  * Slots used = applications of that campus submitted inside the period dates whose status is
--    submitted, verified or confirmed. Drafts, returned and archived applications do not use a slot.
--  * A returned application that is re-submitted is not blocked (the scholar was already accepted once).
--  * An optional per-course quota can cap a single course inside a period.
--  * When the last slot is taken the period locks itself.
--
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- Core check (internal; not callable by app users)
-- ---------------------------------------------------------------------------
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
    AND ea.application_status IN ('submitted', 'verified', 'confirmed')
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
        AND ea.application_status IN ('submitted', 'verified', 'confirmed')
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

-- ---------------------------------------------------------------------------
-- Enforcement on enrollment applications
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_intake_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NEW.application_status IS DISTINCT FROM 'submitted' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Only a new submission is checked. Re-submitting a returned application and edits to an
    -- already submitted one are never blocked.
    IF OLD.application_status IN ('submitted', 'returned', 'verified', 'confirmed') THEN
      RETURN NEW;
    END IF;
  END IF;

  v_result := public.intake_window_check(NEW.institution_id, NEW.course_id, NEW.id, true);
  IF NOT (v_result->>'is_open')::boolean THEN
    RAISE EXCEPTION '%', v_result->>'message' USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_intake_window ON public.enrollment_applications;
CREATE TRIGGER trg_enforce_intake_window
  BEFORE INSERT OR UPDATE OF application_status ON public.enrollment_applications
  FOR EACH ROW EXECUTE FUNCTION public.enforce_intake_window();

-- Lock the period automatically once the last slot is taken. This has to happen AFTER the row is
-- saved: raising an error from the BEFORE trigger would roll back the lock as well.
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
  IF NEW.application_status NOT IN ('submitted', 'verified', 'confirmed') THEN
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
    AND ea.application_status IN ('submitted', 'verified', 'confirmed')
    AND (COALESCE(ea.submitted_at, ea.created_at) AT TIME ZONE 'Asia/Manila')::date BETWEEN v_period.starts_at AND v_period.ends_at;

  IF v_used >= v_period.quota THEN
    PERFORM set_config('app.intake_auto_lock', 'on', true);
    UPDATE public.intake_periods SET is_locked = true, locked_at = now(), locked_by_user_id = NULL WHERE id = v_period.id;
    PERFORM set_config('app.intake_auto_lock', 'off', true);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_lock_full_intake_period ON public.enrollment_applications;
CREATE TRIGGER trg_auto_lock_full_intake_period
  AFTER INSERT OR UPDATE OF application_status ON public.enrollment_applications
  FOR EACH ROW EXECUTE FUNCTION public.auto_lock_full_intake_period();

-- ---------------------------------------------------------------------------
-- Guards on the periods themselves
-- ---------------------------------------------------------------------------
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
    AND ea.application_status IN ('submitted', 'verified', 'confirmed')
    AND (p_course_id IS NULL OR ea.course_id = p_course_id)
    AND (COALESCE(ea.submitted_at, ea.created_at) AT TIME ZONE 'Asia/Manila')::date BETWEEN ip.starts_at AND ip.ends_at;
$$;

REVOKE ALL ON FUNCTION public.intake_period_used(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_intake_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_used integer;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF public.intake_period_used(OLD.id) > 0 THEN
      RAISE EXCEPTION 'This intake period already has applications and cannot be deleted. Lock it instead.' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.quota < 0 THEN
    RAISE EXCEPTION 'The quota cannot be negative.' USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'INSERT' OR NEW.starts_at IS DISTINCT FROM OLD.starts_at
     OR NEW.ends_at IS DISTINCT FROM OLD.ends_at OR NEW.institution_id IS DISTINCT FROM OLD.institution_id THEN
    IF EXISTS (
      SELECT 1 FROM public.intake_periods o
      WHERE o.institution_id = NEW.institution_id
        AND o.id <> NEW.id
        AND o.starts_at <= NEW.ends_at
        AND o.ends_at >= NEW.starts_at
    ) THEN
      RAISE EXCEPTION 'These dates overlap another intake period of the same campus. Pick dates that do not overlap.' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    v_used := public.intake_period_used(NEW.id);

    IF NEW.quota IS DISTINCT FROM OLD.quota AND NEW.quota < v_used THEN
      RAISE EXCEPTION 'The quota cannot be lower than the % applications already counted.', v_used USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.is_locked AND NOT NEW.is_locked AND v_used >= NEW.quota THEN
      RAISE EXCEPTION 'All % slots are used. Raise the quota first, then unlock.', NEW.quota USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_intake_period ON public.intake_periods;
CREATE TRIGGER trg_guard_intake_period
  BEFORE INSERT OR UPDATE OR DELETE ON public.intake_periods
  FOR EACH ROW EXECUTE FUNCTION public.guard_intake_period();

CREATE OR REPLACE FUNCTION public.guard_intake_course_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period public.intake_periods%ROWTYPE;
  v_course_institution uuid;
  v_used integer;
BEGIN
  SELECT * INTO v_period FROM public.intake_periods WHERE id = NEW.intake_period_id;
  SELECT institution_id INTO v_course_institution FROM public.courses WHERE id = NEW.course_id;

  IF v_course_institution IS DISTINCT FROM v_period.institution_id THEN
    RAISE EXCEPTION 'That course does not belong to the same campus as this intake period.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.quota > v_period.quota THEN
    RAISE EXCEPTION 'A course quota cannot be higher than the period total of %.', v_period.quota USING ERRCODE = 'check_violation';
  END IF;

  v_used := public.intake_period_used(NEW.intake_period_id, NEW.course_id);
  IF NEW.quota < v_used THEN
    RAISE EXCEPTION 'The course quota cannot be lower than the % applications already counted for it.', v_used USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_intake_course_quota ON public.intake_course_quotas;
CREATE TRIGGER trg_guard_intake_course_quota
  BEFORE INSERT OR UPDATE ON public.intake_course_quotas
  FOR EACH ROW EXECUTE FUNCTION public.guard_intake_course_quota();

-- ---------------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_intake_period()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event text;
  v_desc text;
  v_row public.intake_periods%ROWTYPE;
  v_actor uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_row := NEW; v_event := 'intake_period.created'; v_desc := format('Created intake period %s (%s)', NEW.name, NEW.code);
  ELSIF TG_OP = 'DELETE' THEN
    v_row := OLD; v_event := 'intake_period.deleted'; v_desc := format('Deleted intake period %s (%s)', OLD.name, OLD.code);
  ELSE
    v_row := NEW;
    IF NEW.is_locked AND NOT OLD.is_locked THEN
      v_event := CASE WHEN current_setting('app.intake_auto_lock', true) = 'on' THEN 'intake_period.auto_locked' ELSE 'intake_period.locked' END;
      v_desc := format('Locked intake period %s (%s)', NEW.name, NEW.code);
    ELSIF OLD.is_locked AND NOT NEW.is_locked THEN
      v_event := 'intake_period.unlocked'; v_desc := format('Unlocked intake period %s (%s)', NEW.name, NEW.code);
    ELSE
      v_event := 'intake_period.updated'; v_desc := format('Updated intake period %s (%s)', NEW.name, NEW.code);
    END IF;
  END IF;

  -- An automatic lock is done by the system, not by the scholar whose submission filled the last slot.
  IF v_event = 'intake_period.auto_locked'
     OR (v_actor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_actor)) THEN
    v_actor := NULL;
  END IF;

  INSERT INTO public.security_audit_logs (actor_user_id, institution_id, event, description, metadata)
  VALUES (
    v_actor, v_row.institution_id, v_event, v_desc,
    jsonb_build_object(
      'period_id', v_row.id, 'code', v_row.code, 'name', v_row.name,
      'starts_at', v_row.starts_at, 'ends_at', v_row.ends_at, 'quota', v_row.quota, 'is_locked', v_row.is_locked,
      'previous', CASE WHEN TG_OP = 'UPDATE'
        THEN jsonb_build_object('name', OLD.name, 'starts_at', OLD.starts_at, 'ends_at', OLD.ends_at, 'quota', OLD.quota, 'is_locked', OLD.is_locked)
        ELSE NULL END
    )
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_intake_period ON public.intake_periods;
CREATE TRIGGER trg_audit_intake_period
  AFTER INSERT OR UPDATE OR DELETE ON public.intake_periods
  FOR EACH ROW EXECUTE FUNCTION public.audit_intake_period();

CREATE OR REPLACE FUNCTION public.audit_intake_course_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.intake_course_quotas%ROWTYPE;
  v_inst uuid;
  v_actor uuid := auth.uid();
  v_event text;
BEGIN
  IF TG_OP = 'DELETE' THEN v_row := OLD; v_event := 'intake_course_quota.removed';
  ELSIF TG_OP = 'INSERT' THEN v_row := NEW; v_event := 'intake_course_quota.set';
  ELSE v_row := NEW; v_event := 'intake_course_quota.changed'; END IF;

  SELECT institution_id INTO v_inst FROM public.intake_periods WHERE id = v_row.intake_period_id;
  IF v_actor IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_actor) THEN
    v_actor := NULL;
  END IF;

  -- When a whole period is deleted its course quotas cascade; the period delete is already logged.
  IF v_inst IS NOT NULL THEN
    INSERT INTO public.security_audit_logs (actor_user_id, institution_id, event, description, metadata)
    VALUES (v_actor, v_inst, v_event, 'Course quota ' || replace(v_event, 'intake_course_quota.', ''),
      jsonb_build_object('period_id', v_row.intake_period_id, 'course_id', v_row.course_id, 'quota', v_row.quota));
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_intake_course_quota ON public.intake_course_quotas;
CREATE TRIGGER trg_audit_intake_course_quota
  AFTER INSERT OR UPDATE OR DELETE ON public.intake_course_quotas
  FOR EACH ROW EXECUTE FUNCTION public.audit_intake_course_quota();

-- ---------------------------------------------------------------------------
-- RPCs used by the app
-- ---------------------------------------------------------------------------

-- Staff: how many slots each period of a campus has used (total and per course).
CREATE OR REPLACE FUNCTION public.get_intake_usage(p_institution_id uuid DEFAULT NULL)
RETURNS TABLE (period_id uuid, used integer, course_usage jsonb)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_active_user()
     OR public.current_user_role() NOT IN ('system_administrator', 'institutional_administrator', 'registrar', 'focal_person') THEN
    RAISE EXCEPTION 'Only staff can view intake usage.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    ip.id,
    public.intake_period_used(ip.id),
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('course_id', q.course_id, 'used', public.intake_period_used(ip.id, q.course_id)))
      FROM public.intake_course_quotas q WHERE q.intake_period_id = ip.id
    ), '[]'::jsonb)
  FROM public.intake_periods ip
  WHERE public.has_institution_access(ip.institution_id)
    AND (p_institution_id IS NULL OR ip.institution_id = p_institution_id);
END;
$$;

-- Any signed-in active user: is enrollment open for this campus right now?
CREATE OR REPLACE FUNCTION public.get_enrollment_window(p_institution_id uuid, p_course_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_active_user() THEN
    RAISE EXCEPTION 'Sign in to check enrollment.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public.intake_window_check(p_institution_id, p_course_id, NULL, false);
END;
$$;

REVOKE ALL ON FUNCTION public.get_intake_usage(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_enrollment_window(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_intake_usage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_enrollment_window(uuid, uuid) TO authenticated;
