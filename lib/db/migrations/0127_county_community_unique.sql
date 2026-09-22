-- 0126 may already have run in a development environment before its lookup
-- index became unique. Recreate it so concurrent first visits cannot split a
-- county's users and ledger across duplicate Community Pools.
DROP INDEX IF EXISTS communities_county_state_lookup_idx;

CREATE UNIQUE INDEX communities_county_state_lookup_idx
  ON communities (
    LOWER(TRIM(REGEXP_REPLACE(county, '\s+County$', '', 'i'))),
    UPPER(TRIM(state))
  )
  WHERE county IS NOT NULL AND state IS NOT NULL;