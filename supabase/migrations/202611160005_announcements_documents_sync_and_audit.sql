-- Phase B / Migration 0005: Announcements, Documents, Idempotent Offline Sync Ledger, Security Audit & Private Storage Buckets

CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id bigint UNIQUE,
  client_draft_id uuid UNIQUE DEFAULT gen_random_uuid(),
  institution_id uuid REFERENCES public.institutions(id) ON DELETE SET NULL,
  author_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  title varchar(255) NOT NULL,
  body text NOT NULL,
  audience public.announcement_audience NOT NULL DEFAULT 'all',
  is_draft boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  expires_at timestamptz,
  archived_at timestamptz,
  deadline_at timestamptz,
  attachment_path varchar(500),
  attachment_name varchar(255),
  attachment_mime varchar(100),
  attachment_size bigint CHECK (attachment_size IS NULL OR attachment_size <= 10485760),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_announcements_lifecycle ON public.announcements (institution_id, published_at, expires_at) WHERE archived_at IS NULL;

CREATE TRIGGER trg_announcements_touch
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.touch_version_and_updated_at();

CREATE TABLE public.announcement_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id bigint UNIQUE,
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, user_id)
);

CREATE TABLE public.operational_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id bigint UNIQUE,
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  uploaded_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  training_batch_id uuid REFERENCES public.training_batches(id) ON DELETE SET NULL,
  enrollment_application_id uuid REFERENCES public.enrollment_applications(id) ON DELETE SET NULL,
  category varchar(50) NOT NULL CHECK (category IN ('attendance_sheet', 'assessment_form', 'photo', 'other')),
  title varchar(180) NOT NULL,
  original_name varchar(255) NOT NULL,
  storage_path varchar(500) NOT NULL,
  mime_type varchar(100) NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.outgoing_document_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id bigint UNIQUE,
  institution_id uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  logged_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  document_type varchar(60) NOT NULL,
  reference_number varchar(100),
  recipient varchar(180),
  subject varchar(255) NOT NULL,
  sent_at date NOT NULL,
  method varchar(50) NOT NULL DEFAULT 'physical',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotency table preventing duplicate offline mutation replays
CREATE TABLE public.offline_sync_mutations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mutation_id uuid NOT NULL,
  entity_type varchar(80) NOT NULL,
  entity_id varchar(120) NOT NULL,
  operation varchar(60) NOT NULL,
  payload_hash varchar(64) NOT NULL,
  result jsonb,
  processed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, mutation_id)
);

-- Append-only Security Audit Logs (replaces activity_logs with tamper protection)
CREATE TABLE public.security_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id bigint UNIQUE,
  actor_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  institution_id uuid REFERENCES public.institutions(id) ON DELETE SET NULL,
  event varchar(100) NOT NULL,
  description text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_security_audit_logs_event_created ON public.security_audit_logs (event, created_at DESC);
CREATE INDEX idx_security_audit_logs_inst_created ON public.security_audit_logs (institution_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Security audit logs are append-only and cannot be updated or deleted.';
END;
$$;

CREATE TRIGGER trg_security_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON public.security_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_mutation();

-- Scheduled/Edge support: lock staff accounts inactive for 90 days cleanly inside PostgreSQL
CREATE OR REPLACE FUNCTION public.lock_inactive_staff_accounts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_locked_count integer;
BEGIN
  WITH locked AS (
    UPDATE public.profiles
    SET account_status = 'inactive'
    WHERE role IN ('registrar', 'focal_person', 'trainer', 'institutional_administrator')
      AND account_status = 'active'
      AND COALESCE(last_login_at, created_at) <= now() - interval '90 days'
    RETURNING id, role, last_login_at
  ),
  inserted_logs AS (
    INSERT INTO public.security_audit_logs (actor_user_id, event, description, metadata)
    SELECT
      NULL,
      'staff_account_auto_locked',
      'Automatically deactivated staff account after 90 days without login.',
      jsonb_build_object('account_id', id, 'role', role, 'last_login_at', last_login_at)
    FROM locked
  )
  SELECT count(*) INTO v_locked_count FROM locked;

  RETURN v_locked_count;
END;
$$;

-- RLS setup
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcement_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outgoing_document_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offline_sync_mutations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized users read announcements matching audience and campus"
  ON public.announcements FOR SELECT
  TO authenticated
  USING (
    public.is_active_user() AND (
      public.is_system_admin()
      OR (
        public.current_user_role() IN ('institutional_administrator', 'registrar')
        AND (institution_id IS NULL OR public.has_institution_access(institution_id))
      )
      OR (
        is_draft = false
        AND archived_at IS NULL
        AND published_at IS NOT NULL
        AND published_at <= now()
        AND (expires_at IS NULL OR expires_at > now())
        AND (
          institution_id IS NULL
          OR public.has_institution_access(institution_id)
          OR EXISTS (
            SELECT 1 FROM public.enrollment_applications ea
            WHERE ea.learner_user_id = auth.uid()
              AND ea.institution_id = announcements.institution_id
              AND ea.archived_at IS NULL
          )
        )
        AND (
          audience = 'all'
          OR (audience = 'scholar' AND public.current_user_role() IN ('scholar', 'applicant'))
          OR (audience = 'focal_person' AND public.current_user_role() IN ('focal_person', 'trainer'))
          OR (audience = 'staff' AND public.current_user_role() IN ('system_administrator', 'institutional_administrator', 'registrar', 'focal_person', 'trainer'))
        )
      )
    )
  );

CREATE POLICY "Admins and registrars publish scoped announcements"
  ON public.announcements FOR ALL
  TO authenticated
  USING (
    public.is_system_admin()
    OR (
      public.current_user_role() IN ('institutional_administrator', 'registrar')
      AND institution_id IS NOT NULL
      AND public.has_institution_access(institution_id)
    )
  )
  WITH CHECK (
    public.is_system_admin()
    OR (
      public.current_user_role() IN ('institutional_administrator', 'registrar')
      AND institution_id IS NOT NULL
      AND public.has_institution_access(institution_id)
    )
  );

CREATE POLICY "Users manage own announcement read views"
  ON public.announcement_views FOR ALL
  TO authenticated
  USING (user_id = auth.uid() AND public.is_active_user())
  WITH CHECK (user_id = auth.uid() AND public.is_active_user());

CREATE POLICY "Focal, registrars, and admins access operational documents"
  ON public.operational_documents FOR ALL
  TO authenticated
  USING (
    public.is_system_admin()
    OR (
      public.current_user_role() IN ('institutional_administrator', 'focal_person', 'registrar')
      AND public.has_institution_access(institution_id)
    )
  )
  WITH CHECK (
    public.is_system_admin()
    OR (
      public.current_user_role() IN ('institutional_administrator', 'focal_person')
      AND public.has_institution_access(institution_id)
    )
  );

CREATE POLICY "Focal and admins manage outgoing document logs"
  ON public.outgoing_document_logs FOR ALL
  TO authenticated
  USING (
    public.is_system_admin()
    OR (
      public.current_user_role() IN ('institutional_administrator', 'focal_person')
      AND public.has_institution_access(institution_id)
    )
  )
  WITH CHECK (
    public.is_system_admin()
    OR (
      public.current_user_role() IN ('institutional_administrator', 'focal_person')
      AND public.has_institution_access(institution_id)
    )
  );

CREATE POLICY "Users manage own offline sync idempotency keys"
  ON public.offline_sync_mutations FOR ALL
  TO authenticated
  USING (user_id = auth.uid() AND public.is_active_user())
  WITH CHECK (user_id = auth.uid() AND public.is_active_user());

CREATE POLICY "Admins read scoped audit logs"
  ON public.security_audit_logs FOR SELECT
  TO authenticated
  USING (
    public.is_system_admin()
    OR (
      public.current_user_role() = 'institutional_administrator'
      AND (institution_id IS NULL OR public.has_institution_access(institution_id))
    )
  );

CREATE POLICY "Authenticated active users insert audit events"
  ON public.security_audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_active_user()
    AND (actor_user_id IS NULL OR actor_user_id = auth.uid())
  );

-- Private Supabase Storage Buckets (zero public anonymous object URLs)
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('learner-documents', 'learner-documents', false),
  ('operational-documents', 'operational-documents', false),
  ('course-materials', 'course-materials', false),
  ('announcement-attachments', 'announcement-attachments', false),
  ('forwarding-summaries', 'forwarding-summaries', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS Policies (object path prefix: <institution_id>/<user_id>/filename)
CREATE POLICY "Owners and scoped registrars read learner-documents objects"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'learner-documents'
    AND (
      (storage.foldername(name))[2] = auth.uid()::text
      OR public.is_system_admin()
      OR (
        public.current_user_role() IN ('institutional_administrator', 'registrar')
        AND public.has_institution_access(((storage.foldername(name))[1])::uuid)
      )
    )
  );

CREATE POLICY "Learners upload own learner-documents objects"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'learner-documents'
    AND public.is_active_user()
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "Scoped staff access operational-documents objects"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'operational-documents'
    AND (
      public.is_system_admin()
      OR (
        public.current_user_role() IN ('institutional_administrator', 'focal_person', 'registrar')
        AND public.has_institution_access(((storage.foldername(name))[1])::uuid)
      )
    )
  )
  WITH CHECK (
    bucket_id = 'operational-documents'
    AND (
      public.is_system_admin()
      OR (
        public.current_user_role() IN ('institutional_administrator', 'focal_person')
        AND public.has_institution_access(((storage.foldername(name))[1])::uuid)
      )
    )
  );
