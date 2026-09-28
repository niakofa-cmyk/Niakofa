ALTER TABLE exchange_sparks
  DROP CONSTRAINT IF EXISTS exchange_sparks_listing_id_fkey;

ALTER TABLE exchange_sparks
  ADD CONSTRAINT exchange_sparks_listing_id_fkey
  FOREIGN KEY (listing_id) REFERENCES exchange_listings(id) ON DELETE RESTRICT;