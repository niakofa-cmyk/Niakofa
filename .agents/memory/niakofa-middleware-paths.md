---
name: Niakofa middleware paths
description: Correct import paths for auth/authz middleware in the api-server.
---

# Middleware Import Paths

**Rule:** Middleware lives in `middlewares/` (plural), not `middleware/`.

- Auth guard: `../middlewares/auth` → exports `requireAuth`
- Authorization: `../middlewares/authz` → exports `requireOwnership(param)` and `requireAdmin()`
- Rate limiting: `../middlewares/rate-limit`

**Why:** A route file importing `../middleware/auth` (singular) fails at runtime with `ERR_MODULE_NOT_FOUND` — tsx doesn't auto-resolve the plural form.

**How to apply:** Always use `middlewares/` (plural) in api-server route imports. `requireAdmin()` is a factory — call it, don't pass it directly.
