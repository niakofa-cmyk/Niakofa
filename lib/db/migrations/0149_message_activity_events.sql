-- Messages production evidence audit: records successful communication/community actions without message content.
CREATE TABLE IF NOT EXISTS message_activity_events (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS message_activity_events_user_created_idx
  ON message_activity_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS message_activity_events_type_created_idx
  ON message_activity_events(event_type, created_at DESC);
