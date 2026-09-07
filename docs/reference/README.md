# Niakofa reference materials

This directory records source material used during production-readiness work.
Reference text, images, and ZIP bundles remain in the repository so future
sessions can review the original material without re-creating it.

## Current review set

- `attached_assets/` — pasted checkpoint notes supplied for the current review.
- `docs/reference/uploads/2026-09-05/` — acceptance, deployment, and status
  material for the latest production-readiness pass.
- `reference/uploads/2026-09-05/` — Diaspora and Spiral acceptance snapshots.
- `docs/reference/uploads/2026-09-05/spirals/` — the Spiral GPS and host-signal
  bundle, including the root-cause and wiring notes.
- `docs/reference/community-pool-fix_1788104483429.zip` — Community Pool UX
  reference implementation.
- `docs/reference/uploads/2026-09-05/assets/` — acceptance and status ZIP
  bundles from the latest operator review.
- `reference/uploads/2026-09-04/` and `reference/uploads/2026-08-28/` —
  earlier Diaspora and Circles/LiveKit operational references retained for
  compatibility and historical context.

The public product name is **Niakofa Spirals**. Circle-era database/API names
remain compatibility internals; do not rename persisted tables or routes
without an explicit migration plan. Do not fabricate neighborhood geometry:
only rows with reviewed, effective geometry may tighten city-level host
eligibility.

Credentials, connection URLs, user state, and deployment-only values must stay
in the workspace or deployment secret manager and must not be copied into
reference files.