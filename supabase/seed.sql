-- Deterministic Non-Secret Reference Seed (Institutions & Example Program Catalog)
-- No plaintext passwords or fake learner PII included.

INSERT INTO public.institutions (code, name, address, contact_email, is_active)
VALUES
  ('BST', 'Balli School of Technology', 'San Jose, Occidental Mindoro', 'bst@tesda-connect.local', true),
  ('MIF', 'Mamburao Integrated Farm', 'Mamburao, Occidental Mindoro', 'mif@tesda-connect.local', true)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  address = EXCLUDED.address,
  is_active = EXCLUDED.is_active;

WITH bst AS (SELECT id FROM public.institutions WHERE code = 'BST' LIMIT 1),
     mif AS (SELECT id FROM public.institutions WHERE code = 'MIF' LIMIT 1)
INSERT INTO public.courses (institution_id, code, name, qualification_level, training_hours, is_active)
SELECT bst.id, 'SMAW-NCII', 'Shielded Metal Arc Welding (SMAW)', 'NC II', 268, true FROM bst
UNION ALL
SELECT bst.id, 'AUTO-NCII', 'Automotive Servicing', 'NC II', 676, true FROM bst
UNION ALL
SELECT mif.id, 'OAP-NCII', 'Organic Agriculture Production', 'NC II', 232, true FROM mif
ON CONFLICT (institution_id, code) DO NOTHING;
