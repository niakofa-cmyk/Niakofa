-- Migration: enhance nia_user_memory table
-- Run this against your Postgres instance before deploying nia-memory.ts

-- Add new columns if they don't exist yet
ALTER TABLE nia_user_memory
  ADD COLUMN IF NOT EXISTS confidence       FLOAT   NOT NULL DEFAULT 0.8,
  ADD COLUMN IF NOT EXISTS location_context TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Ensure unique constraint on (user_id, key) for upsert
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'nia_user_memory_user_id_key_unique'
  ) THEN
    ALTER TABLE nia_user_memory
      ADD CONSTRAINT nia_user_memory_user_id_key_unique UNIQUE (user_id, key);
  END IF;
END $$;

-- Index for fast user lookups sorted by recency
CREATE INDEX IF NOT EXISTS idx_nia_memory_user_updated
  ON nia_user_memory (user_id, updated_at DESC);

-- Index for geographic queries (future: "show helpers near user's preferred location")
CREATE INDEX IF NOT EXISTS idx_nia_memory_location
  ON nia_user_memory (location_context)
  WHERE location_context IS NOT NULL;

-- Backfill updated_at = created_at for existing rows
UPDATE nia_user_memory
SET updated_at = created_at
WHERE updated_at IS NULL OR updated_at = NOW();
