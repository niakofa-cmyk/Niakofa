-- 0089_circle_recording_enrichment.sql
-- Adds recording lifecycle tracking and post-processing metadata to
-- audio_circle_sessions so the archive can show status, duration, file
-- size, transcript, AI summary, and chapter markers alongside the URL.

ALTER TABLE audio_circle_sessions
  ADD COLUMN IF NOT EXISTS recording_status text NOT NULL DEFAULT 'none';
-- none | recording | processing | ready | failed

ALTER TABLE audio_circle_sessions
  ADD COLUMN IF NOT EXISTS recording_duration_seconds integer;

ALTER TABLE audio_circle_sessions
  ADD COLUMN IF NOT EXISTS recording_size_bytes bigint;

ALTER TABLE audio_circle_sessions
  ADD COLUMN IF NOT EXISTS transcript text;

ALTER TABLE audio_circle_sessions
  ADD COLUMN IF NOT EXISTS ai_summary text;

ALTER TABLE audio_circle_sessions
  ADD COLUMN IF NOT EXISTS chapter_markers jsonb;
-- Array of { start: number, end?: number, title: string }
