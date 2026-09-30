-- Privacy-bounded per-viewer daily totals survive the 24-hour Story cleanup.
-- story_id is deliberately not a foreign key: deleting expired Stories must not
-- erase their already-aggregated creator insights.
CREATE TABLE IF NOT EXISTS community_story_watch_daily (
  id serial PRIMARY KEY,
  story_id integer NOT NULL,
  creator_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewer_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  play_day date NOT NULL,
  duration_ms integer NOT NULL DEFAULT 0
    CONSTRAINT community_story_watch_daily_duration_check CHECK (duration_ms >= 0 AND duration_ms <= 300000),
  completed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT community_story_watch_daily_story_viewer_day_uidx UNIQUE (story_id, viewer_user_id, play_day)
);

CREATE INDEX IF NOT EXISTS community_story_watch_daily_creator_day_idx
  ON community_story_watch_daily(creator_user_id, play_day);
CREATE INDEX IF NOT EXISTS community_story_watch_daily_play_day_idx
  ON community_story_watch_daily(play_day);

-- This table stores only dedupe keys, not playback metadata. Retrying a
-- contribution cannot add its duration or completion flag twice.
CREATE TABLE IF NOT EXISTS community_story_watch_event_keys (
  id serial PRIMARY KEY,
  viewer_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_event_id uuid NOT NULL,
  play_day date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT community_story_watch_event_key_uidx UNIQUE (viewer_user_id, client_event_id)
);
CREATE INDEX IF NOT EXISTS community_story_watch_event_key_play_day_idx
  ON community_story_watch_event_keys(play_day);