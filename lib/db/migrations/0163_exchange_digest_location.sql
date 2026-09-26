-- Weekly Exchange digests can use the user's chosen coarse area when a
-- rounded server-side coordinate is unavailable. Timezone is an IANA name
-- supplied by the browser and is used only for the delivery window.

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS exchange_digest_area text,
  ADD COLUMN IF NOT EXISTS exchange_digest_timezone text;

CREATE INDEX IF NOT EXISTS user_settings_exchange_digest_area_idx
  ON user_settings(exchange_digest_area)
  WHERE notif_exchange_digest = true;

CREATE INDEX IF NOT EXISTS exchange_listings_neighborhood_idx
  ON exchange_listings(neighborhood, status, moderation_status, updated_at DESC);