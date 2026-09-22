-- 0099_legacy_family_challenges_real.sql
--
-- Supersedes 0097_legacy_family_challenges.sql, which was documentation-only
-- ("Applied via Supabase MCP apply_migration tool... for version control /
-- audit trail only") and never actually created these tables against the
-- Railway Postgres DB that the deployed app runs against. Every call to the
-- mounted /api/legacy/challenges/:familyId route was hitting
-- "relation does not exist" in production.
--
-- Per BUG-H13 (CLAUDE.md incident log): Legacy Engine tables must use serial
-- integer PKs to match family_id / member_id FK types elsewhere in the
-- schema (families.id, family_members.id are both serial integers) — NOT
-- uuid, which the original route code (legacy-challenges.ts) had assumed.
--
-- Tables: legacy_family_challenges, legacy_challenge_contributions
-- Enums:  legacy_challenge_type, legacy_challenge_status, legacy_contribution_type
-- Trigger: fn_check_challenge_complete auto-completes a challenge when its
--          contribution count reaches its goal.

-- ── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE legacy_challenge_type AS ENUM (
    'story_collection', 'preservation', 'exploration', 'reunion'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE legacy_challenge_status AS ENUM (
    'active', 'completed', 'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE legacy_contribution_type AS ENUM (
    'interview', 'photo', 'story', 'location', 'document', 'checkin'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── legacy_family_challenges ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_family_challenges (
  id                    serial PRIMARY KEY,
  family_id             integer NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  challenge_type        legacy_challenge_type NOT NULL,
  title                 text NOT NULL,
  description           text NOT NULL,
  goal                  integer NOT NULL DEFAULT 5,
  reward_title          text,
  reward_description    text,
  status                legacy_challenge_status NOT NULL DEFAULT 'active',
  deadline              timestamptz,
  created_by_member_id  integer REFERENCES family_members(id) ON DELETE SET NULL,
  completed_at          timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legacy_family_challenges_family ON legacy_family_challenges(family_id);
CREATE INDEX IF NOT EXISTS idx_legacy_family_challenges_status ON legacy_family_challenges(status);

-- ── legacy_challenge_contributions ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_challenge_contributions (
  id                  serial PRIMARY KEY,
  challenge_id        integer NOT NULL REFERENCES legacy_family_challenges(id) ON DELETE CASCADE,
  member_id           integer REFERENCES family_members(id) ON DELETE SET NULL,
  contribution_type   legacy_contribution_type NOT NULL,
  vault_item_ref      text,
  contribution_note   text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legacy_challenge_contributions_challenge ON legacy_challenge_contributions(challenge_id);

-- ── Auto-complete trigger ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_check_challenge_complete()
RETURNS trigger AS $$
DECLARE
  contrib_count integer;
  challenge_goal integer;
  challenge_status legacy_challenge_status;
BEGIN
  SELECT goal, status INTO challenge_goal, challenge_status
  FROM legacy_family_challenges WHERE id = NEW.challenge_id;

  IF challenge_status = 'active' THEN
    SELECT count(*) INTO contrib_count
    FROM legacy_challenge_contributions
    WHERE challenge_id = NEW.challenge_id;

    IF contrib_count >= challenge_goal THEN
      UPDATE legacy_family_challenges
      SET status = 'completed', completed_at = now()
      WHERE id = NEW.challenge_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_challenge_complete ON legacy_challenge_contributions;
CREATE TRIGGER trg_check_challenge_complete
  AFTER INSERT ON legacy_challenge_contributions
  FOR EACH ROW EXECUTE FUNCTION fn_check_challenge_complete();
