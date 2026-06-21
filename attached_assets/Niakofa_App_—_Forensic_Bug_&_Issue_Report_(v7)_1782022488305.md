# Niakofa App — Forensic Bug & Issue Report (v7)

**Release reviewed:** Niakofa-main (v7) · June 2026
**Scope:** Full-stack — API server, frontend SPA, DB schema, workers, WebSocket hub, auth, payments
**Compared against:** v6 (prior release)

---

## What Was Fixed in v7

The following v6 issues are confirmed resolved:

- Auth headers now attached on wallet page (`DELETE` cancel, Stripe Connect status, Stripe onboard, payment-intent pledge, Pay Now)


- Auth headers now attached on profile page (account delete, settings fetch/save, `clearToken` now uses shared constant)


- `GET /requests/stats` and `GET /requests/nearby` now require auth


- Full table scan on `GET /requests` replaced with SQL-level `WHERE` conditions for `helper_id`, `requester_id`, and `status`


- `POST /requests/:id/tip` now rate-limited with `paymentLimiter`


- `POST /stripe/payment-intent` now includes idempotency key


- Identity verification webhook now guards against empty `STRIPE_IDENTITY_WEBHOOK_SECRET` and returns 503


- `trust_score` on identity verification now uses `GREATEST(trust_score, 95)` — established helpers' scores are no longer overwritten downward


- Avatar upload size check unified to 5 MB in both the guard and the error message


- Payout retry worker no longer inserts a duplicate `transactions` row on successful retry


- Cleanup worker now resets `en_route_at` and `arrived_at` when releasing orphaned claimed requests


- Anomaly detection now broadcasts to admins via `broadcastToAdmins()` instead of logging only


- WebSocket `register` now checks `token_version` against DB — revoked tokens rejected at connection time


- `new_report` and `report_reviewed` typed as `AdminOnlyEventType` — `broadcast()` now rejects them at compile time


- `trust_score` default changed from 5.0 to 50 (neutral midpoint)


- `delivery` category enum corrected to `delivery_run` in `request-new.tsx`


- Admin user list, helper applications, and account applications now paginate via `limit`/`offset`


- Account application reviews now record `approval_reviewed_by` and `approval_reviewed_at`


- Forgot password flow (full two-step: email → code → new password) added for all accounts


- GPS speed EMA smoothing applied before the stationary broadcast suppression threshold check


- Admin analytics tab now caches results for 30 seconds using a module-level ref



---

## CRITICAL — Security & Data Integrity

### 1. `POST /users/pledge` — Dedup Query Missing `user_id` Filter

**File:** `artifacts/api-server/src/routes/users.ts`

```
.where(and(
  eq(transactionsTable.request_id, request_id),
  eq(transactionsTable.type, "pledge_sent"),
  eq(transactionsTable.amount, -amount),
  sql`${transactionsTable.created_at} > NOW() - INTERVAL '10 seconds'`,
))
```

`user_id` is absent from the dedup `WHERE` clause. If User A pledges `$50` on request `#5`, any other user who tries to pledge the same amount on the same request within 10 seconds receives a 409 "Duplicate pledge" error and is blocked. On a busy request, this creates a denial-of-service on pledging for all participants except the first to submit. The fix requires adding `eq(transactionsTable.user_id, pParsed.data.id)` to the `WHERE`.

---

### 2. `POST /users/pledge` — `pledge_paid` Updated via Read-Then-Write (TOCTOU)

**File:** `artifacts/api-server/src/routes/users.ts`

```
const newPledgePaid = (request.pledge_paid || 0) + amount;
const [updated] = await db.update(requestsTable)
  .set({ pledge_paid: newPledgePaid })
  .where(eq(requestsTable.id, request_id))
```

The current `pledge_paid` is read and then written back as a computed value. Two concurrent pledges on the same request will both read the same original value, add their respective amounts, and write — the second write overwrites the first. The correct form is `pledge_paid: sql\`${requestsTable.pledge_paid} + ${amount}``(atomic increment at the DB level), which is already the pattern used for`benevolence_wallet` in the same function.

---

### 3. `POST /users/reset-password` — Leaks Account Existence on 404 Response

**File:** `artifacts/api-server/src/routes/users.ts`

```
if (!user) return res.status(404).json({ error: "Invalid or expired code. Please request a new one." });
```

When `POST /forgot-password` always returns a generic 200 (correct, no leak), `POST /reset-password` returns HTTP 404 when the email address has no matching account. An attacker submitting email addresses can distinguish "no account exists" (404) from "account exists but code is wrong or expired" (403) — confirming which emails are registered. The response body message is identical, but the HTTP status codes differ and are trivially detectable. Should return 403 for both cases.

---

### 4. New Schema Columns Not Covered by Any Migration

**File:** `lib/db/src/schema/users.ts`

Two new columns — `approval_reviewed_by` and `approval_reviewed_at` — are added to the schema but the project ships no migration files (no `/migrations` directory, no `.sql` files). The project uses `drizzle-kit push` for schema sync, which must be run manually against the live database. On Railway deploy, this does not happen automatically. A deploy of v7 against an existing v6 database will fail at runtime when the `PATCH /admin/account-applications/:id/review` endpoint attempts to write `approval_reviewed_by` and `approval_reviewed_at` to columns that don't exist yet, producing a PostgreSQL error on every account approval action.

---

### 5. `approval_reviewed_by` Column — No Foreign Key Constraint

**File:** `lib/db/src/schema/users.ts`

```
approval_reviewed_by: integer("approval_reviewed_by"),
```

This column stores the ID of the admin who reviewed the application, but it is defined as a bare `integer()` with no `.references(() => usersTable.id)`. If the reviewing admin account is deleted, the column retains a stale integer pointing at a non-existent user — no referential integrity, no cascade, no set-null. The `helper_status` reviewer field uses the same pattern on the existing `helper-application` review route (also missing FK), confirming this is a systemic gap rather than a one-off.

---

## HIGH — Functional Bugs

### 6. `GET /requests` — Full Table Scan Still Occurs When No Conditions Are Set

**File:** `artifacts/api-server/src/routes/requests.ts`

```
let rows = conditions.length > 0
  ? await db.select().from(requestsTable).where(and(...conditions)).orderBy(...)
  : await db.select().from(requestsTable).orderBy(desc(requestsTable.created_at));
```

When `status`, `helper_id`, and `requester_id` are all absent from the query string (the common case for the admin view), the `conditions` array is empty and a full table scan with no `LIMIT` is issued to the database. The subsequent JavaScript `rows.slice(0, limitParam)` only applies when `limitParam` is explicitly set by the caller. Any call without those three filters and without an explicit `limit` query parameter loads the entire `help_requests` table into memory.

---

### 7. `POST /users/forgot-password` — No Invalidation of Prior Unused Codes

**File:** `artifacts/api-server/src/routes/users.ts`

Each call to `POST /forgot-password` inserts a fresh row into `password_reset_codes` without invalidating or deleting the previous outstanding code for the same user. The `POST /reset-password` and `POST /set-initial-password` endpoints retrieve `ORDER BY created_at DESC LIMIT 1` — so only the most recent code ever works. Prior codes are permanently orphaned in the table. With `authLimiter` allowing 10 requests per 15 minutes, one user can accumulate up to 10 orphaned codes per 15-minute window. There is no cleanup worker or TTL-based purge of `password_reset_codes`, so the table grows unboundedly over time.

---

### 8. Crisis Default Message Still Hardcodes "Tarrant County"

**File:** `artifacts/api-server/src/routes/crisis.ts`

```
const finalMessage = message ?? "⚠️ Emergency situation active in Tarrant County. Check nearby requests and stay safe.";
```

The `CRISIS_DEFAULT_RESOURCES` env var now allows configurable emergency contacts, but the default activation message is still hardcoded to "Tarrant County." A deployment outside Fort Worth with correctly configured `CRISIS_DEFAULT_RESOURCES` will still broadcast "Tarrant County" to users unless every admin remembers to supply a custom `message` body on every `POST /crisis/activate` call. This should use a `CRISIS_DEFAULT_MESSAGE` env var with the same fallback pattern applied to resources.

---

### 9. `POST /users/forgot-password` — Unauthenticated Route Not in `APPROVAL_EXEMPT_PATHS`

**File:** `artifacts/api-server/src/app.ts`

```
const APPROVAL_EXEMPT_PATHS = new Set([
  "/users/login",
  "/users/register",
  "/healthz",
  "/version",
  "/stripe/webhook",
  "/verification/identity/webhook",
]);
```

`/users/forgot-password` and `/users/reset-password` are not in the exempt list. Because both routes run without a Bearer token, `req.authenticatedUserId` is `undefined` and the approval gate calls `next()` immediately — so these routes work correctly today. However, the approval gate logic relies on a subtle implicit assumption (`!req.authenticatedUserId → skip`) rather than an explicit exemption. If any future change adds session-based auth or another mechanism that populates `req.authenticatedUserId` without a Bearer token, both routes break silently for pending/denied users who have forgotten their password and need to reset it to access their account. Both paths should be added to `APPROVAL_EXEMPT_PATHS` explicitly.

---

### 10. Admin Analytics Cache — Module-Level Ref Persists Across User Sessions

**File:** `artifacts/pay-it-forward/src/pages/admin.tsx`

```
let analyticsCacheRef: { current: { data: AnalyticsData; fetchedAt: number } | null } = { current: null };
```

This is a module-level (singleton) variable, not component state or a ref. It persists across the lifetime of the JavaScript module — meaning if Admin A opens the analytics tab and then Admin B logs in on the same browser (or the admin session is refreshed), the 30-second cached response from Admin A's session is served to Admin B. More practically, if the server data changes significantly within 30 seconds (e.g., a ban is actioned), the analytics tab continues showing stale data with no visual indicator that the data is cached. A `useRef` inside the component or a per-session cache key would be safer.

---

### 11. `POST /requests/:id/en-route` and `POST /requests/:id/arrived` — TOCTOU Race Not Fixed

**File:** `artifacts/api-server/src/routes/requests.ts`

The en-route and arrived endpoints still use the same read-then-conditional-update pattern present in v6:

```
const [current] = await db.select({ helper_id: requestsTable.helper_id }).where(...);
if (!current) return 404;
if (current.helper_id !== callerId) return 403;

const [request] = await db.update(requestsTable)
  .set({ status: "en_route" })
  .where(and(eq(requestsTable.id, id), eq(requestsTable.helper_id, callerId)));
```

Between the SELECT and UPDATE, the `helper_id` can be changed by a concurrent cancellation or admin reassignment. The `WHERE helper_id = callerId` in the UPDATE catches this, but only returns `null` without distinguishing between "helper_id changed" and "row deleted." The 404 response in that case is incorrect — the request still exists, but the caller is no longer the assigned helper. Should add `AND status = 'claimed'` (for en-route) and `AND status = 'en_route'` (for arrived) to make the state transition atomic and the error response accurate.

---

## MEDIUM — Logic & Reliability

### 12. `POST /users/forgot-password` — `authLimiter` Applies Per-IP, Not Per-Email

**File:** `artifacts/api-server/src/routes/users.ts`

`POST /forgot-password` uses `authLimiter` (10 requests / 15 minutes keyed by IP). An attacker behind a rotating IP pool can enumerate which email addresses have accounts by making 6-digit code brute-force attempts against `/users/reset-password` at the per-IP limit. The `set-initial-password` endpoint applies per-code attempt lockout (5 attempts), but `reset-password` uses the same lockout — the combination provides reasonable protection against brute force per code, but the code generation itself is rate-limited only by IP, not by email address. A per-email rate limit (max 3 codes requested per email per 15 minutes) would close this gap.

---

### 13. Forgot Password UI — No "Resend Code" Option on the Code Entry Step

**File:** `artifacts/pay-it-forward/src/pages/login.tsx`

After the user enters their email and advances to the code step, there is no "Resend code" button. If the email is delayed or the user exits and returns, they must press "Back to sign in" and restart the entire flow. Because the new code replaces the previous one (only the most recent code validates), the previous code sent to the user's inbox is immediately invalidated when they re-request. The UI gives no indication of this, leaving users confused when old codes fail.

---

### 14. `GET /requests` — `helperId` and `requesterId` Parsed Without `isNaN` Guard

**File:** `artifacts/api-server/src/routes/requests.ts`

```
const helperId = req.query.helper_id ? parseInt(req.query.helper_id as string) : null;
const requesterId = req.query.requester_id ? parseInt(req.query.requester_id as string) : null;
```

`parseInt("abc")` returns `NaN`. When `helperId` or `requesterId` is `NaN`, the Drizzle `eq(requestsTable.helper_id, NaN)` condition produces a malformed SQL query. The route should validate with `isNaN()` and return a 400 on invalid integer inputs, matching the pattern used on all other ID params in the codebase.

---

### 15. Admin Analytics — `fetchAnalytics` Called With Stale `useCallback` Closure

**File:** `artifacts/pay-it-forward/src/pages/admin.tsx`

`fetchAnalytics` is wrapped in `useCallback` with no dependency array items:

```
const fetchAnalytics = useCallback(async (force = false) => { ... }, []);
```

The empty dependency array means the callback is created once and never recreated. Any state or props it closes over (e.g., `authHeaders()` derived from session storage) are captured at mount time. If the admin token changes mid-session, the stale closure continues using the original token. Because `getAdminToken()` reads from `sessionStorage` at call time (not captured as a closure value), this is currently safe — but the empty `[]` dependency array is a latent trap for any future change that introduces closed-over reactive values.

---

### 16. `password_reset_codes` Table — No Index on `expires_at` for Cleanup

**File:** `lib/db/src/schema/password-reset-codes.ts`

The table indexes only `user_id`. Without an index on `expires_at`, any future cleanup query (e.g., `DELETE WHERE expires_at < NOW()`) requires a full table scan. Given that orphaned codes accumulate without bound (Issue 7), this becomes a progressively larger scan over time.

---

### 17. `CRISIS_DEFAULT_RESOURCES` — Parsed JSON Shape Is Not Validated

**File:** `artifacts/api-server/src/routes/crisis.ts`

```
return raw ? JSON.parse(raw) as CrisisState["resources"] : null;
```

The `as` cast is a TypeScript compile-time assertion — it does not validate the runtime shape. If `CRISIS_DEFAULT_RESOURCES` contains valid JSON but is not an array of `{ label, phone?, url? }` objects (e.g., it's a plain string or object), the malformed data is silently passed to `db.insert` and `broadcast()`. The crisis activation will either throw a DB error or broadcast nonsense resource data to connected clients during an actual emergency.

---

## LOW — Enhancements & Hardening

### 18. `POST /users/forgot-password` — No Notification When Code Is Requested for Active Session

The server sends a reset code email and logs the event, but does not notify the legitimate account owner through any in-app channel if they are currently logged in. If an attacker knows a user's email and requests a reset code, the legitimate user receives an unexpected email with no in-app alert. A push notification or WebSocket event to active sessions for this user would provide early warning of unauthorized reset attempts.

---

### 19. Forgot Password Screen — No "Show Password" Toggle on New Password Fields

**File:** `artifacts/pay-it-forward/src/pages/login.tsx`

The code-step form for the forgot-password flow has two plain `type="password"` fields with no eye-icon toggle to reveal the password. The set-initial-password form (the legacy flow) has the toggle. The forgot-password form does not. Users on mobile with no keyboard feedback are more likely to make typos, triggering the "passwords do not match" error with no way to verify what they typed.

---

### 20. `GET /users` (Admin) — Does Not Return `approval_status` or `account_type`

**File:** `artifacts/api-server/src/routes/users.ts`

The admin user list endpoint selects only `id`, `name`, `email`, `is_helper`, `trust_score`, `help_count`, `created_at`. It does not include `approval_status` or `account_type`. The admin panel renders this list but cannot show pending/denied status or account type without separate fetches. The account-applications endpoint covers this for applicants, but the general user list is incomplete for admin moderation workflows.

---

### 21. `analyticsCacheRef` — Module-Level Variable Not Reset on Admin Logout

**File:** `artifacts/pay-it-forward/src/pages/admin.tsx`

When an admin logs out and another admin logs in, `analyticsCacheRef.current` still holds the previous session's data. The new session reads the cached payload (if within 30 seconds) without re-fetching. This is unlikely to cause a security issue since analytics data is not user-specific, but means a freshly logged-in admin may act on stale platform metrics immediately after login. Should be cleared on logout.

---

*End of report — 21 issues documented. 19 v6 issues confirmed fixed. Net remaining issue count: new bugs introduced in v7 (Issues 1–3) plus pre-existing issues not previously addressed (Issues 4–21).*