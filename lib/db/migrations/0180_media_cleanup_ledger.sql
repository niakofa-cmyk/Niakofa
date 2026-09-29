-- Keep provider object keys discoverable after a worker crash or a partial
-- generated-variant write. The JSON ledger is intentionally part of the
-- media row so deletion and cleanup retries retain the same row lock.
ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS cleanup_keys jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE media_processing_jobs
  DROP CONSTRAINT IF EXISTS media_processing_jobs_status_check;

ALTER TABLE media_processing_jobs
  ADD CONSTRAINT media_processing_jobs_status_check
  CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled'));