---
name: Niakofa no-show, wallet-pay, admin write-off features
description: Three features shipped together — helper no-show tracking, wallet installment payment, and enhanced admin pledge write-off.
---

## Helper no-show history (Task #3)
- **Migration 0059**: `ALTER TABLE users ADD COLUMN no_show_count integer NOT NULL DEFAULT 0`
- **Schema**: `no_show_count` added to `usersTable` in `lib/db/src/schema/users.ts`
- **Increment**: `artifacts/api-server/src/routes/requests.ts` cancel endpoint — when `isHelper` releases claim, fire-and-forget `db.update(usersTable).set({ no_show_count: sql\`...+1\` })`. Never blocks response.
- **Public profile** (`GET /users/:id/public`): now returns `no_show_count`, `help_count`, `goodwill_score`, `highest_tier_reached`, `identity_verified`, `background_check_status`, `helper_languages`, `helper_bio`, `helper_qualifications`
- **UI**: `helper-profile.tsx` — "Reliability" section shows no-show count + completion rate (help_count / help_count+no_show), color-coded green/yellow/red; also shows Languages and Bio sections.

**Why:** Requesters had no way to distinguish reliable helpers from those who abandon. Completion rate = help_count / (help_count + no_show_count).

## Wallet installment payment (Task #2)
- **Endpoint**: `POST /api/users/:id/scheduled-payments/:spId/pay-from-wallet` in `users.ts`
  - Requires: auth + ownership (requireOwnership())
  - Checks `benevolence_wallet >= sp.amount`, returns 402 with `code: "insufficient_balance"` if not
  - Atomic tx: deduct wallet → mark sp `paid` → increment `pledge_paid` on request → best-effort ledger insert
- **UI**: `wallet.tsx` — scheduled payment cards now have TWO buttons:
  - "Pay from Balance" (purple) — shown active only when `wallet >= sp.amount`, calls `handlePayFromBalance`
  - "Pay by Card" (primary) — the existing Stripe/honor-system flow, renamed for clarity
  - Balance hint shown below card when balance is sufficient

**Why:** Users shouldn't need to re-enter card info for installments — their goodwill fund balance is the natural source.

## Admin pledge write-off (Task #4)
- **Backend**: `PATCH /admin/requests/:id/pledge-status` now:
  - Accepts optional `reason` string (logged to server)
  - On `forgiven` or `written_off`: also cancels all `pending` scheduled_payments for that request (stops reminder worker from chasing them)
  - Wrapped in a DB transaction
- **UI**: `PledgeWriteOffCard` in `admin.tsx`:
  - Now fetches BOTH `active` AND `defaulted` pledge rows (previously only active)
  - Shows outstanding balance (`pledge_amount - pledge_paid`) separately
  - Defaulted rows get a red "Defaulted" badge
  - Collapsible reason textarea per row (recommended for audit)
  - Toast shows the reason snippet on success
  - Legend explains Forgive vs Write Off semantics
