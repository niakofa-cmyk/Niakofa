-- Keep expiration notifications retryable after a crash between recovery and
-- delivery. Unique in-app notifications allow safe retries across API workers.
ALTER TABLE exchange_pickup_requests
  ADD COLUMN IF NOT EXISTS expiry_notified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS exchange_pickup_requests_expiry_notification_idx
  ON exchange_pickup_requests (id)
  WHERE status = 'expired' AND expiry_notified_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS message_notifications_exchange_expiry_once_idx
  ON message_notifications (user_id, (metadata->>'exchange_pickup_request_id'))
  WHERE type = 'exchange' AND metadata->>'action' = 'coordination_expired';

-- Also handles development databases that ran the initial expiration migration
-- before its historical-row backfill was added.
UPDATE exchange_pickup_requests
SET coordination_expires_at = COALESCE(accepted_at, updated_at, created_at) + INTERVAL '48 hours'
WHERE status = 'accepted' AND coordination_expires_at IS NULL;