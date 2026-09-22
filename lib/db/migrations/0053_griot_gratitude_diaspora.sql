-- Migration 0053: Griot Stories — gratitude linkage, real diaspora hubs,
-- and a transcription job queue (closes three gaps from the Griot audit:
-- (A) archive, (B) gratitude tie-in, (C) diaspora social were disconnected
-- systems sharing a UI).
--
-- Idempotent throughout — see lib/db/scripts/run-migrations.mjs and
-- CLAUDE.md Incident #2 for why every statement must be safe to re-run.

-- ── 1. story_type — makes each story's purpose explicit ────────────────────
DO $$ BEGIN
  CREATE TYPE griot_story_type AS ENUM (
    'heritage_archive',  -- (A) oral history, not tied to a request
    'gratitude',          -- (B) grew out of a completed help request
    'diaspora_social'     -- (C) hub/community connection story
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE griot_stories
  ADD COLUMN IF NOT EXISTS story_type griot_story_type NOT NULL DEFAULT 'heritage_archive';

-- ── 2. diaspora_hubs — replaces the hardcoded 10-city array in globe.tsx ───
CREATE TABLE IF NOT EXISTS diaspora_hubs (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  region_label  TEXT NOT NULL,
  lat           DOUBLE PRECISION NOT NULL,
  lng           DOUBLE PRECISION NOT NULL,
  tag           TEXT NOT NULL DEFAULT 'us',
  note          TEXT,
  -- A real Niakofa community can claim a hub, tying story/impact data to it.
  community_id  INTEGER REFERENCES communities(id) ON DELETE SET NULL,
  -- The original 10 curated cities ship as seed rows so the globe looks the
  -- same on day one; new hubs are proposed by users/communities from here on.
  is_seed       BOOLEAN NOT NULL DEFAULT FALSE,
  status        TEXT NOT NULL DEFAULT 'approved', -- pending_review | approved | rejected
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT diaspora_hubs_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_diaspora_hubs_status ON diaspora_hubs(status);
CREATE INDEX IF NOT EXISTS idx_diaspora_hubs_community ON diaspora_hubs(community_id);

-- Seed the original 10 hubs (matches HUBS in globe.tsx). Keyed off the
-- UNIQUE(name) constraint so this block is safe to re-run — ON CONFLICT
-- DO NOTHING rather than a pre-check SELECT.
INSERT INTO diaspora_hubs (name, region_label, lat, lng, tag, note, is_seed, status)
VALUES
  ('Fort Worth, TX',    'African American · Home base', 32.75,  -97.33, 'home',   'Your Niakofa community. The heart of the network.', TRUE, 'approved'),
  ('Atlanta, GA',       'African American',              33.75,  -84.39, 'us',     'Largest US diaspora hub by member count.', TRUE, 'approved'),
  ('Kingston, Jamaica', 'Afro-Caribbean',                17.99,  -76.79, 'carib',  'Windrush Day events surface here each June.', TRUE, 'approved'),
  ('Santo Domingo, DR', 'Afro-Latino',                   18.48,  -69.90, 'latino', 'Growing storytelling circle in Spanish and Kreyòl.', TRUE, 'approved'),
  ('Salvador, Brazil',  'Afro-Latino',                  -12.97,  -38.50, 'latino', 'Home to the largest Afro-Brazilian population.', TRUE, 'approved'),
  ('Lagos, Nigeria',    'Continental — Yorùbá',           6.52,    3.38, 'africa', 'Source region for many Fort Worth Yorùbá families.', TRUE, 'approved'),
  ('Accra, Ghana',      'Continental — Akan',             5.56,   -0.20, 'africa', 'Year of Return pilgrimage hub since 2019.', TRUE, 'approved'),
  ('London, UK',        'Afro-European',                 51.51,   -0.13, 'europe', 'Notting Hill Carnival community is very active here.', TRUE, 'approved'),
  ('Paris, France',     'Afro-European',                 48.85,    2.35, 'europe', 'One of Europe''s largest West African diaspora communities.', TRUE, 'approved'),
  ('Montréal, Canada',  'Afro-Caribbean · Haitian',       45.50,  -73.57, 'carib',  'Largest Haitian community outside of Haiti.', TRUE, 'approved')
ON CONFLICT (name) DO NOTHING;

-- ── 3. Link griot_stories to what created it ────────────────────────────────
ALTER TABLE griot_stories
  ADD COLUMN IF NOT EXISTS request_id        INTEGER REFERENCES help_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gratitude_post_id INTEGER REFERENCES gratitude_posts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS community_id      INTEGER REFERENCES communities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hub_id            INTEGER REFERENCES diaspora_hubs(id) ON DELETE SET NULL;

-- A gratitude post can graduate into at most one griot story — prevents the
-- "promote to story" action from being spammed into duplicates.
DO $$ BEGIN
  ALTER TABLE griot_stories
    ADD CONSTRAINT griot_stories_gratitude_post_unique UNIQUE (gratitude_post_id);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_griot_stories_type      ON griot_stories(story_type);
CREATE INDEX IF NOT EXISTS idx_griot_stories_request   ON griot_stories(request_id);
CREATE INDEX IF NOT EXISTS idx_griot_stories_community ON griot_stories(community_id);
CREATE INDEX IF NOT EXISTS idx_griot_stories_hub       ON griot_stories(hub_id);

-- ── 4. Transcription job queue — makes the "transcribing" status real ──────
-- Previously `status = 'transcribing'` was a dead state: nothing ever moved
-- a story out of it. This table + griot-transcription-worker.ts closes that.
DO $$ BEGIN
  CREATE TYPE griot_transcription_status AS ENUM (
    'queued', 'processing', 'done', 'failed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS griot_transcription_jobs (
  id            SERIAL PRIMARY KEY,
  story_id      INTEGER NOT NULL REFERENCES griot_stories(id) ON DELETE CASCADE,
  status        griot_transcription_status NOT NULL DEFAULT 'queued',
  attempts      INTEGER NOT NULL DEFAULT 0,
  error         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ
);

-- Partial index — only rows the worker actually needs to scan.
CREATE INDEX IF NOT EXISTS idx_griot_transcription_jobs_queued
  ON griot_transcription_jobs(created_at)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_griot_transcription_jobs_story
  ON griot_transcription_jobs(story_id);
