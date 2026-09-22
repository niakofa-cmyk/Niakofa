-- Community Pool financial settlement hardening.
-- The existing community_pool_ledger remains the signed spendable ledger.
-- Stripe settlement facts are stored separately in cents so gross, fees,
-- Climate deductions, and net funds can be reconciled without estimation.
CREATE TABLE IF NOT EXISTS "community_pool_financial_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "community_pool_ledger_id" integer NOT NULL,
  "user_id" integer,
  "community_id" integer,
  "stripe_payment_intent_id" text,
  "stripe_charge_id" text,
  "stripe_balance_transaction_id" text,
  "stripe_climate_transaction_id" text,
  "gross_amount_cents" integer NOT NULL,
  "stripe_fee_cents" integer NOT NULL DEFAULT 0,
  "climate_contribution_cents" integer NOT NULL DEFAULT 0,
  "net_amount_cents" integer NOT NULL,
  "currency" text NOT NULL DEFAULT 'usd',
  "settlement_status" text NOT NULL DEFAULT 'pending',
  "available_on" timestamptz,
  "paid_out_at" timestamptz,
  "stripe_livemode" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT NOW(),
  "updated_at" timestamptz NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_pool_financial_payment_intent"
  ON "community_pool_financial_events" ("stripe_payment_intent_id")
  WHERE "stripe_payment_intent_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_pool_financial_balance_transaction"
  ON "community_pool_financial_events" ("stripe_balance_transaction_id")
  WHERE "stripe_balance_transaction_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_pool_financial_ledger_entry"
  ON "community_pool_financial_events" ("community_pool_ledger_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pool_financial_user"
  ON "community_pool_financial_events" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pool_financial_community"
  ON "community_pool_financial_events" ("community_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pool_financial_settlement"
  ON "community_pool_financial_events" ("settlement_status");