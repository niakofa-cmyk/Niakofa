-- Migration 0138: enforce the Globe Hub geography contract.
--
-- Product rule:
--   * every non-U.S. Diaspora Hub represents a COUNTRY
--   * the United States is represented by individual STATES
--   * legacy city names remain anchor_city / name data, never Globe Hub scope
--
-- primary_hub_id remains the display-only grouping mechanism for historical
-- local hubs. Canonical Hub uniqueness therefore excludes grouped children.

-- Normalize any legacy U.S. row that already has authoritative country data.
UPDATE diaspora_hubs
SET hub_scope = 'us_state',
    tag = 'us-state'
WHERE country_code = 'US';

UPDATE diaspora_hubs
SET hub_scope = 'country',
    tag = 'country',
    subdivision_code = NULL
WHERE country_code IS NOT NULL
  AND country_code <> 'US'
  AND primary_hub_id IS NULL;

-- A canonical Globe Hub must have a complete geography identity.
-- NOT VALID lets existing legacy data be audited without blocking deployment;
-- every newly inserted/updated row is still checked by PostgreSQL.
DO $$ BEGIN
  ALTER TABLE diaspora_hubs
    ADD CONSTRAINT diaspora_hubs_globe_geography_check
    CHECK (
      (
        hub_scope = 'country'
        AND country_code IS NOT NULL
        AND country_code <> 'US'
        AND subdivision_code IS NULL
      )
      OR
      (
        hub_scope = 'us_state'
        AND country_code = 'US'
        AND subdivision_code IS NOT NULL
      )
    ) NOT VALID;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- There can be exactly one canonical Globe marker for each country or U.S.
-- state. Historical local hubs are allowed to coexist when grouped under a
-- canonical primary_hub_id.
CREATE UNIQUE INDEX IF NOT EXISTS uq_diaspora_hubs_canonical_country
  ON diaspora_hubs(country_code)
  WHERE status = 'approved'
    AND primary_hub_id IS NULL
    AND hub_scope = 'country';

CREATE UNIQUE INDEX IF NOT EXISTS uq_diaspora_hubs_canonical_us_state
  ON diaspora_hubs(subdivision_code)
  WHERE status = 'approved'
    AND primary_hub_id IS NULL
    AND hub_scope = 'us_state'
    AND country_code = 'US';

COMMENT ON CONSTRAINT diaspora_hubs_globe_geography_check ON diaspora_hubs IS
  'Globe contract: non-US Hubs are countries; US Hubs are states. City names are anchors, not Globe Hub scope.';
