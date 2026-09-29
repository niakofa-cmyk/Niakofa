-- Keep Exchange proximity matching on the stored PostGIS geography point.
-- This migration is intentionally a no-op on local PostgreSQL instances
-- without PostGIS; the API uses its bounded Haversine fallback there.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
    ALTER TABLE exchange_listings
      ADD COLUMN IF NOT EXISTS geog geography(Point, 4326);

    UPDATE exchange_listings
    SET geog = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
    WHERE latitude IS NOT NULL
      AND longitude IS NOT NULL
      AND geog IS NULL;

    CREATE OR REPLACE FUNCTION sync_exchange_listing_geog()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $trigger$
    BEGIN
      IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
        NEW.geog := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
      ELSE
        NEW.geog := NULL;
      END IF;
      RETURN NEW;
    END;
    $trigger$;

    DROP TRIGGER IF EXISTS trg_exchange_listings_sync_geog ON exchange_listings;
    CREATE TRIGGER trg_exchange_listings_sync_geog
      BEFORE INSERT OR UPDATE OF latitude, longitude ON exchange_listings
      FOR EACH ROW EXECUTE FUNCTION sync_exchange_listing_geog();

    CREATE INDEX IF NOT EXISTS exchange_listings_geo_idx
      ON exchange_listings USING GIST (geog);
  ELSE
    RAISE NOTICE 'PostGIS not available — skipping Exchange geography (Haversine fallback active)';
  END IF;
END;
$$;