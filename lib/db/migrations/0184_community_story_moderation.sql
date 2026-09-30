ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS reported_community_story_id integer;

CREATE INDEX IF NOT EXISTS reports_reported_community_story_id_idx
  ON reports(reported_community_story_id);

CREATE UNIQUE INDEX IF NOT EXISTS reports_community_story_reporter_unique_idx
  ON reports(reporter_id, reported_community_story_id)
  WHERE reported_community_story_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS community_story_author_mutes (
  viewer_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  muted_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT community_story_author_mutes_pkey PRIMARY KEY (viewer_user_id, muted_user_id),
  CONSTRAINT community_story_author_mutes_distinct_users CHECK (viewer_user_id <> muted_user_id)
);

CREATE INDEX IF NOT EXISTS community_story_author_mutes_muted_idx
  ON community_story_author_mutes(muted_user_id);