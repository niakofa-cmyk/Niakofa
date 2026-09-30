-- Moment-only server-side camera-clip reels. Original Story attachment rows
-- remain intact; this relation tracks only the opt-in derived video.
CREATE TABLE IF NOT EXISTS community_story_moment_compositions (
  id serial PRIMARY KEY,
  story_id integer NOT NULL REFERENCES community_stories(id) ON DELETE CASCADE,
  derived_media_asset_id integer NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  source_media_asset_ids jsonb NOT NULL,
  source_fingerprint varchar(64) NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_story_moment_compositions_status_check
    CHECK (status IN ('queued', 'processing', 'ready', 'failed')),
  CONSTRAINT community_story_moment_compositions_sources_check
    CHECK (jsonb_typeof(source_media_asset_ids) = 'array'
      AND jsonb_array_length(source_media_asset_ids) BETWEEN 2 AND 6),
  CONSTRAINT community_story_moment_compositions_fingerprint_check
    CHECK (source_fingerprint ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS community_story_moment_compositions_story_uidx
  ON community_story_moment_compositions(story_id);
CREATE UNIQUE INDEX IF NOT EXISTS community_story_moment_compositions_asset_uidx
  ON community_story_moment_compositions(derived_media_asset_id);
CREATE INDEX IF NOT EXISTS community_story_moment_compositions_status_idx
  ON community_story_moment_compositions(status, updated_at);

ALTER TABLE media_processing_jobs
  DROP CONSTRAINT IF EXISTS media_processing_jobs_type_check;
ALTER TABLE media_processing_jobs
  ADD CONSTRAINT media_processing_jobs_type_check
  CHECK (job_type IN ('probe', 'thumbnail', 'transcode', 'audio_mix', 'moment_compose'));