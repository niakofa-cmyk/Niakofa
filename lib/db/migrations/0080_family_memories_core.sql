-- Migration 0080: Diaspora Platform — Family Memories core
--
-- Adds the unified "Memory" object (family_memories) plus supporting tables:
--   1. family_memories         — the canonical preserved item (photo, letter, recipe, etc.)
--   2. family_memory_tags      — free-text tags per memory
--   3. family_memory_people    — who appears in a memory (linked member or free text)
--   4. family_memory_comments  — discussion thread per memory
--
-- Additive-only — no existing tables are altered.
-- Idempotent — safe to re-run.

DO $$ BEGIN
  CREATE TYPE family_memory_visibility AS ENUM (
    'family',   -- default: all active members of the family
    'branch',   -- Phase C: restricted to a tagged family_tree branch
    'private'   -- only the author + curators/owner
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE family_memory_source AS ENUM (
    'upload',
    'interview',
    'culture_card',
    'import'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS family_memories (
  id                     SERIAL PRIMARY KEY,
  family_id              INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  -- set null so a deleted account doesn't nuke a family's archive (same
  -- reasoning as griot_stories.author_id)
  author_id              INTEGER REFERENCES users(id) ON DELETE SET NULL,
  title                  TEXT,
  description            TEXT,
  story                  TEXT,  -- longer narrative, e.g. edited interview transcript
  memory_date            TIMESTAMPTZ,  -- when the *event* happened, not created_at
  memory_date_precision  TEXT DEFAULT 'day',  -- day | month | year | circa
  location_label         TEXT,
  lat                    DOUBLE PRECISION,
  lng                    DOUBLE PRECISION,
  source                 family_memory_source NOT NULL DEFAULT 'upload',
  visibility             family_memory_visibility NOT NULL DEFAULT 'family',
  -- FK to family_interviews added in migration 0082 once that table exists.
  -- Kept as a bare integer here to avoid circular dependency.
  interview_id           INTEGER,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_family_memories_family ON family_memories(family_id);
CREATE INDEX IF NOT EXISTS idx_family_memories_date   ON family_memories(memory_date);
CREATE INDEX IF NOT EXISTS idx_family_memories_author ON family_memories(author_id);

CREATE TABLE IF NOT EXISTS family_memory_tags (
  id        SERIAL PRIMARY KEY,
  memory_id INTEGER NOT NULL REFERENCES family_memories(id) ON DELETE CASCADE,
  tag       TEXT NOT NULL  -- free-text, lowercased at write time
);

CREATE INDEX IF NOT EXISTS idx_family_memory_tags_memory ON family_memory_tags(memory_id);
CREATE INDEX IF NOT EXISTS idx_family_memory_tags_tag    ON family_memory_tags(tag);

-- Who appears in this memory. Prefers a real family_members link;
-- falls back to free text for people not yet added as members.
CREATE TABLE IF NOT EXISTS family_memory_people (
  id        SERIAL PRIMARY KEY,
  memory_id INTEGER NOT NULL REFERENCES family_memories(id) ON DELETE CASCADE,
  member_id INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
  name_text TEXT  -- used when member_id is null
);

CREATE INDEX IF NOT EXISTS idx_family_memory_people_memory ON family_memory_people(memory_id);

CREATE TABLE IF NOT EXISTS family_memory_comments (
  id        SERIAL PRIMARY KEY,
  memory_id INTEGER NOT NULL REFERENCES family_memories(id) ON DELETE CASCADE,
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_family_memory_comments_memory ON family_memory_comments(memory_id);
