ALTER TABLE civic_resources
  ADD COLUMN IF NOT EXISTS jurisdiction_level text NOT NULL DEFAULT 'county';

ALTER TABLE civic_resources
  ADD COLUMN IF NOT EXISTS source_name text;

ALTER TABLE civic_resources
  ADD COLUMN IF NOT EXISTS source_url text;

ALTER TABLE civic_resources
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz;

ALTER TABLE civic_resources
  ADD COLUMN IF NOT EXISTS is_authoritative boolean NOT NULL DEFAULT false;

ALTER TABLE civic_resources
  ADD COLUMN IF NOT EXISTS coverage_status text NOT NULL DEFAULT 'needs_verification';

ALTER TABLE civic_resources
  ADD COLUMN IF NOT EXISTS geoid text;

CREATE INDEX IF NOT EXISTS idx_civic_resources_geoid
  ON civic_resources(geoid);
CREATE INDEX IF NOT EXISTS idx_civic_resources_coverage_status
  ON civic_resources(coverage_status);