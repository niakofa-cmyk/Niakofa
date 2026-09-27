CREATE TYPE exchange_pickup_location_type AS ENUM (
  'public_place',
  'community_center',
  'library',
  'park',
  'business_parking',
  'other_public'
);

ALTER TABLE exchange_listings
  ADD COLUMN pickup_location_type exchange_pickup_location_type;

ALTER TABLE exchange_pickup_requests
  ADD COLUMN pickup_location_type exchange_pickup_location_type,
  ADD COLUMN pickup_note TEXT;

CREATE TABLE exchange_pickup_disputes (
  id SERIAL PRIMARY KEY,
  pickup_request_id INTEGER NOT NULL REFERENCES exchange_pickup_requests(id) ON DELETE RESTRICT,
  opened_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  evidence TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  outcome TEXT,
  resolution TEXT,
  resolved_by INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX exchange_pickup_disputes_request_idx
  ON exchange_pickup_disputes (pickup_request_id, created_at);

CREATE UNIQUE INDEX exchange_pickup_disputes_one_open_per_request_idx
  ON exchange_pickup_disputes (pickup_request_id)
  WHERE status = 'open';