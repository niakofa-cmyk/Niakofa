-- Migration 0137: merge duplicate country-level Diaspora Hubs for Globe display.
--
-- Context: migration 0063_diaspora_hub_geography.sql assigned canonical
-- country geography to the 10 legacy seed hubs it named explicitly (one row
-- per country), then applied a generic catch-all to anything still NULL.
-- That catch-all caught three pre-existing Brazil city hubs (Recife,
-- São Luís, São Paulo — added in 0060/0062 as intentionally distinct local
-- communities) and left them with hub_scope='country' but NO country_code,
-- and a raw city name instead of the "Brazil" display label. Net effect:
-- Brazil rendered as 4 separate Globe markers instead of 1, undermining the
-- "one dot per country" redesign, and those 3 rows were unsearchable by
-- country code.
--
-- Fix, non-destructively:
--   1. Give the 3 Brazil city hubs correct country_code so they are at
--      least searchable/consistent even before grouping.
--   2. Add primary_hub_id: a self-referencing pointer used only for Globe
--      *display* grouping. Child rows keep their own id, community_id,
--      stories, pledges, hub_community_leaders, help_requests, etc.
--      completely untouched — nothing about their underlying identity or
--      relationships changes. Only the Globe marker/aggregate view groups
--      them under their country's canonical hub.
--
-- This pattern generalizes to any future country with multiple legacy city
-- hubs; it does not hardcode Brazil-only behavior in the schema.

ALTER TABLE diaspora_hubs
  ADD COLUMN IF NOT EXISTS primary_hub_id INTEGER REFERENCES diaspora_hubs(id);

CREATE INDEX IF NOT EXISTS idx_diaspora_hubs_primary_hub ON diaspora_hubs(primary_hub_id);

UPDATE diaspora_hubs
SET country_code = 'BR', hub_scope = 'country', subdivision_code = NULL
WHERE name IN ('Recife, Brazil', 'São Luís, Brazil', 'São Paulo, Brazil')
  AND (country_code IS NULL OR country_code <> 'BR');

UPDATE diaspora_hubs child
SET primary_hub_id = canon.id
FROM diaspora_hubs canon
WHERE canon.name = 'Salvador, Brazil'
  AND child.name IN ('Recife, Brazil', 'São Luís, Brazil', 'São Paulo, Brazil')
  AND child.id <> canon.id
  AND child.primary_hub_id IS NULL;
