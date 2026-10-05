# Rate-limit failure policy

`RedisRateLimitStore` uses shared Redis counters when available. Non-critical
limiters retain the bounded process-local fallback so an infrastructure fault
does not stop ordinary browsing and community activity.

## Must fail closed in production

The following actions return `503 Service Unavailable` rather than using a
process-local counter when shared Redis is missing or errors:

- Authentication and account recovery: login, registration, password reset,
  password change, and unauthenticated admin secret/bootstrap checks.
- Financial mutations: Stripe payment-intent creation, Stripe Connect onboarding,
  Stripe payouts, wallet cashouts, and community-pool contribution/donation
  endpoints and Griot hub pledges that use `paymentLimiter`.

The development and test environments keep their existing local fallback. The
global API limiter and non-financial feature limiters also keep that fallback;
they are not substitutes for the critical per-action limits above.

## Stripe webhook exception

The Stripe webhook endpoint does not use `paymentLimiter`: it authenticates each
delivery with Stripe's signature, stores event IDs idempotently, and must accept
provider retries. Its abuse controls remain signature verification, event
deduplication, and bounded processing—not a user-facing payment rate bucket.
