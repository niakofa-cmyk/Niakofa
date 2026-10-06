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
- Help-request claims, which change request ownership and may lead to a payout.
- Internal Nia check-in generation, which is service-secret protected and
  scheduled through the durable worker path.

The development and test environments keep their existing local fallback. The
global API limiter and non-financial feature limiters also keep that fallback;
they are not substitutes for the critical per-action limits above.

The user-facing passive safety check-in endpoint remains available with the
bounded local fallback when Redis rate limiting is degraded; blocking a person's
safety check-in would be a worse failure mode. The admin route audit confirms
that admin mutations require both authentication and admin authorization, so no
unauthenticated admin mutation needed a new fail-closed bucket.

## Stripe webhook exception

The Stripe webhook endpoint does not use `paymentLimiter`: it authenticates each
delivery with Stripe's signature, stores event IDs idempotently, and must accept
provider retries. Its abuse controls remain signature verification, event
deduplication, and bounded processing—not a user-facing payment rate bucket.
