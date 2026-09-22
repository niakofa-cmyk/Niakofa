-- Unified realtime event log: durable replay/cursor source for every user-visible event.
CREATE TABLE IF NOT EXISTS realtime_event_log (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_type text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT NOW(), actor_id integer REFERENCES users(id) ON DELETE SET NULL,
  conversation_kind text, conversation_id integer, entity_id text, audience_user_ids integer[] NOT NULL DEFAULT '{}', idempotency_key text UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS realtime_event_log_occurred_idx ON realtime_event_log (occurred_at, event_id);
CREATE INDEX IF NOT EXISTS realtime_event_log_conversation_idx ON realtime_event_log (conversation_kind, conversation_id, occurred_at, event_id);
CREATE INDEX IF NOT EXISTS realtime_event_log_actor_idx ON realtime_event_log (actor_id, occurred_at, event_id);