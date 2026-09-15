-- Durable, membership-checked Hub-to-Hub messaging.
-- The pair is canonicalized by the API (hub_a_id < hub_b_id), making
-- conversation creation idempotent and preventing duplicate threads.

CREATE TABLE IF NOT EXISTS diaspora_hub_conversations (
  id SERIAL PRIMARY KEY,
  hub_a_id INTEGER NOT NULL REFERENCES diaspora_hubs(id) ON DELETE CASCADE,
  hub_b_id INTEGER NOT NULL REFERENCES diaspora_hubs(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT diaspora_hub_conversations_pair_unique UNIQUE (hub_a_id, hub_b_id),
  CONSTRAINT diaspora_hub_conversations_distinct_hubs CHECK (hub_a_id <> hub_b_id)
);

CREATE INDEX IF NOT EXISTS diaspora_hub_conversations_hub_a_idx
  ON diaspora_hub_conversations(hub_a_id);
CREATE INDEX IF NOT EXISTS diaspora_hub_conversations_hub_b_idx
  ON diaspora_hub_conversations(hub_b_id);

CREATE TABLE IF NOT EXISTS diaspora_hub_messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES diaspora_hub_conversations(id) ON DELETE CASCADE,
  sender_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  sender_hub_id INTEGER NOT NULL REFERENCES diaspora_hubs(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS diaspora_hub_messages_conversation_idx
  ON diaspora_hub_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS diaspora_hub_messages_sender_hub_idx
  ON diaspora_hub_messages(sender_hub_id);
