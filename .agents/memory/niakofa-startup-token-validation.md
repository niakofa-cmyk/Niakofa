---
name: Niakofa startup token validation
description: AppContext runs a one-shot JWT validation on mount. Documents the race-safety pattern required to avoid stale-response auth regressions.
---

## Rule
AppContext validates the stored JWT against the server once on mount (last `useEffect`). The validation fetch must be guarded against two race conditions before calling `setCurrentUser`.

## Implementation
1. Capture `capturedId` and set `let active = true` at effect start.
2. Cleanup function sets `active = false` — handles unmount.
3. After the fetch resolves:
   - Check `if (!active) return` — catches unmount race.
   - Re-read `localStorage.getItem("niakofa_user")` and compare `.id` to `capturedId` — catches logout/login-as-different-user race.
4. On 401/403: `clearToken()` + `localStorage.removeItem("niakofa_user")` + `setCurrentUser(null)` + `sessionStorage.setItem("niakofa_session_expired","1")`.
5. On 200: parse fresh user, check `active` again after `.json()`, then `setCurrentUser(fresh)`.
6. On network error: keep stored user (do NOT wipe session on offline).

**Why:** Without the active-flag + stored-id re-check, a slow validation fetch returning after the user explicitly logged out would silently restore the previous session — a serious auth regression.

**How to apply:** Any future async effect in AppContext that conditionally calls `setCurrentUser` must follow the same pattern: capture identifiers at effect start, re-verify them after every await before mutating state.
