-- Migration 0094: Add is_living column to family_members
--
-- Distinguishes living members (who need self-granted storytelling consent)
-- from deceased ancestors (who are eligible by default unless a curator
-- explicitly declines). Without this column the consent rule is not
-- evaluable — every member is treated the same.
--
-- Default true is the privacy-safe direction: existing rows require an
-- explicit grant rather than being silently treated as fair game.

ALTER TABLE family_members
  ADD COLUMN IF NOT EXISTS is_living BOOLEAN NOT NULL DEFAULT true;
