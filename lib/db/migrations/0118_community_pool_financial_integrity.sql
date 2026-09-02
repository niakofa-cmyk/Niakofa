-- Community Pool financial integrity hardening.
--
-- This migration intentionally fails when the read-only preflight reports
-- existing bad data. Run scripts/verify-community-pool-financial-integrity.sql
-- first in the target environment; do not silently repair money records here.

-- REAL is not an appropriate storage type for dollars. Preserve the existing
-- signed ledger values while converting them to exact cents-scale NUMERIC.
ALTER TABLE "community_pool_ledger"
  ALTER COLUMN "amount" TYPE numeric(12, 2)
  USING "amount"::numeric(12, 2);

ALTER TABLE "pool_pending_minimums"
  ALTER COLUMN "amount" TYPE numeric(12, 2)
  USING "amount"::numeric(12, 2);

ALTER TABLE "community_pool_ledger"
  DROP CONSTRAINT IF EXISTS "chk_pool_ledger_amount_scale";
ALTER TABLE "community_pool_ledger"
  ADD CONSTRAINT "chk_pool_ledger_amount_scale"
  CHECK ("amount" = round("amount", 2));

ALTER TABLE "pool_pending_minimums"
  DROP CONSTRAINT IF EXISTS "chk_pool_pending_minimum_amount";
ALTER TABLE "pool_pending_minimums"
  ADD CONSTRAINT "chk_pool_pending_minimum_amount"
  CHECK ("amount" >= 0 AND "amount" = round("amount", 2));

ALTER TABLE "community_pool_financial_events"
  DROP CONSTRAINT IF EXISTS "chk_pool_financial_amounts_non_negative";
ALTER TABLE "community_pool_financial_events"
  ADD CONSTRAINT "chk_pool_financial_amounts_non_negative"
  CHECK (
    "gross_amount_cents" > 0
    AND "stripe_fee_cents" >= 0
    AND "climate_contribution_cents" >= 0
    AND "net_amount_cents" >= 0
  );

ALTER TABLE "community_pool_financial_events"
  DROP CONSTRAINT IF EXISTS "chk_pool_financial_net_reconciles";
ALTER TABLE "community_pool_financial_events"
  ADD CONSTRAINT "chk_pool_financial_net_reconciles"
  CHECK (
    "net_amount_cents" =
      "gross_amount_cents" - "stripe_fee_cents" - "climate_contribution_cents"
  );

ALTER TABLE "community_pool_financial_events"
  DROP CONSTRAINT IF EXISTS "chk_pool_financial_available_requires_verified";
ALTER TABLE "community_pool_financial_events"
  ADD CONSTRAINT "chk_pool_financial_available_requires_verified"
  CHECK (
    "settlement_status" NOT IN ('available', 'paid_out')
    OR (
      "stripe_verification_status" = 'verified'
      AND "stripe_verified_at" IS NOT NULL
    )
  );

ALTER TABLE "community_pool_financial_events"
  DROP CONSTRAINT IF EXISTS "chk_pool_financial_paid_out_evidence";
ALTER TABLE "community_pool_financial_events"
  ADD CONSTRAINT "chk_pool_financial_paid_out_evidence"
  CHECK (
    "settlement_status" <> 'paid_out'
    OR (
      "paid_out_at" IS NOT NULL
      AND "paid_out_by" IS NOT NULL
      AND length(btrim("paid_out_reference")) > 0
    )
  );

-- One operator payout confirmation is the terminal audit fact for an event.
-- A second identical action must fail rather than create ambiguous evidence.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_pool_financial_paid_out_audit"
  ON "community_pool_financial_audit_events" ("financial_event_id")
  WHERE "action" = 'marked_paid_out';