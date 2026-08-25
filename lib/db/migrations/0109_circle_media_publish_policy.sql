-- Niakofa Circles: open media publishing.
-- Keep role-based moderation available, but do not require listener -> speaker
-- promotion before an active participant can publish media.
ALTER TABLE audio_circle_sessions
  ADD COLUMN IF NOT EXISTS media_publish_policy text NOT NULL DEFAULT 'open'
  CHECK (media_publish_policy IN ('open', 'moderated'));

CREATE INDEX IF NOT EXISTS audio_circle_sessions_media_policy_idx
  ON audio_circle_sessions(media_publish_policy);