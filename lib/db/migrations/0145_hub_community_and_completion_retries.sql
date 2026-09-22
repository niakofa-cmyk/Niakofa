-- Durable Hub community posts, comments, reactions, and object-storage media.
CREATE TABLE IF NOT EXISTS hub_community_posts (
  id SERIAL PRIMARY KEY,
  hub_id INTEGER NOT NULL REFERENCES diaspora_hubs(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body TEXT NOT NULL,
  moderation_status TEXT NOT NULL DEFAULT 'approved',
  moderation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hub_community_posts_hub_created_idx
  ON hub_community_posts (hub_id, created_at);
CREATE INDEX IF NOT EXISTS hub_community_posts_moderation_idx
  ON hub_community_posts (moderation_status, created_at);

CREATE TABLE IF NOT EXISTS hub_community_post_media (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES hub_community_posts(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  alt_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hub_community_post_media_post_idx
  ON hub_community_post_media (post_id);

CREATE TABLE IF NOT EXISTS hub_community_post_comments (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES hub_community_posts(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body TEXT NOT NULL,
  moderation_status TEXT NOT NULL DEFAULT 'approved',
  moderation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hub_community_post_comments_post_created_idx
  ON hub_community_post_comments (post_id, created_at);

CREATE TABLE IF NOT EXISTS hub_community_post_reactions (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES hub_community_posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL DEFAULT 'heart',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT hub_community_post_reactions_user_unique UNIQUE (post_id, user_id, reaction)
);

CREATE INDEX IF NOT EXISTS hub_community_post_reactions_post_idx
  ON hub_community_post_reactions (post_id);

ALTER TABLE help_requests
  ADD COLUMN IF NOT EXISTS completion_operation_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS help_requests_helper_completion_key_idx
  ON help_requests (helper_id, completion_operation_key)
  WHERE completion_operation_key IS NOT NULL;