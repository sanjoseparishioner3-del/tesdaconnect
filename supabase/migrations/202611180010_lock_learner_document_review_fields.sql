-- Learners may upload and manage their own documents (owner RLS policy is FOR ALL), but the
-- review outcome belongs to authorized staff. Without this guard a learner could set their
-- own document to 'approved' through the API.
--
-- Rules for anyone who is not service_role / postgres / a reviewing role:
--   INSERT: status is always 'pending' and review fields start empty.
--   UPDATE: status, remarks, reviewed_by_user_id and reviewed_at cannot change.

CREATE OR REPLACE FUNCTION public.guard_learner_document_review_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.app_role;
BEGIN
  IF auth.role() = 'service_role' OR session_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  v_role := public.current_user_role();
  IF v_role IN ('system_administrator', 'institutional_administrator', 'registrar') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending';
    NEW.remarks := NULL;
    NEW.reviewed_by_user_id := NULL;
    NEW.reviewed_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.remarks IS DISTINCT FROM OLD.remarks
     OR NEW.reviewed_by_user_id IS DISTINCT FROM OLD.reviewed_by_user_id
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at THEN
    RAISE EXCEPTION 'Forbidden: only the Registrar or an Administrator can review learner documents.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_learner_document_review_fields ON public.learner_documents;
CREATE TRIGGER trg_guard_learner_document_review_fields
  BEFORE INSERT OR UPDATE ON public.learner_documents
  FOR EACH ROW EXECUTE FUNCTION public.guard_learner_document_review_fields();
