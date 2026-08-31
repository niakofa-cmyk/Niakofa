-- 0059_stripe_pool_webhook_audit.sql
-- Financial hardening for Community Pool Stripe reconciliation.
-- Stores received Stripe event IDs so webhook retries are observable and
-- transaction-level reconciliation can distinguish "paid at Stripe" from
-- "posted to the Niakofa ledger".

CREATE TABLE IF NOT EXISTS "stripe_webhook_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "stripe_event_id" text NOT NULL,
  "event_type" text NOT NULL,
  "livemode" boolean NOT NULL DEFAULT false,
  "payment_intent_id" text,
  "processing_status" text NOT NULL DEFAULT 'received',
  "error_message" text,
  "received_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  "processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_stripe_webhook_events_event_id"
  ON "stripe_webhook_events" ("stripe_event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stripe_webhook_events_pi"
  ON "stripe_webhook_events" ("payment_intent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stripe_webhook_events_status"
  ON "stripe_webhook_events" ("processing_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_stripe_webhook_events_received_at"
  ON "stripe_webhook_events" ("received_at");
