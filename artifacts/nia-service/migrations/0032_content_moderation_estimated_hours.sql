-- Migration 0032: content moderation + estimated hours on help requests
--
-- moderation_status: mirrors the gratitude posts pattern.
--   'approved' = passed heuristic screen (default for all rows)
--   'pending'  = held for admin review (spam/illegal signals detected)
--   'rejected' = admin explicitly removed from public visibility
-- Existing rows default to 'approved' — no backfill needed.
--
-- moderation_reason: human-readable string from the heuristic; null when approved.
--
-- estimated_hours: optional requester-supplied estimate of how long the task
-- will take. Used for future livable-wage calculations (guaranteed minimum
-- can scale with effort once this field is populated consistently).

ALTER TABLE help_requests
  ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS moderation_reason text,
  ADD COLUMN IF NOT EXISTS estimated_hours real;

-- Partial index — only rows needing review hit this; approved rows (the vast
-- majority) are excluded so the index stays small and fast.
CREATE INDEX IF NOT EXISTS help_requests_moderation_idx
  ON help_requests (moderation_status, created_at)
  WHERE moderation_status != 'approved';
