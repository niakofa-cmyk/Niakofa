-- 0090_circle_session_settings_enrichment.sql
-- Adds chat_enabled and recording_allowed settings to audio_circle_sessions
-- so the host can toggle them mid-session with server-side enforcement.

ALTER TABLE audio_circle_sessions
  ADD COLUMN IF NOT EXISTS chat_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE audio_circle_sessions
  ADD COLUMN IF NOT EXISTS recording_allowed boolean NOT NULL DEFAULT true;
