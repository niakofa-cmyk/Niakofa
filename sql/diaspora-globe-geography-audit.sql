-- Read-only audit for the canonical Diaspora Globe geography contract.
-- Run before applying migration 0140.

-- 1) Approved canonical rows that violate the country/state contract.
SELECT
  id,
  name,
  status,
  hub_scope,
  country_code,
  subdivision_code,
  primary_hub_id
FROM diaspora_hubs
WHERE status = 'approved'
  AND primary_hub_id IS NULL
  AND NOT (
    (
      hub_scope = 'country'
      AND country_code IS NOT NULL
      AND upper(country_code) <> 'US'
      AND subdivision_code IS NULL
    )
    OR
    (
      hub_scope = 'us_state'
      AND upper(country_code) = 'US'
      AND subdivision_code IS NOT NULL
    )
  )
ORDER BY id;

-- 2) Duplicate canonical country/state identity.
SELECT country_code, hub_scope, COUNT(*) AS canonical_count
FROM diaspora_hubs
WHERE status = 'approved'
  AND primary_hub_id IS NULL
  AND hub_scope = 'country'
  AND country_code IS NOT NULL
  AND upper(country_code) <> 'US'
GROUP BY country_code, hub_scope
HAVING COUNT(*) > 1
ORDER BY country_code;

SELECT subdivision_code, COUNT(*) AS canonical_count
FROM diaspora_hubs
WHERE status = 'approved'
  AND primary_hub_id IS NULL
  AND hub_scope = 'us_state'
  AND upper(country_code) = 'US'
  AND subdivision_code IS NOT NULL
GROUP BY subdivision_code
HAVING COUNT(*) > 1
ORDER BY subdivision_code;

-- 3) Self-parenting rows.
SELECT id, name, primary_hub_id
FROM diaspora_hubs
WHERE primary_hub_id = id
ORDER BY id;

-- 4) Home-shaped legacy values that must not be canonical Globe roots.
SELECT id, name, display_name, hub_scope, country_code, subdivision_code, tag
FROM diaspora_hubs
WHERE primary_hub_id IS NULL
  AND (
    lower(coalesce(name, '')) IN ('home', 'home hub')
    OR lower(coalesce(display_name, '')) IN ('home', 'home hub')
    OR lower(coalesce(tag, '')) IN ('home', 'home-hub')
  )
ORDER BY id;