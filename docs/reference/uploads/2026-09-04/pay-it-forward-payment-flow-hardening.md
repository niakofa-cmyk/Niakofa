# Pay It Forward payment-flow hardening

This is a sanitized engineering reference for the September 4, 2026 Niakofa
payment-flow review. It contains no credentials, tokens, storage-state files,
or uploaded terminal transcripts.

## Product behavior

- A requester can repay the original funding source for a completed help
  request. When the Community Pool fronted the helper, repayment returns to the
  immutable pool/community or hub scope recorded by the original helper-front
  ledger entry.
- A requester can separately thank the assigned helper directly. This is an
  extra tip and does not reduce a Community Pool repayment balance.
- Direct helper tips use one settlement rail: Stripe confirms a platform charge,
  then the webhook credits the helper's Goodwill Fund for later cashout. They do
  not also use a Stripe destination transfer.
- Failed or skipped Stripe attempts are never recorded as paid.

## Integrity rules

- Signed Stripe webhooks are authoritative for card-funded settlement.
- Payment state claims and repayment/tip ledger effects are atomic.
- Partial Pay It Forward installments and repeat tips are allowed.
- Only one immediate service charge may complete per request.
- Only one authorized Pay It Forward PaymentIntent may be active per
  requester/request. A racing duplicate is cancelled and the durable active
  intent is reused.
- Stripe PaymentIntent IDs are unique in the application ledger.
- Refunds reverse only their incremental amount. Pay It Forward refunds reduce
  `pledge_paid`; tip and installment refunds do not cancel completed help work.

## Verification

- API payment regressions are covered in
  `artifacts/api-server/src/__tests__/stripe-money-moving.test.ts`.
- Full API tests, root typecheck, lint, and production web build are release
  gates.
- Real-money Stripe charges are prohibited in acceptance testing. Use dedicated
  Stripe test-mode credentials only.