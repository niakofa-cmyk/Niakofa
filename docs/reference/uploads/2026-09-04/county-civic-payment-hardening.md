# County, civic, and payment hardening reference

This checkpoint implements and verifies the September 4, 2026 continuation
request for county-aware Community Pools, GPS-driven jurisdiction switching,
county-scoped civic content, and Stripe payment-flow validation.

## Source material retained

The original continuation and payment-review notes remain in `attached_assets/`:

- `Pasted-Continue-to-build-the-Niakofa-app-and-use-the-documents_1788558806944.txt`
- `Pasted-I-ll-keep-the-secrets-in-place-as-requested-but-I-need-_1788558545327.txt`
- `Pasted-Where-do-I-get-the-USER-A-STATE-JSON-USER-A-STATE-is-no_1788564529028.txt`
- `Pasted-Last-login-Thu-Sep-3-08-11-56-on-ttys000-treazurenewhou_1788564557208.txt`

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
- BullMQ payout retries use the same Stripe idempotency key and atomically
  repair both the payment ledger and helper History after an API restart.
- Deployed mutation acceptance refuses unknown commits, missing storage state,
  and accounts that have not been explicitly confirmed as disposable.

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

## Safe certification commands

Generate storage state without displaying or committing it:

```bash
BASE_URL=https://deployment.example \
DISPOSABLE_EMAIL=... DISPOSABLE_PASSWORD=... \
CONFIRM_DISPOSABLE_ACCOUNT=1 \
OUT="$PWD/playwright/.auth/user-a.json" \
node ops/generate-user-a-state.mjs
```

Run the deployed authenticated suite:

```bash
BASE_URL=https://deployment.example \
USER_A_STATE="$PWD/playwright/.auth/user-a.json" \
EXPECTED_COMMIT=<deployed-commit> \
ALLOW_MUTATING_E2E=1 CONFIRM_DISPOSABLE_ACCOUNT=1 \
bash ops/run-deployed-acceptance.sh
```

Run Stripe provider certification only with test-mode credentials:

```bash
STRIPE_TEST_SECRET_KEY=... STRIPE_TEST_WEBHOOK_SECRET=... \
BASE_URL=https://deployment.example \
EXPECTED_COMMIT=<deployed-commit> \
ALLOW_STRIPE_TEST_MUTATIONS=1 \
node ops/certify-stripe-test-mode.mjs
```

Production `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are intentionally
ignored by this script. The September 4 safety run confirmed the configured
production key is live mode, and therefore correctly performed no mutation.

The raw terminal transcripts remain reference-only because they contain local
machine paths and operational context. Credential-bearing storage-state JSON
must never be copied into this manifest or committed.