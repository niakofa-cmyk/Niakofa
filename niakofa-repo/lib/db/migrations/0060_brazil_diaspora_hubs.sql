-- Migration 0060: Additional Brazilian diaspora hubs.
--
-- Context: Brazil has the largest Afro-descendant population outside Africa
-- (110M+, ~55% of the country identifies as Black/Brown) — more than the
-- rest of the existing hub list combined. The original seed (migration 0053)
-- included only one Brazilian city (Salvador). This adds three more that
-- reflect where that population is actually concentrated: the Northeast
-- (Recife, São Luís) and the largest Afro-Brazilian population in absolute
-- numbers (São Paulo).
--
-- Idempotent — see CLAUDE.md Incident #2. Keyed off the existing
-- UNIQUE(name) constraint on diaspora_hubs, same pattern as migration 0053.

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
