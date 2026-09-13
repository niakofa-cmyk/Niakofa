-- Migration 0063: canonical Diaspora Hub geography.
-- Non-U.S. hubs are country-level; U.S. hubs are state-level.
-- Existing hub IDs are preserved so story/community references remain valid.

ALTER TABLE diaspora_hubs
  ADD COLUMN IF NOT EXISTS hub_scope TEXT NOT NULL DEFAULT 'country',
  ADD COLUMN IF NOT EXISTS country_code TEXT,
  ADD COLUMN IF NOT EXISTS subdivision_code TEXT;

CREATE INDEX IF NOT EXISTS idx_diaspora_hubs_scope ON diaspora_hubs(hub_scope);
CREATE INDEX IF NOT EXISTS idx_diaspora_hubs_country ON diaspora_hubs(country_code);
CREATE INDEX IF NOT EXISTS idx_diaspora_hubs_subdivision ON diaspora_hubs(subdivision_code);

-- Convert the original city seed rows into the canonical geography without
-- changing their primary keys. This preserves existing story/community links.
UPDATE diaspora_hubs SET name = 'Texas', region_label = 'United States · Texas', tag = 'us-state', hub_scope = 'home', country_code = 'US', subdivision_code = 'TX'
WHERE name = 'Fort Worth, TX';

UPDATE diaspora_hubs SET name = 'Georgia', region_label = 'United States · Georgia', tag = 'us-state', hub_scope = 'us_state', country_code = 'US', subdivision_code = 'GA'
WHERE name = 'Atlanta, GA';

UPDATE diaspora_hubs SET name = 'Jamaica', region_label = 'Caribbean · Jamaica', tag = 'country', hub_scope = 'country', country_code = 'JM', subdivision_code = NULL
WHERE name = 'Kingston, Jamaica';

UPDATE diaspora_hubs SET name = 'Dominican Republic', region_label = 'Caribbean · Dominican Republic', tag = 'country', hub_scope = 'country', country_code = 'DO', subdivision_code = NULL
WHERE name = 'Santo Domingo, DR';

UPDATE diaspora_hubs SET name = 'Brazil', region_label = 'South America · Brazil', tag = 'country', hub_scope = 'country', country_code = 'BR', subdivision_code = NULL
WHERE name = 'Salvador, Brazil';

UPDATE diaspora_hubs SET name = 'Nigeria', region_label = 'West Africa · Nigeria', tag = 'country', hub_scope = 'country', country_code = 'NG', subdivision_code = NULL
WHERE name = 'Lagos, Nigeria';

UPDATE diaspora_hubs SET name = 'Ghana', region_label = 'West Africa · Ghana', tag = 'country', hub_scope = 'country', country_code = 'GH', subdivision_code = NULL
WHERE name = 'Accra, Ghana';

UPDATE diaspora_hubs SET name = 'United Kingdom', region_label = 'Europe · United Kingdom', tag = 'country', hub_scope = 'country', country_code = 'GB', subdivision_code = NULL
WHERE name = 'London, UK';

UPDATE diaspora_hubs SET name = 'France', region_label = 'Europe · France', tag = 'country', hub_scope = 'country', country_code = 'FR', subdivision_code = NULL
WHERE name = 'Paris, France';

UPDATE diaspora_hubs SET name = 'Canada', region_label = 'North America · Canada', tag = 'country', hub_scope = 'country', country_code = 'CA', subdivision_code = NULL
WHERE name = 'Montréal, Canada';

-- Seed additional U.S. state hubs so the model is immediately extensible.
-- These rows intentionally start unclaimed; they become active community
-- nodes when a community is associated through the existing claim workflow.
INSERT INTO diaspora_hubs (name, region_label, lat, lng, tag, hub_scope, country_code, subdivision_code, note, is_seed, status)
VALUES
  ('California', 'United States · California', 36.7783, -119.4179, 'us-state', 'us_state', 'US', 'CA', 'U.S. state-level Diaspora Hub.', TRUE, 'approved'),
  ('New York', 'United States · New York', 42.9538, -75.5268, 'us-state', 'us_state', 'US', 'NY', 'U.S. state-level Diaspora Hub.', TRUE, 'approved')
ON CONFLICT (name) DO NOTHING;

-- Backfill any non-U.S. or legacy rows not explicitly mapped above.
UPDATE diaspora_hubs
SET hub_scope = CASE WHEN country_code = 'US' THEN 'us_state' ELSE 'country' END
WHERE hub_scope IS NULL OR hub_scope = '';
