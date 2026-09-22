-- Migration 0139: enforce the canonical Diaspora Globe geography contract.
--
-- Product rules:
--   * non-U.S. canonical Hubs represent countries
--   * the United States is represented by individual states
--   * grouped local/city Hubs remain durable records but never become Globe
--     markers of their own
--   * Home is user context, not a Hub geography
--
-- 0138 is already the durable Hub messaging migration in this repository.

-- Normalize canonical roots that already have authoritative country metadata.
UPDATE diaspora_hubs
SET hub_scope = 'us_state',
    tag = 'us-state'
WHERE primary_hub_id IS NULL
  AND country_code = 'US';

UPDATE diaspora_hubs
SET hub_scope = 'country',
    tag = 'country',
    subdivision_code = NULL
WHERE primary_hub_id IS NULL
  AND country_code IS NOT NULL
  AND country_code <> 'US';

-- Approved canonical roots must have a complete country/state identity.
-- Pending, rejected, and grouped local rows remain writable so moderation and
-- legacy local-community workflows can finish their own data entry.
DO $$ BEGIN
  ALTER TABLE diaspora_hubs
    ADD CONSTRAINT diaspora_hubs_globe_geography_check
    CHECK (
      status <> 'approved'
      OR primary_hub_id IS NOT NULL
      OR (
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
      )
    ) NOT VALID;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- There can be exactly one approved canonical Globe marker per country or
-- U.S. state. Grouped local rows are intentionally excluded.
CREATE UNIQUE INDEX IF NOT EXISTS uq_diaspora_hubs_canonical_country
  ON diaspora_hubs(country_code)
  WHERE status = 'approved'
    AND primary_hub_id IS NULL
    AND hub_scope = 'country'
    AND country_code IS NOT NULL
    AND country_code <> 'US';

CREATE UNIQUE INDEX IF NOT EXISTS uq_diaspora_hubs_canonical_us_state
  ON diaspora_hubs(subdivision_code)
  WHERE status = 'approved'
    AND primary_hub_id IS NULL
    AND hub_scope = 'us_state'
    AND country_code = 'US'
    AND subdivision_code IS NOT NULL;

COMMENT ON CONSTRAINT diaspora_hubs_globe_geography_check ON diaspora_hubs IS
  'Approved canonical Globe Hubs are non-US countries or US states; Home is user context and grouped local rows are not Globe markers.';