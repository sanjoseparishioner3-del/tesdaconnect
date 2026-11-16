-- Phase B / Migration 0007: Server-Enforced Self Password Rotation RPC
-- Allows active users to clear force_password_change and rotate password_expires_at cleanly
-- without allowing arbitrary direct updates to password_expires_at via client PostgREST calls.

CREATE OR REPLACE FUNCTION public.prevent_self_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role'
     OR current_user = 'postgres'
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

CREATE OR REPLACE FUNCTION public.complete_own_password_change()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_next_expiry timestamptz := now() + interval '90 days';
BEGIN
  IF v_uid IS NULL OR NOT public.is_active_user() THEN
    RAISE EXCEPTION 'Forbidden: active authenticated account required.';
  END IF;

  PERFORM set_config('tesda.allow_password_reset', '1', true);

  UPDATE public.profiles
  SET
    force_password_change = false,
    password_expires_at = v_next_expiry
  WHERE id = v_uid;

  INSERT INTO public.security_audit_logs (actor_user_id, event, description, metadata)
  VALUES (
    v_uid,
    'password_rotated',
    'User completed required password rotation.',
    jsonb_build_object('next_expiry', v_next_expiry)
  );

  RETURN v_next_expiry;
END;
$$;
