ALTER TABLE community_stories
  DROP CONSTRAINT IF EXISTS community_stories_exchange_listing_id_fkey;

ALTER TABLE community_stories
  ADD CONSTRAINT community_stories_exchange_listing_id_fkey
  FOREIGN KEY (exchange_listing_id) REFERENCES exchange_listings(id) ON DELETE CASCADE;