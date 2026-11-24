-- Read-only role for TESDA officials. It can only see numbers per training batch
-- (see get_tesda_overview in the next migration), never personal data.
-- This must be its own migration: a new enum value cannot be used in the same transaction that adds it.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'tesda_viewer';
