-- Focus the system on the campus that is active now.
--
--  * Mamburao Integrated Farm (MIF) is the active campus. Balli School of Technology (BST) opens next year.
--  * Each campus gets ONE course for now:
--      MIF: Organic Agriculture Production NC II (featured, the course the system highlights)
--      BST: Shielded Metal Arc Welding NC II
--    Other courses of these two campuses are hidden (is_active = false), not deleted, so existing
--    records that point to them keep working. Re-activate any of them later from the Courses page.
-- Safe to run more than once.

ALTER TABLE public.institutions
  ADD COLUMN IF NOT EXISTS operating_status varchar(20) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS display_order smallint NOT NULL DEFAULT 100;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'institutions_operating_status_check') THEN
    ALTER TABLE public.institutions
      ADD CONSTRAINT institutions_operating_status_check CHECK (operating_status IN ('active', 'upcoming'));
  END IF;
END $$;

ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;

UPDATE public.institutions SET operating_status = 'active', display_order = 1 WHERE upper(code) = 'MIF';
UPDATE public.institutions SET operating_status = 'upcoming', display_order = 2 WHERE upper(code) = 'BST';

DO $$
DECLARE
  v_mif uuid;
  v_bst uuid;
  v_course uuid;
BEGIN
  SELECT id INTO v_mif FROM public.institutions WHERE upper(code) = 'MIF';
  SELECT id INTO v_bst FROM public.institutions WHERE upper(code) = 'BST';

  -- MIF: Organic Agriculture Production NC II
  IF v_mif IS NOT NULL THEN
    SELECT id INTO v_course FROM public.courses
    WHERE institution_id = v_mif AND (name ILIKE '%organic agriculture%' OR upper(code) LIKE 'OAP%')
    ORDER BY created_at LIMIT 1;

    IF v_course IS NULL THEN
      INSERT INTO public.courses (institution_id, code, name, qualification_level, is_active, is_featured)
      VALUES (v_mif, 'OAP', 'Organic Agriculture Production NC II', 'NC II', true, true)
      RETURNING id INTO v_course;
    ELSE
      UPDATE public.courses
      SET name = 'Organic Agriculture Production NC II', qualification_level = 'NC II', is_active = true, is_featured = true, archived_at = NULL
      WHERE id = v_course;
    END IF;

    UPDATE public.courses SET is_active = false, is_featured = false WHERE institution_id = v_mif AND id <> v_course;
  END IF;

  -- BST: Shielded Metal Arc Welding NC II
  IF v_bst IS NOT NULL THEN
    SELECT id INTO v_course FROM public.courses
    WHERE institution_id = v_bst AND (name ILIKE '%arc welding%' OR name ILIKE '%smaw%' OR upper(code) LIKE 'SMAW%')
    ORDER BY created_at LIMIT 1;

    IF v_course IS NULL THEN
      INSERT INTO public.courses (institution_id, code, name, qualification_level, is_active, is_featured)
      VALUES (v_bst, 'SMAW', 'Shielded Metal Arc Welding NC II', 'NC II', true, false)
      RETURNING id INTO v_course;
    ELSE
      UPDATE public.courses
      SET name = 'Shielded Metal Arc Welding NC II', qualification_level = 'NC II', is_active = true, is_featured = false, archived_at = NULL
      WHERE id = v_course;
    END IF;

    UPDATE public.courses SET is_active = false, is_featured = false WHERE institution_id = v_bst AND id <> v_course;
  END IF;
END $$;

-- Batch code = course code + NC level + school year + batch number (OAP-NCII-2026-B1).
-- If the course code already ends with the NC level (for example OAP-NCII), it is not repeated.
CREATE OR REPLACE FUNCTION public.apply_batch_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_course public.courses%ROWTYPE;
  v_level text;
  v_code text;
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
  v_code := upper(v_course.code);
  IF v_level <> '' AND regexp_replace(v_code, '[^A-Z0-9]', '', 'g') NOT LIKE '%' || v_level THEN
    v_code := v_code || '-' || v_level;
  END IF;
  NEW.code := v_code || '-' || NEW.school_year || '-B' || NEW.batch_number;

  IF NEW.name IS NULL OR btrim(NEW.name) = '' THEN
    NEW.name := 'Batch ' || NEW.batch_number;
  END IF;

  RETURN NEW;
END;
$$;
