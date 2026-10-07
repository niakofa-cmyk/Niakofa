-- Niakofa Community Pool readiness report (read-only).
-- Active means the account is not being deleted and its location was updated
-- within the last 30 days. Only explicitly county/state-scoped communities are
-- treated as county pools; NULL-scope, unscoped, and missing references are
-- reported separately.
--
-- Run against the intended database only after confirming the environment.
-- This transaction cannot write data.
BEGIN;
SET TRANSACTION READ ONLY;

-- County readiness. Amber means below the reserve goal, not automatically a
-- failure. A queued unpaid minimum always takes priority and is urgent.
WITH active_users AS (
  SELECT id, community_id, helper_mode_active
  FROM users
  WHERE deletion_status = 'active'
    AND location_updated_at > now() - interval '30 days'
),
active_by_community AS (
  SELECT community_id,
         count(*) AS active_users,
         count(*) FILTER (WHERE helper_mode_active) AS active_helpers
  FROM active_users
  GROUP BY community_id
),
pool_balance AS (
  SELECT community_id,
         coalesce(sum(amount), 0) AS balance,
         coalesce(sum(amount) FILTER (WHERE entry_type = 'sponsor_contribution'), 0) AS contributed
  FROM community_pool_ledger
  GROUP BY community_id
),
pending AS (
  SELECT community_id,
         count(*) AS pending_minimums,
         coalesce(sum(amount), 0) AS pending_owed
  FROM pool_pending_minimums
  WHERE status = 'pending'
  GROUP BY community_id
)
SELECT c.id,
       c.name,
       c.county,
       c.state,
       a.active_users,
       a.active_helpers,
       coalesce(b.balance, 0) AS balance,
       c.target_reserve_amount AS target,
       coalesce(b.contributed, 0) AS contributed,
       coalesce(p.pending_minimums, 0) AS pending_minimums,
       coalesce(p.pending_owed, 0) AS pending_owed,
       CASE
         WHEN coalesce(p.pending_minimums, 0) > 0 THEN '1_RED_unpaid_minimums_queued'
         WHEN coalesce(b.balance, 0) <= 0 THEN '2_RED_empty'
         WHEN coalesce(b.balance, 0) < c.target_reserve_amount THEN '3_AMBER_below_target'
         ELSE '4_GREEN_at_or_above_target'
       END AS readiness
FROM active_by_community a
JOIN communities c ON c.id = a.community_id
LEFT JOIN pool_balance b ON b.community_id = c.id
LEFT JOIN pending p ON p.community_id = c.id
WHERE a.active_users > 0
  AND nullif(btrim(c.county), '') IS NOT NULL
  AND nullif(btrim(c.state), '') IS NOT NULL
ORDER BY readiness, a.active_users DESC;

-- Active users without a valid county-scoped pool. This includes NULL IDs,
-- missing community rows, and rows for existing but unscoped communities.
WITH active_users AS (
  SELECT id, community_id
  FROM users
  WHERE deletion_status = 'active'
    AND location_updated_at > now() - interval '30 days'
)
SELECT
  count(*) FILTER (WHERE au.community_id IS NULL) AS null_community_id_users,
  count(*) FILTER (
    WHERE au.community_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM communities c
        WHERE c.id = au.community_id
          AND nullif(btrim(c.county), '') IS NOT NULL
          AND nullif(btrim(c.state), '') IS NOT NULL
      )
  ) AS users_without_county_scoped_community,
  count(*) FILTER (
    WHERE au.community_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM communities c WHERE c.id = au.community_id)
  ) AS users_with_missing_community_reference
FROM active_users au;

-- Is the reported amount still in the NULL-scope bucket?
SELECT 'ledger_null_scope' AS check_name,
       count(*) AS rows,
       coalesce(sum(amount), 0) AS balance
FROM community_pool_ledger
WHERE community_id IS NULL;

SELECT 'pending_null_scope' AS check_name,
       count(*) AS pending_minimums,
       coalesce(sum(amount), 0) AS pending_owed
FROM pool_pending_minimums
WHERE community_id IS NULL
  AND status = 'pending';

-- Funding and queued minimums attached to existing communities that have no
-- county/state scope; these must not be mistaken for a county pool.
SELECT c.id, c.name, c.county, c.state,
       coalesce(b.balance, 0) AS balance,
       coalesce(p.pending_minimums, 0) AS pending_minimums,
       coalesce(p.pending_owed, 0) AS pending_owed
FROM communities c
LEFT JOIN (
  SELECT community_id, sum(amount) AS balance
  FROM community_pool_ledger
  GROUP BY community_id
) b ON b.community_id = c.id
LEFT JOIN (
  SELECT community_id, count(*) AS pending_minimums, sum(amount) AS pending_owed
  FROM pool_pending_minimums
  WHERE status = 'pending'
  GROUP BY community_id
) p ON p.community_id = c.id
WHERE nullif(btrim(c.county), '') IS NULL
   OR nullif(btrim(c.state), '') IS NULL
ORDER BY c.id;

-- Unpaid minimums for every scope, including counties without currently active
-- users, so old promises remain visible and urgent.
SELECT community_id, count(*) AS pending_minimums, coalesce(sum(amount), 0) AS pending_owed
FROM pool_pending_minimums
WHERE status = 'pending'
GROUP BY community_id
ORDER BY pending_minimums DESC, community_id NULLS FIRST;

-- Duplicate guard: only compare rows with both county and state assigned.
SELECT lower(trim(regexp_replace(county, '\s+County$', '', 'i'))) AS county_key,
       upper(trim(state)) AS state_key,
       count(*) AS pool_count
FROM communities
WHERE nullif(btrim(county), '') IS NOT NULL
  AND nullif(btrim(state), '') IS NOT NULL
GROUP BY 1, 2
HAVING count(*) > 1;

-- Orphaned pool ledger and pending-minimum rows should return no rows.
SELECT 'ledger_points_at_missing_community' AS check_name, l.id, l.community_id
FROM community_pool_ledger l
WHERE l.community_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM communities c WHERE c.id = l.community_id);

SELECT 'pending_minimum_points_at_missing_community' AS check_name, p.id, p.community_id
FROM pool_pending_minimums p
WHERE p.community_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM communities c WHERE c.id = p.community_id);

ROLLBACK;
