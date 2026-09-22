-- Migration 0131: optional authoritative geometry for neighborhood Spiral hosting.
-- City-level host fence remains the primary gate. Neighborhood geometry is optional:
-- when present and geometry_verified, hosting a neighborhood Spiral requires the GPS
-- fix to fall inside the polygon or radius. Missing/unverified geometry must NOT
-- invent a boundary — the route falls back to city-only verification.
--
-- PostGIS is already available (0050). Columns are plain numeric/jsonb so the
-- app can evaluate containment in JS without requiring ST_Contains on every path;
-- a future migration can materialize geography columns + GiST once curated data exists.

ALTER TABLE city_neighborhoods
  ADD COLUMN IF NOT EXISTS center_lat double precision,
  ADD COLUMN IF NOT EXISTS center_lng double precision,
  ADD COLUMN IF NOT EXISTS radius_meters double precision,
  ADD COLUMN IF NOT EXISTS polygon_geojson jsonb,
  ADD COLUMN IF NOT EXISTS geometry_source text,
  ADD COLUMN IF NOT EXISTS geometry_version text,
  ADD COLUMN IF NOT EXISTS geometry_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS geometry_effective_at timestamp with time zone;

-- Optional sanity: radius must be positive when set.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'city_neighborhoods_radius_meters_positive'
  ) THEN
    ALTER TABLE city_neighborhoods
      ADD CONSTRAINT city_neighborhoods_radius_meters_positive
      CHECK (radius_meters IS NULL OR radius_meters > 0);
  END IF;
END $$;
