-- Migration 0087: Add hand_raised_at timestamp to audio_circle_participants.
--
-- Previously hand_raised was a bare boolean — the host saw names in the
-- raised-hands queue but had no idea who raised first, so "Bring Up" order
-- was arbitrary. This timestamp lets the frontend sort the queue by wait
-- time (longest waiting first) and show a live "Xm Ys" counter next to
-- each raised hand without relying on client-side memory that is lost on
-- page refresh.
--
-- Also adds a speaker_limit_reached notification field and a
-- hand_raised_at index so the raised-hand queue lookup stays O(log n) as
-- rooms grow.

ALTER TABLE audio_circle_participants
  ADD COLUMN IF NOT EXISTS hand_raised_at TIMESTAMPTZ;

-- Backfill: rows that already have hand_raised=true get "now" as a
-- placeholder (better than NULL for queue sort).
UPDATE audio_circle_participants
  SET hand_raised_at = NOW()
  WHERE hand_raised = true AND hand_raised_at IS NULL;

CREATE INDEX IF NOT EXISTS audio_circle_participants_hand_raised_at_idx
  ON audio_circle_participants(session_id, hand_raised_at)
  WHERE hand_raised = true AND left_at IS NULL;
