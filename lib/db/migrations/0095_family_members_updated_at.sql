-- Migration 0095: Add updated_at column to family_members
--
-- WHY THIS EXISTS:
-- family_members only had created_at. The Legacy Mode fingerprint
-- (artifacts/api-server/src/routes/legacy.ts, buildReservoir()) hashes
-- member id+updated_at to detect when family knowledge changes so the game
-- world/quests regenerate. Without this column, editing an existing
-- member's name/role/relation after creation was invisible to the
-- fingerprint — the app fell back to created_at, which never changes.
--
-- Backfilled to created_at for existing rows so this migration doesn't
-- itself cause a mass fingerprint change/regeneration for every family on
-- deploy — the "new" updated_at starts equal to the old create-time value.

ALTER TABLE family_members
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE family_members
  SET updated_at = created_at
  WHERE updated_at IS DISTINCT FROM created_at;
