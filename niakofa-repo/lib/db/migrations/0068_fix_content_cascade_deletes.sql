-- 0068_fix_content_cascade_deletes.sql
--
-- Data-loss audit fix. Three foreign keys were set to ON DELETE CASCADE
-- where the referenced row is community CONTENT (a civic need post, an
-- audio circle session, a heritage-archive story) rather than a pure
-- ownership/membership link. Deleting a single user account was silently
-- destroying that content for every other user who claimed, joined, or
-- relied on it — not just data belonging to the deleted account.
--
-- Pattern used elsewhere in this same schema for exactly this reason:
-- civic_needs.claimed_by_user_id, griot_stories.request_id/community_id/
-- hub_id, diaspora_hubs.created_by, etc. all already use ON DELETE SET NULL.
-- These three were the inconsistent outliers. This migration brings them
-- in line and is safe to run on a live database — it only changes what
-- happens on a FUTURE delete; it does not touch existing rows.

BEGIN;

-- ── civic_needs.posted_by_user_id ───────────────────────────────────────
-- Was: deleting the posting user's account deleted the entire need (title,
-- geocoded lat/lng, claim/completion history), even needs already fulfilled
-- by someone else.
ALTER TABLE civic_needs
  ALTER COLUMN posted_by_user_id DROP NOT NULL;

ALTER TABLE civic_needs
  DROP CONSTRAINT IF EXISTS civic_needs_posted_by_user_id_users_id_fk;
ALTER TABLE civic_needs
  ADD CONSTRAINT civic_needs_posted_by_user_id_users_id_fk
  FOREIGN KEY (posted_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

-- ── civic_needs.government_sponsor_id ───────────────────────────────────
-- Was: removing/re-seeding a sponsor wiped every need it ever posted,
-- including completed ones that are part of the county's public record.
-- RESTRICT forces an explicit decision instead of a silent bulk delete.
ALTER TABLE civic_needs
  DROP CONSTRAINT IF EXISTS civic_needs_government_sponsor_id_government_sponsors_id_fk;
ALTER TABLE civic_needs
  ADD CONSTRAINT civic_needs_government_sponsor_id_government_sponsors_id_fk
  FOREIGN KEY (government_sponsor_id) REFERENCES government_sponsors(id) ON DELETE RESTRICT;

-- ── audio_circle_sessions.host_id ───────────────────────────────────────
-- Was: deleting the host's account deleted the session row, which then
-- cascade-deleted every OTHER participant's row (audio_circle_participants
-- cascades from session_id) — one host's account removal took an entire
-- conversation and everyone else's history down with it.
ALTER TABLE audio_circle_sessions
  ALTER COLUMN host_id DROP NOT NULL;

ALTER TABLE audio_circle_sessions
  DROP CONSTRAINT IF EXISTS audio_circle_sessions_host_id_users_id_fk;
ALTER TABLE audio_circle_sessions
  ADD CONSTRAINT audio_circle_sessions_host_id_users_id_fk
  FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE SET NULL;

-- ── griot_stories.author_id ──────────────────────────────────────────────
-- Was: the one cascading FK in a table where request_id, gratitude_post_id,
-- community_id, and hub_id all deliberately use SET NULL. A heritage-archive
-- recording — the thing this table exists to preserve — was destroyed the
-- moment its author's account was deleted.
ALTER TABLE griot_stories
  ALTER COLUMN author_id DROP NOT NULL;

ALTER TABLE griot_stories
  DROP CONSTRAINT IF EXISTS griot_stories_author_id_users_id_fk;
ALTER TABLE griot_stories
  ADD CONSTRAINT griot_stories_author_id_users_id_fk
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL;

COMMIT;

-- Note: this migration only changes behavior for deletes that happen AFTER
-- it runs. If accounts were already deleted under the old CASCADE rule,
-- that content is already gone and cannot be recovered from this database —
-- only from a backup/snapshot taken before the deletion.
