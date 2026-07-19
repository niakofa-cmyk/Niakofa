-- Migration 0033: background_check_id + ToS waiver on users
--
-- background_check_id: Checkr's candidate ID, stored when we initiate a check
--   so we can match incoming webhooks back to the right user row.
--
-- tos_waiver_accepted_at: timestamp when the user accepted the current ToS
--   version. NULL = never accepted (should be gated in UI for sensitive tasks).
--
-- tos_waiver_version: the version string of the ToS they accepted (e.g.
--   "2026-07"). When the ToS text is updated, increment this version and
--   users will be prompted to re-accept before posting sensitive requests.
--
-- pledge_status 'defaulted': new value for the pledge_status check constraint.
--   Existing check constraints on text columns are not enforced in Postgres
--   unless explicitly added, so this is informational — no DDL change needed
--   for the column itself. The application already writes this value.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS background_check_id text,
  ADD COLUMN IF NOT EXISTS tos_waiver_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS tos_waiver_version text;

-- Index for webhook matching (Checkr → user lookup)
CREATE INDEX IF NOT EXISTS users_background_check_id_idx
  ON users (background_check_id)
  WHERE background_check_id IS NOT NULL;

-- Index for admin finding users who still need background checks
CREATE INDEX IF NOT EXISTS users_bg_check_status_idx
  ON users (background_check_status)
  WHERE background_check_status IN ('not_started', 'pending', 'failed');
