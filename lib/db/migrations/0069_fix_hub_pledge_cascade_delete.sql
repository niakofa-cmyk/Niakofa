-- 0069_fix_hub_pledge_cascade_delete.sql
--
-- Data-loss audit fix (follow-up to 0068). diaspora_hub_pledges.pledged_by
-- was still ON DELETE CASCADE — the same "content vs. ownership link" bug
-- class that 0068 fixed for civic_needs, audio_circle_sessions, and
-- griot_stories, but missed here because this table lives in a separate
-- schema file.
--
-- A "pledged" row records real money already captured via Stripe and
-- credited to the receiving hub's community pool (see recordPoolContribution
-- in the webhook handler). Deleting the pledging user's account must not
-- delete that financial record — it belongs to the receiving hub's
-- crisis-relief history as much as to the person who sent it.
--
-- routes/users.ts already blocks self-delete and admin-delete while any
-- pledge exists on the account (findBlockingPledges()), so this cascade was
-- not actively firing through the app's normal delete paths. This migration
-- closes the gap at the schema level so a check-then-delete race, or any
-- future/manual deletion path that doesn't inherit that guard, can't destroy
-- pledge history either. Safe to run on a live database — it only changes
-- what happens on a FUTURE delete; it does not touch existing rows.

BEGIN;

ALTER TABLE diaspora_hub_pledges
  ALTER COLUMN pledged_by DROP NOT NULL;

ALTER TABLE diaspora_hub_pledges
  DROP CONSTRAINT IF EXISTS diaspora_hub_pledges_pledged_by_users_id_fk;
ALTER TABLE diaspora_hub_pledges
  ADD CONSTRAINT diaspora_hub_pledges_pledged_by_users_id_fk
  FOREIGN KEY (pledged_by) REFERENCES users(id) ON DELETE SET NULL;

COMMIT;

-- Note: this migration only changes behavior for deletes that happen AFTER
-- it runs. If a pledging account was already deleted under the old CASCADE
-- rule, that pledge record is already gone and cannot be recovered from this
-- database — only from a backup/snapshot taken before the deletion.
