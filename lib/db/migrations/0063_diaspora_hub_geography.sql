-- Migration 0063: canonical Diaspora Hub geography.
-- Non-U.S. hubs are country-level; U.S. hubs are state-level.
-- Existing hub IDs and anchor names are preserved so story/community and
-- neighborhood/Spiral references remain valid.

ALTER TABLE diaspora_hubs
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS hub_scope TEXT NOT NULL DEFAULT 'country',
  ADD COLUMN IF NOT EXISTS country_code TEXT,
  ADD COLUMN IF NOT EXISTS subdivision_code TEXT,
  ADD COLUMN IF NOT EXISTS anchor_city TEXT;

CREATE INDEX IF NOT EXISTS idx_diaspora_hubs_scope ON diaspora_hubs(hub_scope);
CREATE INDEX IF NOT EXISTS idx_diaspora_hubs_country ON diaspora_hubs(country_code);
CREATE INDEX IF NOT EXISTS idx_diaspora_hubs_subdivision ON diaspora_hubs(subdivision_code);

-- Public Hub labels are canonical country/state names; `name` remains the
-- original anchor identity used by existing city/neighborhood aggregation.
UPDATE diaspora_hubs SET display_name = 'Texas', region_label = 'United States · Texas', tag = 'us-state', hub_scope = 'us_state', country_code = 'US', subdivision_code = 'TX', anchor_city = 'Fort Worth'
WHERE name = 'Fort Worth, TX';

UPDATE diaspora_hubs SET display_name = 'Georgia', region_label = 'United States · Georgia', tag = 'us-state', hub_scope = 'us_state', country_code = 'US', subdivision_code = 'GA', anchor_city = 'Atlanta'
WHERE name = 'Atlanta, GA';

UPDATE diaspora_hubs SET display_name = 'Jamaica', region_label = 'Caribbean · Jamaica', tag = 'country', hub_scope = 'country', country_code = 'JM', subdivision_code = NULL, anchor_city = 'Kingston'
WHERE name = 'Kingston, Jamaica';

UPDATE diaspora_hubs SET display_name = 'Dominican Republic', region_label = 'Caribbean · Dominican Republic', tag = 'country', hub_scope = 'country', country_code = 'DO', subdivision_code = NULL, anchor_city = 'Santo Domingo'
WHERE name = 'Santo Domingo, DR';

UPDATE diaspora_hubs SET display_name = 'Brazil', region_label = 'South America · Brazil', tag = 'country', hub_scope = 'country', country_code = 'BR', subdivision_code = NULL, anchor_city = 'Salvador'
WHERE name = 'Salvador, Brazil';

UPDATE diaspora_hubs SET display_name = 'Nigeria', region_label = 'West Africa · Nigeria', tag = 'country', hub_scope = 'country', country_code = 'NG', subdivision_code = NULL, anchor_city = 'Lagos'
WHERE name = 'Lagos, Nigeria';

UPDATE diaspora_hubs SET display_name = 'Ghana', region_label = 'West Africa · Ghana', tag = 'country', hub_scope = 'country', country_code = 'GH', subdivision_code = NULL, anchor_city = 'Accra'
WHERE name = 'Accra, Ghana';

UPDATE diaspora_hubs SET display_name = 'United Kingdom', region_label = 'Europe · United Kingdom', tag = 'country', hub_scope = 'country', country_code = 'GB', subdivision_code = NULL, anchor_city = 'London'
WHERE name = 'London, UK';

UPDATE diaspora_hubs SET display_name = 'France', region_label = 'Europe · France', tag = 'country', hub_scope = 'country', country_code = 'FR', subdivision_code = NULL, anchor_city = 'Paris'
WHERE name = 'Paris, France';

UPDATE diaspora_hubs SET display_name = 'Canada', region_label = 'North America · Canada', tag = 'country', hub_scope = 'country', country_code = 'CA', subdivision_code = NULL, anchor_city = 'Montréal'
WHERE name = 'Montréal, Canada';

-- One seed row per INSERT keeps each VALUES list independently valid and
-- prevents a future row-arity edit from breaking the whole migration.
INSERT INTO diaspora_hubs (name, display_name, region_label, lat, lng, tag, hub_scope, country_code, subdivision_code, anchor_city, note, is_seed, status)
VALUES ('Los Angeles, CA', 'California', 'United States · California', 34.0522, -118.2437, 'us-state', 'us_state', 'US', 'CA', 'Los Angeles', 'U.S. state-level Diaspora Hub.', TRUE, 'approved')
ON CONFLICT (name) DO NOTHING;

INSERT INTO diaspora_hubs (name, display_name, region_label, lat, lng, tag, hub_scope, country_code, subdivision_code, anchor_city, note, is_seed, status)
VALUES ('New York City, NY', 'New York', 'United States · New York', 40.7128, -74.0060, 'us-state', 'us_state', 'US', 'NY', 'New York City', 'U.S. state-level Diaspora Hub.', TRUE, 'approved')
ON CONFLICT (name) DO NOTHING;

UPDATE diaspora_hubs
SET display_name = COALESCE(display_name, name),
    hub_scope = CASE WHEN country_code = 'US' THEN 'us_state' ELSE 'country' END,
    anchor_city = COALESCE(anchor_city, split_part(name, ',', 1))
WHERE display_name IS NULL OR hub_scope IS NULL OR hub_scope = '' OR anchor_city IS NULL;
