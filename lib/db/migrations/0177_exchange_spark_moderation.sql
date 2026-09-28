ALTER TABLE exchange_sparks
  ADD COLUMN IF NOT EXISTS moderation_reason text,
  ADD COLUMN IF NOT EXISTS moderation_reviewed_by integer REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS moderation_reviewed_at timestamptz;

CREATE TABLE IF NOT EXISTS exchange_spark_moderation_history (
  id serial PRIMARY KEY,
  -- Keep the append-only audit row after an owner-requested Spark cleanup.
  spark_id integer NOT NULL,
  moderator_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action text NOT NULL,
  previous_status text NOT NULL,
  next_status text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exchange_spark_moderation_history_spark_idx
  ON exchange_spark_moderation_history(spark_id, created_at);