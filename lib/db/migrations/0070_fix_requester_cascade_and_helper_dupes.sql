-- 0070_fix_requester_cascade_and_helper_dupes.sql
--
-- Closes the last live data-loss path in the account-delete flow:
--
-- 1. help_requests.requester_id was ON DELETE CASCADE (migration 0020). The
--    app-level guard in users.ts only blocks deletion while the account has
--    an OPEN/ACTIVE request — a user whose requests are all completed or
--    cancelled could still be deleted, and every one of those completed
--    requests would be cascade-deleted along with them, silently erasing
--    real request history. Switched to ON DELETE RESTRICT: the database now
--    refuses the delete outright if any request (any status) still
--    references the user, so history can never vanish as a side effect.
--    (The users.ts app-level guard is updated in lockstep to check ALL
--    requester_id rows, not just active ones, so the user gets a clear 409
--    instead of a raw constraint-violation 500.)
--
-- 2. Drizzle had accumulated a second, redundant FK constraint alongside the
--    hand-written migration-0020 ones for both requester_id and helper_id
--    (harmless but confusing — two constraints enforcing the same rule).
--    Cleaned up to a single constraint per column.
--
-- 3. request_helpers.helper_id was ON DELETE CASCADE. This table is part of
--    the multi-helper payment-split trail — cascading it away on account
--    deletion would erase the record that a helper was once in a chain and
--    received a share of a payout. Switched to ON DELETE SET NULL, matching
--    the pattern already used for diaspora_hub_pledges.pledged_by (0069).

DO $$
BEGIN
  -- 1 & 2. help_requests.requester_id: drop whichever FK constraints exist, re-add one with RESTRICT.
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'help_requests_requester_id_fk') THEN
    ALTER TABLE help_requests DROP CONSTRAINT help_requests_requester_id_fk;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'help_requests_requester_id_users_id_fk') THEN
    ALTER TABLE help_requests DROP CONSTRAINT help_requests_requester_id_users_id_fk;
  END IF;
  ALTER TABLE help_requests
    ADD CONSTRAINT help_requests_requester_id_fk
    FOREIGN KEY (requester_id) REFERENCES users(id) ON DELETE RESTRICT;
  RAISE NOTICE 'help_requests.requester_id: CASCADE -> RESTRICT';
END $$;

DO $$
BEGIN
  -- Tidy up the redundant duplicate constraint on helper_id (already SET NULL either way).
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'help_requests_helper_id_users_id_fk') THEN
    ALTER TABLE help_requests DROP CONSTRAINT help_requests_helper_id_users_id_fk;
    RAISE NOTICE 'help_requests.helper_id: dropped redundant duplicate FK constraint';
  END IF;
END $$;

DO $$
BEGIN
  -- 3. request_helpers.helper_id: allow NULL, then swap CASCADE -> SET NULL.
  ALTER TABLE request_helpers ALTER COLUMN helper_id DROP NOT NULL;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'request_helpers_helper_id_fkey') THEN
    ALTER TABLE request_helpers DROP CONSTRAINT request_helpers_helper_id_fkey;
  END IF;
  ALTER TABLE request_helpers
    ADD CONSTRAINT request_helpers_helper_id_fkey
    FOREIGN KEY (helper_id) REFERENCES users(id) ON DELETE SET NULL;
  RAISE NOTICE 'request_helpers.helper_id: CASCADE -> SET NULL';
END $$;
