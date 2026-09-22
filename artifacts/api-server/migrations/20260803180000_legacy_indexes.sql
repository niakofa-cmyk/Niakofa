-- Add missing indexes for Legacy Mode tables to improve query performance
-- These indexes address gaps identified in the Legacy Mode audit

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
