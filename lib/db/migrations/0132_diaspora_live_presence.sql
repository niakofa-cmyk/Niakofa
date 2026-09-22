-- Migration 0132: live Diaspora hub presence.
--
-- location_updated_at is authoritative for GPS freshness. Do not use users.updated_at:
-- ordinary profile edits must never make an old GPS fix look current.
-- presence_radius_km is an operational matching radius, not a legal boundary.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS location_updated_at TIMESTAMPTZ;

ALTER TABLE diaspora_hubs
  ADD COLUMN IF NOT EXISTS presence_radius_km DOUBLE PRECISION NOT NULL DEFAULT 35;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'diaspora_hubs_presence_radius_km_positive'
  ) THEN
    ALTER TABLE diaspora_hubs
      ADD CONSTRAINT diaspora_hubs_presence_radius_km_positive
      CHECK (presence_radius_km > 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS users_location_updated_at_idx
  ON users(location_updated_at);

CREATE INDEX IF NOT EXISTS diaspora_hubs_status_idx
  ON diaspora_hubs(status);
