---
name: Niakofa forensic bug fixes
description: Key patterns and decisions from the 35-bug forensic report across two fix sessions.
---

## Critical patterns fixed

**Earned transaction timing (BUG-007)**
The `transactions.type = "earned"` row must only be inserted AFTER `stripe.transfers.create()` succeeds. Previously it was inserted unconditionally before the Stripe call, so helpers saw "earnings" that were never actually paid out.

**Pledge double-credit (BUG-009)**
The `/users/:id/pledge` endpoint used to immediately credit `benevolence_wallet` AND insert `pledge_received`/`pledge_sent` rows. The Stripe webhook (`payment_intent.succeeded`) also does this for `pay_it_forward` payment_transactions rows. Fix: remove the immediate wallet credit from the pledge endpoint — only create the `pending_contribution` payment_transaction row there. Webhook remains the single authoritative crediting path.

**Trust score decay (BUG-018)**
`trust_score` was only recomputed on new rating events. Added a weekly scheduler job in `lib/scheduler.ts` (`startTrustScoreDecayWorker`) that recomputes all rated users' trust scores using the same 90-day half-life formula. Skips banned users (trust_score = -1).

**DB default approval_status (BUG-032)**
Changed from `"approved"` to `"pending"` — any INSERT that omits approval_status now creates a pending-review account instead of silently bypassing admin review.

**Shared geo utility (BUG-030)**
`distanceMiles` extracted to `artifacts/api-server/src/lib/geo.ts` (also exports `distanceMeters`). Import from there in routes that need haversine distance.

## Key architectural notes

- `benevolence_wallet` = goodwill/donation pot (pledges, tips, sponsorships) — NOT real withdrawable earnings. Real Stripe payouts tracked separately in `transactions.type = "earned"`.
- Tips (BUG-008) currently only credit `benevolence_wallet` without a real Stripe transfer — known architectural limitation; logged as WARN.
- Avatar storage in DB (BUG-005) is a known limitation — 5MB cap is in place; proper fix requires CDN (S3/R2).
- `approval_status` default is now `"pending"` — registration route explicitly sets this anyway, but the default now fails safe.
- Weekly trust decay scheduler runs at server start and then every 7 days. It's non-critical (fails silently per-user).
