-- 0100_legacy_quest_progress.sql
--
-- Quest completion was never durably persisted. POST
-- /api/legacy/quests/:familyId/:questId/complete only busted the quest
-- cache and re-synced achievement *counts* (which are derived from real
-- vault rows elsewhere, e.g. memories/interviews/chapters) — nothing
-- recorded that THIS quest id was completed BY this user. That means:
--   1. The same quest could be "completed" repeatedly with no record of
--      it having happened before.
--   2. There was no queryable history of a family's/user's completed
--      quests independent of the 6h quest cache expiring.
--
-- AI-generated quests (see legacy.ts's AiQuest) are cached per
-- family+fingerprint and are not first-class DB rows, so quest_id is only
-- guaranteed stable for the fingerprint it was generated under — this
-- table stores the fingerprint alongside the quest_id for that reason,
-- and snapshots quest_title/quest_category so a completion record still
-- reads correctly after the quest cache entry itself has expired.
--
-- Tables: legacy_quest_progress

CREATE TABLE IF NOT EXISTS legacy_quest_progress (
  id              serial PRIMARY KEY,
  family_id       integer NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  user_id         integer NOT NULL,
  quest_id        text NOT NULL,
  fingerprint     text NOT NULL,
  quest_title     text NOT NULL,
  quest_category  text NOT NULL,
  xp_awarded      integer NOT NULL DEFAULT 0,
  completed_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legacy_quest_progress_family
  ON legacy_quest_progress (family_id);

CREATE INDEX IF NOT EXISTS idx_legacy_quest_progress_user
  ON legacy_quest_progress (family_id, user_id);

-- Enforced at the DB level (not just app logic) so re-completing the
-- identical quest can only ever be a no-op, never a duplicate XP/credit,
-- even under concurrent requests.
CREATE UNIQUE INDEX IF NOT EXISTS idx_legacy_quest_progress_uidx
  ON legacy_quest_progress (family_id, user_id, quest_id, fingerprint);
