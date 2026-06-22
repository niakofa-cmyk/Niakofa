CREATE TABLE IF NOT EXISTS nia_conversations (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  session_id TEXT NOT NULL,
  user_message TEXT NOT NULL,
  nia_response TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS nia_conversations_session_idx ON nia_conversations (session_id);
CREATE INDEX IF NOT EXISTS nia_conversations_created_at_idx ON nia_conversations (created_at);
