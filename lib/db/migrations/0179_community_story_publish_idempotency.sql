-- Optional, short-lived idempotency metadata for media-less Community Stories.
-- Existing rows remain unkeyed; Story deletion naturally removes the key.
ALTER TABLE community_stories
  ADD COLUMN IF NOT EXISTS client_publish_id varchar(36),
  ADD COLUMN IF NOT EXISTS publish_payload_hash varchar(64);

CREATE UNIQUE INDEX IF NOT EXISTS community_stories_author_client_publish_uidx
  ON community_stories (author_user_id, client_publish_id)
  WHERE client_publish_id IS NOT NULL;