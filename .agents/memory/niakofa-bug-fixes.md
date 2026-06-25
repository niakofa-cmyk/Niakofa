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

## Forensic reports describe a STALE snapshot — verify before editing

Every batch of "forensic reports" the user pastes has been generated against an old zip, not the live repo. Always verify each finding line-by-line against the real code first; the majority are false positives. Confirmed-false patterns seen repeatedly: NiaFab drag/localStorage (exists, `NiaDrawer.tsx`), `offline.html` (exists), `reportTypeEnum` missing `sos` (it already has it; clients can't file `sos` via the generic report route by design — only `/verification/sos` does), user-delete cascade (all user FKs already have `onDelete`), `users.ts` `as any` "mass assignment" (guarded by an explicit allowlist of fields read from validated `bParsed.data`).

## Durable constraints confirmed during forensic-verification pass (non-obvious)

- **Stripe payout duplication**: `transfers.create` MUST pass `idempotencyKey: payout-req-<requestId>` — the read-then-update guard alone still lets two concurrent calls create two transfers. The `transfer.created` webhook must match `payment_transactions` by metadata `requestId`+`helperId` constrained to `state != 'completed'` (there's a partial unique index on `request_id WHERE state='completed'`), never by `request_id` alone.
- **nia-proxy `/history` must forward `Authorization`** to nia-service or authenticated history always returns empty (upstream requires auth; anon sessions are intentionally blocked there).
- **Internal service auth uses two env var names** (`INTERNAL_SECRET` for check-in, `SESSION_SECRET` for neighborhoods/crisis). Unify both sides to `INTERNAL_SECRET ?? SESSION_SECRET` so they match whichever is set in prod.
- **Leaderboard cache**: city-scoped keys are `leaderboard:city:*`; `invalidateLeaderboardCache` must `cacheDelPrefix("leaderboard:city:")` or city boards serve stale rankings until TTL.
- **Dev DB is unprovisioned**: `relation "users"/"help_requests" does not exist` errors from trust-decay/anomaly workers are the known empty-dev-DB state, not a regression. The auto-registered `artifacts/api-server: API Server` workflow always fails with `EADDRINUSE` on 8080 (duplicate of `Start API server`) — ignore it.
