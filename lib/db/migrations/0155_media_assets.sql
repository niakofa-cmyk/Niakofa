-- Niakofa-native universal media foundation.
-- This migration is deliberately additive: existing Story and direct-message
-- tables keep their original storage_key fields while gaining an optional
-- canonical media asset reference.

CREATE TABLE IF NOT EXISTS media_assets (
  id serial PRIMARY KEY,
  owner_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  context_kind text NOT NULL,
  context_id integer NOT NULL,
  media_type text NOT NULL,
  mime_type text NOT NULL,
  original_name text,
  original_key text NOT NULL UNIQUE,
  thumbnail_key text,
  variant_key text,
  byte_size integer NOT NULL,
  width integer,
  height integer,
  duration_ms integer,
  status text NOT NULL DEFAULT 'pending',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT media_assets_status_check
    CHECK (status IN ('pending', 'processing', 'ready', 'failed', 'deleted')),
  CONSTRAINT media_assets_context_kind_check
    CHECK (context_kind IN ('story', 'direct', 'request', 'hub', 'family', 'circle')),
  CONSTRAINT media_assets_media_type_check
    CHECK (media_type IN ('photo', 'video', 'audio', 'document'))
);

CREATE INDEX IF NOT EXISTS media_assets_context_idx
  ON media_assets(context_kind, context_id, created_at DESC);
CREATE INDEX IF NOT EXISTS media_assets_owner_idx
  ON media_assets(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS media_assets_status_idx
  ON media_assets(status, updated_at);

CREATE TABLE IF NOT EXISTS media_processing_jobs (
  id serial PRIMARY KEY,
  media_asset_id integer NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  job_type text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT media_processing_jobs_type_check
    CHECK (job_type IN ('probe', 'thumbnail', 'transcode', 'audio_mix')),
  CONSTRAINT media_processing_jobs_status_check
    CHECK (status IN ('queued', 'processing', 'completed', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS media_processing_jobs_asset_type_uidx
  ON media_processing_jobs(media_asset_id, job_type);
CREATE INDEX IF NOT EXISTS media_processing_jobs_queue_idx
  ON media_processing_jobs(status, created_at);

ALTER TABLE community_story_media
  ADD COLUMN IF NOT EXISTS media_asset_id integer
    REFERENCES media_assets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS community_story_media_asset_idx
  ON community_story_media(media_asset_id);

ALTER TABLE direct_message_attachments
  ADD COLUMN IF NOT EXISTS media_asset_id integer
    REFERENCES media_assets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS direct_message_attachments_asset_idx
  ON direct_message_attachments(media_asset_id);