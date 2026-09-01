-- Migration 0116: Link Community Pool contributions to the contributor's
-- personal History and seed the reserve-health policy.
--
-- The pool ledger and financial-events table remain the accounting source of
-- truth. These columns provide a durable, read-only projection for Profile →
-- History, including a gross headline and the processor/Climate/net details.

ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "related_pool_ledger_id" integer;

ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "related_financial_event_id" integer;

ALTER TABLE "transactions"
  ADD COLUMN IF NOT EXISTS "metadata" jsonb;

CREATE INDEX IF NOT EXISTS "transactions_related_pool_ledger_id_idx"
  ON "transactions" ("related_pool_ledger_id");

--> statement-breakpoint

-- Backfill existing named sponsor contributions. The NOT EXISTS guard makes
-- this safe to run repeatedly and preserves the gross amount as the History
-- headline even when a financial event has a smaller net amount.
INSERT INTO "transactions"
  ("user_id", "type", "amount", "description",
   "related_pool_ledger_id", "related_financial_event_id", "metadata", "created_at")
SELECT
  l.user_id,
  'pool_contribution',
  COALESCE(f.gross_amount_cents / 100.0, l.amount),
  CASE
    WHEN f.id IS NOT NULL THEN
      'You contributed $' ||
      TO_CHAR(ROUND((f.gross_amount_cents / 100.0)::numeric, 2), 'FM999999990.00') ||
      ' to the Community Pool'
    ELSE
      'You contributed $' ||
      TO_CHAR(ROUND(l.amount::numeric, 2), 'FM999999990.00') ||
      ' to the Community Pool'
  END,
  l.id,
  f.id,
  CASE
    WHEN f.id IS NOT NULL THEN
      jsonb_build_object(
        'gross_amount_cents', f.gross_amount_cents,
        'stripe_fee_cents', f.stripe_fee_cents,
        'climate_contribution_cents', f.climate_contribution_cents,
        'net_amount_cents', f.net_amount_cents,
        'currency', f.currency,
        'settlement_status', f.settlement_status,
        'available_on', f.available_on
      )
    ELSE NULL
  END,
  l.created_at
FROM "community_pool_ledger" l
LEFT JOIN "community_pool_financial_events" f
  ON f.community_pool_ledger_id = l.id
WHERE l.entry_type = 'sponsor_contribution'
  AND l.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "transactions" t
    WHERE t.user_id = l.user_id
      AND t.type = 'pool_contribution'
      AND t.related_pool_ledger_id = l.id
  );

--> statement-breakpoint

-- Required Reserve = helpers covered × guaranteed hours × hourly rate ×
-- safety multiplier. These are independent of the $1–$10,000 contribution
-- bounds and can be tuned by the existing admin settings endpoint.
INSERT INTO "system_settings" ("key", "value") VALUES
  ('pool_reserve_helpers_covered', '10'),
  ('pool_reserve_guaranteed_hours', '4'),
  ('pool_reserve_safety_multiplier', '1.25')
ON CONFLICT ("key") DO NOTHING;