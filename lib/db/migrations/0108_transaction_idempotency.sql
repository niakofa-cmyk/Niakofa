-- Retry-safe wallet and ledger mutations.
-- NULL remains allowed for legacy transactions; keyed operations are unique per user.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_user_id_idempotency_key_idx
  ON transactions (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;