-- The current Diaspora DNA engine compares derived marker sketches only.
-- It does not calculate provider-grade shared cM, so shared_cm_est must remain nullable.
ALTER TABLE dna_match_results
  ALTER COLUMN shared_cm_est DROP NOT NULL;
