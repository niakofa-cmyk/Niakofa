-- V21 media assets use private staging contexts before they are attached to
-- a persisted Community or Hub Moment. Exchange Spark drafts also own uploads.
ALTER TABLE media_assets
  DROP CONSTRAINT IF EXISTS media_assets_context_kind_check;

ALTER TABLE media_assets
  ADD CONSTRAINT media_assets_context_kind_check
  CHECK (context_kind IN (
    'story',
    'direct',
    'request',
    'hub',
    'family',
    'circle',
    'exchange_spark',
    'community_moment',
    'hub_moment'
  ));

ALTER TABLE media_assets
  DROP CONSTRAINT IF EXISTS media_assets_status_check;

ALTER TABLE media_assets
  ADD CONSTRAINT media_assets_status_check
  CHECK (status IN ('pending', 'processing', 'ready', 'failed', 'deleted', 'deletion_pending'));