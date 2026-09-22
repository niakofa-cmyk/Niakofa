-- Phase 1: Structured memory column for nia_memories
-- Idempotent — safe to run multiple times.

ALTER TABLE nia_memories
  ADD COLUMN IF NOT EXISTS structured JSONB NOT NULL DEFAULT '{}';

-- nia_conversations: index on user_id for crisis follow-up worker query
-- (may already exist from 0011, safe to create if not)
CREATE INDEX IF NOT EXISTS nia_conversations_user_id_idx
  ON nia_conversations (user_id);
