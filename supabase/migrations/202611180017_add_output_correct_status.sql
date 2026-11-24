-- Adds the "Submitted Output Correct" result for tasks (next to Competent and Not Yet Competent).
-- Must be its own migration: a new enum value cannot be used in the same transaction that adds it.
ALTER TYPE public.competency_status ADD VALUE IF NOT EXISTS 'output_correct';
