CREATE TABLE IF NOT EXISTS media_upload_sessions (
  media_asset_id integer PRIMARY KEY REFERENCES media_assets(id) ON DELETE CASCADE,
  chunk_size integer NOT NULL CHECK (chunk_size > 0),
  next_offset integer NOT NULL DEFAULT 0 CHECK (next_offset >= 0),
  finalized boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS media_upload_chunks (
  id serial PRIMARY KEY,
  media_asset_id integer NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  byte_offset integer NOT NULL CHECK (byte_offset >= 0),
  byte_length integer NOT NULL CHECK (byte_length > 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  object_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT media_upload_chunks_asset_offset_uidx UNIQUE (media_asset_id, byte_offset)
);