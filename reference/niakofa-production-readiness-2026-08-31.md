# Niakofa production-readiness reference — August 31, 2026

This reference records the uploaded handoff materials and the verified
implementation boundary for this work session. It intentionally contains no
Stripe, Census, GitHub, Railway, or session credentials.

## Source materials reviewed in full

- `attached_assets/Niakofa-Community-Pool-Stripe-Hardening-v2_1788188511761.zip`
  - `README.md`
  - `RAILWAY_STRIPE_RUNBOOK.md`
  - `artifacts/api-server/src/routes/pool-stripe-reconciliation.ts`
  - `artifacts/api-server/src/routes/index.ts.patch`
  - `artifacts/api-server/src/routes/stripe.ts.webhook-hardening.patch`
  - `lib/db/migrations/0059_stripe_pool_webhook_audit.sql`
- `attached_assets/stripe_1788188511761.ts`
- `attached_assets/Pasted-write-the-webhook-500-on-failure-patch-now-it-s-a-small_1788188499195.txt`
- `attached_assets/Pasted-official-Census-API-key-request-page-not-working-can-we_1788188558650.txt`
- `attached_assets/Pasted-I-ve-now-added-the-Community-Pool-Stripe-reconciliation_1788188946413.txt`

The ZIP was extracted into an isolated temporary directory for inspection; it
was never extracted over the application tree.

## Verified Stripe requirements

1. Stripe invalid-signature and missing-secret requests remain HTTP 400.
2. A verified event is recorded in `stripe_webhook_events` before business
   processing, with idempotent event-ID insertion.
3. Successful business processing marks the audit row `processed`.
4. A business-processing failure marks the audit row `failed` when possible and
   returns HTTP 500 so Stripe retries.
5. Community Pool reconciliation is admin-only, read-only until an explicit
   repair request, and repairs an already-succeeded PaymentIntent without
   creating another charge.
6. Stripe live/test mode and account identity are checked through the admin
   configuration-health endpoint without returning secrets.
7. The production Stripe destination must be the deployed API's
   `/api/stripe/webhook` URL, not an old workspace/preview URL.

## Verified Census/geography requirements

- Census is an optional enrichment source, not a replacement for Mapbox
  geocoding or the civic resource registry.
- Non-JSON/missing-key Census responses are treated as unavailable.
- Verified offline fallback coverage remains explicit and provenance-labeled.
- Unverified place rows are not silently promoted into civic resource
  jurisdiction matching.
- When a user's location cannot be confidently resolved, the API returns no
  unrelated regional resources rather than guessing.

## Implementation status at this handoff

- `lib/db/migrations/0059_stripe_pool_webhook_audit.sql` already exists on the
  synchronized `origin/main` branch.
- The reconciliation router and its registration already exist on that branch.
- The remaining webhook gap was completed in
  `artifacts/api-server/src/routes/stripe.ts`, with regression coverage in
  `artifacts/api-server/src/__tests__/stripe-money-moving.test.ts`.
- The application remains the existing pnpm monorepo and artifact workflow
  structure; no Legacy RPG runtime was merged into the platform.