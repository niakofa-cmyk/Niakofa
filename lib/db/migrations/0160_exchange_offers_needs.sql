-- Exchange UX foundation: distinguish Offers and Needs without introducing
-- commercial or payment fields. Existing rows remain approved goods Offers.

ALTER TABLE exchange_listings
  ADD COLUMN IF NOT EXISTS listing_type text NOT NULL DEFAULT 'offer';

ALTER TABLE exchange_listings
  ADD COLUMN IF NOT EXISTS resource_type text NOT NULL DEFAULT 'goods';

ALTER TABLE exchange_listings
  DROP CONSTRAINT IF EXISTS exchange_listings_listing_type_check;

ALTER TABLE exchange_listings
  ADD CONSTRAINT exchange_listings_listing_type_check
  CHECK (listing_type IN ('offer', 'need'));

ALTER TABLE exchange_listings
  DROP CONSTRAINT IF EXISTS exchange_listings_resource_type_check;

ALTER TABLE exchange_listings
  ADD CONSTRAINT exchange_listings_resource_type_check
  CHECK (resource_type IN ('goods', 'services'));

CREATE INDEX IF NOT EXISTS exchange_listings_type_idx
  ON exchange_listings(listing_type, resource_type, status, moderation_status, created_at DESC, id DESC);