-- Migration: Legacy Phase 5 Enhancements — AI Director, Memory Mysteries, Character Evolution
-- Run this against your Postgres instance before deploying the new Phase 5 routes.

-- ── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE legacy_mystery_type AS ENUM (
    'unknown_person', 'unknown_place', 'unknown_date',
    'unknown_document', 'unknown_event', 'missing_interview'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE legacy_mystery_status AS ENUM (
    'open', 'investigating', 'solved', 'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE legacy_mission_type AS ENUM (
    'record_interview', 'identify_photo', 'add_ancestor',
    'tag_location', 'add_event', 'upload_document',
    'reconnect_relative', 'complete_chapter', 'preserve_tradition'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE legacy_mission_status AS ENUM (
    'active', 'completed', 'expired', 'skipped'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── legacy_memory_mysteries ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_memory_mysteries (
  id              SERIAL PRIMARY KEY,
  family_id       INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  mystery_type    legacy_mystery_type NOT NULL,
  status          legacy_mystery_status NOT NULL DEFAULT 'open',
  title           TEXT NOT NULL,
  description     TEXT,
  vault_item_type TEXT,
  vault_item_id   INTEGER,
  resolution       TEXT,
  resolved_by      INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
  ai_hint          TEXT,
  suggested_actions TEXT[],
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_legacy_mysteries_family
  ON legacy_memory_mysteries(family_id);
CREATE INDEX IF NOT EXISTS idx_legacy_mysteries_status
  ON legacy_memory_mysteries(family_id, status);

-- ── legacy_ai_director_missions ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_ai_director_missions (
  id              SERIAL PRIMARY KEY,
  family_id       INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  mission_type    legacy_mission_type NOT NULL,
  status          legacy_mission_status NOT NULL DEFAULT 'active',
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  gap_description TEXT,
  target_member_id  INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
  target_vault_item TEXT,
  reward_xp         INTEGER NOT NULL DEFAULT 50,
  reward_description TEXT,
  knowledge_version_id INTEGER,
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  completed_by    INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legacy_missions_family
  ON legacy_ai_director_missions(family_id);
CREATE INDEX IF NOT EXISTS idx_legacy_missions_status
  ON legacy_ai_director_missions(family_id, status);
CREATE INDEX IF NOT EXISTS idx_legacy_missions_date
  ON legacy_ai_director_missions(family_id, generated_at);

-- ── legacy_character_evolution ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_character_evolution (
  id                  SERIAL PRIMARY KEY,
  family_id           INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id           INTEGER NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  knowledge_version_id INTEGER,
  stats               JSONB NOT NULL DEFAULT '{}',
  new_dialogue_count  INTEGER NOT NULL DEFAULT 0,
  new_journal_count   INTEGER NOT NULL DEFAULT 0,
  new_quest_count     INTEGER NOT NULL DEFAULT 0,
  new_memory_count    INTEGER NOT NULL DEFAULT 0,
  evolution_summary   TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legacy_char_evo_member
  ON legacy_character_evolution(member_id);
CREATE INDEX IF NOT EXISTS idx_legacy_char_evo_family
  ON legacy_character_evolution(family_id, member_id);

-- ── updated_at trigger for memory_mysteries ──────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trigger_legacy_mysteries_updated_at
  ON legacy_memory_mysteries;
CREATE TRIGGER trigger_legacy_mysteries_updated_at
  BEFORE UPDATE ON legacy_memory_mysteries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
