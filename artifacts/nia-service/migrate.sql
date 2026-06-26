CREATE TABLE IF NOT EXISTS nia_conversations (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  session_id TEXT NOT NULL,
  user_message TEXT NOT NULL,
  nia_response TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS nia_conversations_session_idx ON nia_conversations (session_id);
CREATE INDEX IF NOT EXISTS nia_conversations_created_at_idx ON nia_conversations (created_at);

CREATE TABLE IF NOT EXISTS nia_memories (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  memory TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Phase 1: Structured memory — JSONB subfields for high-signal facts.
-- Shape: { recurring_needs, accessibility_notes, people_mentioned, corrections,
--          preferred_language, emotional_arc, resources_that_worked }
-- Idempotent — safe to re-run.
ALTER TABLE nia_memories
  ADD COLUMN IF NOT EXISTS structured JSONB NOT NULL DEFAULT '{}';

-- Index for crisis follow-up worker (queries by user_id)
CREATE INDEX IF NOT EXISTS nia_conversations_user_id_idx
  ON nia_conversations (user_id);

-- system_settings: persists admin toggles (e.g. nia_enabled) across redeploys
CREATE TABLE IF NOT EXISTS system_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
