-- Migration 0133: neighborhood geography provenance.
--
-- city_neighborhoods previously knew whether a row was generated/curated and
-- whether its geometry had been reviewed, but not where the geometry came from.
-- Provenance is required before a neighborhood can become a GPS host checkpoint.

ALTER TABLE city_neighborhoods
  ADD COLUMN IF NOT EXISTS source_publisher TEXT,
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS source_license TEXT,
  ADD COLUMN IF NOT EXISTS source_retrieved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_version TEXT,
  ADD COLUMN IF NOT EXISTS source_kind TEXT NOT NULL DEFAULT 'generated_hint',
  ADD COLUMN IF NOT EXISTS authority_level TEXT NOT NULL DEFAULT 'generated';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'city_neighborhoods_source_kind_valid'
  ) THEN
    ALTER TABLE city_neighborhoods
      ADD CONSTRAINT city_neighborhoods_source_kind_valid
      CHECK (source_kind IN (
        'municipal_gis', 'county_gis', 'state_gis', 'regional_gis',
        'osm_reviewed', 'niakofa_curated', 'generated_hint'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'city_neighborhoods_authority_level_valid'
  ) THEN
    ALTER TABLE city_neighborhoods
      ADD CONSTRAINT city_neighborhoods_authority_level_valid
      CHECK (authority_level IN ('authoritative', 'curated', 'generated'));
  END IF;
END $$;

-- Existing Fort Worth rows are curated content, not generated guesses.
UPDATE city_neighborhoods
SET
  source_kind = 'niakofa_curated',
  authority_level = 'curated',
  source_publisher = COALESCE(source_publisher, 'Niakofa curated geography')
WHERE city_key = 'fort_worth'
  AND source = 'curated';

-- LLM-generated rows remain hints. They may power discovery UX, but they must
-- never be treated as GPS boundary evidence until reviewed and sourced.
UPDATE city_neighborhoods
SET
  source_kind = 'generated_hint',
  authority_level = 'generated'
WHERE source = 'generated'
  AND authority_level = 'generated';

CREATE INDEX IF NOT EXISTS city_neighborhoods_city_authority_idx
  ON city_neighborhoods(city_key, authority_level, geometry_verified);
