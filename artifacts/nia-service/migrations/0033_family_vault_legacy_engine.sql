-- ─────────────────────────────────────────────────────────────────────────────
-- Niakofa — Family Vault Schema + Legacy Engine Tables
-- Migration 0033
--
-- Creates the core Family Vault domain tables (places, events, stories,
-- consent) and the Legacy Engine domain tables (knowledge versions, worlds,
-- chapters, sessions, achievements). These power the Living Family Legacy
-- Experience described in the Niakofa design document.
--
-- All tables are idempotent (IF NOT EXISTS). Enum types use DO $$ blocks.
-- RLS is enabled on every table with family-member-scoped policies.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Enum types ──────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE family_consent_scope AS ENUM ('storytelling', 'reconnection', 'publication');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

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

-- ── family_places ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS family_places (
  id            SERIAL PRIMARY KEY,
  family_id     INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  place_type    TEXT,
  country       TEXT,
  region        TEXT,
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_family_places_family ON family_places(family_id);

-- ── family_events ────────────────────────────────────────────────────────────

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
  metadata              JSONB NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_family_events_family ON family_events(family_id);
CREATE INDEX IF NOT EXISTS idx_family_events_member ON family_events(member_id);
CREATE INDEX IF NOT EXISTS idx_family_events_date ON family_events(event_date);

-- ── family_stories ───────────────────────────────────────────────────────────

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
  tags              JSONB NOT NULL DEFAULT '[]',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_family_stories_family ON family_stories(family_id);
CREATE INDEX IF NOT EXISTS idx_family_stories_about ON family_stories(about_member_id);

-- ── family_member_consent ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS family_member_consent (
  id            SERIAL PRIMARY KEY,
  family_id     INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  member_id     INTEGER NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  scope         family_consent_scope NOT NULL,
  granted       BOOLEAN NOT NULL DEFAULT FALSE,
  granted_by    INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
  granted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_family_member_consent_member ON family_member_consent(member_id, scope);
CREATE INDEX IF NOT EXISTS idx_family_member_consent_family ON family_member_consent(family_id);

-- ── family_knowledge_versions ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS family_knowledge_versions (
  id            SERIAL PRIMARY KEY,
  family_id     INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  version       INTEGER NOT NULL,
  fingerprint   TEXT NOT NULL,
  snapshot      JSONB NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_family_knowledge_versions_family ON family_knowledge_versions(family_id, version);
CREATE INDEX IF NOT EXISTS idx_family_knowledge_versions_fp ON family_knowledge_versions(family_id, fingerprint);

-- ── legacy_worlds ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_worlds (
  id                    SERIAL PRIMARY KEY,
  family_id             INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  knowledge_version_id  INTEGER REFERENCES family_knowledge_versions(id) ON DELETE SET NULL,
  status                legacy_world_status NOT NULL DEFAULT 'generating',
  world_data            JSONB NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_legacy_worlds_family ON legacy_worlds(family_id);

-- ── legacy_chapters ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_chapters (
  id                  SERIAL PRIMARY KEY,
  world_id            INTEGER NOT NULL REFERENCES legacy_worlds(id) ON DELETE CASCADE,
  family_id           INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  ancestor_member_id  INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
  chapter_number      INTEGER NOT NULL,
  title               TEXT NOT NULL,
  synopsis            TEXT,
  status              legacy_chapter_status NOT NULL DEFAULT 'locked',
  chapter_data        JSONB NOT NULL DEFAULT '{}',
  unlocked_at         TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_legacy_chapters_world ON legacy_chapters(world_id);
CREATE INDEX IF NOT EXISTS idx_legacy_chapters_family ON legacy_chapters(family_id);
CREATE INDEX IF NOT EXISTS idx_legacy_chapters_status ON legacy_chapters(status);

-- ── legacy_sessions ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_sessions (
  id                  SERIAL PRIMARY KEY,
  family_id           INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  world_id            INTEGER NOT NULL REFERENCES legacy_worlds(id) ON DELETE CASCADE,
  user_id             INTEGER,
  ancestor_member_id  INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
  current_chapter_id  INTEGER REFERENCES legacy_chapters(id) ON DELETE SET NULL,
  status              legacy_session_status NOT NULL DEFAULT 'active',
  session_state       JSONB NOT NULL DEFAULT '{}',
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at            TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_legacy_sessions_family ON legacy_sessions(family_id);
CREATE INDEX IF NOT EXISTS idx_legacy_sessions_user ON legacy_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_legacy_sessions_status ON legacy_sessions(status);

-- ── legacy_achievements ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS legacy_achievements (
  id              SERIAL PRIMARY KEY,
  family_id       INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  achievement_key TEXT NOT NULL,
  category        legacy_achievement_category NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  progress        INTEGER NOT NULL DEFAULT 0,
  goal            INTEGER NOT NULL,
  unlocked        BOOLEAN NOT NULL DEFAULT FALSE,
  unlocked_at     TIMESTAMPTZ,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_legacy_achievements_family ON legacy_achievements(family_id);
CREATE INDEX IF NOT EXISTS idx_legacy_achievements_key ON legacy_achievements(family_id, achievement_key);
CREATE INDEX IF NOT EXISTS idx_legacy_achievements_unlocked ON legacy_achievements(family_id, unlocked);
