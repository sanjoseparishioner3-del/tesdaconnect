-- Charts become real records: Course > Chart > Unit > Task.
--
-- Every course gets the two standard charts (Progress Chart and Achievement Chart). The Focal Person can add
-- more charts, create Units inside a chart, and create Tasks inside a Unit. Existing units and tasks are moved
-- into the matching chart. Run AFTER 202611180017_add_output_correct_status.sql. Safe to run more than once.

CREATE TABLE IF NOT EXISTS public.competency_charts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  name varchar(100) NOT NULL,
  kind varchar(20) NOT NULL DEFAULT 'custom' CHECK (kind IN ('progress', 'achievement', 'custom')),
  sort_order smallint NOT NULL DEFAULT 0,
  created_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, name)
);

CREATE INDEX IF NOT EXISTS idx_competency_charts_course ON public.competency_charts (course_id, sort_order);

ALTER TABLE public.competency_units
  ADD COLUMN IF NOT EXISTS chart_id uuid REFERENCES public.competency_charts(id) ON DELETE RESTRICT;

-- Task numbers are unique inside a unit; a unit now lives in one chart, so a custom chart type is allowed.
ALTER TABLE public.competency_tasks DROP CONSTRAINT IF EXISTS competency_tasks_chart_type_check;
ALTER TABLE public.competency_tasks
  ADD CONSTRAINT competency_tasks_chart_type_check CHECK (chart_type IN ('progress', 'achievement', 'custom'));

-- Unit numbers are unique inside a chart (before: inside a course).
ALTER TABLE public.competency_units DROP CONSTRAINT IF EXISTS competency_units_course_id_unit_number_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_competency_units_chart_number
  ON public.competency_units (chart_id, unit_number) WHERE chart_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_competency_units_course_number_legacy
  ON public.competency_units (course_id, unit_number) WHERE chart_id IS NULL;

-- ---------------------------------------------------------------------------
-- Standard charts for every course (new and existing)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_default_competency_charts(p_course_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.competency_charts (course_id, name, kind, sort_order)
  VALUES (p_course_id, 'Progress Chart', 'progress', 1), (p_course_id, 'Achievement Chart', 'achievement', 2)
  ON CONFLICT (course_id, name) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_default_competency_charts(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_course_default_charts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_default_competency_charts(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_courses_default_charts ON public.courses;
CREATE TRIGGER trg_courses_default_charts
  AFTER INSERT ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.trg_course_default_charts();

DO $$
DECLARE
  c record;
  u record;
  v_progress uuid;
  v_achievement uuid;
  v_has_progress boolean;
  v_has_achievement boolean;
  v_copy uuid;
BEGIN
  FOR c IN SELECT id FROM public.courses LOOP
    PERFORM public.ensure_default_competency_charts(c.id);
  END LOOP;

  -- Move existing units into the matching chart.
  FOR u IN SELECT id, course_id, unit_number, name, sort_order FROM public.competency_units WHERE chart_id IS NULL ORDER BY course_id, unit_number LOOP
    SELECT id INTO v_progress FROM public.competency_charts WHERE course_id = u.course_id AND kind = 'progress' ORDER BY sort_order LIMIT 1;
    SELECT id INTO v_achievement FROM public.competency_charts WHERE course_id = u.course_id AND kind = 'achievement' ORDER BY sort_order LIMIT 1;
    SELECT EXISTS (SELECT 1 FROM public.competency_tasks t WHERE t.competency_unit_id = u.id AND t.chart_type = 'progress') INTO v_has_progress;
    SELECT EXISTS (SELECT 1 FROM public.competency_tasks t WHERE t.competency_unit_id = u.id AND t.chart_type = 'achievement') INTO v_has_achievement;

    IF v_has_achievement AND NOT v_has_progress THEN
      UPDATE public.competency_units SET chart_id = v_achievement WHERE id = u.id;
    ELSE
      UPDATE public.competency_units SET chart_id = v_progress WHERE id = u.id;
      IF v_has_achievement THEN
        -- The unit had tasks in both charts: give the achievement tasks their own copy of the unit.
        INSERT INTO public.competency_units (course_id, chart_id, unit_number, name, sort_order)
        VALUES (u.course_id, v_achievement, u.unit_number, u.name, u.sort_order)
        RETURNING id INTO v_copy;
        UPDATE public.competency_tasks SET competency_unit_id = v_copy WHERE competency_unit_id = u.id AND chart_type = 'achievement';
      END IF;
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Access: everyone active can read charts; only the Focal Person of the campus manages them
-- ---------------------------------------------------------------------------
ALTER TABLE public.competency_charts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Active users view competency charts" ON public.competency_charts;
CREATE POLICY "Active users view competency charts"
  ON public.competency_charts FOR SELECT
  TO authenticated
  USING (public.is_active_user());

DROP POLICY IF EXISTS "Only focal person manages competency charts" ON public.competency_charts;
CREATE POLICY "Only focal person manages competency charts"
  ON public.competency_charts FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = competency_charts.course_id
        AND public.current_user_role() = 'focal_person'
        AND public.has_institution_access(c.institution_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.courses c
      WHERE c.id = competency_charts.course_id
        AND public.current_user_role() = 'focal_person'
        AND public.has_institution_access(c.institution_id)
    )
  );

-- A unit must sit in a chart of its own course, and a task's chart type follows its unit's chart.
CREATE OR REPLACE FUNCTION public.guard_competency_chart_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chart public.competency_charts%ROWTYPE;
BEGIN
  IF TG_TABLE_NAME = 'competency_units' THEN
    IF NEW.chart_id IS NOT NULL THEN
      SELECT * INTO v_chart FROM public.competency_charts WHERE id = NEW.chart_id;
      IF NOT FOUND OR v_chart.course_id <> NEW.course_id THEN
        RAISE EXCEPTION 'That chart belongs to a different course.' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'competency_tasks' THEN
    SELECT ch.* INTO v_chart
    FROM public.competency_units cu JOIN public.competency_charts ch ON ch.id = cu.chart_id
    WHERE cu.id = NEW.competency_unit_id;
    IF FOUND THEN
      NEW.chart_type := v_chart.kind;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_competency_units_chart ON public.competency_units;
CREATE TRIGGER trg_guard_competency_units_chart
  BEFORE INSERT OR UPDATE OF chart_id, course_id ON public.competency_units
  FOR EACH ROW EXECUTE FUNCTION public.guard_competency_chart_links();

DROP TRIGGER IF EXISTS trg_guard_competency_tasks_chart ON public.competency_tasks;
CREATE TRIGGER trg_guard_competency_tasks_chart
  BEFORE INSERT OR UPDATE OF competency_unit_id ON public.competency_tasks
  FOR EACH ROW EXECUTE FUNCTION public.guard_competency_chart_links();
