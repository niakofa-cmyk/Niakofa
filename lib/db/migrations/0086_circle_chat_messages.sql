-- Migration 0086: persistent chat messages for Circle sessions.
--
-- Previously chat was ephemeral — the server broadcast each message via
-- WebSocket but never wrote it to the DB, so messages were lost on refresh
-- and late-joiners saw nothing. This table stores every message so clients
-- can fetch the last 200 on mount (GET /audio-circle-sessions/:id/chat) and
-- seamlessly merge them with live WS messages.
--
-- Cascade from session_id: when a session is deleted its whole message
-- thread is cleaned up automatically.
-- SET NULL on sender_id (mirrors chat_messages pattern from migration 0075):
-- deleting a user does NOT wipe the conversation for everyone else — the
-- message body survives with a null sender_id.

CREATE TABLE IF NOT EXISTS audio_circle_messages (
  id         SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES audio_circle_sessions(id) ON DELETE CASCADE,
  sender_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body       TEXT    NOT NULL,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audio_circle_messages_session_idx ON audio_circle_messages(session_id);
CREATE INDEX IF NOT EXISTS audio_circle_messages_sent_at_idx ON audio_circle_messages(sent_at);
