-- Migration: add per-community livable hourly rate override.
-- When set, this overrides the global pool_minimum_hourly_rate system setting
-- for helpers in that specific community/county. Null = fall back to global rate.
-- Default NULL so existing communities keep using the global $15/hr setting
-- with no behavior change until a county admin explicitly sets their rate.
ALTER TABLE communities ADD COLUMN IF NOT EXISTS hourly_rate real DEFAULT NULL;

-- Allow county-branded impact dashboard description and sponsor info.
ALTER TABLE communities ADD COLUMN IF NOT EXISTS description text DEFAULT NULL;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS sponsor_name text DEFAULT NULL;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS sponsor_logo_url text DEFAULT NULL;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS county text DEFAULT NULL;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS state text DEFAULT NULL;
