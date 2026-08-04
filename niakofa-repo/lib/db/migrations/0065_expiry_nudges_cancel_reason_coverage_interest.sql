-- Migration 0065: Request Expiry Nudges, Helper Cancel Reasons, Coverage Interest
--
-- Adds:
--   1. help_requests.expiry_nudge_sent_at   — dedupe marker for the pre-expiry
--      "no one's claimed this yet" nudge sent by cleanup-worker.
--   2. help_requests.last_helper_cancel_reason / last_cancelled_by_helper_id —
--      audit trail for helper drop-offs. A reason of 'request_changed' means
--      the requester altered the task/address out from under the helper —
--      that drop is not the helper's fault, so it must not count against
--      their no_show_count (see requests.ts POST /:id/cancel).
--   3. coverage_interest — lightweight demand signal for counties that don't
--      have an active pool yet. A user who posts outside coverage can ask to
--      be notified when their county activates; admins can see aggregate
--      demand by neighborhood without any pool machinery existing yet.
--
-- Idempotent — safe to re-run.

ALTER TABLE help_requests
  ADD COLUMN IF NOT EXISTS expiry_nudge_sent_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_helper_cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS last_cancelled_by_helper_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS coverage_interest (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  neighborhood TEXT,
  email TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  notified_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS coverage_interest_created_at_idx ON coverage_interest (created_at);
