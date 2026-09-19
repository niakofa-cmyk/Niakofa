-- Community Stories/Moments are ephemeral social content. They are deliberately
-- separate from Messages and from durable Griot/family-history stories.
CREATE TABLE IF NOT EXISTS community_stories (
  id serial PRIMARY KEY,
  author_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hub_id integer REFERENCES diaspora_hubs(id) ON DELETE SET NULL,
  community_id integer REFERENCES communities(id) ON DELETE SET NULL,
  caption text,
  audience text NOT NULL DEFAULT 'community',
  status text NOT NULL DEFAULT 'published',
  reply_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS community_stories_author_expires_idx
  ON community_stories(author_user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS community_stories_hub_expires_idx
  ON community_stories(hub_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS community_stories_status_expires_idx
  ON community_stories(status, expires_at DESC);
CREATE INDEX IF NOT EXISTS community_stories_community_expires_idx
  ON community_stories(community_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS community_story_media (
  id serial PRIMARY KEY,
  story_id integer NOT NULL REFERENCES community_stories(id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  thumbnail_storage_key text,
  media_type text NOT NULL,
  mime_type text NOT NULL,
  byte_size integer NOT NULL,
  duration_ms integer,
  width integer,
  height integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_story_media_story_idx
  ON community_story_media(story_id);

CREATE TABLE IF NOT EXISTS community_story_elements (
  id serial PRIMARY KEY,
  story_id integer NOT NULL REFERENCES community_stories(id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  position_x real NOT NULL DEFAULT 50,
  position_y real NOT NULL DEFAULT 50,
  scale real NOT NULL DEFAULT 1,
  rotation real NOT NULL DEFAULT 0,
  z_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_story_elements_story_idx
  ON community_story_elements(story_id);