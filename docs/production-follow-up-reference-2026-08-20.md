# Niakofa production follow-up reference

This reference preserves the production-hardening objectives supplied with the
August 20, 2026 build session. The uploaded source notes remain in
`attached_assets/` for local reference; that directory is intentionally
ignored by Git because it can contain large or non-production source material.

## Follow-up priorities

1. Add requester/helper lifecycle smoke coverage.
2. Make degraded dependency behavior and readiness states explicit.
3. Remove remaining high-risk hook lint warnings in request tracking and Nia
   flows.

## Platform principles to preserve

- The database is the required source of truth for core community and request
  flows.
- Nia, Redis, Stripe, Mapbox, and WebRTC are optional capabilities. Their
  failure must leave safe, visible fallbacks instead of taking down the core
  app.
- A current AI/world generation result must never replace the last playable
  world version as the only source of truth.
- Request lifecycle transitions should remain observable and testable from
  create through claim, en-route, arrival, completion, payment, receipt, and
  rating.
- Keep the existing contract-first monorepo and service separation; do not
  rewrite the platform to address a single production gap.

## Source notes received

- `Pasted-Proceed-with-follow-up-production-tasks-for-the-next-ph_1787215035379.txt`
- `Pasted-The-objective-should-be-More-coherent-code-I-would-targ_1787215058172.txt`

## Verification contract

- `GET /api/healthz` is the Railway traffic probe and fails only when the API's
  required database is unavailable.
- `GET /api/status` is a public capability summary and always returns HTTP 200.
- `GET /api/health` is the bounded Nia compatibility probe and may return 503
  when the optional Nia service is unavailable.
- `GET /api/readiness` is the machine-readable dependency summary. It returns
  `ready` when all capabilities are available, `degraded` when core database
  readiness is intact but optional capabilities are unavailable, and `unready`
  only when the database is unavailable.

The reference does not contain credentials, access tokens, or deployment
secrets.