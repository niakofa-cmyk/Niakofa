-- Migration 0055: Real payment rails for cross-hub crisis pledges
--
-- diaspora_hub_pledges previously only recorded a *promise* to help — no
-- money ever moved. This wires pledges into the same Stripe PaymentIntent +
-- webhook pattern already used by /pool/contribute and /wallet/cashout:
--
--   POST /griot/hubs/:id/pledges  → creates a PaymentIntent, inserts the
--     pledge row with status='pending_payment' and the intent id attached.
--   Stripe webhook (payment_intent.succeeded) → flips status to 'pledged'
--     and credits the destination hub's community pool via the existing
--     recordPoolContribution() ledger function.
--   Stripe webhook (payment_intent.payment_failed) → flips status to
--     'cancelled'.
--
-- Idempotent throughout (see CLAUDE.md Incident #2).

ALTER TABLE diaspora_hub_pledges
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT;

-- Unique + partial: only one pledge row may ever claim a given PaymentIntent
-- id. NULL is allowed for legacy/dev-mode rows recorded without Stripe.
CREATE UNIQUE INDEX IF NOT EXISTS idx_hub_pledges_stripe_pi
  ON diaspora_hub_pledges(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- Existing rows predate the payment flow and were recorded directly
-- (dev-mode style) — they represent real ledger intent, so leave their
-- status ('pledged') untouched. New rows created after this migration will
-- start at 'pending_payment' until the webhook confirms the charge.

CREATE INDEX IF NOT EXISTS idx_hub_pledges_status ON diaspora_hub_pledges(status);
