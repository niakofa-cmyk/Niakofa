# Niakofa production hardening reference

This reference preserves the uploaded production-hardening assessment and
turns it into an implementation boundary for future work.

## Current verified foundations

- Express API security middleware, request IDs, structured errors, rate
  limiting, raw Stripe webhook handling, upload handling, and SPA fallback
  protection are present.
- Production CORS is fail-closed when `ALLOWED_ORIGIN` is missing.
- Production startup refuses to serve traffic when database migrations fail
  after bounded retries.
- Stripe payment-intent creation is approval-gated, and money-moving webhook
  paths use state guards/idempotent writes.
- Circles have role-aware room controls, presence heartbeats, reconnect
  handling, WebRTC signaling, recording recovery, and automated route tests.

## Safe next phases

1. Add release-candidate smoke coverage for requester, helper, Circle, and
   Family Vault flows.
2. Require durable Redis-backed queues for money, notification, recording,
   matching, and AI jobs in production; retain interval scheduling only for
   explicitly non-critical development work.
3. Move large media to signed object-storage uploads followed by durable
   processing and CDN delivery.
4. Expand observability with latency, queue, payment, matching, WebRTC,
   AI-cost, and frontend-error metrics tied to SLOs.

## Scope boundary

The uploaded assessments describe five-nine reliability, multi-cloud scale,
and millions of concurrent users as the destination architecture. They are
not evidence that those guarantees can be claimed today. Changes must be
implemented incrementally, tested against the existing contracts, and must
not promote reference-only art or simulated gameplay into production runtime
without an explicit asset and behavior contract.

## Source

Uploaded reference: `Pasted--Fortify-The-Structure-and-Infrastructure-To-Be-able-to_1787273085436.txt`
