-- Migration 0140: Hub context imagery + final geography validation.
--
-- This migration deliberately fails closed on invalid approved canonical
-- geography. Run the read-only Diaspora Globe geography audit first and repair
-- any reported data before applying this migration.

ALTER TABLE diaspora_hubs
  ADD COLUMN IF NOT EXISTS hero_image_url text;

DO $$ BEGIN
  ALTER TABLE diaspora_hubs
    ADD CONSTRAINT diaspora_hubs_primary_not_self
    CHECK (primary_hub_id IS NULL OR primary_hub_id <> id) NOT VALID;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM diaspora_hubs
    WHERE hero_image_url IS NOT NULL
      AND hero_image_url !~ '^https://'
  ) THEN
    RAISE EXCEPTION '0140 blocked: hero_image_url must use https://';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM diaspora_hubs
    WHERE primary_hub_id = id
  ) THEN
    RAISE EXCEPTION '0140 blocked: self-parenting Diaspora Hub rows exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM diaspora_hubs
    WHERE status = 'approved'
      AND primary_hub_id IS NULL
      AND NOT (
        (
          hub_scope = 'country'
          AND country_code IS NOT NULL
          AND upper(country_code) <> 'US'
          AND subdivision_code IS NULL
        )
        OR
        (
          hub_scope = 'us_state'
          AND upper(country_code) = 'US'
          AND subdivision_code IS NOT NULL
        )
      )
  ) THEN
    RAISE EXCEPTION '0140 blocked: approved canonical Diaspora geography is invalid; run the audit first';
  END IF;
END $$;

ALTER TABLE diaspora_hubs
  VALIDATE CONSTRAINT diaspora_hubs_primary_not_self;

ALTER TABLE diaspora_hubs
  VALIDATE CONSTRAINT diaspora_hubs_globe_geography_check;

DO $$ BEGIN
  ALTER TABLE diaspora_hubs
    ADD CONSTRAINT diaspora_hubs_hero_image_https
    CHECK (hero_image_url IS NULL OR hero_image_url ~ '^https://') NOT VALID;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE diaspora_hubs
  VALIDATE CONSTRAINT diaspora_hubs_hero_image_https;

COMMENT ON COLUMN diaspora_hubs.hero_image_url IS
  'Optional authoritative HTTPS image for selected Hub context; never used as a Globe landing marker asset.';