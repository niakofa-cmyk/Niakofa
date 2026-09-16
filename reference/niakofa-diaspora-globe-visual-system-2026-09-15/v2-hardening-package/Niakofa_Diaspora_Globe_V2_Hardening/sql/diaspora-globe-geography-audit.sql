-- Read-only audit for the Diaspora Globe geography contract.
-- Run against the Niakofa database after migrations have been applied.
--
-- Rules:
--   1. non-US canonical roots are countries
--   2. US canonical roots are individual states
--   3. grouped local rows are not Globe roots
--   4. approved canonical roots need complete geography identity
--
-- This file intentionally does not mutate data.

-- 1) Approved canonical rows that violate the contract.
SELECT
  id,
  name,
  display_name,
  status,
  primary_hub_id,
  hub_scope,
  country_code,
  subdivision_code,
  anchor_city
FROM diaspora_hubs
WHERE status = 'approved'
  AND primary_hub_id IS NULL
  AND NOT (
    (
      hub_scope = 'country'
      AND country_code IS NOT NULL
      AND country_code <> 'US'
      AND subdivision_code IS NULL
    )
    OR
    (
      hub_scope = 'us_state'
      AND country_code = 'US'
      AND subdivision_code IS NOT NULL
    )
  )
ORDER BY id;

-- 2) Duplicate approved canonical country markers.
SELECT country_code, COUNT(*) AS canonical_count
FROM diaspora_hubs
WHERE status = 'approved'
  AND primary_hub_id IS NULL
  AND hub_scope = 'country'
  AND country_code IS NOT NULL
  AND country_code <> 'US'
GROUP BY country_code
HAVING COUNT(*) > 1
ORDER BY country_code;

-- 3) Duplicate approved U.S. state markers.
SELECT subdivision_code, COUNT(*) AS canonical_count
FROM diaspora_hubs
WHERE status = 'approved'
  AND primary_hub_id IS NULL
  AND hub_scope = 'us_state'
  AND country_code = 'US'
  AND subdivision_code IS NOT NULL
GROUP BY subdivision_code
HAVING COUNT(*) > 1
ORDER BY subdivision_code;

-- 4) Grouped local rows (these should not become independent Globe markers).
SELECT
  id,
  name,
  primary_hub_id,
  hub_scope,
  country_code,
  subdivision_code,
  anchor_city
FROM diaspora_hubs
WHERE primary_hub_id IS NOT NULL
ORDER BY primary_hub_id, id;
