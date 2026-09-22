-- Migration 0062: Ensure Brazil diaspora hubs exist (idempotent safety net)
--
-- 0060 already seeds Recife, São Luís, São Paulo alongside Salvador from 0053.
-- This migration is a no-op on any DB that ran 0060 correctly — the ON CONFLICT
-- clause keys off the UNIQUE(name) constraint, so it only fires on databases
-- that somehow missed 0060 entirely.
--
-- CRITICAL: names here MUST match 0060 exactly or ON CONFLICT will not fire and
-- duplicate rows will be created. Verified correct names (matching 0060):
--   'Recife, Brazil' / 'São Luís, Brazil' / 'São Paulo, Brazil'
INSERT INTO diaspora_hubs (name, region_label, lat, lng, tag, note, is_seed, status)
VALUES
  ('Recife, Brazil',
   'Afro-Latino',
   -8.05, -34.88,
   'latino',
   'Pernambuco — heart of maracatu and one of the Northeast''s largest Afro-Brazilian communities.',
   TRUE, 'approved'),
  ('São Luís, Brazil',
   'Afro-Latino',
   -2.53, -44.30,
   'latino',
   'Maranhão — home to Bumba-meu-boi and deep Afro-Brazilian religious and cultural traditions.',
   TRUE, 'approved'),
  ('São Paulo, Brazil',
   'Afro-Latino',
   -23.55, -46.63,
   'latino',
   'Largest city in the Americas by Black population in absolute numbers.',
   TRUE, 'approved')
ON CONFLICT (name) DO NOTHING;
