-- Migration 0085: add topic, description, and configurable max_speakers to
-- audio_circle_sessions.
--
-- The host modal has accepted topic + description since the HostCircleModal was
-- built, but the API's INSERT silently dropped both fields because there were no
-- DB columns to store them in. This adds the columns so they are persisted.
--
-- max_speakers was previously hardcoded to 13 (the default); this migration
-- keeps that default but lets a host choose 4/8/12/18/24 at session start.
-- The column already existed (added in 0074) so we only update the default.
--
-- All three changes are fully backward-compatible: existing rows get NULL for
-- topic/description and keep their existing max_speakers value.

ALTER TABLE audio_circle_sessions
  ADD COLUMN IF NOT EXISTS topic       TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Clamp any out-of-range existing max_speakers to the nearest valid option
-- (shouldn't be necessary in practice, but defensive).
UPDATE audio_circle_sessions
  SET max_speakers = 13
  WHERE max_speakers NOT IN (4, 8, 12, 13, 18, 24);
