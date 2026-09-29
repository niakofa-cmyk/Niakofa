-- Repair Exchange geography provisioning after the initial spatial migration.
--
-- 0168 already owns exchange_listings_geo_idx as the fallback latitude/
-- longitude B-tree. The first PostGIS migration reused that name for a GiST
-- index, so PostgreSQL treated the GiST CREATE INDEX IF NOT EXISTS as a
-- no-op. This repair uses a distinct name and also makes the no-PostGIS
-- schema compatible with Drizzle inserts, which include the optional geog
-- column as DEFAULT.
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

    CREATE INDEX IF NOT EXISTS exchange_listings_geog_gist_idx
      ON exchange_listings USING GIST (geog);
  ELSE
    ALTER TABLE exchange_listings
      ADD COLUMN IF NOT EXISTS geog text;
    RAISE NOTICE 'PostGIS not available — Exchange geography repair kept the Haversine fallback active';
  END IF;
END;
$$;