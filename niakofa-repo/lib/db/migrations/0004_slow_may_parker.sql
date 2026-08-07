-- PostGIS geography columns for spatial queries.
-- Wrapped in a DO block so this migration is a no-op when PostGIS is not
-- installed (e.g. Railway Postgres 18+ without the extension) rather than
-- crashing and blocking all subsequent migrations.  The api-server already
-- falls back to Haversine distance when these columns are absent.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'postgis') THEN
    BEGIN
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "geog" geography(Point, 4326);
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Could not add geog column to users: %', SQLERRM;
    END;
    BEGIN
      ALTER TABLE "help_requests" ADD COLUMN IF NOT EXISTS "geog" geography(Point, 4326);
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Could not add geog column to help_requests: %', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'PostGIS not available — skipping geography columns (Haversine fallback active)';
  END IF;
END;
$$;
