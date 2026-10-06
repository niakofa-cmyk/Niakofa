# Niakofa production-hardening reference

This file records the durable conclusions from the supplied architecture review
and lifecycle smoke-testing brief. The full source documents remain preserved in
`attached_assets/` with their upload names and are not treated as executable
configuration.

## Architectural direction

Preserve the existing monorepo and contract-first service separation. Improve
coherence by converging on:

- one identity and authorization model;
- one canonical domain-event layer for real-life help, circles, Family Vault,
  and Legacy state changes;
- one knowledge/provenance model for relationships and media;
- one policy-controlled Nia gateway;
- one observability and trace model;
- one machine-auditable navigation contract;
- one media upload/provenance boundary; and
- one feature-flag and rollout mechanism.

## Graceful-degradation contract

Optional dependencies must not make core community or family functionality
unavailable:

- map failure keeps family/community views usable with address fallback;
- Nia failure keeps the app usable without AI;
- Stripe failure leaves requests visible and payments pending;
- Redis failure preserves durable critical work through the fallback scheduler;
- WebRTC failure falls back to audio-only behavior; and
- unavailable world generation keeps the last playable world version.

The current production readiness endpoint intentionally reports `ready: true`
with `status: "degraded"` when optional Nia is unavailable. Database readiness
remains required.

## Required production journey coverage

The requester/helper smoke journey should cover signup, location, request
creation, matching, acceptance, tracking, arrival, completion, payment/receipt,
and reciprocal ratings. The helper journey additionally covers verification,
availability, navigation, and payout. Circle coverage should cover joining,
permissions, host moderation, speaker requests, media fallback, leaving, and
recording completion.

A focused, opt-in production acceptance now verifies the requester/helper
arrival slice (`open → claimed → en_route → arrived`) with distinct approved
accounts. See [Requester/Helper Arrival Acceptance](../acceptance/requester-helper-arrival.md)
for the gates and recorded evidence. This does not certify completion, payment,
receipt, ratings, or the rest of the full lifecycle.

## Verification recorded on August 20, 2026

- `origin/main` was refreshed and local `main` aligned exactly to it before
  editing.
- Public Railway `/api/healthz`, `/api/readiness`, and `/api/version` responded
  successfully on the deployed commit; the database was connected.
- Route audit passed for 63 declared routes plus fallback.
- TypeScript typecheck passed.
- Frontend tests passed: 632.
- API tests passed: 259, with 5 intentional skips.
- The managed web preview rendered the real Niakofa sign-in screen without
  browser console errors.

## Arrival-slice verification recorded October 6, 2026

The operator-provided production browser run reported 1/1 arrival acceptance
passing. Independently, local `main`, public `origin/main`, and the commit
served by `niakofa.com/api/version` matched at
`03008f003a84738a859238c443949e5b82ea5dc3`; scoped payments readiness returned
ready. The detailed evidence and its source are recorded in the
[acceptance document](../acceptance/requester-helper-arrival.md). This result
covers arrival only, not the broader production journey above.

## Reference-only boundary

The supplied text files are planning and review material. They do not authorize
new credentials, unreviewed media, or a second runtime. Production assets and
runtime behavior must continue to use the canonical sources documented in the
project memory and `replit.md`.