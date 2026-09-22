-- Phase 2 (partial) + check-in worker fix: idempotent — safe to run multiple times.

-- nia-checkin-worker.ts (api-server) has referenced this column since it was
-- written, but it was never actually migrated — every hourly run was throwing
-- "column nia_checkin_sent_at does not exist". This adds the column and the
-- index the worker's own query depends on for fast lookups of unsent,
-- recently-completed requests.
ALTER TABLE help_requests
  ADD COLUMN IF NOT EXISTS nia_checkin_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS help_requests_checkin_idx
  ON help_requests (completed_at, nia_checkin_sent_at)
  WHERE status = 'completed' AND nia_checkin_sent_at IS NULL;

-- Crisis-flag tracking on nia_conversations, needed before any crisis-specific
-- follow-up worker (Phase 2) can query "which threads were crisis-flagged and
-- never followed up on" — previously there was no column recording this at
-- all, so that worker had nothing to select against.
ALTER TABLE nia_conversations
  ADD COLUMN IF NOT EXISTS is_crisis BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS nia_conversations_crisis_idx
  ON nia_conversations (user_id, created_at)
  WHERE is_crisis = TRUE;
