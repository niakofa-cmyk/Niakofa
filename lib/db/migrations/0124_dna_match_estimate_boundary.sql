-- The derived sketch does not calculate provider-grade shared centimorgans.
-- Keep the legacy column for forward compatibility, but make it impossible
-- for this source to invent a cM value.
ALTER TABLE dna_match_results
  ALTER COLUMN shared_cm_est DROP NOT NULL;