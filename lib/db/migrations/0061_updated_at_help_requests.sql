-- Migration 0061: Add updated_at to help_requests
-- This column enables:
--   • safety-ping to record last liveness timestamp (admin dashboard queryable)
--   • stale-data detection for the map layer
--   • general audit trail for any state change that doesn't have its own timestamp column
ALTER TABLE help_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
-- Back-fill with created_at so the column is never fully null on existing rows.
-- The safety-ping route will write real values going forward.
UPDATE help_requests SET updated_at = created_at WHERE updated_at IS NULL;
