CREATE TABLE IF NOT EXISTS payout_operations (
  id SERIAL PRIMARY KEY,
  operation_key TEXT NOT NULL,
  request_id INTEGER NOT NULL,
  helper_id INTEGER NOT NULL,
  requester_id INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  platform_fee_cents INTEGER NOT NULL,
  stripe_account_id TEXT NOT NULL,
  stripe_transfer_id TEXT,
  state TEXT NOT NULL DEFAULT 'claimed',
  last_attempt INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS payout_operations_operation_key_idx
  ON payout_operations (operation_key);