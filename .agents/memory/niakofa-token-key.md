---
name: Niakofa token key is niakofa_token
description: The canonical localStorage auth token key is "niakofa_token"; always use authHeaders() helper.
---

## Rule
The canonical localStorage key for the JWT auth token is `"niakofa_token"` (defined in `artifacts/pay-it-forward/src/lib/auth.ts`).

**Why:** Historical inconsistency introduced `"nia_token"` in some places (e.g. recurring.tsx MatchedHelpersSection). Using the wrong key silently sends an empty Bearer token, causing 401s that are hard to trace.

**How to apply:**
- Always use `authHeaders()` from `@/lib/auth` instead of reading `localStorage.getItem("...")` directly.
- `authHeaders()` returns `{ Authorization: "Bearer <token>" }` or `{}` when no token is stored.
- Never reference the key string `"nia_token"` — it's wrong. Search for it if reviewing old code.
