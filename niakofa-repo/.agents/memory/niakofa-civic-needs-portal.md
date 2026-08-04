---
name: Niakofa civic needs two-way portal
description: Migration 0057 civic_needs/civic_invoices tables — county/gov-sponsor need posting, claiming, NET30 invoicing
---

## Shape
Two new tables (migration 0057): `civic_needs` (posted by an approved gov-sponsor, lifecycle `open → claimed → completed | cancelled`) and `civic_invoices` (auto-created when a need is marked completed).

## Key decisions
- Any authenticated user (helper/business) can claim an open need — not gated to a role, since the goal is opening the marketplace, not restricting it.
- Only the claimant can mark a need `completed`; only the sponsor who posted it can `cancel` it. Both guards are atomic (`WHERE status = 'x' AND owner = caller`), not read-then-write, to avoid race conditions.
- On completion, an invoice is generated automatically with `due_date = completed_at + 30 days` (NET30) and `amount` = caller-supplied `final_cost` or falls back to the need's original `estimated_cost`.
- Invoice payment is currently a manual admin action (`PATCH .../invoice/:id/pay`) — there is no Stripe institutional billing wired in yet. That would be the natural next step (Stripe Invoice or PaymentIntent against the sponsor's Stripe Customer ID).

**Why:** the original civic portal was one-way (sponsors could only fund the pool, not post concrete needs); this closes that gap so the platform can route real gov/county work (potholes, cleanup, elder-care visits) to helpers and bill the sponsor afterward.
