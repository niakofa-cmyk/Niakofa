-- 0103_legacy_quests_persistent.sql
--
-- Persistent Quest Storage + Knowledge Version Uniqueness
--
-- WHY THIS EXISTS:
-- Migration 0093 dropped legacy_quests (created in 0092 with uuid PKs) and
-- never recreated it. The quest system in legacy.ts has been using an
-- in-memory cache keyed by family+fingerprint, meaning quests are lost on
-- server restart and cannot be queried historically. This migration creates
-- a proper persistent quest table with serial integer PKs matching the
-- Drizzle ORM conventions.
--
-- Additionally, family_knowledge_versions lacks a unique constraint on
-- (family_id, version), meaning duplicate versions can be inserted under
-- concurrent requests. This migration adds that constraint.
--
-- Safety: all statements are idempotent (IF NOT EXISTS / DO $$ blocks).

-- ── 1. Enum types for quests ──────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE legacy_quest_type AS ENUM (
    'mystery', 'preservation', 'reconnection', 'exploration', 'cultural'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE legacy_quest_status AS ENUM (
    'available', 'in_progress', 'completed', 'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. legacy_quests table ───────────────────────────────────────────────────
-- Persistent storage for AI-generated quests. Each quest is scoped to a
-- family and optionally to a world. The fingerprint field links the quest
-- to the specific knowledge version it was generated from, so we can
-- invalidate quests when the family vault changes.

CREATE TABLE IF NOT EXISTS legacy_quests (
  id                    serial PRIMARY KEY,
  family_id             integer NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  world_id              integer REFERENCES legacy_worlds(id) ON DELETE SET NULL,
  quest_id_text         text NOT NULL,
  fingerprint           text NOT NULL,
  title                 text NOT NULL,
  description           text,
  quest_type            legacy_quest_type NOT NULL DEFAULT 'mystery',
  status                legacy_quest_status NOT NULL DEFAULT 'available',
  xp_reward             integer NOT NULL DEFAULT 100,
  category              text NOT NULL DEFAULT 'record',
  action_path           text,
  ancestor_name         text,
  is_ai_generated       boolean NOT NULL DEFAULT false,
  steps                 jsonb DEFAULT '[]',
  completion_condition  jsonb DEFAULT '{}',
  expires_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legacy_quests_family ON legacy_quests(family_id);
CREATE INDEX IF NOT EXISTS idx_legacy_quests_fingerprint ON legacy_quests(family_id, fingerprint);
CREATE INDEX IF NOT EXISTS idx_legacy_quests_status ON legacy_quests(family_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_legacy_quests_uidx ON legacy_quests(family_id, quest_id_text, fingerprint);

-- ── 3. Unique constraint on family_knowledge_versions ─────────────────────────
-- Prevents duplicate version numbers for the same family under concurrent
-- requests. The application code in legacy-knowledge-version.ts uses
-- INSERT ... ON CONFLICT DO NOTHING, which requires this constraint.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_family_knowledge_versions_family_version'
  ) THEN
    ALTER TABLE family_knowledge_versions
      ADD CONSTRAINT uq_family_knowledge_versions_family_version
      UNIQUE (family_id, version);
  END IF;
END $$;

-- ── 4. RLS on legacy_quests ───────────────────────────────────────────────────
-- Uses the same family-membership pattern as migration 0102.

ALTER TABLE legacy_quests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "legacy_select_own_quests" ON legacy_quests;
CREATE POLICY "legacy_select_own_quests" ON legacy_quests FOR SELECT
  TO authenticated USING (legacy_is_family_member(family_id));

DROP POLICY IF EXISTS "legacy_insert_own_quests" ON legacy_quests;
CREATE POLICY "legacy_insert_own_quests" ON legacy_quests FOR INSERT
  TO authenticated WITH CHECK (legacy_is_family_member(family_id));

DROP POLICY IF EXISTS "legacy_update_own_quests" ON legacy_quests;
CREATE POLICY "legacy_update_own_quests" ON legacy_quests FOR UPDATE
  TO authenticated USING (legacy_is_family_member(family_id))
  WITH CHECK (legacy_is_family_member(family_id));

DROP POLICY IF EXISTS "legacy_delete_own_quests" ON legacy_quests;
CREATE POLICY "legacy_delete_own_quests" ON legacy_quests FOR DELETE
  TO authenticated USING (legacy_is_family_member(family_id));
