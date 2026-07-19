---
name: Niakofa tip-wallet and paginated transactions
description: Tip endpoint pattern, transaction pagination headers, admin toggle-admin constraints
---

## Tip wallet endpoint
- Route: `POST /requests/:id/tip-wallet` (not the retired `/requests/:id/tip` which returns 410)
- Pattern: atomic DB transaction — `FOR UPDATE`-style lock via sequential selects, debit requester, credit helper, insert two ledger rows (`tip_sent` / `tip_received`)
- `transactionsTable.type` is `text("type")` (no DB enum) — any string is valid; `tip_sent`/`tip_received` are safe to insert without a cast
- Returns 402 + `{ code: "insufficient_balance" }` when wallet too low — TipModal catches this and redirects to `/wallet?tip_amount=X&tip_request=Y&tip_helper=Z`
- Notifies helper via `sendToUser` with `payment_completed` WS event

**Why:** The old `/tip` endpoint had no Stripe verification — any user could inflate helper wallets by any amount. The new route gates on real wallet balance.

## Transaction pagination
- `GET /users/:id/transactions` now accepts `?limit` (1–100, default 50) and `?offset` (default 0)
- Response body stays `Transaction[]` (backward-compatible with generated API client)
- Pagination metadata in headers: `X-Total-Count` and `X-Has-More: true|false`
- wallet.tsx uses manual `fetchTransactions(offset, append)` instead of the generated hook (generated hook expects plain array, not pagination metadata)
- "Load more" button appends pages; refetch (offset=0, append=false) replaces list

**Why:** Generated hook `useGetUserTransactions` returns `Transaction[]`; changing the response body shape would break the generated client without re-running codegen. Headers are a zero-breaking-change way to expose pagination.

## Admin toggle-admin
- Route: `PATCH /users/:id/toggle-admin` (admin only, cannot self-demote — returns 409)
- Toggles `is_admin` boolean; returns `{ ok, user_id, is_admin }` — frontend does optimistic update with this value
- Grant/Remove Admin button lives in UsersTab action sheet in admin.tsx
- Uses `ShieldCheck` icon (already imported in admin.tsx)

## DELETE /griot/stories/:id
- Hard delete (not soft delete) — griot schema doesn't have a `deleted` enum status
- Auth: author or is_admin DB check (not middleware — griot routes use generalApiLimiter not requireAdmin())
