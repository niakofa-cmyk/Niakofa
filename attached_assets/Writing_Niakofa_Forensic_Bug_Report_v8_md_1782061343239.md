# 🔍 Niakofa App — Forensic Bug & Issue Report (v8)
**Review Date:** June 21, 2026  
**Scope:** Full codebase review — Backend API, Frontend PWA, DB Schema, Workers, WebSocket Hub, Auth, Payments, Service Worker

---

## ██ CRITICAL — SECURITY & DATA INTEGRITY

---

### BUG-001 · Registration Password Minimum Inconsistency — Silent Null Hash
**File:** `artifacts/api-server/src/routes/users.ts` — Line 315  
**Severity:** 🔴 CRITICAL  

Registration accepts passwords with as few as **6 characters** at the server level (`rawPassword.length >= 6`), but all password-change, forgot-password, and set-initial-password flows enforce **8 characters minimum**. A user registered with a 6- or 7-character password can never change it via the standard UI (which demands ≥8 chars), and is locked in a permanently inconsistent state. Additionally, if the password field is omitted entirely or is fewer than 6 characters, `password_hash` is stored as `null` with no warning — the account is created silently with no password at all.

**Fix Required:** Enforce minimum 8-character password at registration. Reject registration if no password is provided; do not silently create a null-hash account.

---

### BUG-002 · `account_approved` / `account_denied` WebSocket Events Not Handled on Frontend
**File:** `artifacts/pay-it-forward/src/lib/wsClient.ts` / `src/lib/AppContext.tsx`  
**Severity:** 🔴 CRITICAL  

The server emits `account_approved` and `account_denied` WebSocket events when an admin reviews an account. The `wsClient.ts` event type union does **not include** these two event types. `AppContext.tsx` subscribes to `helper_application_approved` and `helper_application_denied` but **never handles `account_approved` or `account_denied`**. Users whose accounts are approved or denied receive no real-time notification, no UI update, and no toast. They are required to manually refresh the page or re-login to discover their approval state.

**Fix Required:** Add `account_approved` and `account_denied` to the `WsEventType` union in `wsClient.ts`. Handle both events in `AppContext.tsx` to update `currentUser.approval_status` and display a toast notification.

---

### BUG-003 · Registration Does Not Send Admin Approval Email / Push Notification
**File:** `artifacts/api-server/src/routes/users.ts` — `POST /users/register`  
**Severity:** 🔴 CRITICAL  

When a new user registers, the account is set to `approval_status: "pending"` and the response is returned. No notification is sent to any admin to alert them that a new account is awaiting review. If no admin happens to check the dashboard, accounts can sit in `pending` state indefinitely with no action taken. The helper application review flow does send emails on decision; the account-level approval flow does not send any notification to admins on submission.

**Fix Required:** On new account registration, send an admin alert email (or `broadcastToAdmins` WS event) to notify that a new account is pending review.

---

### BUG-004 · `requireApproved` Approval Gate Applied AFTER `parseAuth` — Race Window on Token Bump
**File:** `artifacts/api-server/src/app.ts`  
**Severity:** 🔴 CRITICAL  

The approval gate runs per-request via middleware. However, `parseAuth` (which does a DB lookup to validate `token_version`) and `requireApproved` (which checks `approval_status`) are **two separate DB queries on the same request**. Between these two queries, an admin could change `approval_status` or `token_version`. This is a minor TOCTOU issue, but more critically: a user whose account is `denied` can still issue valid tokens (they received a token on registration). The `token_version` is only bumped on logout/password-change — a `denied` user's token remains cryptographically valid and is only blocked by the approval middleware. If any exempted path (`GET /users/:id`) leaks data useful to a denied user, the gate is partially bypassed.

**Fix Required:** When an account is denied, bump `token_version` to immediately revoke all outstanding tokens, matching the `ban` moderation pattern already in place in `PATCH /users/:id/moderation`.

---

### BUG-005 · Avatar Upload Stores Raw Base64 in DB Column — No CDN / No Cleanup
**File:** `artifacts/api-server/src/routes/users.ts` — `POST /users/:id/avatar`  
**Severity:** 🔴 CRITICAL  

Profile avatars are accepted as base64 data URLs (up to 5 MB) and stored directly in the `avatar_url` text column in PostgreSQL. This: (1) bloats the database enormously at scale, (2) causes every user row returned by queries to carry a 5 MB payload in the `avatar_url` field, (3) sends the full base64 blob to every client that receives a user object, and (4) is returned in every `enrichRequest` call as `requester_avatar` on request listings. There is no CDN offload, no image resizing, and no deduplication.

**Fix Required:** Use an object store (S3/R2/Cloudflare) for avatar uploads. Store only the CDN URL in the DB column. Apply server-side image resizing/compression before storage.

---

### BUG-006 · `settings.tsx` Fetches and Saves Settings Without Auth Headers
**File:** `artifacts/pay-it-forward/src/pages/settings.tsx` — Lines 24–42  
**Severity:** 🔴 CRITICAL  

The `fetchSettings` and `saveSettings` helper functions in `settings.tsx` make API calls to `/api/users/:id/settings` **without including the `Authorization: Bearer` header**. The backend routes `GET /users/:id/settings` and `PUT /users/:id/settings` both require authentication via `requireAuth` + `requireOwnership`. Every call from the settings page will return `401 Unauthorized` in production — settings will silently fail to load or save. The identical functions in `profile.tsx` correctly use `authHeaders()`, but `settings.tsx` has its own copy without them.

**Fix Required:** Add `import { authHeaders } from "@/lib/auth"` to `settings.tsx`. Pass `headers: { ...authHeaders() }` in both `fetchSettings` and `saveSettings`.

---

### BUG-007 · `POST /requests/:id/complete` — Stripe Transfer + DB Insert Not Atomic
**File:** `artifacts/api-server/src/routes/requests.ts` — `complete` handler  
**Severity:** 🔴 CRITICAL  

On request completion, the flow is: (1) update request status to `completed`, (2) increment `help_count`, (3) insert `earned` transaction row, (4) attempt Stripe transfer. If the Stripe transfer fails, it enqueues a retry via BullMQ. However, the `earned` transaction row (step 3) and `help_count` increment (step 2) are **always committed** regardless of whether the Stripe transfer ever succeeds. If the payout retry also exhausts all 5 attempts and permanently fails, the helper's transaction history shows an `earned` record and their `help_count` is incremented — but they never actually received payment. There is no rollback or reconciliation mechanism between the `transactions` table and the `payment_transactions` table.

**Fix Required:** Either: (a) defer inserting the `earned` transaction row until the payout-worker confirms success, or (b) implement a reconciliation job that cross-checks `earned` transaction rows against `payment_transactions` rows for permanent failures and marks orphaned earnings records accordingly.

---

### BUG-008 · Tip Credited to `benevolence_wallet` — Not Real Money
**File:** `artifacts/api-server/src/routes/requests.ts` — `POST /requests/:id/tip`  
**Severity:** 🔴 CRITICAL  

When a requester tips a helper, the tip amount is credited to the helper's `benevolence_wallet` (goodwill pot) — not transferred via Stripe Connect. The schema docstring explicitly states `benevolence_wallet` is the goodwill/donation pot and is **NOT** real earnings. Tips are real money paid by the requester, but helpers only receive a number increment in a wallet column with no actual payment. There is no Stripe payment intent created for tips, no Stripe transfer to the helper's connected account, and no way for helpers to withdraw tip amounts as real money.

**Fix Required:** Tips must trigger a Stripe PaymentIntent and Connect transfer, matching the `immediate` payment flow. The `benevolence_wallet` should not be used for tip accounting.

---

### BUG-009 · `pledge` Endpoint Credits `benevolence_wallet` Before Stripe Payment Confirmed
**File:** `artifacts/api-server/src/routes/users.ts` — `POST /users/:id/pledge`  
**Severity:** 🔴 CRITICAL  

The `POST /users/:id/pledge` endpoint immediately credits the helper's `benevolence_wallet` and inserts both `pledge_received` and `pledge_sent` transaction rows upon API call — before any Stripe payment is processed. The Stripe `payment_intent.succeeded` webhook also credits `benevolence_wallet` and inserts the same transaction types. If a pledge goes through both paths (e.g. client calls the pledge endpoint and then the Stripe webhook fires), the helper's wallet is **double-credited** and duplicate transaction rows are inserted. The dedup guard only checks for duplicate `pledge_sent` entries within 10 seconds by the same user — it does not prevent webhook double-credit.

**Fix Required:** The `/pledge` endpoint should only record an *intent* (insert a `payment_transactions` row as `pending`). All wallet crediting must happen exclusively in the Stripe webhook handler on `payment_intent.succeeded`.

---

## ██ HIGH — FUNCTIONAL BUGS

---

### BUG-010 · `GET /requests/:id` — 404 Checked After 403 Check Fails to Guard Null
**File:** `artifacts/api-server/src/routes/requests.ts` — `GET /requests/:id`  
**Severity:** 🟠 HIGH  

The route checks `if (request && request.status !== "open")` for the ownership guard, then separately checks `if (!request) return res.status(404)`. If `request` is `null` (not found), the first `if` block is skipped correctly, but the 404 response is returned **after** attempting to access `request.requester_id` if the logic is ever reordered. More critically: the 403 check is `request.requester_id !== authenticatedUserId && request.helper_id !== authenticatedUserId` — but `request.helper_id` can be `null` on a claimed-but-not-yet-assigned state. A helper whose `helper_id` has been nulled out (via cancel flow) and attempts to view the request gets a 403 even though the request is no longer private.

**Fix Required:** Move the 404 check before the 403 check. Guard `request.helper_id` null case in ownership check.

---

### BUG-011 · `InAppChat` — No Optimistic Message in UI (Input Cleared Before Confirmation)
**File:** `artifacts/pay-it-forward/src/components/InAppChat.tsx`  
**Severity:** 🟠 HIGH  

When a user sends a message, `setInput("")` is called immediately and the message content is stored in `optimisticContent`. If the POST request fails, the input is restored with `setInput(optimisticContent)`. However, there is no optimistic UI message added to the message list. The user sees their message disappear from the input, then a blank pause, then it reappears if it fails — or they see no message in the chat at all until the WS `chat_message` event echoes it back. This creates a confusing "did it send?" UX, especially on slow connections.

**Fix Required:** Add an optimistic message object to the `messages` state immediately on send. Remove it if the request fails. Deduplicate when the WS echo arrives.

---

### BUG-012 · `cleanup-worker` Orphan Release — `claimed_at` May Be Null
**File:** `artifacts/api-server/src/workers/cleanup-worker.ts`  
**Severity:** 🟠 HIGH  

The orphaned claim cleanup queries `WHERE status = 'claimed' AND claimed_at < cutoff`. The `claimed_at` column is nullable in the DB schema. If a request was somehow set to `claimed` status without a `claimed_at` timestamp (e.g. via a direct DB operation, migration, or a bug in the claim route), `lt(requestsTable.claimed_at, orphanCutoff)` on a `NULL` value evaluates to `NULL` (false) in PostgreSQL — the orphan is never released. Additionally, the `WHERE claimed_at < cutoff` silently excludes all null-`claimed_at` rows without logging.

**Fix Required:** Add `AND claimed_at IS NOT NULL` explicitly. Separately log and alert on `status = 'claimed' AND claimed_at IS NULL` rows as data integrity issues.

---

### BUG-013 · `anomaly-worker` Queries `status = 'cancelled'` — Includes Requester-Cancelled, Not Just Helper-Abandoned
**File:** `artifacts/api-server/src/workers/anomaly-worker.ts`  
**Severity:** 🟠 HIGH  

The anomaly detector flags helpers with `>= 3` cancelled requests in 24 hours by counting `WHERE status = 'cancelled' AND helper_id IS NOT NULL`. But a request with `status = 'cancelled'` and a non-null `helper_id` can mean the **requester** cancelled after a helper was assigned — this is not the helper's fault. The helper cancel flow sets `status = 'open'` (re-opens the request), not `status = 'cancelled'`. Only requester-withdrawal sets `status = 'cancelled'`. So this detector is actually flagging helpers who were on requests the **requester** cancelled — a false positive that could unjustly trigger admin reviews of innocent helpers.

**Fix Required:** Track helper-initiated cancellations in a dedicated column or table, or query for requests where `status = 'open'` was set with `helper_id` being cleared (re-opened), not where `status = 'cancelled'` with `helper_id` set.

---

### BUG-014 · `map.tsx` — `useWebSocket` Called With Callback, Not Event Type — Type Mismatch
**File:** `artifacts/pay-it-forward/src/pages/map.tsx`  
**Severity:** 🟠 HIGH  

`map.tsx` calls `useWebSocket(useCallback((event) => { ... }, []))` — passing a raw handler function as the first argument. However, the typed overload of `useWebSocket` in `useWebSocket.ts` (inferred from `AppContext.tsx`) expects `(eventType: WsEventType, handler: Handler)` as a two-argument form. Passing only a callback means the subscription receives **all** events, which is the intended behavior, but the `crisis_update` event type is handled inside this callback with `(event as { type: string }).type === "crisis_update"` — a runtime cast that bypasses TypeScript's type system. If `crisis_update` is ever renamed or the event type changes, this will silently break.

**Fix Required:** Use typed `useWebSocket("crisis_update", handler)` calls for each event type, or add `"crisis_update"` to the `WsEventType` union and use discriminated union handling throughout.

---

### BUG-015 · Map Defaults to Fort Worth Coordinates When No GPS Available
**File:** `artifacts/pay-it-forward/src/pages/map.tsx` — `initialViewState`  
**Severity:** 🟠 HIGH  

The Mapbox map's `initialViewState` uses hardcoded fallback coordinates `longitude: -97.33, latitude: 32.75` (Fort Worth, TX) when `myLocation` is null. While `AppContext.tsx` no longer hardcodes a default location (correctly using `loadLastLocation()`), the map still falls back to Fort Worth if no last-known location exists. A new user in any other city will see the map centered on Fort Worth before GPS acquires, potentially for several seconds, causing confusion about whether the app is working.

**Fix Required:** Show a loading state or prompt the user to allow location access before rendering the map. Use IP geolocation fallback (already implemented in `AppContext`) as the `initialViewState` when available.

---

### BUG-016 · `POST /requests` — `requestCreationLimiter` Runs After `requireOwnership` But Before DB Insert — Rate Limit Key Uses Auth ID, Not Body `requester_id`
**File:** `artifacts/api-server/src/routes/requests.ts` — Line `router.post("/requests", ...)`  
**Severity:** 🟠 HIGH  

The `requestCreationLimiter` middleware keyed on `req.authenticatedUserId`. But `requireOwnership("requester_id")` runs before it. If ownership check fails (403), the rate limiter is never reached — correct. However, if a helper submits a request on behalf of another user ID in the body (which ownership check prevents), and a malicious actor calls with their own user ID, the rate limiter correctly fires per authenticated user. The issue is middleware **order**: `requireOwnership` → `requestCreationLimiter` → handler. If `requireOwnership` is removed or bypassed in future refactoring, the rate limiter key (`authenticatedUserId`) would still work — but the comment says "IP fallback was dead code" implying the IP fallback was removed. If `authenticatedUserId` is somehow undefined at rate limiter time (e.g. middleware reorder), the limiter uses `undefined` as the key, allowing unlimited requests.

**Fix Required:** Add a guard in `keyGenerator` to throw or return a fallback-blocked key if `req.authenticatedUserId` is unexpectedly undefined.

---

### BUG-017 · `DELETE /users/:id` — Non-Atomic Cascade Across 14 Tables
**File:** `artifacts/api-server/src/routes/users.ts` — `DELETE /users/:id`  
**Severity:** 🟠 HIGH  

Account deletion issues 14+ sequential `db.delete()` and `db.update()` calls without a database transaction. If any intermediate step fails (network blip, DB timeout, constraint violation), the account is left in a partially deleted state — some dependent records deleted, others not, and the user row itself may or may not exist. The catch block returns a 500, but partial deletion has already occurred and is not rolled back.

**Fix Required:** Wrap all deletion steps in a single `db.transaction(async (tx) => { ... })` call.

---

### BUG-018 · Trust Score Recency Decay Applied Only on New Rating — Not Retroactively
**File:** `artifacts/api-server/src/routes/requests.ts` — `POST /requests/:id/rate`  
**Severity:** 🟠 HIGH  

The recency-weighted trust score recomputation runs when a **new** rating is submitted. Old ratings' weights naturally decay over time, but the recomputation is never triggered by time alone — only by a new rating event. A helper who received poor ratings 6 months ago and then stopped using the app will have a permanently low trust score that never decays without a new rating. Conversely, a helper whose old good ratings have decayed in weight will not see their score updated unless someone rates them again.

**Fix Required:** Add a scheduled job (e.g. weekly) to recompute trust scores for all rated users, applying the recency decay to reflect current standing without requiring new ratings as a trigger.

---

### BUG-019 · `payout-worker` Creates New Stripe Client Per Job — Memory / Connection Leak
**File:** `artifacts/api-server/src/workers/payout-worker.ts`  
**Severity:** 🟠 HIGH  

`processPayout` instantiates `new Stripe(stripeKey)` on **every single job execution**. The BullMQ worker has `concurrency: 2`, meaning up to 2 Stripe client instances exist simultaneously per job cycle. Over time with many jobs, this creates excessive object instantiation, no connection pooling, and potential memory growth. The Stripe Node library recommends a singleton instance.

**Fix Required:** Instantiate the Stripe client once outside `processPayout` at module load time (guarding for missing key), and reuse the singleton across all job executions.

---

## ██ MEDIUM — UX, LOGIC & BEHAVIORAL BUGS

---

### BUG-020 · `forgotPasswordMode` "Resend Code" Button Resets Step to Email Without Invalidating Old Code
**File:** `artifacts/pay-it-forward/src/pages/login.tsx`  
**Severity:** 🟡 MEDIUM  

The "Resend code" button in the forgot-password flow calls `setForgotStep("email"); setForgotCode("")`. This resets the UI but does **not** call the API to invalidate the previously issued code or send a new one. The user must go back to the email step and re-submit to actually trigger a new code. The button label "Resend code" implies it immediately sends a new code — it does not. The server's `forgot-password` endpoint does correctly delete prior unused codes when called, but the UI's "Resend" button doesn't call that endpoint.

**Fix Required:** Rename "Resend code" to "Try a different email" — or have the button directly call `POST /users/forgot-password` with the current email and immediately move back to the code step.

---

### BUG-021 · `crisis_update` WebSocket Event Type Missing from Frontend `WsEventType` Union
**File:** `artifacts/pay-it-forward/src/lib/wsClient.ts`  
**Severity:** 🟡 MEDIUM  

`crisis_update` is present in `wsClient.ts`'s `WsEventType` union (line 42). However, it is handled in `map.tsx` via a runtime cast `(event as { type: string }).type === "crisis_update"` rather than as a typed discriminated union member. The `map.tsx` subscription handler uses a monolithic `useWebSocket(callback)` call without type-filtering, relying on runtime string comparison. If the event type is ever renamed server-side, TypeScript will not catch the mismatch.

**Fix Required:** Use typed `useWebSocket("crisis_update", handler)` in `map.tsx`. Remove runtime type casts.

---

### BUG-022 · Neighborhood Filter Chips Visible Only to Helpers — Requesters Cannot Filter Their Own Map View
**File:** `artifacts/pay-it-forward/src/pages/map.tsx`  
**Severity:** 🟡 MEDIUM  

The neighborhood filter chip row is gated on `helperModeActive`. Requesters browsing the map cannot filter by neighborhood to see requests near them — only helpers in helper mode see the filter. This is an inconsistency in the UX — requesters looking for helpers nearby or monitoring their own posted requests have no neighborhood scoping available.

**Fix Required:** Show neighborhood filter chips regardless of helper mode, or add a separate requester-specific filter UI.

---

### BUG-023 · `BottomSheet` and `DispatchIntelligenceCard` Never Shown Simultaneously — But Both Can Be Non-Null
**File:** `artifacts/pay-it-forward/src/pages/map.tsx`  
**Severity:** 🟡 MEDIUM  

The rendering logic shows `DispatchIntelligenceCard` when `showBestMatch` is true, and shows `BottomSheet` only when `!showBestMatch`. These are mutually exclusive. However, when a helper dismisses the best-match card (`setBestMatchDismissed(bestMatch.id)`), the dismissed ID is stored. If the same request remains the best match (no new requests arrive), `showBestMatch` becomes false and the BottomSheet shows instead. The helper sees the same dismissed request reappear in the BottomSheet immediately after dismissing it from the card — there is no suppression in the BottomSheet for dismissed requests.

**Fix Required:** Pass `bestMatchDismissed` to `BottomSheet` and visually distinguish or deprioritize dismissed requests in the list.

---

### BUG-024 · `GoodnessScore` / `benevolence_wallet` Displayed as "Earned" in Wallet UI — Misleading Label
**File:** `artifacts/pay-it-forward/src/pages/wallet.tsx` (inferred from schema/comments)  
**Severity:** 🟡 MEDIUM  

The schema comment on `benevolence_wallet` explicitly warns: *"Any UI/logic treating this as 'total earnings' is wrong."* The `benevolence_wallet` is the goodwill/donation pot (pledges, tips, sponsorships) — not real money from immediate-pay jobs. However, tips are currently credited to `benevolence_wallet` (BUG-008), and the wallet page likely displays this value with currency formatting, implying it is real withdrawable money. Helpers cannot currently withdraw `benevolence_wallet` funds via Stripe — only `immediate` job earnings are paid via Stripe Connect transfer.

**Fix Required:** Clearly differentiate "Goodwill Fund" (benevolence_wallet) from "Earned Income" (Stripe transfers) in all wallet UI. Add a note that Goodwill Fund is non-withdrawable community credit, not real cash.

---

### BUG-025 · `helper_skills` and Legacy `specialties` Are Both Stored — Skill Match Logic Handles Both But DB Has Two Separate Columns
**File:** `lib/db/src/schema/users.ts` / `artifacts/pay-it-forward/src/pages/map.tsx`  
**Severity:** 🟡 MEDIUM  

The `users` table has two separate array columns: `specialties` (legacy) and `helper_skills` (new helper application field). The dispatch intelligence and skill-matching logic in `map.tsx` checks both with `u?.helper_skills ?? u?.specialties ?? []`. The `PATCH /users/:id` endpoint also accepts both `specialties` and `helper_skills` as separate fields. This creates a split source of truth — a user could have skills in `specialties` that are not in `helper_skills` and vice versa. There is no migration or normalization to consolidate them.

**Fix Required:** Migrate `specialties` data into `helper_skills`. Deprecate the `specialties` column. Remove the dual-field lookup once migrated.

---

### BUG-026 · Service Worker Cache Name Hardcoded — Manual Bump Required on Every Deployment
**File:** `artifacts/pay-it-forward/public/sw.js` — Line 3  
**Severity:** 🟡 MEDIUM  

The service worker cache is named `"niakofa-v3"`. When app assets change in a new deployment, browsers will serve stale cached versions until the cache name is manually incremented. There is no build-time cache-busting (e.g. content hash injected into the cache name). A deployment that forgets to bump this string will result in users seeing outdated app shells.

**Fix Required:** Inject a build-time hash or timestamp into the cache name via Vite's `define` or `import.meta.env`. Example: `const CACHE_NAME = "niakofa-" + VITE_BUILD_HASH`.

---

### BUG-027 · `POST /stripe/connect/return` Redirects to `/wallet/connected` — Route Likely Does Not Exist
**File:** `artifacts/api-server/src/routes/stripe.ts`  
**Severity:** 🟡 MEDIUM  

The Stripe Connect onboarding return URL redirects to `/wallet/connected`. Reviewing the app router (inferred from page files), the corresponding frontend page is `artifacts/pay-it-forward/src/pages/stripe-connected.tsx`, which is likely routed as `/stripe-connected` — not `/wallet/connected`. A mismatch between the redirect target and the actual frontend route would result in the SPA serving the 404 page after Stripe onboarding completes.

**Fix Required:** Verify the frontend route for `stripe-connected.tsx` and align the Stripe redirect URL accordingly.

---

### BUG-028 · `useWebSocket` Hook Called With Both One and Two Arguments — Inconsistent API
**File:** `artifacts/pay-it-forward/src/lib/useWebSocket.ts` / multiple components  
**Severity:** 🟡 MEDIUM  

Components use `useWebSocket` with two different call signatures: (1) `useWebSocket("event_type", handler)` and (2) `useWebSocket(handler)`. The hook appears to support both, but having two different calling conventions in the same codebase creates inconsistency and risk of incorrect usage. The two-argument form only fires for one event type; the one-argument form fires for all events. Components using the one-argument form must manually type-check the event, increasing the surface area for runtime errors.

**Fix Required:** Standardize all `useWebSocket` calls to the two-argument typed form. Remove the one-argument catch-all form or clearly document it as an internal escape hatch.

---

## ██ LOW — CODE QUALITY & ENHANCEMENT

---

### BUG-029 · `request-password-reset` Endpoint Only Works for Legacy (No-Password) Accounts
**File:** `artifacts/api-server/src/routes/users.ts` — `POST /users/request-password-reset`  
**Severity:** 🟢 LOW  

The `request-password-reset` endpoint returns the same generic success response if the user already has a `password_hash` (`if (!user || user.password_hash) return res.json(GENERIC_RESPONSE)`). This means users with passwords who accidentally call this endpoint (e.g. from an old app version) receive a success message but no code is sent. Meanwhile `forgot-password` correctly handles all accounts. Having two similar endpoints with different scope is confusing and error-prone.

**Fix Required:** Deprecate `request-password-reset` and redirect all clients to `forgot-password`. Document the legacy-only behavior clearly.

---

### BUG-030 · `distanceMiles` Function Duplicated in `requests.ts` — Not Shared
**File:** `artifacts/api-server/src/routes/requests.ts`  
**Severity:** 🟢 LOW  

The `distanceMiles` haversine function is defined locally in `requests.ts`. An equivalent function (`distanceMeters`) exists in `AppContext.tsx` on the frontend. If the haversine formula is ever corrected or optimized, both copies must be updated. No shared utility module exists in `lib/` for this commonly used calculation.

**Fix Required:** Move `distanceMiles` to a shared server-side utility module. Import it wherever needed.

---

### BUG-031 · `admin.tsx` Fetches Analytics Without Polling — Stale Data on Long Sessions
**File:** `artifacts/pay-it-forward/src/pages/admin.tsx`  
**Severity:** 🟢 LOW  

The admin analytics dashboard fetches data once on mount. There is no `refetchInterval` or WebSocket-driven refresh for the analytics view. An admin who leaves the dashboard open will see increasingly stale counts for open requests, active helpers, and recent completions — with no indication that the data is stale.

**Fix Required:** Add a `refetchInterval` (e.g. 60 seconds) to admin analytics queries, or add a "Last updated: X seconds ago" indicator with a manual refresh button.

---

### BUG-032 · `approval_status` DB Default is `"approved"` — Existing Users Grandfathered Without Review
**File:** `lib/db/src/schema/users.ts` — Line ~63  
**Severity:** 🟢 LOW  

The `approval_status` column defaults to `"approved"` at the database level. The comment acknowledges this is intentional for grandfathering existing rows during migration. However, this means any direct DB insert that omits `approval_status` will silently create an approved account, bypassing the admin review requirement. The registration endpoint correctly overrides this to `"pending"`, but a future bug or migration script that forgets this override would create approved accounts silently.

**Fix Required:** Change the DB default to `"pending"`. Update the `GET /users/:id` exempt path in `app.ts` to additionally exempt profile fetches for `"approved"` checking. Provide an explicit migration script to set existing users to `"approved"` rather than relying on the column default.

---

### BUG-033 · `Crisis Banner` Hardcodes "Tarrant County" — Not Configurable
**File:** `artifacts/pay-it-forward/src/pages/map.tsx` — Crisis banner JSX  
**Severity:** 🟢 LOW  

The crisis banner displays the hardcoded string `"Community Emergency Alert · Tarrant County"` regardless of where the app is deployed. The crisis backend correctly supports `CRISIS_DEFAULT_MESSAGE` and `CRISIS_DEFAULT_RESOURCES` env vars for custom deployments. However, the banner subtitle is hardcoded in JSX and cannot be overridden without a code change.

**Fix Required:** Include a configurable `region` or `subtitle` field in the crisis state object. Render it from the API response rather than a hardcoded string.

---

### BUG-034 · No Input Sanitization on `title`, `description`, `helper_bio`, `review` Fields
**File:** Multiple routes — requests.ts, users.ts  
**Severity:** 🟢 LOW  

Free-text fields including request `title`, `description`, `helper_bio`, `review`, and `content` (chat) are stored as-is without sanitization. While the frontend renders them in React (which escapes by default), email templates in `mailer.ts` interpolate these values directly into HTML strings with template literals. A `title` or `helperName` containing `<script>` tags or malicious HTML would be injected verbatim into email bodies.

**Fix Required:** HTML-escape all user-supplied strings before interpolating them into HTML email templates. Use a library like `he` or a sanitization function on all text inserted into email HTML.

---

### BUG-035 · `pnpm-lock.yaml` Included in Repository — Risk of Dependency Drift on Non-PNPM Environments
**File:** `pnpm-lock.yaml`  
**Severity:** 🟢 LOW  

The lockfile is included in the repository (correct), but there is no CI enforcement that `pnpm-lock.yaml` is up-to-date with `package.json`. On Railway, if `npm install` or `yarn install` is accidentally invoked instead of `pnpm install`, the lockfile is ignored and dependency versions can drift. The `.npmrc` configures `engine-strict=true` which helps, but does not prevent wrong package manager usage.

**Fix Required:** Add a `preinstall` script that fails if not invoked with pnpm. The `.npmrc` `only-allow=pnpm` option enforces this at the npm/yarn level.

---

## ██ RECOMMENDATIONS

| # | Recommendation |
|---|----------------|
| R-01 | Add end-to-end payment reconciliation job: cross-check `transactions.type = 'earned'` against `payment_transactions.state = 'failed'` to detect unresolved payout failures |
| R-02 | Implement per-device token management (JWT with `jti` claim or device session table) to support single-device logout rather than forced logout-everywhere |
| R-03 | Add Zod validation on ALL request bodies — several endpoints (`/tip`, `/rate`, `/cancel`) use inline TypeScript casts (`req.body as { ... }`) without Zod parsing |
| R-04 | Add database-level `CHECK` constraints on `trust_score` range (0–100, except ban sentinel -1), `stars` (1–5), `amount` (> 0) |
| R-05 | Add `UNIQUE(request_id, rater_id)` constraint at the DB level on `ratings` table as a backstop to the application-level duplicate check |
| R-06 | Move admin-only routes (`/admin/*`) to a separate Express sub-router mounted at `/admin` with `requireAdmin` applied at the router level, not per-route |
| R-07 | Add structured pagination (`X-Total-Count` header + `next` cursor) to all list endpoints instead of capped `limit/offset` |
| R-08 | Add OpenTelemetry tracing spans around Stripe API calls and DB transactions for production latency visibility |
| R-09 | Add `Content-Security-Policy`, `X-Frame-Options`, and `Referrer-Policy` response headers to the Express app |
| R-10 | Replace hardcoded `ipapi.co` IP geolocation fallback with a configurable env var — third-party IP lookup is a privacy leak and has rate limits |

---

*End of Report — 35 Bugs Identified, 10 Enhancement Recommendations*
