---
name: Niakofa auth routing bugs fixed
description: Three auth bugs found and fixed during seed account testing; resolveMeParam middleware pattern; requester_id ownership model.
---

## Bug 1: POST /requests — requireOwnership("requester_id") always fails

**Root cause:** `requireOwnership` checks `req.params.requester_id` first (undefined for a POST with no URL params), then `req.body.requester_id`. The frontend doesn't send `requester_id` in the body — the server derives it from the auth token.

**Fix:** Removed `requireOwnership("requester_id")` entirely from `POST /requests`. The handler enforces ownership by always using `req.authenticatedUserId` for:
- The active-request count check (was using `parsed.data.requester_id`)
- The DB INSERT `requester_id` field (was using `parsed.data.requester_id`)
- Both now use `req.authenticatedUserId!` exclusively

**Security:** This is strictly better — a caller can no longer spoof a different user's ID.

## Bug 2: /users/me/... routes — parseInt("me") = NaN in handlers

**Root cause:** `requireOwnership()` was updated to handle `"me"` as the authenticated user (authentication passes), but every handler then did `parseInt(String(req.params.id))` = `parseInt("me")` = NaN, causing Zod parse failure (400).

**Fix:** Added `resolveMeParam` middleware exported from `middlewares/authz.ts`:
```typescript
export function resolveMeParam(req: Request, _res: Response, next: NextFunction): void {
  if (req.params.id === "me" && req.authenticatedUserId) {
    req.params.id = String(req.authenticatedUserId);
  }
  next();
}
```

Applied to all user-facing routes in `users.ts` AFTER `requireAuth` (which populates `req.authenticatedUserId`) and BEFORE `requireOwnership()`:
```typescript
router.get("/users/:id", requireAuth, resolveMeParam, requireOwnership(), handler)
router.patch("/users/:id/helper-mode", requireAuth, resolveMeParam, requireApproved, requireOwnership(), handler)
// ... all other /users/:id/* routes
```

**Why NOT router.param:** `router.param` fires before route middleware, so `req.authenticatedUserId` is undefined when it runs. `resolveMeParam` must run AFTER `requireAuth`.

## Bug 3: requester_id required in CreateRequestBody Zod schema

**Root cause:** The OpenAPI spec had `requester_id` in the `required` array for `HelpRequestInput`, causing Zod to fail validation when the client didn't send it (correct behavior — server should derive it from token).

**Fix:** Removed `requester_id` from `required` in `lib/api-spec/openapi.yaml` (line 2041):
```yaml
required: [title, category, lat, lng]   # removed requester_id
```

Then regenerated: `cd lib/api-spec && pnpm exec orval`

**Do NOT edit generated files directly** (`lib/api-zod/src/generated/api.ts`) — they will be overwritten on next codegen run. Always edit `lib/api-spec/openapi.yaml` as the source of truth.

## Bug 4: is_crisis column on wrong table

**Symptom:** `ALTER TABLE users ADD COLUMN is_crisis` was applied, but this column belongs on `nia_conversations` (already present there from a previous session). There is no `is_crisis` column on `usersTable` in the Drizzle schema.

**Fix:** `ALTER TABLE users DROP COLUMN IF EXISTS is_crisis;`

**Rule:** Before adding any column via psql, verify it exists in the Drizzle schema file for that table.

## DB Schema Audit (This Session)

After audit, only two legitimately missing columns were found:
- `help_requests.hardship_requested_at TIMESTAMPTZ` — added ✅
- `help_requests.hardship_note TEXT` — added ✅

All other tables (users, ratings, transactions, wallet_cashouts, push_subscriptions) are in sync with their Drizzle schema files.
