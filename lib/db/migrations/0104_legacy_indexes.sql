-- 0104_legacy_indexes.sql
--
-- Missing performance indexes for Legacy Mode tables.
--
-- WHY THIS EXISTS:
-- This file was originally committed to artifacts/api-server/migrations/
-- (path: 20260803180000_legacy_indexes.sql) which is not scanned by
-- run-migrations.mjs — only lib/db/migrations/*.sql files are applied.
-- The indexes were therefore never created on the Railway database.
-- Moved here so run-migrations.mjs applies them on next deploy.
--
-- All statements use CREATE INDEX IF NOT EXISTS — fully idempotent.

-- Memory mysteries: queried by family_id + status
CREATE INDEX IF NOT EXISTS idx_legacy_memory_mysteries_family_status
  ON legacy_memory_mysteries (family_id, status);

-- AI director missions: queried by family_id + status
CREATE INDEX IF NOT EXISTS idx_legacy_ai_director_missions_family_status
  ON legacy_ai_director_missions (family_id, status);

-- Seasonal events: queried by family_id
CREATE INDEX IF NOT EXISTS idx_legacy_seasonal_events_family_id
  ON legacy_seasonal_events (family_id);

-- World evolution log: queried by family_id, ordered by created_at DESC
CREATE INDEX IF NOT EXISTS idx_legacy_world_evolution_log_family_created
  ON legacy_world_evolution_log (family_id, created_at DESC);
