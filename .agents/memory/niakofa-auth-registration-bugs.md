---
name: Niakofa auth/registration critical bugs
description: Three critical bugs that broke registration, login, and admin page access — all fixed.
---

## Bug 1 — `tos_accepted` never sent in register body
**File**: `artifacts/pay-it-forward/src/pages/login.tsx` `handleSubmit()`
**Symptom**: Every "Join" attempt returned HTTP 400 "You must accept the Terms of Service".
**Cause**: The `fetch("/api/users/register")` body was missing `tos_accepted: tosAccepted`. The server enforces `body.tos_accepted === true` server-side (defence-in-depth), so all registrations silently failed.
**Fix**: Added `tos_accepted: tosAccepted` to the register body JSON.
**Why**: Server-side ToS check is intentional (prevents API bypass); frontend must mirror it.

## Bug 2 — Email not normalized to lowercase in register route
**File**: `artifacts/api-server/src/routes/users.ts` `/users/register` handler
**Symptom**: "No account found with that email" for users who registered with mixed-case email.
**Cause**: Register stored the email exactly as submitted from Zod (e.g. "Bob@Example.com"). Login always queries with `email.trim().toLowerCase()`. Mismatch → login finds nothing.
**Fix**: `const normalizedEmail = email.trim().toLowerCase()` before both the duplicate check and the INSERT.
**How to apply**: Any future DB write of user.email must use the normalized (lowercase+trimmed) form. Login already normalizes input correctly.

## Bug 3 — AppContext redirect fires for `/admin` path
**File**: `artifacts/pay-it-forward/src/lib/AppContext.tsx`
**Symptom**: Navigating to `/admin` while unauthenticated redirected to the app `/login` page instead of showing AdminScreen's own auth gate.
**Cause**: `useEffect(() => { if (!currentUser && location !== "/login") setLocation("/login"); })` was missing `/admin` in the exclusion list. AppShell correctly renders `<AdminScreen />` for `/admin`, but the AppContext useEffect fires AFTER render and changes the URL to `/login`.
**Fix**: Changed to `NO_REDIRECT_PATHS = ["/login", "/admin", "/admin/analytics", "/status"]` with a `startsWith` check so all /admin/* subpaths are also excluded.
**Why**: AdminScreen has its own auth gate (shield screen + is_admin auto-auth). Redirecting to /login first destroys that flow. Same logic applies to public /status page.
