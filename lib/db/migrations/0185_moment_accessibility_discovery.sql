ALTER TABLE community_stories
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT ARRAY[]::text[];

ALTER TABLE community_story_media
  ADD COLUMN IF NOT EXISTS alt_text varchar(250),
  ADD COLUMN IF NOT EXISTS captions_vtt text;

CREATE INDEX IF NOT EXISTS community_stories_author_feed_idx
  ON community_stories(author_user_id, status, expires_at, created_at DESC);

CREATE INDEX IF NOT EXISTS community_stories_tags_gin_idx
  ON community_stories USING GIN(tags);

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS community_stories_caption_trgm_idx
  ON community_stories USING GIN(coalesce(caption, '') gin_trgm_ops);