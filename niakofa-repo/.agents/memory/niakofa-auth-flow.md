---
name: Niakofa auth flow
description: Root causes and fixes for Registration Failed, broken logout, and initial location issues.
---

## Root Cause of "Registration Failed"
Database tables didn't exist. Fix: run `pnpm --filter @workspace/db run push` to apply Drizzle schema. The DB was provisioned (DATABASE_URL set) but schema was never pushed.

## Broken Logout
`profile.tsx` used `localStorage.removeItem("token")` and `localStorage.removeItem("user")` — **wrong keys**.
Actual keys are `niakofa_token` (via `auth.ts`) and `niakofa_user` (set by AppContext + login.tsx).

**Fix:** Centralized `logout()` function added to AppContextType and AppProvider. It calls `clearToken()`, removes `niakofa_user`, calls `wsUnregister()`, then navigates to `/login`. All components must call `logout()` from AppContext — never clear keys manually.

## setCurrentUser is now a wrapper
`setCurrentUser` in AppContext is no longer a raw React state setter. It wraps `setCurrentUserState` and also syncs `localStorage.setItem("niakofa_user", ...)`. External callers pass a value (`User | null`), not a function. Internal patching (e.g. helper mode toggle) uses `setCurrentUserState` directly.

## Last-Known Location
Hardcoded `{ lat: 32.75, lng: -97.33 }` (Fort Worth default) replaced with `loadLastLocation()` from `localStorage.getItem("niakofa_last_location")`. Persisted on every GPS update. Falls back to `null` if no history — map defaults to user's browser geolocation prompt.

**Why:** The document recommended eliminating hardcoded city defaults to support cross-region use.
