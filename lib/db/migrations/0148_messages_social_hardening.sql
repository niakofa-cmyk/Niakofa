-- Messages production-hardening: active people, durable stories and durable notifications.
CREATE TABLE IF NOT EXISTS message_notifications (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  action_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS message_notifications_user_created_idx
  ON message_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS message_notifications_user_read_idx
  ON message_notifications(user_id, read_at);

CREATE TABLE IF NOT EXISTS message_stories (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text,
  media_url text,
  media_type text,
  status text NOT NULL DEFAULT 'published',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS message_stories_user_expires_idx
  ON message_stories(user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS message_stories_status_expires_idx
  ON message_stories(status, expires_at DESC);
