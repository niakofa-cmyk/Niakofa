-- Migration 0082: Diaspora Platform — Family Interviews + Transcription Jobs
--
-- Adds:
--   1. family_interviews           — Oral History guided session records
--   2. family_transcription_jobs   — independent job queue for family audio transcription
--                                    (deliberately separate from griot_transcription_jobs;
--                                     see docs/diaspora-platform-design.md §9.1)
--   3. Back-fills the circular FKs between family_memories and family_interviews
--      that were left as bare integers in 0080 and 0082.
--
-- Additive-only. Idempotent.

DO $$ BEGIN
  CREATE TYPE family_interview_status AS ENUM (
    'scheduled',
    'recording',
    'transcribing',
    'review',
    'published'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE family_transcription_status AS ENUM (
    'pending',
    'processing',
    'done',
    'failed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS family_interviews (
  id                   SERIAL PRIMARY KEY,
  family_id            INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  -- who is being interviewed
  subject_member_id    INTEGER REFERENCES family_members(id) ON DELETE SET NULL,
  interviewer_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  -- Nia-suggested or curated prompts sent to the client
  prompts_used         JSONB DEFAULT '[]'::jsonb,
  status               family_interview_status NOT NULL DEFAULT 'scheduled',
  -- set once the family_memory is created post-transcription
  resulting_memory_id  INTEGER,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_family_interviews_family ON family_interviews(family_id);
CREATE INDEX IF NOT EXISTS idx_family_interviews_status ON family_interviews(status);

-- Now that both tables exist, add the circular FKs as deferred constraints.
ALTER TABLE family_memories
  ADD COLUMN IF NOT EXISTS interview_id_fk INTEGER REFERENCES family_interviews(id) ON DELETE SET NULL;

-- Note: family_memories.interview_id (bare integer, migration 0080) stays for
-- backward compat; new code should use interview_id_fk. A future cleanup
-- migration can drop the bare column once all reads are migrated.

ALTER TABLE family_interviews
  ADD CONSTRAINT fk_family_interviews_resulting_memory
    FOREIGN KEY (resulting_memory_id) REFERENCES family_memories(id) ON DELETE SET NULL
    NOT VALID;

-- Validate the constraint in a separate step to avoid locking the table long.
ALTER TABLE family_interviews
  VALIDATE CONSTRAINT fk_family_interviews_resulting_memory;

-- Independent transcription job queue for family interview audio.
-- Deliberately NOT sharing griot_transcription_jobs (see design doc §9.1).
CREATE TABLE IF NOT EXISTS family_transcription_jobs (
  id             SERIAL PRIMARY KEY,
  asset_id       INTEGER NOT NULL REFERENCES family_memory_assets(id) ON DELETE CASCADE,
  interview_id   INTEGER REFERENCES family_interviews(id) ON DELETE SET NULL,
  status         family_transcription_status NOT NULL DEFAULT 'pending',
  error_message  TEXT,
  attempts       INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_family_transcription_jobs_status  ON family_transcription_jobs(status);
CREATE INDEX IF NOT EXISTS idx_family_transcription_jobs_asset   ON family_transcription_jobs(asset_id);
