# Niakofa uploaded materials reference

The August 27, 2026 handoff included these materials:

- `attached_assets/niakofa-circles-rate-limit-hardening.tar_1787814956038.gz`
- `attached_assets/Pasted-Done-27-27-tests-passing-0-typecheck-errors-confirmed-a_1787815093144.txt`

The archive was reviewed in full before implementation. It contained:

- a Redis-capable rate-limit store and hardened middleware proposal;
- API store and legacy-middleware regression tests;
- a `fetchWithBackoff` proposal and seven client retry tests;
- an `app.ts` middleware-order diff; and
- `RATE_LIMIT_HARDENING.md`, including its explicit remaining-work section.

The proposal was adapted to the canonical root `artifacts/` source tree. Its
three reported bugs were verified against the live checkout before adoption:
auth ordering, global-plus-route double counting, and single-instance
in-memory state. The client retry implementation also closes the proposal's
non-idempotent network-error replay edge case.

The original upload files remain alongside the repository assets for audit
traceability. The maintained implementation notes are in
`docs/RATE_LIMIT_HARDENING.md`.