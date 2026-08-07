---
name: Niakofa hardship request system
description: Self-serve pledge forgiveness — requesters can submit hardship requests instead of silently defaulting.
---

## Schema
`help_requests.hardship_requested_at` (TIMESTAMPTZ, nullable) — set when requester submits
`help_requests.hardship_note` (TEXT, nullable) — optional explanation

Migration: `lib/db/migrations/0040_hardship_request.sql`

## Routes
- `POST /api/requests/:id/hardship` — requester-only, rate-limited via requestCreationLimiter
  - Only allowed when `pledge_status IN ('active', 'defaulted')` — NOT forgiven/written_off
  - One submission per pledge (duplicate guard via hardship_requested_at NOT NULL)
- `GET /api/admin/hardship-requests` — admin queue, returns rows with hardship_requested_at IS NOT NULL + pledge not resolved
- `DELETE /admin/requests/:id/hardship` — admin dismisses (clears hardship_requested_at) without changing pledge_status
- Resolve via existing `PATCH /api/admin/requests/:id/pledge-status` (forgiven or written_off)

## Frontend
- `wallet.tsx` — "Can't pay right now? Request a hardship waiver" button on each outstanding pledge
- `admin.tsx` System tab — "Hardship Requests" section with Forgive / Write Off / Dismiss actions

## Why
Replaces "awkward silent non-payment" with a transparent self-serve flow. Removes "contact an admin"
mental model. Admin queue makes hardship requests visible before the 90-day default window fires.
