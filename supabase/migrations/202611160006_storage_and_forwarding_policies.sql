-- Phase B / Migration 0006: Remaining Storage Bucket Policies (course-materials, announcement-attachments, forwarding-summaries)

CREATE POLICY "Authorized staff and enrolled learners read course-materials objects"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'course-materials'
    AND public.is_active_user()
    AND (
      public.is_system_admin()
      OR (
        public.current_user_role() IN ('institutional_administrator', 'focal_person', 'trainer', 'registrar')
        AND public.has_institution_access(((storage.foldername(name))[1])::uuid)
      )
      OR EXISTS (
        SELECT 1 FROM public.enrollment_applications ea
        WHERE ea.learner_user_id = auth.uid()
          AND ea.institution_id = ((storage.foldername(name))[1])::uuid
          AND ea.archived_at IS NULL
          AND ea.application_status IN ('verified', 'confirmed')
      )
    )
  );

CREATE POLICY "Focal, trainers, and admins write course-materials objects"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'course-materials'
    AND (
      public.is_system_admin()
      OR (
        public.current_user_role() IN ('institutional_administrator', 'focal_person', 'trainer')
        AND public.has_institution_access(((storage.foldername(name))[1])::uuid)
      )
    )
  );

CREATE POLICY "Authenticated active users read scoped announcement-attachments objects"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'announcement-attachments'
    AND public.is_active_user()
    AND (
      public.is_system_admin()
      OR (storage.foldername(name))[1] = 'global'
      OR public.has_institution_access(((storage.foldername(name))[1])::uuid)
      OR EXISTS (
        SELECT 1 FROM public.enrollment_applications ea
        WHERE ea.learner_user_id = auth.uid()
          AND ea.institution_id = ((storage.foldername(name))[1])::uuid
          AND ea.archived_at IS NULL
      )
    )
  );

CREATE POLICY "Admins and registrars write announcement-attachments objects"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'announcement-attachments'
    AND (
      public.is_system_admin()
      OR (
        public.current_user_role() IN ('institutional_administrator', 'registrar')
        AND public.has_institution_access(((storage.foldername(name))[1])::uuid)
      )
    )
  );

CREATE POLICY "Registrars and admins read forwarding-summaries objects"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'forwarding-summaries'
    AND (
      public.is_system_admin()
      OR (
        public.current_user_role() IN ('institutional_administrator', 'registrar')
        AND public.has_institution_access(((storage.foldername(name))[1])::uuid)
      )
    )
  );
