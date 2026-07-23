-- Migration 0052: Griot Stories — oral history / diaspora storytelling
-- Status machine: recorded → transcribing → pending_review → ready → published

CREATE TYPE griot_story_status AS ENUM (
  'recorded',
  'transcribing',
  'pending_review',
  'ready',
  'published'
);

CREATE TYPE griot_story_visibility AS ENUM (
  'public',
  'diaspora_tag',
  'private'
);

CREATE TABLE IF NOT EXISTS griot_stories (
  id            SERIAL PRIMARY KEY,
  author_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT,
  prompt        TEXT,
  -- Voice recording: stored as a URL/path to the audio file
  audio_url     TEXT,
  -- Text content (if text mode, or auto-transcript)
  text_content  TEXT,
  -- Language the story was recorded in (BCP-47 code, e.g. 'yo', 'es', 'fr')
  original_language TEXT NOT NULL DEFAULT 'en',
  -- Diaspora tag for discovery grouping
  diaspora_tag  TEXT,
  -- Hub city/region (e.g. 'Lagos, Nigeria')
  hub_location  TEXT,
  lat           DOUBLE PRECISION,
  lng           DOUBLE PRECISION,
  status        griot_story_status NOT NULL DEFAULT 'recorded',
  visibility    griot_story_visibility NOT NULL DEFAULT 'public',
  -- Recorder controls release timing (NULL = publish immediately once ready)
  release_at    TIMESTAMPTZ,
  published_at  TIMESTAMPTZ,
  duration_seconds INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_griot_stories_author   ON griot_stories(author_id);
CREATE INDEX IF NOT EXISTS idx_griot_stories_status   ON griot_stories(status);
CREATE INDEX IF NOT EXISTS idx_griot_stories_hub      ON griot_stories(hub_location);
CREATE INDEX IF NOT EXISTS idx_griot_stories_diaspora ON griot_stories(diaspora_tag);
CREATE INDEX IF NOT EXISTS idx_griot_stories_published ON griot_stories(published_at DESC) WHERE status = 'published';

-- Child table: one row per language translation draft
CREATE TABLE IF NOT EXISTS story_translations (
  id              SERIAL PRIMARY KEY,
  story_id        INTEGER NOT NULL REFERENCES griot_stories(id) ON DELETE CASCADE,
  language        TEXT NOT NULL,   -- BCP-47 (e.g. 'pt', 'fr', 'es', 'ht', 'sw')
  nia_draft_text  TEXT,
  -- Recorder-edited version (NULL until they edit)
  edited_text     TEXT,
  recorder_approved BOOLEAN NOT NULL DEFAULT FALSE,
  approved_at     TIMESTAMPTZ,
  -- If recorder edits, log it so we can fine-tune future translations
  was_edited      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(story_id, language)
);

CREATE INDEX IF NOT EXISTS idx_story_translations_story    ON story_translations(story_id);
CREATE INDEX IF NOT EXISTS idx_story_translations_pending  ON story_translations(story_id) WHERE recorder_approved = FALSE;
