-- Community Pool settlement invariants (defense-in-depth).
-- Append-only: 0136 is used instead of renaming existing 0118/0119 files.
--
-- verified  => Stripe balance transaction id present
-- available / paid_out => balance transaction + available_on present
-- paid_out  => available_on present (operator payout evidence is application-enforced)

ALTER TABLE "community_pool_financial_events"
  ADD CONSTRAINT "chk_pool_financial_verified_has_balance_transaction"
  CHECK (
    "stripe_verification_status" <> 'verified'
    OR NULLIF(btrim("stripe_balance_transaction_id"), '') IS NOT NULL
  );
--> statement-breakpoint

ALTER TABLE "community_pool_financial_events"
  ADD CONSTRAINT "chk_pool_financial_available_has_evidence"
  CHECK (
    "settlement_status" NOT IN ('available', 'paid_out')
    OR (
      NULLIF(btrim("stripe_balance_transaction_id"), '') IS NOT NULL
      AND "available_on" IS NOT NULL
    )
  );
--> statement-breakpoint

ALTER TABLE "community_pool_financial_events"
  ADD CONSTRAINT "chk_pool_financial_paid_out_is_available"
  CHECK (
    "settlement_status" <> 'paid_out'
    OR "available_on" IS NOT NULL
  );
