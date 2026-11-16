-- Phase B / Migration 0008: Forwarding Summary Storage Upload Policy & Structural Competency Locks

CREATE POLICY "Registrars and admins upload forwarding-summaries objects"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'forwarding-summaries'
    AND (
      public.is_system_admin()
      OR (
        public.current_user_role() IN ('institutional_administrator', 'registrar')
        AND public.has_institution_access(((storage.foldername(name))[1])::uuid)
      )
    )
  );

-- Enforce Master Prompt & legacy rule: structural competency unit/task edits lock once assessments or reviews exist
CREATE OR REPLACE FUNCTION public.guard_competency_unit_structure_lock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_unit_id uuid := COALESCE(OLD.id, NEW.id);
  v_has_activity boolean;
BEGIN
  SELECT (
    EXISTS (
      SELECT 1 FROM public.competency_unit_reviews r
      WHERE r.competency_unit_id = v_unit_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.competency_tasks t
      JOIN public.competency_progress p ON p.competency_task_id = t.id
      WHERE t.competency_unit_id = v_unit_id
    )
  ) INTO v_has_activity;

  IF v_has_activity THEN
    IF TG_OP = 'DELETE'
      OR NEW.unit_number IS DISTINCT FROM OLD.unit_number
      OR NEW.name IS DISTINCT FROM OLD.name THEN
      RAISE EXCEPTION 'Competency unit is locked because assessment progress or unit reviews already exist.';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_guard_competency_unit_structure_lock
  BEFORE UPDATE OR DELETE ON public.competency_units
  FOR EACH ROW EXECUTE FUNCTION public.guard_competency_unit_structure_lock();

CREATE OR REPLACE FUNCTION public.guard_competency_task_structure_lock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_task_id uuid := COALESCE(OLD.id, NEW.id);
  v_unit_id uuid := COALESCE(OLD.competency_unit_id, NEW.competency_unit_id);
  v_has_activity boolean;
BEGIN
  SELECT (
    EXISTS (
      SELECT 1 FROM public.competency_progress p
      WHERE p.competency_task_id = v_task_id
    )
    OR EXISTS (
      SELECT 1 FROM public.competency_unit_reviews r
      WHERE r.competency_unit_id = v_unit_id
    )
  ) INTO v_has_activity;

  IF v_has_activity THEN
    IF TG_OP = 'DELETE'
      OR NEW.task_number IS DISTINCT FROM OLD.task_number
      OR NEW.chart_type IS DISTINCT FROM OLD.chart_type
      OR NEW.name IS DISTINCT FROM OLD.name THEN
      RAISE EXCEPTION 'Competency task is locked because assessment progress or unit reviews already exist.';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_guard_competency_task_structure_lock
  BEFORE UPDATE OR DELETE ON public.competency_tasks
  FOR EACH ROW EXECUTE FUNCTION public.guard_competency_task_structure_lock();
