-- Migration 0014: Analytics — voice activation + language tracking
-- Adds columns to help_requests for language distribution and voice activation
-- metrics that feed the admin analytics dashboard.
-- All changes are additive and idempotent.

ALTER TABLE help_requests
  ADD COLUMN IF NOT EXISTS voice_activated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voice_language  text;

-- Index for analytics GROUP BY queries — partial index on voice_activated=true
-- keeps it small (only voice-activated rows).
CREATE INDEX IF NOT EXISTS help_requests_voice_activated_idx
  ON help_requests (voice_activated)
  WHERE voice_activated = true;

CREATE INDEX IF NOT EXISTS help_requests_voice_language_idx
  ON help_requests (voice_language)
  WHERE voice_language IS NOT NULL;
