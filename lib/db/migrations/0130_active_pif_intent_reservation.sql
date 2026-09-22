-- Forward migration for databases that applied 0129 before the active
-- Pay It Forward reservation index was added.
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_one_active_pif_per_requester
  ON payment_transactions (request_id, requester_id)
  WHERE payment_type = 'pay_it_forward' AND state = 'authorized';