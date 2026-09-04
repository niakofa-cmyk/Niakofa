# County, civic, and payment hardening reference

This checkpoint implements and verifies the September 4, 2026 continuation
request for county-aware Community Pools, GPS-driven jurisdiction switching,
county-scoped civic content, and Stripe payment-flow validation.

## Source material retained

The original continuation and payment-review notes remain in `attached_assets/`:

- `Pasted-Continue-to-build-the-Niakofa-app-and-use-the-documents_1788558806944.txt`
- `Pasted-I-ll-keep-the-secrets-in-place-as-requested-but-I-need-_1788558545327.txt`

Existing uploaded Legacy images, ZIP archives, and their manifests remain in
`attached_assets/`, `docs/reference/`, `docs/references/`, and `reference/`.
They are reference material only and are not promoted into the production
runtime without the existing provenance and licensing review.

## Implemented boundaries

- Every valid fresh GPS fix is reverse-geocoded so county travel can change the
  user's Community Pool assignment.
- A verified US county gets an independent community record when first
  encountered; county/state matching is canonical and county-suffix tolerant.
- Reverse-geocoder outages preserve the previous assignment.
- Civic needs and resources fail closed to the verified county instead of
  broadening into unrelated county or statewide content.
- The original Tarrant County seed is backfilled with its canonical
  jurisdiction and indexed for location lookup.
- Existing Stripe settlement, refund, payout, cashout, and idempotency behavior
  remains the financial source of truth.

## Verification recorded for this checkpoint

- Full API Jest suite: 39 suites passed, 343 tests passed, 5 skipped.
- Focused county/location suite: 23 tests passed.
- Focused Stripe money-movement and settlement suite: 20 tests passed.
- Root lint, typecheck, production build, API build, workflow startup, database
  migrations, and web preview completed successfully.

## External release gates

- Live county switching requires `MAPBOX_TOKEN` and `VITE_MAPBOX_TOKEN`.
- A real Stripe test-mode acceptance pass requires operator-approved test
  charges, signed webhook delivery, refunds, transfers, and cashout evidence.
- Production Redis/BullMQ and Railway provider health remain separate
  environment/operator gates; code verification does not certify them.