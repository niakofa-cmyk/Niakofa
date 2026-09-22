-- Durable upload metadata and versioned Story composition state.
-- This is additive so existing legacy attachment rows remain readable.

ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS composition_manifest jsonb;

CREATE INDEX IF NOT EXISTS media_assets_manifest_idx
  ON media_assets ((composition_manifest IS NOT NULL));

ALTER TABLE community_stories
  ADD COLUMN IF NOT EXISTS composition_manifest jsonb;