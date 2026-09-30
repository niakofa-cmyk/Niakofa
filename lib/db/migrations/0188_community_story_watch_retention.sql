-- Backfill the day key for already-recorded idempotency tokens so the scheduled
-- 90-day retention cleanup can expire them in lockstep with daily aggregates.
ALTER TABLE community_story_watch_event_keys
  ADD COLUMN IF NOT EXISTS play_day date;

UPDATE community_story_watch_event_keys
SET play_day = (created_at AT TIME ZONE 'UTC')::date
WHERE play_day IS NULL;

ALTER TABLE community_story_watch_event_keys
  ALTER COLUMN play_day SET DEFAULT CURRENT_DATE,
  ALTER COLUMN play_day SET NOT NULL;

CREATE INDEX IF NOT EXISTS community_story_watch_daily_play_day_idx
  ON community_story_watch_daily(play_day);
DROP INDEX IF EXISTS community_story_watch_event_key_created_idx;
CREATE INDEX IF NOT EXISTS community_story_watch_event_key_play_day_idx
  ON community_story_watch_event_keys(play_day);