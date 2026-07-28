-- Migration 0088: Add last_seen_at heartbeat column to audio_circle_participants.
--
-- Presence in large rooms can drift when WS leave events are dropped (network
-- blips, browser crash, mobile backgrounding). A heartbeat timestamp lets the
-- server lazily mark participants as left if they haven't pinged in > 90s,
-- preventing ghost participants from cluttering the audience count.
--
-- Also adds a pinned_message_id fk placeholder on sessions for the future
-- "pin a chat message" feature (NULL until used).

ALTER TABLE audio_circle_participants
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Index for the background sweep that marks stale participants as left.
CREATE INDEX IF NOT EXISTS audio_circle_participants_last_seen_idx
  ON audio_circle_participants(last_seen_at)
  WHERE left_at IS NULL;
