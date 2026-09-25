-- Allow a neighbor to try again after a pickup request is declined or cancelled.
-- Historical pickup rows remain available for coordination history.

DROP INDEX IF EXISTS exchange_pickup_requests_one_per_buyer_listing_idx;
DROP INDEX IF EXISTS exchange_pickup_requests_one_active_per_buyer_listing_idx;

CREATE UNIQUE INDEX IF NOT EXISTS exchange_pickup_requests_one_active_per_buyer_listing_idx
  ON exchange_pickup_requests(listing_id, buyer_id)
  WHERE status IN ('requested', 'accepted');