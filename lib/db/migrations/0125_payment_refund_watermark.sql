-- Stripe charge.refunded.amount_refunded is cumulative. Persist the watermark
-- so partial refunds and webhook retries only reverse each dollar once.
ALTER TABLE payment_transactions
  ADD COLUMN IF NOT EXISTS amount_refunded NUMERIC(10, 2) DEFAULT 0 NOT NULL;