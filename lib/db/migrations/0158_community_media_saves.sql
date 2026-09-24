-- Private, idempotent Community Media saves.
-- Saves point to the Hub post attachment rather than duplicating universal media
-- storage or changing the visibility of the underlying post.

CREATE TABLE IF NOT EXISTS community_media_saves (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media_id integer NOT NULL REFERENCES hub_community_post_media(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS community_media_saves_user_media_uidx
  ON community_media_saves(user_id, media_id);

CREATE INDEX IF NOT EXISTS community_media_saves_user_created_idx
  ON community_media_saves(user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS community_media_saves_media_idx
  ON community_media_saves(media_id);