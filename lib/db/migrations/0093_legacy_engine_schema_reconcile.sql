-- Migration 0093: Legacy Engine schema reconciliation
--
-- WHY THIS EXISTS (see CLAUDE.md Incident #22):
-- Migration 0092 (from the Bolt prototype) created all the Legacy Engine tables
-- with uuid PRIMARY KEYs. The @workspace/db Drizzle ORM schema
-- (lib/db/src/schema/legacy-engine.ts, family-knowledge-versions.ts) defines
-- these same tables with serial integer PKs. This mismatch causes every Drizzle
-- query against these tables to fail at runtime.
--
-- Additionally, migration 0092 attempted to create family_places, family_events,
-- family_stories with uuid PKs (silently skipped because those tables already
-- existed from earlier migrations — correct integer PK versions). But
-- family_member_consent and family_knowledge_versions were NOT in any prior
-- migration, so 0092's uuid-based versions were actually created.
--
-- This migration:
--   1. Drops all uuid-based legacy engine tables from 0092
--   2. Recreates them with serial integer PKs matching the Drizzle schema
--   3. Creates family_places, family_events, family_stories with correct schemas
--      (these may already exist with correct schemas from 0092 IF NOT EXISTS
--       — so we use IF NOT EXISTS here too, safe either way)
--   4. Creates family_member_consent (missing from all prior migrations)
--   5. Drops the uuid family_knowledge_versions and recreates as serial integer
--
-- Idempotent — DROP IF EXISTS + CREATE IF NOT EXISTS throughout.

-- ── Step 1: Drop uuid-based legacy engine tables (bottom-up to respect FKs) ──
-- Order matters: drop tables with FKs before the tables they reference.

DROP TABLE IF EXISTS legacy_quest_progress;
DROP TABLE IF EXISTS legacy_quests;
DROP TABLE IF EXISTS legacy_user_achievements;
DROP TABLE IF EXISTS legacy_achievements;
DROP TABLE IF EXISTS legacy_sessions;
DROP TABLE IF EXISTS legacy_choices;
DROP TABLE IF EXISTS legacy_dialogues;
DROP TABLE IF EXISTS legacy_scenes;
DROP TABLE IF EXISTS legacy_chapters;
DROP TABLE IF EXISTS legacy_worlds;

-- family_knowledge_versions: uuid-based from 0092 — drop and recreate
DROP TABLE IF EXISTS family_knowledge_versions;

-- ── Step 2: Enum types for legacy engine ──────────────────────────────────────
-- These were created in 0092. They use correct values so we keep them.
-- EXCEPTION WHEN duplicate_object THEN NULL guards re-runs.

DO $$ BEGIN
  CREATE TYPE legacy_world_status AS ENUM ('generating', 'ready', 'stale');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE legacy_chapter_status AS ENUM ('locked', 'unlocked', 'in_progress', 'completed', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE legacy_session_status AS ENUM ('active', 'paused', 'completed', 'abandoned');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE legacy_achievement_category AS ENUM ('vault_prompt', 'reconnection', 'gameplay', 'preservation');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Step 3: Recreate legacy engine tables with serial integer PKs ─────────────
-- These match lib/db/src/schema/legacy-engine.ts exactly.

CREATE TABLE IF NOT EXISTS family_knowledge_versions (
  id           SERIAL PRIMARY KEY,
  family_id    INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  version      INTEGER NOT NULL,
  fingerprint  TEXT NOT NULL,
  snapshot     JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_family_knowledge_versions_family
  ON family_knowledge_versions (family_id, version);
CREATE INDEX IF NOT EXISTS idx_family_knowledge_versions_fp
  ON family_knowledge_versions (family_id, fingerprint);

CREATE TABLE IF NOT EXISTS legacy_worlds (
  id                   SERIAL PRIMARY KEY,
  family_id            INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  knowledge_version_id INTEGER REFERENCES family_knowledge_versions(id) ON DELETE SET NULL,
  status               legacy_world_status NOT NULL DEFAULT 'generating',
  world_data           JSONB DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_legacy_worlds_family ON legacy_worlds (family_id);

CREATE TABLE IF NOT EXISTS legacy_chapters (
  id                  SERIAL PRIMARY KEY,
  world_id            INTEGER NOT NULL REFERENCES legacy_worlds(id) ON DELETE CASCADE,
  family_id           INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  ancestor_member_id  INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
  chapter_number      INTEGER NOT NULL,
  title               TEXT NOT NULL,
  synopsis            TEXT,
  status              legacy_chapter_status NOT NULL DEFAULT 'locked',
  chapter_data        JSONB DEFAULT '{}',
  unlocked_at         TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_legacy_chapters_world  ON legacy_chapters (world_id);
CREATE INDEX IF NOT EXISTS idx_legacy_chapters_family ON legacy_chapters (family_id);
CREATE INDEX IF NOT EXISTS idx_legacy_chapters_status ON legacy_chapters (status);

CREATE TABLE IF NOT EXISTS legacy_sessions (
  id                  SERIAL PRIMARY KEY,
  family_id           INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  world_id            INTEGER NOT NULL REFERENCES legacy_worlds(id) ON DELETE CASCADE,
  user_id             INTEGER,
  ancestor_member_id  INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
  current_chapter_id  INTEGER REFERENCES legacy_chapters(id) ON DELETE SET NULL,
  status              legacy_session_status NOT NULL DEFAULT 'active',
  session_state       JSONB DEFAULT '{}',
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at            TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_legacy_sessions_family ON legacy_sessions (family_id);
CREATE INDEX IF NOT EXISTS idx_legacy_sessions_user   ON legacy_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_legacy_sessions_status ON legacy_sessions (status);

CREATE TABLE IF NOT EXISTS legacy_achievements (
  id               SERIAL PRIMARY KEY,
  family_id        INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  achievement_key  TEXT NOT NULL,
  category         legacy_achievement_category NOT NULL,
  title            TEXT NOT NULL,
  description      TEXT NOT NULL,
  progress         INTEGER NOT NULL DEFAULT 0,
  goal             INTEGER NOT NULL,
  unlocked         BOOLEAN NOT NULL DEFAULT FALSE,
  unlocked_at      TIMESTAMPTZ,
  metadata         JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_legacy_achievements_family   ON legacy_achievements (family_id);
CREATE INDEX IF NOT EXISTS idx_legacy_achievements_key      ON legacy_achievements (family_id, achievement_key);
CREATE INDEX IF NOT EXISTS idx_legacy_achievements_unlocked ON legacy_achievements (family_id, unlocked);

-- ── Step 4: Missing family vault tables ───────────────────────────────────────
-- family_places, family_events, family_stories were attempted in 0092 with
-- uuid PKs but silently skipped because IF NOT EXISTS saw no existing table.
-- However they don't exist in the DB from any prior migration either.
-- Create them here with correct serial integer PKs.

CREATE TABLE IF NOT EXISTS family_places (
  id           SERIAL PRIMARY KEY,
  family_id    INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  place_type   TEXT,
  country      TEXT,
  region       TEXT,
  lat          DOUBLE PRECISION,
  lng          DOUBLE PRECISION,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_family_places_family ON family_places (family_id);

CREATE TABLE IF NOT EXISTS family_events (
  id                    SERIAL PRIMARY KEY,
  family_id             INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id             INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
  title                 TEXT NOT NULL,
  description           TEXT,
  event_date            TIMESTAMPTZ,
  event_date_precision  TEXT DEFAULT 'year',
  category              TEXT,
  place_id              INTEGER REFERENCES family_places(id) ON DELETE SET NULL,
  metadata              JSONB DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_family_events_family ON family_events (family_id);
CREATE INDEX IF NOT EXISTS idx_family_events_member ON family_events (member_id);
CREATE INDEX IF NOT EXISTS idx_family_events_date   ON family_events (event_date);

CREATE TABLE IF NOT EXISTS family_stories (
  id                SERIAL PRIMARY KEY,
  family_id         INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  teller_member_id  INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
  about_member_id   INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  body              TEXT NOT NULL,
  category          TEXT,
  language          TEXT,
  memory_id         INTEGER REFERENCES family_memories(id) ON DELETE SET NULL,
  tags              JSONB DEFAULT '[]',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_family_stories_family ON family_stories (family_id);
CREATE INDEX IF NOT EXISTS idx_family_stories_about  ON family_stories (about_member_id);

-- ── Step 5: family_member_consent ─────────────────────────────────────────────
-- This table exists in the Drizzle schema but was never added to any migration.

DO $$ BEGIN
  CREATE TYPE family_consent_scope AS ENUM ('storytelling', 'reconnection', 'publication');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS family_member_consent (
  id          SERIAL PRIMARY KEY,
  family_id   INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id   INTEGER NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  scope       family_consent_scope NOT NULL,
  granted     BOOLEAN NOT NULL DEFAULT FALSE,
  granted_by  INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
  granted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_family_member_consent_member ON family_member_consent (member_id, scope);
CREATE INDEX IF NOT EXISTS idx_family_member_consent_family ON family_member_consent (family_id);

-- ── Step 6: Add missing columns to existing tables (schema drift fixes) ───────
-- families table is missing updated_at (added in 0079 without it)
ALTER TABLE families
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- family_members table is missing updated_at (added in 0079 without it)
ALTER TABLE family_members
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
