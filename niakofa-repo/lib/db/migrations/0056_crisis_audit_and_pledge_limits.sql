-- Migration 0056: crisis-clear audit trail
--
-- The one action that makes a real emergency disappear from the map
-- (clearing a hub's is_crisis flag) had no record of who did it or why.
-- Adds a resolution note + cleared-by/at pair, mirroring the existing
-- crisis_declared_by/at columns from migration 0054.
--
-- Idempotent throughout (see CLAUDE.md Incident #2).

ALTER TABLE diaspora_hubs
  ADD COLUMN IF NOT EXISTS crisis_resolved_note TEXT,
  ADD COLUMN IF NOT EXISTS crisis_cleared_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS crisis_cleared_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
