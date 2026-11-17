-- SECURITY FIX: guard triggers were bypassed for every user.
--
-- These guard functions are SECURITY DEFINER (owned by postgres). Inside such a function
-- `current_user` is the function OWNER, so the test `current_user = 'postgres'` was always
-- true and the guard returned early for everyone: learners could change their own role and
-- account status, assign ULI numbers, publish announcements and self-approve documents.
--
-- The administrative bypass now checks `session_user` (the login role: 'authenticator' for
-- API calls, 'postgres' in the SQL editor), which a SECURITY DEFINER function does not change.
-- service_role API calls are still allowed through `auth.role() = 'service_role'`.
--
-- Also adds the learner_documents review guard (status/remarks/reviewer fields can only be
-- set by registrar/admin roles; learner inserts are forced to 'pending').

CREATE OR REPLACE FUNCTION public.prevent_self_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role'
     OR session_user IN ('postgres', 'supabase_admin')
     OR current_setting('tesda.allow_password_reset', true) = '1' THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_system_admin() THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Forbidden: users cannot modify their own or others authorization role.';
    END IF;
    IF NEW.account_status IS DISTINCT FROM OLD.account_status THEN
      RAISE EXCEPTION 'Forbidden: only authorized administrators may change account_status.';
    END IF;
    IF NEW.password_expiry_exempt IS DISTINCT FROM OLD.password_expiry_exempt THEN
      RAISE EXCEPTION 'Forbidden: cannot modify password expiry exemption.';
    END IF;
    IF NEW.password_expires_at IS DISTINCT FROM OLD.password_expires_at THEN
      RAISE EXCEPTION 'Forbidden: cannot modify password expiration directly.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_uli_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.app_role;
  v_is_confirmed boolean;
BEGIN
  IF auth.role() = 'service_role' OR session_user IN ('postgres', 'supabase_admin') OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF (TG_OP = 'INSERT' AND NEW.uli_number IS NOT NULL AND length(trim(NEW.uli_number)) > 0)
     OR (TG_OP = 'UPDATE' AND NEW.uli_number IS DISTINCT FROM OLD.uli_number) THEN
    v_role := public.current_user_role();
    IF v_role NOT IN ('system_administrator', 'institutional_administrator', 'registrar') THEN
      RAISE EXCEPTION 'Forbidden: only Administrators or Registrars may assign or edit ULI numbers.';
    END IF;

    IF NEW.uli_number IS NOT NULL AND length(trim(NEW.uli_number)) > 0 THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.enrollment_applications ea
        WHERE ea.learner_user_id = NEW.user_id
          AND ea.archived_at IS NULL
          AND ea.application_status = 'confirmed'
      ) INTO v_is_confirmed;

      IF NOT v_is_confirmed THEN
        RAISE EXCEPTION 'Forbidden: ULI issued by TESDA Main can only be encoded after the learner enrollment is Confirmed.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_announcement_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.app_role;
BEGIN
  IF auth.role() = 'service_role' OR session_user IN ('postgres', 'supabase_admin') OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_role := public.current_user_role();
  IF v_role NOT IN ('system_administrator', 'institutional_administrator', 'registrar') THEN
    RAISE EXCEPTION 'Forbidden: only Administrators and Registrars can publish announcements.';
  END IF;

  IF NEW.target_roles IS NULL OR array_length(NEW.target_roles, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one announcement target audience role is required.';
  END IF;

  IF NOT (NEW.target_roles <@ ARRAY['scholar', 'applicant', 'focal_person', 'registrar']::text[]) THEN
    RAISE EXCEPTION 'Invalid target role in announcement.';
  END IF;

  IF v_role = 'registrar' THEN
    IF NOT (NEW.target_roles <@ ARRAY['scholar', 'applicant', 'focal_person']::text[]) THEN
      RAISE EXCEPTION 'Forbidden: Registrars may announce only to Focal Persons and Scholars/Students.';
    END IF;
    IF NEW.audience NOT IN ('scholar', 'focal_person') THEN
      NEW.audience := CASE
        WHEN 'scholar' = ANY(NEW.target_roles) OR 'applicant' = ANY(NEW.target_roles) THEN 'scholar'::public.announcement_audience
        ELSE 'focal_person'::public.announcement_audience
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

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
