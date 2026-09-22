-- Migration 0084: audio_circle_follows + circle_blocks + circle_reports tables
--
-- audio_circle_follows lets users subscribe to a neighborhood circle and
-- receive a real-time notification (circle_went_live WS event) the moment
-- a new session starts. One row per (user, circle) — unique constraint
-- prevents duplicates. Cascades on both sides so no orphan rows remain when
-- a user or circle is deleted.
--
-- circle_blocks persists host-initiated blocks so a blocked user cannot
-- rejoin any future session hosted by the same host. Survives session end.
--
-- circle_reports logs incident reports from circle participants for admin
-- review. Survives session end so reports can be investigated after the
-- session has ended.
--
-- co_host role is stored as plain text in audio_circle_participants.role
-- ("host" | "co_host" | "speaker" | "listener") — no enum migration needed
-- since that column is already text. This migration only adds the follows,
-- blocks, and reports tables and a comment documenting the new role value.

CREATE TABLE IF NOT EXISTS audio_circle_follows (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  circle_id  INTEGER NOT NULL REFERENCES audio_circles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, circle_id)
);

CREATE INDEX IF NOT EXISTS audio_circle_follows_user_idx   ON audio_circle_follows(user_id);
CREATE INDEX IF NOT EXISTS audio_circle_follows_circle_idx ON audio_circle_follows(circle_id);

CREATE TABLE IF NOT EXISTS circle_blocks (
  id               SERIAL PRIMARY KEY,
  host_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id       INTEGER REFERENCES audio_circle_sessions(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (host_id, blocked_user_id)
);

CREATE INDEX IF NOT EXISTS circle_blocks_host_idx   ON circle_blocks(host_id);
CREATE INDEX IF NOT EXISTS circle_blocks_blocked_idx ON circle_blocks(blocked_user_id);

CREATE TABLE IF NOT EXISTS circle_reports (
  id           SERIAL PRIMARY KEY,
  session_id   INTEGER REFERENCES audio_circle_sessions(id) ON DELETE SET NULL,
  reporter_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason       TEXT NOT NULL,
  reviewed     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS circle_reports_session_idx  ON circle_reports(session_id);
CREATE INDEX IF NOT EXISTS circle_reports_reported_idx ON circle_reports(reported_id);
CREATE INDEX IF NOT EXISTS circle_reports_reviewed_idx ON circle_reports(reviewed);

COMMENT ON COLUMN audio_circle_participants.role IS
  'host | co_host | speaker | listener — '
  'co_host can promote/demote/mute/kick/block but cannot end the session or control recording';
