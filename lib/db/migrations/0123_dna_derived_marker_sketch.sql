-- A compact, one-way comparison sketch enables the private cohort MVP without
-- retaining raw genotype records. It is not an IBD segment file or ethnicity
-- dataset and must never be presented as forensic or legal evidence.

ALTER TABLE family_dna_profiles
  ADD COLUMN IF NOT EXISTS marker_sketch JSONB;