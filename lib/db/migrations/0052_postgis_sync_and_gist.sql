-- Migration: keep users.geog / help_requests.geog in sync with lat/lng, and
-- add GiST indexes so ST_DWithin / ST_Distance queries against those columns
-- are actually indexed instead of doing a sequential scan.
--
-- Context: migration 0004 added the `geog` columns conditionally (only when
-- PostGIS was available), but nothing ever populated them or indexed them.
-- The live /requests/nearby route works around this today by calling
-- ST_MakePoint(hr.lng, hr.lat)::geography inline on every request — that
-- expression can't use an index. This migration:
--   1. Backfills geog on existing rows from lat/lng.
--   2. Adds a BEFORE INSERT/UPDATE trigger so geog auto-updates whenever
--      lat/lng changes (INSERT or UPDATE of either column) — callers never
--      have to remember to set geog manually.
--   3. Adds a GiST index on each geog column.
--
-- Same defensive pattern as 0004: everything is wrapped in a check for
-- PostGIS availability, so this is a safe no-op on a dev DB / Postgres
-- server without the extension (Haversine fallback stays active there).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN

    -- ── Trigger function: sync geog from lat/lng ──────────────────────────
    -- SRID 4326, lng first (ST_MakePoint(x, y) = (lng, lat)) to match the
    -- convention already used in requests.ts's inline ST_MakePoint calls.
    CREATE OR REPLACE FUNCTION sync_geog_from_latlng() RETURNS trigger AS $trig$
    BEGIN
      IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
        NEW.geog := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
      ELSE
        NEW.geog := NULL;
      END IF;
      RETURN NEW;
    END;
    $trig$ LANGUAGE plpgsql;

    -- ── users ───────────────────────────────────────────────────────────
    BEGIN
      -- Backfill first so existing rows aren't left with a NULL geog until
      -- their next unrelated UPDATE.
      UPDATE users
      SET geog = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
      WHERE lat IS NOT NULL AND lng IS NOT NULL AND geog IS NULL;

      DROP TRIGGER IF EXISTS trg_users_sync_geog ON users;
      CREATE TRIGGER trg_users_sync_geog
        BEFORE INSERT OR UPDATE OF lat, lng ON users
        FOR EACH ROW EXECUTE FUNCTION sync_geog_from_latlng();

      CREATE INDEX IF NOT EXISTS users_geog_gix ON users USING GIST (geog);
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Could not wire up geog sync/index for users: %', SQLERRM;
    END;

    -- ── help_requests ──────────────────────────────────────────────────
    BEGIN
      UPDATE help_requests
      SET geog = ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
      WHERE lat IS NOT NULL AND lng IS NOT NULL AND geog IS NULL;

      DROP TRIGGER IF EXISTS trg_help_requests_sync_geog ON help_requests;
      CREATE TRIGGER trg_help_requests_sync_geog
        BEFORE INSERT OR UPDATE OF lat, lng ON help_requests
        FOR EACH ROW EXECUTE FUNCTION sync_geog_from_latlng();

      CREATE INDEX IF NOT EXISTS help_requests_geog_gix ON help_requests USING GIST (geog);
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Could not wire up geog sync/index for help_requests: %', SQLERRM;
    END;

  ELSE
    RAISE NOTICE 'PostGIS not available — skipping geog sync trigger/index (Haversine fallback active)';
  END IF;
END;
$$;
