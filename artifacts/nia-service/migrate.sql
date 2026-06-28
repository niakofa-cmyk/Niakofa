CREATE TABLE IF NOT EXISTS nia_conversations (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  session_id TEXT NOT NULL,
  user_message TEXT NOT NULL,
  nia_response TEXT NOT NULL,
  -- is_crisis: set by checkSafety() at save-time in routes/chat.ts
  -- Used by crisis follow-up worker (crisis-followup-worker.ts) to find
  -- users who need a gentle check-in 48-72h after a crisis-flagged message.
  is_crisis BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add is_crisis if this table already exists from an older migration
ALTER TABLE nia_conversations
  ADD COLUMN IF NOT EXISTS is_crisis BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS nia_conversations_session_idx ON nia_conversations (session_id);
CREATE INDEX IF NOT EXISTS nia_conversations_created_at_idx ON nia_conversations (created_at);
CREATE INDEX IF NOT EXISTS nia_conversations_user_id_idx ON nia_conversations (user_id);
-- Index for crisis follow-up worker: quickly find crisis rows by time window
CREATE INDEX IF NOT EXISTS nia_conversations_crisis_idx
  ON nia_conversations (user_id, created_at)
  WHERE is_crisis = TRUE;

CREATE TABLE IF NOT EXISTS nia_memories (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  memory TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Phase 1: Structured memory — JSONB subfields for high-signal facts.
ALTER TABLE nia_memories
  ADD COLUMN IF NOT EXISTS structured JSONB NOT NULL DEFAULT '{}';

-- system_settings: persists admin toggles (e.g. nia_enabled) across redeploys
CREATE TABLE IF NOT EXISTS system_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- nia_knowledge: Nia's continuous learning store.
-- Keyed entries (e.g. 'fort_worth_news', 'community_trends') with TTL.
-- The continuous-learning worker writes here every 6h.
-- chat.ts injects fresh entries into Nia's context prefix.
CREATE TABLE IF NOT EXISTS nia_knowledge (
  key         TEXT PRIMARY KEY,
  content     TEXT NOT NULL,
  source      TEXT,
  learned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS nia_knowledge_expires_idx
  ON nia_knowledge (expires_at)
  WHERE expires_at IS NOT NULL;

-- push_notification_queue: lightweight queue for proactive Nia notifications.
-- Written by: ambient-presence-worker.ts, general-checkin-worker.ts
-- Consumed by: a future notification sender (api-server or standalone worker).
-- Non-fatal if not yet consumed — rows accumulate until drained.
--
-- BUG-14c FIX: This table was previously missing from migrate.sql.
-- Both ambient-presence-worker and general-checkin-worker tried to INSERT
-- into it on every cycle, throwing "relation does not exist" silently
-- (caught by their per-insert try/catch). All push notifications were
-- silently dropped on every nia-service boot.
CREATE TABLE IF NOT EXISTS push_notification_queue (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  data       JSONB NOT NULL DEFAULT '{}',
  sent_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS push_notification_queue_unsent_idx
  ON push_notification_queue (user_id, created_at)
  WHERE sent_at IS NULL;
