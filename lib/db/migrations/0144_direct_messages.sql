-- Migration 0144: direct user-to-user messaging.
-- Request chat and Hub-to-Hub messaging remain separate bounded systems.

CREATE TABLE IF NOT EXISTS direct_conversations (
  id serial PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  status text NOT NULL DEFAULT 'active',
  CONSTRAINT direct_conversations_status_check CHECK (status IN ('active', 'blocked', 'closed'))
);

CREATE TABLE IF NOT EXISTS direct_conversation_members (
  conversation_id integer NOT NULL REFERENCES direct_conversations(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS direct_conversation_members_user_idx
  ON direct_conversation_members(user_id);

CREATE TABLE IF NOT EXISTS direct_messages (
  id serial PRIMARY KEY,
  conversation_id integer NOT NULL REFERENCES direct_conversations(id) ON DELETE CASCADE,
  sender_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  read_at timestamptz
);

CREATE INDEX IF NOT EXISTS direct_messages_conversation_created_idx
  ON direct_messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS direct_message_blocks (
  blocker_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT direct_message_blocks_distinct_users CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS direct_message_blocks_blocked_idx
  ON direct_message_blocks(blocked_id);

CREATE TABLE IF NOT EXISTS direct_message_reports (
  id serial PRIMARY KEY,
  reporter_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id integer NOT NULL REFERENCES direct_conversations(id) ON DELETE CASCADE,
  message_id integer REFERENCES direct_messages(id) ON DELETE SET NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS direct_message_reports_status_idx
  ON direct_message_reports(status, created_at);