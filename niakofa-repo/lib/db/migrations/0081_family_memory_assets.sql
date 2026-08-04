-- Migration 0081: Diaspora Platform — Family Memory Assets
--
-- Adds family_memory_assets: one row per file attached to a family_memory.
-- storage_key references object storage (S3/R2) — never raw bytes in Postgres.
--
-- Additive-only. Idempotent.

DO $$ BEGIN
  CREATE TYPE family_asset_type AS ENUM (
    'photo',
    'video',
    'audio',
    'document'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE family_asset_processing_status AS ENUM (
    'uploaded',
    'processing',
    'ready',
    'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS family_memory_assets (
  id                 SERIAL PRIMARY KEY,
  memory_id          INTEGER NOT NULL REFERENCES family_memories(id) ON DELETE CASCADE,
  asset_type         family_asset_type NOT NULL,
  -- e.g. "families/12/memories/88/original.jpg" — points into object storage
  storage_key        TEXT NOT NULL,
  thumbnail_key      TEXT,
  mime_type          TEXT NOT NULL,
  byte_size          INTEGER,
  duration_seconds   INTEGER,  -- audio/video only
  width              INTEGER,
  height             INTEGER,
  -- populated by Nia transcription worker for audio/video assets
  transcript         TEXT,
  processing_status  family_asset_processing_status NOT NULL DEFAULT 'uploaded',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_family_memory_assets_memory ON family_memory_assets(memory_id);
CREATE INDEX IF NOT EXISTS idx_family_memory_assets_status ON family_memory_assets(processing_status);
