-- Request chat and Hub community media now participate in the universal
-- MediaAsset model while retaining their legacy storage keys for compatibility.

ALTER TABLE hub_community_post_media
  ADD COLUMN IF NOT EXISTS media_asset_id integer
    REFERENCES media_assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS hub_community_post_media_asset_idx
  ON hub_community_post_media(media_asset_id);

CREATE TABLE IF NOT EXISTS request_message_attachments (
  id serial PRIMARY KEY,
  message_id integer NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  media_asset_id integer REFERENCES media_assets(id) ON DELETE SET NULL,
  storage_key text NOT NULL UNIQUE,
  attachment_type text NOT NULL DEFAULT 'file',
  mime_type text NOT NULL,
  byte_size integer NOT NULL,
  original_name text,
  alt_text text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT request_message_attachments_size_chk
    CHECK (byte_size > 0 AND byte_size <= 5242880),
  CONSTRAINT request_message_attachments_type_chk
    CHECK (attachment_type IN ('file'))
);

CREATE INDEX IF NOT EXISTS request_message_attachments_message_idx
  ON request_message_attachments(message_id);