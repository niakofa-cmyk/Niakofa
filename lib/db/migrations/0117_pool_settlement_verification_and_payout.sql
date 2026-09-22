-- Migration 0117: separate automatic Stripe verification from operator payout.
-- Stripe verification answers "did Stripe record/settle this money?"
-- settlement_status answers "has Niakofa confirmed the money was released?"

ALTER TABLE "community_pool_financial_events"
  ADD COLUMN IF NOT EXISTS "stripe_verification_status" text NOT NULL DEFAULT 'unverified';
ALTER TABLE "community_pool_financial_events"
  ADD COLUMN IF NOT EXISTS "stripe_verified_at" timestamptz;
ALTER TABLE "community_pool_financial_events"
  ADD COLUMN IF NOT EXISTS "stripe_verification_error" text;
ALTER TABLE "community_pool_financial_events"
  ADD COLUMN IF NOT EXISTS "paid_out_by" integer;
ALTER TABLE "community_pool_financial_events"
  ADD COLUMN IF NOT EXISTS "paid_out_reference" text;
ALTER TABLE "community_pool_financial_events"
  ADD COLUMN IF NOT EXISTS "paid_out_note" text;

--> statement-breakpoint

ALTER TABLE "community_pool_financial_events"
  DROP CONSTRAINT IF EXISTS "chk_pool_financial_verification_status";
ALTER TABLE "community_pool_financial_events"
  ADD CONSTRAINT "chk_pool_financial_verification_status"
  CHECK ("stripe_verification_status" IN ('unverified', 'verified', 'verification_failed'));

ALTER TABLE "community_pool_financial_events"
  DROP CONSTRAINT IF EXISTS "chk_pool_financial_settlement_status";
ALTER TABLE "community_pool_financial_events"
  ADD CONSTRAINT "chk_pool_financial_settlement_status"
  CHECK ("settlement_status" IN ('pending', 'available', 'paid_out', 'failed'));

-- The database itself must reject an unverified payout.
ALTER TABLE "community_pool_financial_events"
  DROP CONSTRAINT IF EXISTS "chk_pool_financial_paid_out_requires_verified";
ALTER TABLE "community_pool_financial_events"
  ADD CONSTRAINT "chk_pool_financial_paid_out_requires_verified"
  CHECK ("settlement_status" <> 'paid_out' OR "stripe_verification_status" = 'verified');

--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_pool_financial_verification_status"
  ON "community_pool_financial_events" ("stripe_verification_status");
CREATE INDEX IF NOT EXISTS "idx_pool_financial_paid_out_by"
  ON "community_pool_financial_events" ("paid_out_by");

-- Existing financial-event rows were created only after the Stripe breakdown
-- succeeded. Backfill that verified fact without changing payout state.
UPDATE "community_pool_financial_events"
SET
  "stripe_verification_status" = 'verified',
  "stripe_verified_at" = COALESCE("stripe_verified_at", "created_at")
WHERE "stripe_verification_status" = 'unverified'
  AND "stripe_balance_transaction_id" IS NOT NULL;

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "community_pool_financial_audit_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "financial_event_id" integer NOT NULL,
  "action" text NOT NULL,
  "actor_user_id" integer NOT NULL,
  "reference" text,
  "note" text,
  "metadata" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "idx_pool_financial_audit_event"
  ON "community_pool_financial_audit_events" ("financial_event_id");
CREATE INDEX IF NOT EXISTS "idx_pool_financial_audit_actor"
  ON "community_pool_financial_audit_events" ("actor_user_id");
CREATE INDEX IF NOT EXISTS "idx_pool_financial_audit_created_at"
  ON "community_pool_financial_audit_events" ("created_at");

-- Audit rows are financial evidence: application code may insert them, but
-- future code cannot silently rewrite or delete them.
CREATE OR REPLACE FUNCTION prevent_pool_financial_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'community_pool_financial_audit_events is insert-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_pool_financial_audit_immutable
  ON "community_pool_financial_audit_events";
CREATE TRIGGER trg_pool_financial_audit_immutable
  BEFORE UPDATE OR DELETE ON "community_pool_financial_audit_events"
  FOR EACH ROW EXECUTE FUNCTION prevent_pool_financial_audit_mutation();