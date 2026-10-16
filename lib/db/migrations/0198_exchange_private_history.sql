-- Removing history is private to each participant; retain coordination and
-- safety evidence instead of cascading away another neighbor's records.
ALTER TABLE exchange_listings ADD COLUMN IF NOT EXISTS owner_history_removed_at timestamptz;
ALTER TABLE exchange_pickup_requests ADD COLUMN IF NOT EXISTS buyer_history_removed_at timestamptz;
ALTER TABLE exchange_pickup_requests ADD COLUMN IF NOT EXISTS seller_history_removed_at timestamptz;
