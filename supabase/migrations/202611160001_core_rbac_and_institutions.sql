-- Phase B / Migration 0001: Core Types, Institutions, Profiles, RBAC & Security Helpers
-- Target Platform: Supabase PostgreSQL 15+

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Canonical Enums (reconciling legacy contradictions such as ongoing vs in_training)
CREATE TYPE public.app_role AS ENUM (
  'system_administrator',
  'institutional_administrator',
  'registrar',
  'focal_person',
  'trainer',
  'applicant',
  'scholar'
);

CREATE TYPE public.account_status AS ENUM (
  'active',
  'inactive',
  'pending_approval'
);

CREATE TYPE public.application_status AS ENUM (
  'draft',
  'submitted',
  'returned',
  'verified',
  'confirmed',
  'archived'
);

CREATE TYPE public.document_status AS ENUM (
  'pending',
  'approved',
  'rejected'
);

CREATE TYPE public.batch_status AS ENUM (
  'upcoming',
  'in_training',
  'completed',
  'cancelled'
);

CREATE TYPE public.competency_status AS ENUM (
  'not_assessed',
  'competent',
  'not_yet_competent'
);

CREATE TYPE public.unit_review_status AS ENUM (
  'pending_review',
  'verified',
  'returned'
);

CREATE TYPE public.report_submission_status AS ENUM (
  'draft',
  'reviewed',
  'finalized',
  'submitted'
);

CREATE TYPE public.attendance_status AS ENUM (
  'present',
  'absent',
  'late'
);

CREATE TYPE public.certificate_status AS ENUM (
  'not_completed',
  'eligible',
  'issued',
  'revoked'
);

CREATE TYPE public.announcement_audience AS ENUM (
  'all',
  'scholar',
  'focal_person',
  'staff'
);

-- Shared trigger helper for optimistic locking version & updated_at
CREATE OR REPLACE FUNCTION public.touch_version_and_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' THEN
    NEW.version := COALESCE(OLD.version, 1) + 1;
  END IF;
  RETURN NEW;
END;
$$;

-- Institutions (Balli School of Technology 'BST', Mamburao Integrated Farm 'MIF')
CREATE TABLE public.institutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id bigint UNIQUE,
  code varchar(10) NOT NULL UNIQUE,
  name varchar(255) NOT NULL,
  address text,
  contact_email varchar(255),
  contact_number varchar(30),
  is_active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_institutions_touch
  BEFORE UPDATE ON public.institutions
  FOR EACH ROW EXECUTE FUNCTION public.touch_version_and_updated_at();

-- User Profiles mapped 1:1 to Supabase Auth users
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  legacy_id bigint UNIQUE,
  email varchar(255) NOT NULL UNIQUE,
  full_name varchar(255) NOT NULL,
  username varchar(50) UNIQUE,
  role public.app_role NOT NULL DEFAULT 'applicant',
  account_status public.account_status NOT NULL DEFAULT 'pending_approval',
  last_login_at timestamptz,
  password_expiry_exempt boolean NOT NULL DEFAULT false,
  password_expires_at timestamptz,
  force_password_change boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_role_status ON public.profiles (role, account_status);

CREATE TRIGGER trg_profiles_touch
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_version_and_updated_at();

-- Institution Memberships
CREATE TABLE public.institution_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (institution_id, user_id)
);

CREATE INDEX idx_institution_user_user_id ON public.institution_user (user_id);

-- Security Definer Helpers (evaluated safely inside RLS)
CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.account_status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.role
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.account_status = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_system_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() = 'system_administrator'::public.app_role, false);
$$;

CREATE OR REPLACE FUNCTION public.has_institution_access(target_institution_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_system_admin()
    OR EXISTS (
      SELECT 1
      FROM public.institution_user iu
      JOIN public.profiles p ON p.id = iu.user_id
      WHERE iu.user_id = auth.uid()
        AND iu.institution_id = target_institution_id
        AND p.account_status = 'active'
    );
$$;

-- Hard protection: prevent authenticated non-service users from self-escalating roles or status
CREATE OR REPLACE FUNCTION public.prevent_self_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' OR current_user = 'postgres' THEN
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

CREATE TRIGGER trg_profiles_prevent_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_privilege_escalation();

-- Enable RLS
ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institution_user ENABLE ROW LEVEL SECURITY;

-- Institutions Policies
CREATE POLICY "Active staff and learners read active institutions"
  ON public.institutions FOR SELECT
  TO authenticated
  USING (is_active = true OR public.has_institution_access(id));

CREATE POLICY "System admins manage institutions"
  ON public.institutions FOR ALL
  TO authenticated
  USING (public.is_system_admin())
  WITH CHECK (public.is_system_admin());

-- Profiles Policies
CREATE POLICY "Users read own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Admins and institutional admins read scoped profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin()
    OR (
      public.current_user_role() IN ('institutional_administrator', 'registrar', 'focal_person')
      AND EXISTS (
        SELECT 1
        FROM public.institution_user iu
        WHERE iu.user_id = profiles.id
          AND public.has_institution_access(iu.institution_id)
      )
    )
  );

CREATE POLICY "Users update own safe display fields"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid() AND public.is_active_user())
  WITH CHECK (id = auth.uid());

CREATE POLICY "System admins update profiles"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.is_system_admin())
  WITH CHECK (public.is_system_admin());

-- Institution User Policies
CREATE POLICY "Users read own institution memberships"
  ON public.institution_user FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_institution_access(institution_id));

CREATE POLICY "System and institutional admins manage scoped memberships"
  ON public.institution_user FOR ALL
  TO authenticated
  USING (
    public.is_system_admin()
    OR (
      public.current_user_role() = 'institutional_administrator'
      AND public.has_institution_access(institution_id)
    )
  )
  WITH CHECK (
    public.is_system_admin()
    OR (
      public.current_user_role() = 'institutional_administrator'
      AND public.has_institution_access(institution_id)
    )
  );
