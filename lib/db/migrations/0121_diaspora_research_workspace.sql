-- Migration 0121: Diaspora research workspace.
-- Private-by-membership: every row is scoped to a Family Space and creator.

CREATE TABLE IF NOT EXISTS diaspora_research_cases (
  id                SERIAL PRIMARY KEY,
  family_id         INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  created_by        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  person_member_id  INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
  title             TEXT NOT NULL,
  research_question TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'open',
  confidence        TEXT NOT NULL DEFAULT 'unreviewed',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_diaspora_research_cases_family ON diaspora_research_cases(family_id);
CREATE INDEX IF NOT EXISTS idx_diaspora_research_cases_creator ON diaspora_research_cases(created_by);
CREATE INDEX IF NOT EXISTS idx_diaspora_research_cases_person ON diaspora_research_cases(person_member_id);

CREATE TABLE IF NOT EXISTS diaspora_research_evidence (
  id           SERIAL PRIMARY KEY,
  case_id      INTEGER NOT NULL REFERENCES diaspora_research_cases(id) ON DELETE CASCADE,
  created_by   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  source_url   TEXT,
  citation     TEXT,
  evidence_type TEXT NOT NULL DEFAULT 'document',
  confidence   TEXT NOT NULL DEFAULT 'possible',
  notes        TEXT,
  source_date  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_diaspora_research_evidence_case ON diaspora_research_evidence(case_id);

CREATE TABLE IF NOT EXISTS diaspora_research_notes (
  id         SERIAL PRIMARY KEY,
  case_id    INTEGER NOT NULL REFERENCES diaspora_research_cases(id) ON DELETE CASCADE,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_diaspora_research_notes_case ON diaspora_research_notes(case_id);
