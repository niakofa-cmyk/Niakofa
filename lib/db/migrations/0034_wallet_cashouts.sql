-- Migration 0034: wallet cash-out ledger
--
-- Closes the "benevolence_wallet is a dead-end" gap: pay-it-forward / pool-fronted /
-- guaranteed-minimum earnings previously only ever incremented this integer column
-- and had NO code path that ever moved the balance to Stripe. This table is the
-- idempotency ledger for POST /wallet/cashout — one row per cash-out attempt,
-- inserted before the Stripe transfer call so its id can serve as the Stripe
-- idempotency key (same pattern as payout-worker.ts / requests.ts completion payouts).

CREATE TABLE IF NOT EXISTS wallet_cashouts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending',
  stripe_account_id TEXT,
  stripe_transfer_id TEXT,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wallet_cashouts_user_id_idx ON wallet_cashouts (user_id);
