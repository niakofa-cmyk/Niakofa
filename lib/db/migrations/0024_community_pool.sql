-- 0024_community_pool.sql
-- Community Pool: funded pool that fronts helper payments at pay-it-forward
-- completion; requester repayments replenish the pool; guaranteed minimum per
-- completed task. Idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING).

CREATE TABLE IF NOT EXISTS "community_pool_ledger" (
  "id" serial PRIMARY KEY NOT NULL,
  "entry_type" text NOT NULL,
  "amount" real NOT NULL,
  "request_id" integer,
  "user_id" integer,
  "payment_transaction_id" integer,
  "stripe_payment_intent_id" text,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pool_ledger_entry_type" ON "community_pool_ledger" ("entry_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pool_ledger_request_id" ON "community_pool_ledger" ("request_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pool_ledger_created_at" ON "community_pool_ledger" ("created_at");
--> statement-breakpoint
-- Prevent double-fronting the same request: only one helper_front entry per request
CREATE UNIQUE INDEX IF NOT EXISTS "uq_pool_ledger_front_per_request"
  ON "community_pool_ledger" ("request_id")
  WHERE "entry_type" = 'helper_front';
--> statement-breakpoint
-- Prevent double-minimum for the same request
CREATE UNIQUE INDEX IF NOT EXISTS "uq_pool_ledger_minimum_per_request"
  ON "community_pool_ledger" ("request_id")
  WHERE "entry_type" = 'guaranteed_minimum';
--> statement-breakpoint
-- Webhook idempotency: one contribution entry per Stripe payment intent
CREATE UNIQUE INDEX IF NOT EXISTS "uq_pool_ledger_stripe_pi"
  ON "community_pool_ledger" ("stripe_payment_intent_id")
  WHERE "stripe_payment_intent_id" IS NOT NULL;
--> statement-breakpoint
-- Pool configuration defaults (admin-tunable via system_settings)
INSERT INTO "system_settings" ("key", "value") VALUES ('pool_enabled', 'true')
  ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "system_settings" ("key", "value") VALUES ('pool_guaranteed_minimum', '5')
  ON CONFLICT ("key") DO NOTHING;
