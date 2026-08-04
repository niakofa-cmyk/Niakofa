CREATE INDEX IF NOT EXISTS idx_nia_conversations_session_created
  ON nia_conversations (session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_nia_conversations_user_created
  ON nia_conversations (user_id, created_at);
