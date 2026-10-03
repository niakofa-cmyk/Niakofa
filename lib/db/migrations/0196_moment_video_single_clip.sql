-- A camera-captured Moment may contain one source video. Keep this constraint
-- aligned for databases that already applied 0190.
ALTER TABLE community_story_moment_compositions
  DROP CONSTRAINT IF EXISTS community_story_moment_compositions_sources_check;

ALTER TABLE community_story_moment_compositions
  ADD CONSTRAINT community_story_moment_compositions_sources_check
  CHECK (jsonb_typeof(source_media_asset_ids) = 'array'
    AND jsonb_array_length(source_media_asset_ids) BETWEEN 1 AND 6);