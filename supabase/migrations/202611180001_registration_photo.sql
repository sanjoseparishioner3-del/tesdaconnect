-- Preserve the photo attached in Registration Intake alongside the MIS 03-01 fields.
ALTER TABLE public.learner_profiles ADD COLUMN IF NOT EXISTS id_picture_url text;
