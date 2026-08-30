# Niakofa Community Pool / Payments Review — 2026-08-30

## Scope

Reviewed the Niakofa repository with focus on Community Pool contributions,
Stripe payment UI/workflows, helper payments, civic geographic resource
resolution, environment warnings, and deployment safety.

## Findings

### Community Pool contribution

- Authenticated contributions use `POST /api/pool/contribute`.
- Amount validation is $1–$10,000.
- Stripe PaymentIntent creation uses an idempotency key and records
  `community_id` in metadata.
- The Stripe webhook records the ledger entry only after
  `payment_intent.succeeded`.
- Development without Stripe can record directly; production without Stripe
  returns 503.
- Anonymous Stripe donations use `/api/pool/donate`.

### Card entry and confirmation

- Card/payment details are collected by Stripe's `PaymentElement`.
- Raw card details are not posted to Niakofa's API.
- The confirmation UI is rendered in a portal above navigation with an
  independent scroll container.
- The confirmation action is sticky and uses mobile safe-area padding.
- Stripe webhook signature verification is required server-side.

### Community scope

The public `/pool/stats` and `/pool/ledger` endpoints are platform-wide
transparency views. Contributions are tagged with `community_id`, while the
authenticated Pool tab uses:

- `GET /api/pool/my-stats`
- `GET /api/pool/my-ledger`

These endpoints resolve the authenticated user's assigned `community_id` and
return only that community's balance/activity. The UI falls back to public
transparency data if the scoped request is unavailable.

### Civic resources

The civic resource resolver resolves latitude/longitude through Mapbox,
extracts city/county/state, matches city plus county first, then falls back to
county and state. It intentionally returns no unrelated resource when the
jurisdiction cannot be verified. Census enrichment is optional and the
verified Texas fallback remains available without `CENSUS_API_KEY`.

### Production gates

Before launch, configure Stripe production credentials and webhook delivery,
provision Redis/BullMQ, configure national Census enrichment if required, and
run browser/device regressions including Stripe 3DS/SCA, failed cards,
processing payments, duplicate webhooks, refunds, and network retry.

This document records source and workspace validation, not live production
payment execution.