# Niakofa Stripe reconciliation source note — August 31, 2026

The original Stripe reconciliation upload referenced by the August 31
production-readiness handoff is no longer present in the working tree. This
safe recovery note preserves only the non-secret operational context needed
for future work; it does not reproduce credentials, tokens, customer data, or
raw payment methods.

## Recovered context

- The canonical application is the root `artifacts/` pnpm monorepo.
- The production API is the single Railway service serving the API and built
  frontend.
- Stripe's production webhook destination is the deployed API's
  `/api/stripe/webhook` path.
- Community Pool contributions are recorded only after a verified
  `payment_intent.succeeded` webhook, with the Stripe PaymentIntent ID as the
  idempotency key in the ledger.
- The admin reconciliation flow is read-only by default and can repair an
  already-succeeded PaymentIntent without creating another charge.
- Production Stripe checks must not return secret values. Stripe live/test
  mode and account identity are safe to report only through the admin
  configuration-health contract.
- Production Redis/BullMQ and Stripe readiness are required capabilities;
  local development may use explicit fallback behavior.

## Source references

The handoff identified these source materials for the lost upload:

- `Niakofa-Community-Pool-Stripe-Hardening-v2` ZIP
- `stripe` TypeScript patch
- Stripe webhook 500-on-failure note
- Census API-key note
- Community Pool Stripe reconciliation note

Those source materials remain reference-only and must never be copied into
tracked runtime code with credential-shaped content.