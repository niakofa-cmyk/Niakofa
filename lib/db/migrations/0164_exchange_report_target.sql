-- Give Exchange reports a durable target and reject duplicate reports from
-- the same reporter for the same listing.

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS reported_exchange_listing_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reports_reported_exchange_listing_id_fk'
      AND conrelid = 'reports'::regclass
  ) THEN
    ALTER TABLE reports
      ADD CONSTRAINT reports_reported_exchange_listing_id_fk
      FOREIGN KEY (reported_exchange_listing_id)
      REFERENCES exchange_listings(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS reports_reported_exchange_listing_id_idx
  ON reports(reported_exchange_listing_id);

CREATE UNIQUE INDEX IF NOT EXISTS reports_exchange_listing_reporter_unique_idx
  ON reports(reporter_id, reported_exchange_listing_id)
  WHERE reported_exchange_listing_id IS NOT NULL;