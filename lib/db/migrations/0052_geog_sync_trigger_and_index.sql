-- Completes the PostGIS geography setup started in 0004_slow_may_parker.sql.
--
-- 0004 added the `geog` columns but nothing has ever written to them —
-- there is no trigger keeping geog in sync with lat/lng, and no GiST index
-- was ever created. As a result:
--   - Every row's `geog` is NULL (confirmed: no INSERT/UPDATE in app code
--     ever sets it).
--   - /requests/nearby works anyway only because it computes
--     ST_MakePoint(hr.lng, hr.lat)::geography inline, per row, on every
--     query — which cannot use a GiST index even once one exists, since
--     the index must be on the *column*, not an ad-hoc expression.
--   - /helpers/nearby doesn't use PostGIS at all; it pulls every row into
--     Node and Haversine-scans in JS.
--
-- This migration:
--   1. Adds a trigger that populates geog from lat/lng on insert/update,
--      for both help_requests and users.
--   2. Backfills geog for existing rows.
--   3. Creates the GiST indexes that make ST_DWithin / KNN (<->) queries
--      against the geog column actually indexed.
--
-- Wrapped the same way as 0004: a no-op (with a NOTICE) when PostGIS is
-- not installed, so this never blocks subsequent migrations on an
-- environment running the Haversine fallback.
DO $
BEGIN
  -- Use pg_extension (installed) not pg_available_extensions (can be installed).
  -- Migration 0050 runs CREATE EXTENSION IF NOT EXISTS postgis, so by the time
  -- this migration executes, the extension entry is in pg_extension if and only
  -- if PostGIS is actually installed and usable on this cluster.
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN

    -- One trigger function, reused by both tables' triggers.
    BEGIN
      CREATE OR REPLACE FUNCTION sync_geog() RETURNS trigger AS $trigger$
      BEGIN
        IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
          NEW.geog := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
        ELSE
          NEW.geog := NULL;
        END IF;
        RETURN NEW;
      END;
      $trigger$ LANGUAGE plpgsql;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Could not create sync_geog(): %', SQLERRM;
    END;

    -- help_requests: trigger + backfill + index.
    BEGIN
      DROP TRIGGER IF EXISTS trg_sync_geog_help_requests ON help_requests;
      CREATE TRIGGER trg_sync_geog_help_requests
        BEFORE INSERT OR UPDATE OF lat, lng ON help_requests
        FOR EACH ROW EXECUTE FUNCTION sync_geog();
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Could not create trigger on help_requests: %', SQLERRM;
    END;

    BEGIN
      UPDATE help_requests
      SET geog = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
      WHERE geog IS NULL AND lat IS NOT NULL AND lng IS NOT NULL;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Could not backfill geog on help_requests: %', SQLERRM;
    END;

    BEGIN
      CREATE INDEX IF NOT EXISTS idx_help_requests_geog ON help_requests USING GIST (geog);
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Could not create GiST index on help_requests: %', SQLERRM;
    END;

    -- users: trigger + backfill + index.
    BEGIN
      DROP TRIGGER IF EXISTS trg_sync_geog_users ON users;
      CREATE TRIGGER trg_sync_geog_users
        BEFORE INSERT OR UPDATE OF lat, lng ON users
        FOR EACH ROW EXECUTE FUNCTION sync_geog();
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Could not create trigger on users: %', SQLERRM;
    END;

    BEGIN
      UPDATE users
      SET geog = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
      WHERE geog IS NULL AND lat IS NOT NULL AND lng IS NOT NULL;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Could not backfill geog on users: %', SQLERRM;
    END;

    BEGIN
      CREATE INDEX IF NOT EXISTS idx_users_geog ON users USING GIST (geog);
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Could not create GiST index on users: %', SQLERRM;
    END;

  ELSE
    RAISE NOTICE 'PostGIS not available — skipping geog trigger/index setup (Haversine fallback active)';
  END IF;
END;
$$;
