# Niakofa production-readiness handoff — August 29, 2026

This reference keeps the production-readiness review supplied for this build
alongside the canonical app. The original 158-line handoff remains tracked at
`attached_assets/Pasted--Unlock-full-production-readiness-for-payments-and-circ_1788053128506.txt`.

## Verified baseline

- GitHub `origin/main` is the canonical checkout; the local branch was synced
  to it before implementation work.
- The public Niakofa SPA renders through the managed web artifact workflow.
- The API workflow starts on port 8080 after the idempotent development database
  migration and civic-resource seed flow.
- The frontend suite passes 487 tests.
- The backend suite passes 298 tests with 5 intentionally skipped cases
  (including the explicit root `new-endpoints` suite).
- TypeScript, route, app/AI boundary, legacy asset, strict-mode, and release
  validation checks pass when run with the repository-pinned pnpm version.
- Production readiness correctly remains degraded until the external
  payment, durable queue, and Circle media providers are configured.

## Changes made from this review

1. The API package test command now loads `jest.config.mjs`, so backend tests
   cannot silently report “No tests found” while test files exist.
2. The root runtime guidance now distinguishes development scheduler fallback
   from the production Redis requirement and documents Stripe webhook plus
   LiveKit requirements.
3. `SECRETS_REQUIRED.md` now matches the runtime readiness contract: Stripe,
   Redis, and LiveKit are production boundaries; Nia credentials are
   conditional because Nia is disabled by default.

## Production operator gate

Use the secure environment configuration flow; never commit or paste values
into source control. Before calling payments and Circles production-ready:

1. Run `scripts/verify-livekit-env.sh` without printing secret values.
2. Confirm `/api/readiness?scope=payments,circles` reports `ready: true`.
3. Confirm `/api/livekit-readiness` reports authenticated reachability.
4. Run `scripts/src/release-smoke.mjs` with its default production payment and
   Circles requirements.
5. Complete the real-device Circle matrix documented in
   `reference/niakofa-circles-production-readiness-2026-08-28.md`.

The development workspace may continue to report degraded optional capabilities
when those providers are intentionally not attached; that is not a reason to
weaken the production fail-closed checks.