ALTER TABLE community_stories
  ADD COLUMN IF NOT EXISTS exchange_listing_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'community_stories_exchange_listing_id_fkey'
  ) THEN
    ALTER TABLE community_stories
      ADD CONSTRAINT community_stories_exchange_listing_id_fkey
      FOREIGN KEY (exchange_listing_id) REFERENCES exchange_listings(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS community_stories_exchange_listing_idx
  ON community_stories(exchange_listing_id, created_at);