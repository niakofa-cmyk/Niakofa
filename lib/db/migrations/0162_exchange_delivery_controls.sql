-- Exchange roadmap: privacy-safe geospatial matching, stale archival, and
-- durable weekly digest delivery deduplication.

ALTER TABLE exchange_listings
  ADD COLUMN IF NOT EXISTS latitude real,
  ADD COLUMN IF NOT EXISTS longitude real,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archive_reason text;

CREATE INDEX IF NOT EXISTS exchange_listings_geo_idx
  ON exchange_listings(latitude, longitude, status, moderation_status, created_at DESC);

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS notif_exchange_activity boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notif_exchange_digest boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notif_optional_paused boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS exchange_digest_deliveries (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_key text NOT NULL,
  listing_count integer NOT NULL DEFAULT 0,
  sent_at timestamptz NOT NULL DEFAULT now(),
  delivered boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX IF NOT EXISTS exchange_digest_deliveries_user_week_idx
  ON exchange_digest_deliveries(user_id, week_key);
CREATE INDEX IF NOT EXISTS exchange_digest_deliveries_sent_idx
  ON exchange_digest_deliveries(sent_at);