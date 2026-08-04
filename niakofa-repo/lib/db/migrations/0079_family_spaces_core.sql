-- Migration 0079: Diaspora Platform — Family Spaces core
--
-- First migration of the Diaspora Platform build (Phase A). Adds:
--   1. families        — a private kinship community ("Family Space").
--   2. family_members  — membership + role/invite state for a family_id.
--
-- This migration is deliberately additive-only: it does not touch
-- diaspora_hubs, griot_stories, griot_transcription_jobs, or nia_memories.
-- See docs/diaspora-platform-design.md for the full domain model and the
-- rest of the Phase A migration sequence (0080 family_memories,
-- 0081 family_memory_assets, 0082 family_interviews).
--
-- Idempotent — safe to re-run (see CLAUDE.md Incident #2).

DO $$ BEGIN
  CREATE TYPE family_member_role AS ENUM (
    'owner',
    'curator',
    'contributor',
    'viewer'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE family_member_status AS ENUM (
    'invited',
    'active',
    'removed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS families (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  cover_image_url TEXT,
  created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_families_created_by ON families(created_by);

CREATE TABLE IF NOT EXISTS family_members (
  id            SERIAL PRIMARY KEY,
  family_id     INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  -- Nullable: an invited-but-not-yet-a-user member (e.g. an elder without
  -- the app) gets a placeholder row with display_name/invite_email set and
  -- user_id NULL, until they sign up and claim it.
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  display_name  TEXT NOT NULL,
  invite_email  TEXT,
  relation_note TEXT,
  role          family_member_role NOT NULL DEFAULT 'contributor',
  status        family_member_status NOT NULL DEFAULT 'invited',
  invited_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  joined_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One membership row per (family_id, user_id). Postgres treats each NULL as
-- distinct for uniqueness purposes, so this does NOT limit how many
-- unclaimed (user_id IS NULL) invite placeholders a family can hold — it
-- only prevents a single registered user from joining the same family twice.
CREATE UNIQUE INDEX IF NOT EXISTS family_members_family_user_unique
  ON family_members(family_id, user_id);

CREATE INDEX IF NOT EXISTS idx_family_members_family ON family_members(family_id);
CREATE INDEX IF NOT EXISTS idx_family_members_user   ON family_members(user_id);
