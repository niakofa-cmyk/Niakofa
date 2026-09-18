CREATE TABLE IF NOT EXISTS direct_message_attachments (
  id serial PRIMARY KEY,
  message_id integer NOT NULL REFERENCES direct_messages(id) ON DELETE CASCADE,
  storage_key text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  byte_size integer NOT NULL,
  original_name text,
  alt_text text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT direct_message_attachments_size_chk
    CHECK (byte_size > 0 AND byte_size <= 5242880)
);

CREATE INDEX IF NOT EXISTS direct_message_attachments_message_idx
  ON direct_message_attachments(message_id);