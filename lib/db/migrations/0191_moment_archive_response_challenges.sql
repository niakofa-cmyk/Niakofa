ALTER TABLE community_stories ADD COLUMN IF NOT EXISTS archive_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE community_stories ADD COLUMN IF NOT EXISTS remix_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE community_stories ADD COLUMN IF NOT EXISTS featured_at timestamptz;
ALTER TABLE community_stories ADD COLUMN IF NOT EXISTS response_to_story_id integer
  REFERENCES community_stories(id) ON DELETE SET NULL;
ALTER TABLE community_stories ADD COLUMN IF NOT EXISTS response_to_author_user_id integer
  REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE community_stories ADD COLUMN IF NOT EXISTS response_to_author_name varchar(120);
ALTER TABLE community_stories ADD COLUMN IF NOT EXISTS challenge_key varchar(80);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_stories_challenge_key_check') THEN
    ALTER TABLE community_stories ADD CONSTRAINT community_stories_challenge_key_check
      CHECK (challenge_key IS NULL OR challenge_key ~ '^[a-z0-9][a-z0-9_-]{0,79}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'community_stories_not_self_response_check') THEN
    ALTER TABLE community_stories ADD CONSTRAINT community_stories_not_self_response_check
      CHECK (response_to_story_id IS NULL OR response_to_story_id <> id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS community_stories_archive_idx
  ON community_stories(author_user_id, archive_enabled, created_at);
CREATE INDEX IF NOT EXISTS community_stories_featured_idx
  ON community_stories(community_id, featured_at);
CREATE INDEX IF NOT EXISTS community_stories_response_idx
  ON community_stories(response_to_story_id);