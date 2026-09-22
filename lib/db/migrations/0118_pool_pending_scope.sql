-- Preserve the fund boundary when a guaranteed minimum is queued for later.
-- Existing rows remain nullable for historical compatibility; new payout code
-- rejects unscoped money movement instead of treating NULL as a shared reserve.
ALTER TABLE "pool_pending_minimums"
  ADD COLUMN IF NOT EXISTS "community_id" integer,
  ADD COLUMN IF NOT EXISTS "hub_id" integer;

CREATE INDEX IF NOT EXISTS "idx_pool_pending_minimums_scope"
  ON "pool_pending_minimums" ("community_id", "hub_id", "status", "created_at");