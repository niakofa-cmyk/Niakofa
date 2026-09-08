-- Migration 0134: staged authoritative neighborhood boundary imports.
--
-- Source ingestion is deliberately separated from GPS verification. A public
-- municipal GIS feed can be imported and validated without immediately becoming
-- an operational host boundary. Admin review promotes only trusted geometry.

CREATE TABLE IF NOT EXISTS neighborhood_boundary_imports (
  id bigserial PRIMARY KEY,
  city_key text NOT NULL,
  city_display text NOT NULL,
  source_kind text NOT NULL,
  authority_level text NOT NULL,
  source_publisher text NOT NULL,
  source_url text NOT NULL,
  source_dataset text NOT NULL,
  source_feature_id text NOT NULL,
  source_version text,
  source_license text,
  source_retrieved_at timestamptz NOT NULL,
  name text NOT NULL,
  neighborhood_id text NOT NULL,
  polygon_geojson jsonb,
  center_lat double precision,
  center_lng double precision,
  radius_meters double precision,
  geometry_valid boolean NOT NULL DEFAULT false,
  geometry_verified boolean NOT NULL DEFAULT false,
  reviewed boolean NOT NULL DEFAULT false,
  review_note text,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT neighborhood_boundary_imports_source_kind_chk CHECK (
    source_kind IN ('municipal_gis','county_gis','state_gis','regional_gis','osm_reviewed','niakofa_curated','generated_hint')
  ),
  CONSTRAINT neighborhood_boundary_imports_authority_chk CHECK (
    authority_level IN ('authoritative','curated','generated')
  ),
  CONSTRAINT neighborhood_boundary_imports_authority_source_chk CHECK (
    NOT (authority_level = 'authoritative' AND source_kind = 'generated_hint')
  ),
  CONSTRAINT neighborhood_boundary_imports_coordinates_chk CHECK (
    (center_lat IS NULL OR center_lat BETWEEN -90 AND 90)
    AND (center_lng IS NULL OR center_lng BETWEEN -180 AND 180)
    AND (radius_meters IS NULL OR radius_meters > 0)
  ),
  CONSTRAINT neighborhood_boundary_imports_verified_chk CHECK (
    NOT geometry_verified OR (geometry_valid AND reviewed)
  ),
  CONSTRAINT neighborhood_boundary_imports_unique_source_feature UNIQUE (
    city_key, source_dataset, source_feature_id, source_version
  )
);

CREATE INDEX IF NOT EXISTS neighborhood_boundary_imports_city_review_idx
  ON neighborhood_boundary_imports(city_key, reviewed, geometry_valid, geometry_verified);

CREATE INDEX IF NOT EXISTS neighborhood_boundary_imports_source_idx
  ON neighborhood_boundary_imports(source_kind, source_dataset, source_version);
