-- 0105_legacy_interview_quest_schema.sql
--
-- Schema additions for the Interview Quest system and Character Profile enrichment.
--
-- WHY THIS EXISTS:
-- The Interview Quest system (legacy-interview-quest.ts) uses status values
-- "in_progress", "transcribed", and "completed" that did not exist in the
-- family_interview_status enum. It also stores title, interview_type,
-- conducted_by, transcript, extraction_result, and completed_at on interviews.
-- The Character Profile generator (legacy-character-profile.ts) uses birth_year
-- and death_year from family_members for timeline rendering and lineage display.
--
-- All statements are idempotent (ADD COLUMN IF NOT EXISTS, ALTER TYPE ... ADD VALUE
-- IF NOT EXISTS) — safe to re-run on an already-migrated database.

-- ── family_interview_status enum: add Interview Quest statuses ────────────────
ALTER TYPE family_interview_status ADD VALUE IF NOT EXISTS 'in_progress';
ALTER TYPE family_interview_status ADD VALUE IF NOT EXISTS 'transcribed';
ALTER TYPE family_interview_status ADD VALUE IF NOT EXISTS 'completed';

-- ── family_interviews: add Interview Quest columns ────────────────────────────
ALTER TABLE family_interviews ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE family_interviews ADD COLUMN IF NOT EXISTS interview_type TEXT;
ALTER TABLE family_interviews ADD COLUMN IF NOT EXISTS conducted_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE family_interviews ADD COLUMN IF NOT EXISTS transcript TEXT;
ALTER TABLE family_interviews ADD COLUMN IF NOT EXISTS extraction_result JSONB;
ALTER TABLE family_interviews ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- ── family_members: add birth_year and death_year for timeline/lineage ─────────
ALTER TABLE family_members ADD COLUMN IF NOT EXISTS birth_year INTEGER;
ALTER TABLE family_members ADD COLUMN IF NOT EXISTS death_year INTEGER;

-- ── legacy_ai_director_missions: add target_member_name and emotional_weight ──
ALTER TABLE legacy_ai_director_missions ADD COLUMN IF NOT EXISTS target_member_name TEXT;
ALTER TABLE legacy_ai_director_missions ADD COLUMN IF NOT EXISTS emotional_weight TEXT;

-- ── indexes for new columns ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_family_interviews_interview_type
  ON family_interviews (family_id, interview_type);

CREATE INDEX IF NOT EXISTS idx_family_members_birth_year
  ON family_members (family_id, birth_year);
