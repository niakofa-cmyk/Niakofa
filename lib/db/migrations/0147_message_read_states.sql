CREATE TABLE IF NOT EXISTS message_read_states (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_kind TEXT NOT NULL CHECK (conversation_kind IN ('request', 'hub')),
  conversation_id INTEGER NOT NULL,
  last_read_message_id INTEGER,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, conversation_kind, conversation_id)
);

CREATE INDEX IF NOT EXISTS message_read_states_conversation_idx
  ON message_read_states(conversation_kind, conversation_id, user_id);
