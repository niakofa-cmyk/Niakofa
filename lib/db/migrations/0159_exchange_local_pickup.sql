-- Exchange milestone: local pickup only. No payment, checkout, escrow, or
-- financial settlement fields are intentionally present.

CREATE TABLE IF NOT EXISTS exchange_listings (
  id serial PRIMARY KEY,
  seller_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL DEFAULT 'other',
  condition text NOT NULL DEFAULT 'good',
  neighborhood text NOT NULL,
  pickup_notes text,
  status text NOT NULL DEFAULT 'active',
  moderation_status text NOT NULL DEFAULT 'approved',
  moderation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exchange_listings_status_idx
  ON exchange_listings(status, moderation_status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS exchange_listings_seller_idx
  ON exchange_listings(seller_id, updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS exchange_pickup_requests (
  id serial PRIMARY KEY,
  listing_id integer NOT NULL REFERENCES exchange_listings(id) ON DELETE RESTRICT,
  buyer_id integer NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  note text NOT NULL,
  pickup_area text NOT NULL,
  proposed_window text NOT NULL,
  status text NOT NULL DEFAULT 'requested',
  buyer_confirmed_at timestamptz,
  seller_confirmed_at timestamptz,
  accepted_at timestamptz,
  cancelled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exchange_pickup_requests_listing_idx
  ON exchange_pickup_requests(listing_id, created_at);
CREATE INDEX IF NOT EXISTS exchange_pickup_requests_buyer_idx
  ON exchange_pickup_requests(buyer_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS exchange_pickup_requests_one_per_buyer_listing_idx
  ON exchange_pickup_requests(listing_id, buyer_id);