---
name: Niakofa Civic Portal
description: Gov-sponsor self-serve request portal, public profile route, and Radix Toast duration gotcha.
---

## Radix Toast `duration: 0` gotcha
Radix Toast evaluates duration as `durationProp || context.duration`. Since `0` is falsy in JS, `duration: 0` silently falls through to the provider default (~5 s). The correct sentinel for "never auto-dismiss" is `duration: Infinity`. Always comment this in the file so future sessions don't revert it.

**Why:** Service-worker update toast must stay visible until the user clicks Refresh. Duration 0 caused it to vanish before they could act.

## `GET /users/:id/public` route
Added to `users.ts` immediately BEFORE `GET /users/:id` (Express matches in order; `/users/:id/public` needs to be registered first or `:id` will capture `public` as the ID). Returns only public-safe fields: id, name, avatar_url, is_helper, neighborhood, city, trust_score, specialties, quick_replies, created_at. Never email, password, lat/lng, token_version, or admin fields.

**Why:** `helper-profile.tsx` calls this route; the owner-gated `GET /users/:id` returned 403 for non-owners.

## Civic Portal architecture
- Backend: `POST /civic/portal/requests` and `GET /civic/portal/requests` in `civic.ts`
- Auth gate: caller must have an approved `governmentSponsorsTable` row (`submitted_by_user_id = userId AND approval_status = 'approved'`)
- Creates a standard `help_requests` row tagged with `government_sponsor_id` — flows through existing claim/complete pipeline
- Falls back to Fort Worth, TX lat/lng (32.7555, -97.3308) if client sends no coordinates
- `government_sponsor_id: integer` added to `requestsTable` schema (migration 0042)
- Frontend: `artifacts/pay-it-forward/src/pages/civic-portal.tsx` at route `/civic-portal`
- 4-state gate: not logged in → login prompt; no application → apply prompt; pending/rejected → status screen; approved → full portal

## REDIS_URL classification
Reclassified from 🔵 OPTIONAL → 🟡 IMPORTANT in SECRETS_REQUIRED.md. Without it, the pledge-reminder worker and payout-retry worker fail to start silently — reminders never go out and failed payouts never retry. Core to "pay whenever, no pressure" promise.
