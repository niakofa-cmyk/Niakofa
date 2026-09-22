-- Immediate requester charges remain one-per-request. Pay It Forward
-- installments and repeat helper tips are separate completed payments and must
-- not collide with that invariant.
DROP INDEX IF EXISTS payment_transactions_one_completed_per_request;

CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_one_completed_immediate_per_request
  ON payment_transactions (request_id)
  WHERE state = 'completed' AND payment_type = 'immediate';

-- A Stripe PaymentIntent is one economic operation even when the client retries
-- intent creation or Stripe redelivers its webhook.
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_stripe_payment_intent_unique
  ON payment_transactions (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- At most one unsettled card repayment can reserve a request balance for a
-- requester. A retry reuses that durable PaymentIntent; a racing duplicate is
-- cancelled before its client secret is returned.
CREATE UNIQUE INDEX IF NOT EXISTS payment_transactions_one_active_pif_per_requester
  ON payment_transactions (request_id, requester_id)
  WHERE payment_type = 'pay_it_forward' AND state = 'authorized';