CREATE TABLE IF NOT EXISTS civic_jurisdictions (
  id serial PRIMARY KEY,
  state text NOT NULL,
  county text,
  city text,
  geoid text NOT NULL UNIQUE,
  jurisdiction_level text NOT NULL,
  source_name text NOT NULL,
  source_url text NOT NULL,
  coverage_status text NOT NULL DEFAULT 'needs_verification',
  last_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_civic_jurisdictions_state_county_city
  ON civic_jurisdictions(state, county, city);
CREATE INDEX IF NOT EXISTS idx_civic_jurisdictions_coverage_status
  ON civic_jurisdictions(coverage_status);