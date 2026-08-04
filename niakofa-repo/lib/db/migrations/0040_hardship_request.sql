-- Migration 0040: Hardship / forgiveness self-service
-- Adds two nullable columns to help_requests:
--   hardship_requested_at — set when a requester self-submits a hardship request
--   hardship_note         — optional explanation the requester provides
--
-- Admins review via GET /api/admin/hardship-requests and resolve via the existing
-- PATCH /api/admin/requests/:id/pledge-status endpoint (setting pledge_status to
-- 'forgiven' or 'written_off').
--
-- Both columns are nullable so they can be added to production with zero downtime.

ALTER TABLE help_requests
  ADD COLUMN IF NOT EXISTS hardship_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hardship_note         TEXT;

-- Index for the admin queue: fast scan of pending hardship requests
CREATE INDEX IF NOT EXISTS help_requests_hardship_idx
  ON help_requests (hardship_requested_at)
  WHERE hardship_requested_at IS NOT NULL;
