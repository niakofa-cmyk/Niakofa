# Niakofa Community Pool Enhancement — 2026-08-30

## Implemented behavior

1. Authenticated users can choose a $1–$10,000 contribution and continue to
   Stripe.
2. Anonymous users can fund the pool when Stripe is configured.
3. Contributions carry the contributor's `community_id` into the
   PaymentIntent and are credited by the webhook after successful payment.
4. Payment confirmation is a full-screen portal above navigation with its own
   scroll container and a sticky, safe-area-aware footer.
5. Stripe `PaymentElement` remains the secure card-entry surface; raw PAN/CVC
   data never reaches Niakofa's API.
6. Signed-in Pool pages prefer community-scoped stats and ledger endpoints
   over platform-wide transparency values.
7. Census enrichment is additive and optional. Without `CENSUS_API_KEY`, no
   Census network call is made and civic resources continue through the
   verified fallback behavior.

## Payment architecture

- Community Pool funding: Stripe PaymentIntent + Stripe PaymentElement +
  webhook ledger credit.
- Helper payouts: Stripe Connect onboarding/status in Wallet; helpers must
  complete onboarding and have payouts enabled for direct bank payouts.
- Pay-it-forward/tips: existing Stripe PaymentIntent flows credit helpers only
  after successful webhook processing.

## Environment gates

- `CENSUS_API_KEY` is optional for the current fallback and enables broader
  enrichment when configured.
- `REDIS_URL` is required for production BullMQ workers; development may use
  the documented scheduler fallback.
- Stripe production requires `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  and `VITE_STRIPE_PUBLISHABLE_KEY`.

Full live Stripe, browser-payment, and production-worker certification still
requires staging/provider credentials and real-device testing.