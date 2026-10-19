-- Confirm municipal receipts and reconcile existing helper transfers with
-- connected-account bank payouts without creating additional Stripe transfers.

ALTER TABLE community_pool_ledger
  ADD COLUMN IF NOT EXISTS government_budget_id INTEGER
    REFERENCES government_budgets(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS community_pool_ledger_government_budget_idx
  ON community_pool_ledger (government_budget_id)
  WHERE government_budget_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS government_budget_receipts (
  id SERIAL PRIMARY KEY,
  government_sponsor_id INTEGER NOT NULL REFERENCES government_sponsors(id) ON DELETE RESTRICT,
  budget_id INTEGER NOT NULL REFERENCES government_budgets(id) ON DELETE RESTRICT,
  created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE RESTRICT,
  operation_key TEXT NOT NULL,
  stripe_payment_intent_id TEXT,
  community_pool_ledger_id INTEGER REFERENCES community_pool_ledger(id) ON DELETE RESTRICT,
  community_pool_financial_event_id INTEGER REFERENCES community_pool_financial_events(id) ON DELETE RESTRICT,
  gross_amount_cents INTEGER NOT NULL CHECK (gross_amount_cents > 0),
  stripe_fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (stripe_fee_cents >= 0),
  net_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (net_amount_cents >= 0),
  amount_refunded_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_refunded_cents >= 0),
  net_refunded_cents INTEGER NOT NULL DEFAULT 0 CHECK (net_refunded_cents >= 0),
  refund_net_verified BOOLEAN NOT NULL DEFAULT FALSE,
  currency TEXT NOT NULL DEFAULT 'usd',
  settlement_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (settlement_status IN ('pending', 'available', 'paid_out', 'failed')),
  status TEXT NOT NULL DEFAULT 'creating'
    CHECK (status IN ('creating', 'pending', 'succeeded', 'failed', 'canceled', 'partially_refunded', 'refunded')),
  stripe_livemode BOOLEAN NOT NULL DEFAULT FALSE,
  succeeded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT government_budget_receipts_sponsor_operation_uidx
    UNIQUE (government_sponsor_id, operation_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS government_budget_receipts_payment_intent_uidx
  ON government_budget_receipts (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS government_budget_receipts_budget_status_idx
  ON government_budget_receipts (budget_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS government_funding_transfer_links (
  id SERIAL PRIMARY KEY,
  request_funding_id INTEGER NOT NULL
    REFERENCES government_request_funding(id) ON DELETE RESTRICT,
  payout_operation_id INTEGER NOT NULL
    REFERENCES payout_operations(id) ON DELETE RESTRICT,
  stripe_transfer_id TEXT NOT NULL,
  stripe_destination_payment_id TEXT,
  stripe_account_id TEXT NOT NULL,
  linked_amount_cents INTEGER NOT NULL CHECK (linked_amount_cents > 0),
  transfer_amount_cents INTEGER NOT NULL CHECK (transfer_amount_cents > 0),
  reversed_amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (reversed_amount_cents >= 0),
  stripe_livemode BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (linked_amount_cents <= transfer_amount_cents),
  CHECK (reversed_amount_cents <= linked_amount_cents),
  CONSTRAINT government_funding_transfer_link_uidx
    UNIQUE (request_funding_id, stripe_transfer_id)
);
CREATE INDEX IF NOT EXISTS government_funding_transfer_account_idx
  ON government_funding_transfer_links (stripe_account_id, stripe_transfer_id);

CREATE TABLE IF NOT EXISTS government_connected_payouts (
  id SERIAL PRIMARY KEY,
  stripe_account_id TEXT NOT NULL,
  stripe_payout_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('paid', 'failed', 'canceled')),
  arrival_date TIMESTAMPTZ,
  stripe_event_id TEXT NOT NULL,
  stripe_livemode BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT government_connected_payout_account_uidx
    UNIQUE (stripe_account_id, stripe_payout_id)
);
CREATE INDEX IF NOT EXISTS government_connected_payout_status_idx
  ON government_connected_payouts (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS government_transfer_bank_payouts (
  id SERIAL PRIMARY KEY,
  transfer_link_id INTEGER NOT NULL
    REFERENCES government_funding_transfer_links(id) ON DELETE RESTRICT,
  connected_payout_id INTEGER NOT NULL
    REFERENCES government_connected_payouts(id) ON DELETE RESTRICT,
  stripe_balance_transaction_id TEXT NOT NULL,
  linked_amount_cents INTEGER NOT NULL CHECK (linked_amount_cents > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT government_transfer_bank_payout_uidx
    UNIQUE (transfer_link_id, connected_payout_id)
);
CREATE INDEX IF NOT EXISTS government_transfer_bank_payout_payout_idx
  ON government_transfer_bank_payouts (connected_payout_id);
