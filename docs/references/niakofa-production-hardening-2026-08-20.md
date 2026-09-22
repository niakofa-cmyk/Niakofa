# Niakofa production-hardening reference

This reference captures the uploaded production review and the deployment
failure snapshot used for the August 20, 2026 hardening pass. The uploaded
documents remain in `attached_assets/`; this file is the durable index for
future sessions.

## Non-negotiable platform properties

Niakofa should converge on one identity and authorization model, one canonical
domain-event layer, one knowledge graph, one policy-controlled AI gateway, one
observable request trace, one machine-verifiable navigation model, one media
provenance/storage model, and one feature-flag/rollout system.

## Graceful degradation contract

- Map outage: family and community surfaces remain available.
- Nia outage: core app flows remain available without AI.
- Stripe outage: requests remain visible and payment becomes pending.
- Redis outage: critical flows remain safe and durable scheduling continues.
- WebRTC outage: audio-only participation remains available.
- Mapbox outage: cached/address fallback remains available.
- World generation outage: the last playable world version remains authoritative.

## Hardening sequence

1. Verify navigation end to end: route, page, API, authorization, data,
   back-navigation, deep link, refresh, unauthorized state, and mobile state.
2. Add lifecycle smoke coverage for requester, helper, and audio-circle flows.
3. Harden payout, push, upload/media provenance, offline actions, and safety
   escalation before scaling the marketplace.
4. Add structured metrics, traces, alerts, SLOs, error tracking, backups,
   migration checks, and dependency/security scans.
5. Preserve the contract-first OpenAPI boundary, service separation, graceful
   Redis degradation, and versioned Legacy world state.

## Deployment incident recorded

The August 19 deployment failed during `pnpm install` after repeated transient
registry download errors. The application build itself was not reached. A
fresh workspace install from the committed lockfile succeeded during this
review, so future deployment diagnosis should distinguish dependency registry
failures from application build failures.