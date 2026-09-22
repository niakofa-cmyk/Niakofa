-- Migration 0120: Heritage collection contributions.
--
-- Curated collection metadata stays in the API catalog. This additive table
-- stores user submissions behind an explicit moderation boundary.

DO $$ BEGIN
  CREATE TYPE heritage_contribution_kind AS ENUM (
    'photo',
    'story',
    'note',
    'link'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE heritage_contribution_status AS ENUM (
    'pending',
    'published',
    'rejected',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS heritage_contributions (
  id                SERIAL PRIMARY KEY,
  collection_slug   TEXT NOT NULL,
  family_id         INTEGER REFERENCES families(id) ON DELETE SET NULL,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind              heritage_contribution_kind NOT NULL,
  title             TEXT NOT NULL CHECK (btrim(title) <> '' AND length(title) <= 200),
  body              TEXT CHECK (body IS NULL OR length(body) <= 8000),
  media_url         TEXT,
  status            heritage_contribution_status NOT NULL DEFAULT 'pending',
  moderated_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  moderated_at      TIMESTAMPTZ,
  rejection_reason  TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT heritage_contributions_moderation_consistency CHECK (
    (status IN ('pending', 'archived') AND moderated_by IS NULL AND moderated_at IS NULL)
    OR (status IN ('published', 'rejected') AND moderated_by IS NOT NULL AND moderated_at IS NOT NULL)
  ),
  CONSTRAINT heritage_contributions_link_has_url CHECK (
    kind <> 'link' OR (media_url IS NOT NULL AND btrim(media_url) <> '')
  )
);

CREATE INDEX IF NOT EXISTS idx_heritage_contributions_collection
  ON heritage_contributions(collection_slug, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_heritage_contributions_family
  ON heritage_contributions(family_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_heritage_contributions_user
  ON heritage_contributions(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_heritage_contributions_updated_at
  ON heritage_contributions;
CREATE TRIGGER trigger_heritage_contributions_updated_at
  BEFORE UPDATE ON heritage_contributions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();