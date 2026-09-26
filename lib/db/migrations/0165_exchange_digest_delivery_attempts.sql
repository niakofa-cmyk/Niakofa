-- Make weekly Exchange delivery safe across workers and recoverable after
-- process crashes or push-provider outages.

ALTER TABLE exchange_digest_deliveries
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS claim_token text,
  ADD COLUMN IF NOT EXISTS claim_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS terminal_failure boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_error text;

CREATE INDEX IF NOT EXISTS exchange_digest_deliveries_retry_idx
  ON exchange_digest_deliveries(next_attempt_at, claim_expires_at);