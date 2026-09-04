-- Every GPS-resolved county gets one independently funded Community Pool.
-- The original seed predates the county/state columns, so backfill it before
-- the resolver starts using canonical jurisdiction keys.
UPDATE communities
SET county = 'Tarrant',
    state = 'TX'
WHERE county IS NULL
  AND state IS NULL
  AND LOWER(TRIM(name)) IN ('tarrant county', 'tarrant county, tx');

CREATE UNIQUE INDEX IF NOT EXISTS communities_county_state_lookup_idx
  ON communities (
    LOWER(TRIM(REGEXP_REPLACE(county, '\s+County$', '', 'i'))),
    UPPER(TRIM(state))
  )
  WHERE county IS NOT NULL AND state IS NOT NULL;