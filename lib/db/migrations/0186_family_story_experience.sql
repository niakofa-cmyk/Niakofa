ALTER TABLE family_stories
  ADD COLUMN IF NOT EXISTS author_id integer REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'family',
  ADD COLUMN IF NOT EXISTS date_year integer,
  ADD COLUMN IF NOT EXISTS date_month integer,
  ADD COLUMN IF NOT EXISTS date_day integer,
  ADD COLUMN IF NOT EXISTS date_precision text;

CREATE INDEX IF NOT EXISTS idx_family_stories_author
  ON family_stories(author_id, created_at);

ALTER TABLE family_stories
  ADD CONSTRAINT family_stories_audience_check
    CHECK (audience IN ('family', 'private')),
  ADD CONSTRAINT family_stories_date_precision_check
    CHECK (date_precision IS NULL OR date_precision IN ('day', 'month', 'year', 'decade', 'circa')),
  ADD CONSTRAINT family_stories_date_parts_check
    CHECK (
      (date_year IS NULL AND date_month IS NULL AND date_day IS NULL AND date_precision IS NULL)
      OR (
        date_year BETWEEN 1 AND 9999
        AND date_precision IS NOT NULL
        AND (
          (date_precision = 'day' AND date_month BETWEEN 1 AND 12 AND date_day BETWEEN 1 AND 31)
          OR (date_precision = 'month' AND date_month BETWEEN 1 AND 12 AND date_day IS NULL)
          OR (date_precision IN ('year', 'circa') AND date_month IS NULL AND date_day IS NULL)
          OR (date_precision = 'decade' AND date_year % 10 = 0 AND date_month IS NULL AND date_day IS NULL)
        )
      )
    );

CREATE TABLE IF NOT EXISTS family_story_keeps (
  id serial PRIMARY KEY,
  family_id integer NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  moment_id integer NOT NULL,
  story_id integer REFERENCES family_stories(id) ON DELETE SET NULL,
  created_by integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT family_story_keeps_family_moment_uidx UNIQUE (family_id, moment_id)
);

CREATE INDEX IF NOT EXISTS family_story_keeps_created_by_idx
  ON family_story_keeps(created_by, created_at);