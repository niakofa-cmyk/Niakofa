-- Accepted pickup coordination must not reserve an Exchange listing forever.
-- Expiry is recovery, not completion: both participants retain the request
-- history and the listing returns to active for a new coordination attempt.
ALTER TABLE exchange_pickup_requests
  ADD COLUMN IF NOT EXISTS coordination_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;

-- Existing accepted pickups need the same recovery deadline as new ones.
-- A legacy row without accepted_at uses its last recorded transition time.
UPDATE exchange_pickup_requests
SET coordination_expires_at = COALESCE(accepted_at, updated_at, created_at) + INTERVAL '48 hours'
WHERE status = 'accepted' AND coordination_expires_at IS NULL;

CREATE INDEX IF NOT EXISTS exchange_pickup_requests_expiry_idx
  ON exchange_pickup_requests (coordination_expires_at)
  WHERE status = 'accepted';