-- Migration 0122: enforce the persistent Diaspora research workspace vocabulary.
-- The API validates these values, but the database must remain the final
-- integrity boundary for direct writes, imports, and future services.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'diaspora_research_cases_status_check'
      AND conrelid = 'diaspora_research_cases'::regclass
  ) THEN
    ALTER TABLE diaspora_research_cases
      ADD CONSTRAINT diaspora_research_cases_status_check
      CHECK (status IN ('open', 'paused', 'resolved'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'diaspora_research_cases_confidence_check'
      AND conrelid = 'diaspora_research_cases'::regclass
  ) THEN
    ALTER TABLE diaspora_research_cases
      ADD CONSTRAINT diaspora_research_cases_confidence_check
      CHECK (confidence IN ('unreviewed', 'possible', 'supported', 'strong'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'diaspora_research_evidence_type_check'
      AND conrelid = 'diaspora_research_evidence'::regclass
  ) THEN
    ALTER TABLE diaspora_research_evidence
      ADD CONSTRAINT diaspora_research_evidence_type_check
      CHECK (evidence_type IN ('document', 'shared_segment', 'pedigree', 'oral_history', 'place_history', 'dna_profile'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'diaspora_research_evidence_confidence_check'
      AND conrelid = 'diaspora_research_evidence'::regclass
  ) THEN
    ALTER TABLE diaspora_research_evidence
      ADD CONSTRAINT diaspora_research_evidence_confidence_check
      CHECK (confidence IN ('unreviewed', 'possible', 'supported', 'strong'));
  END IF;
END $$;
