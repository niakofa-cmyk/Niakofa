---
name: Niakofa guaranteed minimum scaling
description: How the Community Pool guaranteed minimum is computed — hours-scaled vs flat, hourly rate setting, server-side bounds, anonymous pool donation.
---

## Rule
`getGuaranteedMinimum(estimatedHours?: number | null)` returns `max(flatFloor, roundMoney(hours × hourlyRate))`.

## Why
The original flat floor made "livable wage" marketing meaningless — a 5-hour home repair job and a 15-minute errand both got $5. The owner briefing explicitly called this out as a gap.

## How to apply
- `pool_guaranteed_minimum` system setting = flat per-task floor (e.g. $5)
- `pool_minimum_hourly_rate` system setting = hourly rate (default $15/hr; read by `getHourlyMinimumRate()`)
- `/requests/:id/complete` passes `request.estimated_hours` to `getGuaranteedMinimum()`
- Server-side bounds: `estimated_hours` must be 0.5–24 (returns 400 if out of range). Never trust the client alone — an unbounded value would inflate the pool queue.
- `POST /pool/donate` — no auth, Stripe-only (no dev-mode direct credit for anonymous). Webhook handles null `user_id` via `parseInt("") || null`. Keeps pool open to public donations without login.
- `GET /pool/stats` now returns `minimum_hourly_rate` alongside `guaranteed_minimum`.
- Frontend form `request-new.tsx` collects `estimated_hours` (optional, shown for non-goodwill), sends in mutation data.
