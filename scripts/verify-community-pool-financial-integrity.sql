-- Production-safe, read-only Community Pool financial integrity preflight.
--
-- Every result set below should be empty (except migration/status checks)
-- before declaring the Community Pool financial schema production-complete.
--
-- HISTORY (2026-09-02): migration_presence previously omitted
-- 0118_community_pool_financial_integrity.sql. Both existing 0118-prefixed
-- files are checked explicitly by full filename. Do not rename an already-
-- applied migration solely to make numeric prefixes unique.
BEGIN;
SET TRANSACTION READ ONLY;

SELECT 'migration_presence' AS check_name, filename, applied_at
FROM _migrations_applied
WHERE filename IN (
  '0115_community_pool_financial_events.sql',
  '0116_pool_contribution_user_history.sql',
  '0117_pool_settlement_verification_and_payout.sql',
  '0118_pool_pending_scope.sql',
  '0118_community_pool_financial_integrity.sql'
)
ORDER BY filename;
-- Expect 5 rows once fully migrated. If financial-integrity migration is
-- missing, downstream clean checks are unverified rather than a database pass.

SELECT '0118_collision_status' AS check_name,
       count(*) FILTER (WHERE filename = '0118_pool_pending_scope.sql') AS pending_scope_applied,
       count(*) FILTER (WHERE filename = '0118_community_pool_financial_integrity.sql') AS financial_integrity_applied
FROM _migrations_applied;

SELECT 'ledger_type' AS check_name, table_name, column_name, data_type,
       numeric_precision, numeric_scale
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('community_pool_ledger', 'pool_pending_minimums')
  AND column_name = 'amount';
-- Expect numeric(12,2) on both after financial integrity migration.

SELECT 'ledger_amount_conversion_risk' AS check_name, id, amount
FROM community_pool_ledger
WHERE amount::text = 'NaN'
   OR amount::numeric <> round(amount::numeric, 2)
   OR amount::numeric > 9999999999.99
   OR amount::numeric < -9999999999.99
ORDER BY id;

SELECT 'pending_amount_conversion_risk' AS check_name, id, amount
FROM pool_pending_minimums
WHERE amount::text = 'NaN'
   OR amount::numeric <> round(amount::numeric, 2)
   OR amount::numeric < 0
   OR amount::numeric > 9999999999.99
ORDER BY id;

SELECT 'accounting_mismatch' AS check_name, id, gross_amount_cents,
       stripe_fee_cents, climate_contribution_cents, net_amount_cents,
       gross_amount_cents - stripe_fee_cents - climate_contribution_cents AS computed_net
FROM community_pool_financial_events
WHERE net_amount_cents <>
      gross_amount_cents - stripe_fee_cents - climate_contribution_cents
ORDER BY id;

SELECT 'negative_or_zero_financial_amount' AS check_name, id,
       gross_amount_cents, stripe_fee_cents, climate_contribution_cents,
       net_amount_cents
FROM community_pool_financial_events
WHERE gross_amount_cents <= 0
   OR stripe_fee_cents < 0
   OR climate_contribution_cents < 0
   OR net_amount_cents < 0
ORDER BY id;

SELECT 'available_without_verification' AS check_name, id,
       stripe_verification_status, stripe_verified_at, settlement_status
FROM community_pool_financial_events
WHERE settlement_status IN ('available', 'paid_out')
  AND (
    stripe_verification_status <> 'verified'
    OR stripe_verified_at IS NULL
  )
ORDER BY id;

SELECT 'paid_out_without_evidence' AS check_name, id, paid_out_at,
       paid_out_by, paid_out_reference, settlement_status
FROM community_pool_financial_events
WHERE settlement_status = 'paid_out'
  AND (
    paid_out_at IS NULL
    OR paid_out_by IS NULL
    OR NULLIF(btrim(paid_out_reference), '') IS NULL
  )
ORDER BY id;

SELECT 'duplicate_paid_out_audit' AS check_name, financial_event_id,
       count(*) AS audit_count
FROM community_pool_financial_audit_events
WHERE action = 'marked_paid_out'
GROUP BY financial_event_id
HAVING count(*) > 1
ORDER BY financial_event_id;

ROLLBACK;
