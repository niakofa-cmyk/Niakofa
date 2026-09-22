---
name: Niakofa admin auth model
description: How admin authentication works — DB flag only, no client secret, no bypass.
---

## The rule
Admin access is granted exclusively via `is_admin = true` on the user's DB row. No client-side secret, no `VITE_ADMIN_SECRET` bypass.

## Why
The old admin gate compared `adminInput` against `import.meta.env.VITE_ADMIN_SECRET` (a Vite env var visible in the browser bundle). When a user authenticated this way, no JWT existed in localStorage → every admin API call returned 401. The Nia toggle was broken because `requireAuth` rejected all requests with no token.

## How to apply
- `AdminScreen` has no password input. It checks `currentUser?.is_admin` via `useEffect` → calls `setAuthed(true)`.
- Gate states:
  - `!currentUser` → "Sign in required" + button to `/login`
  - `currentUser && !is_admin` → "No admin access" message
  - `currentUser && is_admin` → auto-authed, admin panel renders
- All admin API routes require `requireAuth + requireAdmin()` middleware — this is the true security boundary.
- `AppContext` must exclude `/admin/*` from the unauthenticated-redirect rule (otherwise non-logged-in users on /admin get redirect-looped before the admin gate can render).
- Admin login flow: user signs in at `/login` as admin@niakofa.app, gets redirected to `/`, navigates to `/admin`, `currentUser.is_admin` triggers auto-auth.
- The `VITE_ADMIN_SECRET` env var on Railway can be deleted — it is no longer referenced anywhere in the frontend or server code.
