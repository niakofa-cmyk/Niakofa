-- Read-only Community Pool migration and Stripe settlement verification.
SELECT filename, applied_at
FROM _migrations_applied
WHERE filename LIKE '%0115%' OR filename LIKE '%0116%'
ORDER BY filename;

SELECT to_regclass('public.community_pool_financial_events') AS financial_events,
       to_regclass('public.community_pool_ledger') AS pool_ledger;

SELECT
  l.id AS ledger_id,
  l.amount AS ledger_net_dollars,
  l.stripe_payment_intent_id,
  f.gross_amount_cents,
  f.stripe_fee_cents,
  f.climate_contribution_cents,
  f.net_amount_cents,
  f.stripe_balance_transaction_id,
  f.stripe_charge_id,
  f.settlement_status,
  f.available_on,
  (f.gross_amount_cents - f.stripe_fee_cents - f.climate_contribution_cents) AS computed_net,
  (f.net_amount_cents = f.gross_amount_cents - f.stripe_fee_cents - f.climate_contribution_cents) AS amounts_reconcile
FROM community_pool_ledger l
LEFT JOIN community_pool_financial_events f
  ON f.community_pool_ledger_id = l.id
WHERE l.entry_type = 'sponsor_contribution'
ORDER BY l.created_at DESC
LIMIT 20;

SELECT t.id, t.user_id, t.type, t.amount AS history_amount,
       t.related_pool_ledger_id, t.metadata, t.created_at
FROM transactions t
WHERE t.type = 'pool_contribution'
ORDER BY t.created_at DESC
LIMIT 20;

SELECT l.id, l.user_id, l.amount, l.stripe_payment_intent_id, l.created_at
FROM community_pool_ledger l
WHERE l.entry_type = 'sponsor_contribution'
  AND l.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM transactions t
    WHERE t.type = 'pool_contribution'
      AND t.related_pool_ledger_id = l.id
  )
ORDER BY l.created_at DESC
LIMIT 20;

SELECT COALESCE(SUM(amount), 0) AS pool_balance_net
FROM community_pool_ledger;