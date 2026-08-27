# Niakofa rate-limit hardening

This change addresses the normal-use `429 Too many requests` failures reported
for Circles and SPA navigation while keeping abuse protection in place.

## What was wrong

1. The global limiter ran before `parseAuth`, so it could never see the
   authenticated user ID and every request used the shared IP bucket.
2. The same global limiter was also attached as route middleware in 35 route
   files. Requests to those routes consumed the same budget twice.
3. The old limiter used only an in-memory store, which cannot coordinate
   multiple API instances.
4. The client had no common retry policy for transient `429` or `5xx`
   responses. Network errors could also accidentally replay non-idempotent
   requests.

## Current behavior

- `parseAuth` runs before the global API limiter.
- `apiTrafficLimiter` is mounted once in `app.ts`.
- Authenticated traffic gets a 2,000-request/15-minute user-scoped budget.
- Unauthenticated traffic gets a 300-request/15-minute IP-scoped budget.
- The legacy `generalApiLimiter` export is a no-op compatibility middleware.
  Existing route declarations stay intact but cannot double-count.
- All specialized limiters keep their existing ceilings and keys while using
  the shared Redis-capable store.
- Redis reuses the existing BullMQ connection. If Redis is unavailable, a
  fixed-window local counter fails open for availability.
- The shared API client retries only idempotent `GET`, `HEAD`, and `OPTIONS`
  requests on `429` and `5xx`, honors `Retry-After`, and adds bounded
  exponential backoff with jitter. Mutating methods require explicit opt-in.

## Validation

The following checks are part of the release gate:

- API TypeScript typecheck
- API Jest regression tests for local store increment/decrement/reset/expiry
- API regression test proving repeated legacy middleware does not double-count
- Frontend retry tests for success, `429`, `Retry-After`, network errors, and
  explicit non-idempotent retry opt-in
- Frontend TypeScript typecheck and production build
- Route/boundary verification and the managed SPA/API workflow smoke check

This document is based on the reviewed upload
`niakofa-circles-rate-limit-hardening.tar_1787814956038.gz` and the accompanying
27-test completion note. The implementation was rechecked against the current
canonical `artifacts/` tree rather than copied into the stale `niakofa-repo/`
mirror.