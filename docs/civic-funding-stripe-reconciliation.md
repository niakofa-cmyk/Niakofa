# Civic budget Stripe reconciliation

This flow is test-mode only in development. Development reads `STRIPE_TEST_SECRET_KEY`,
`STRIPE_TEST_WEBHOOK_SECRET`, and `VITE_STRIPE_TEST_PUBLISHABLE_KEY`; it does not
fall back to live Stripe credentials.

For a Stripe **test-mode** webhook endpoint pointed at the API's existing
`/api/stripe/webhook` route, subscribe to:

- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `payment_intent.canceled`
- `charge.refunded`
- `transfer.created`
- `transfer.reversed`
- Connected-account events: `payout.paid`, `payout.failed`, and `payout.canceled`

The receipt becomes confirmed only after the signed `payment_intent.succeeded`
event is validated and its charge Balance Transaction supplies the exact fee,
net, currency, and settlement availability. A browser confirmation is not
receipt evidence. Refund net impact is taken from the actual refund Balance
Transactions; when those are not yet available, the receipt remains unavailable
for new commitments until refreshed.

The helper transfer is the transfer already created by the payout service.
Reconciliation links it to approved request commitments using the durable payout
operation metadata. A connected-account payout is linked to that transfer only
when a payout Balance Transaction's source ID exactly matches the transfer or
its destination payment. Amount-only matches are never used. Unmatched payout
amounts are not assigned to individual municipal requests.

Do not configure these events or credentials in live mode as part of this
development workflow.
