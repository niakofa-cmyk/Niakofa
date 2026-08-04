-- Migration 0035: wallet_cashouts index for reconciliation cron performance
--
-- The wallet_cashouts state machine uses these values:
--   pending                → Phase 1 complete: wallet debited, Stripe not yet called
--   failed                 → Stripe transfer failed; retry queued; wallet still debited
--   completed              → Stripe transfer confirmed; ledger entry written
--   reversed               → Stripe reversed the transfer; wallet balance restored
--   permanently_failed     → all retries exhausted, no Stripe transfer; wallet refunded
--   reconciliation_required → ambiguous Stripe outcome; operator must verify before refunding
--
-- This migration adds a composite index on (state, created_at) so the reconciliation
-- cron that scans for stale pending/failed/reconciliation_required rows is fast.
-- It also adds the FK from wallet_cashouts.user_id → users.id (omitted in 0034).

CREATE INDEX IF NOT EXISTS wallet_cashouts_state_created_idx
  ON wallet_cashouts (state, created_at);

-- Add FK idempotently using a DO block (IF NOT EXISTS for CONSTRAINT isn't
-- supported for FK constraints in PostgreSQL without version guards)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'wallet_cashouts'
      AND constraint_name = 'wallet_cashouts_user_id_fk'
      AND constraint_type = 'FOREIGN KEY'
  ) THEN
    ALTER TABLE wallet_cashouts
      ADD CONSTRAINT wallet_cashouts_user_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END;
$$;
