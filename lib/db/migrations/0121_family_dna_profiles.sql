-- Family DNA Connections: retain only a validated derived profile summary.
-- Raw provider exports are processed in memory by the API and are never stored.

DO $$ BEGIN
  CREATE TYPE dna_provider AS ENUM (
    'AncestryDNA',
    '23andMe',
    'MyHeritage',
    'LivingDNA',
    'FamilyTreeDNA'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE dna_import_status AS ENUM ('failed', 'ready');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS family_dna_profiles (
  id                       SERIAL PRIMARY KEY,
  family_id                INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id                  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider                 dna_provider NOT NULL,
  status                   dna_import_status NOT NULL,
  source_file_name         TEXT NOT NULL CHECK (length(source_file_name) BETWEEN 1 AND 200),
  source_format            TEXT NOT NULL CHECK (length(source_format) BETWEEN 1 AND 40),
  dataset_fingerprint      TEXT NOT NULL CHECK (length(dataset_fingerprint) = 64),
  marker_count             INTEGER NOT NULL DEFAULT 0 CHECK (marker_count >= 0),
  raw_data_retained        BOOLEAN NOT NULL DEFAULT false,
  ethnicity_available      BOOLEAN NOT NULL DEFAULT false,
  match_count              INTEGER CHECK (match_count IS NULL OR match_count >= 0),
  error_code               TEXT,
  retention_expires_at     TIMESTAMPTZ NOT NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT family_dna_profiles_family_user_unique UNIQUE (family_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_family_dna_profiles_user
  ON family_dna_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_family_dna_profiles_retention
  ON family_dna_profiles(retention_expires_at);