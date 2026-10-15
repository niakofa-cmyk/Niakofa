-- Regular Exchange listings can own approved, processed V21 media assets.
-- Uploads remain in the seller's private staging context until listing create
-- or edit binds them to the listing in one database transaction.
ALTER TABLE media_assets
  DROP CONSTRAINT IF EXISTS media_assets_context_kind_check;

ALTER TABLE media_assets
  ADD CONSTRAINT media_assets_context_kind_check
  CHECK (context_kind IN (
    'story',
    'direct',
    'request',
    'hub',
    'family',
    'circle',
    'exchange_spark',
    'community_moment',
    'hub_moment',
    'exchange_listing_draft',
    'exchange_listing'
  ));

CREATE TABLE IF NOT EXISTS exchange_listing_media (
  id serial PRIMARY KEY,
  listing_id integer NOT NULL REFERENCES exchange_listings(id) ON DELETE CASCADE,
  media_asset_id integer NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exchange_listing_media_position_check CHECK (position BETWEEN 0 AND 5),
  CONSTRAINT exchange_listing_media_listing_position_uidx UNIQUE (listing_id, position),
  CONSTRAINT exchange_listing_media_asset_uidx UNIQUE (media_asset_id)
);

CREATE INDEX IF NOT EXISTS exchange_listing_media_listing_position_idx
  ON exchange_listing_media(listing_id, position);
