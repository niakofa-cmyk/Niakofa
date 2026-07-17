---
name: Niakofa X-Request-ID middleware placement
description: X-Request-ID header middleware must be placed BEFORE the /api router mount in app.ts, not after it.
---

# X-Request-ID Middleware Must Be Before the Router

## The Rule
In `artifacts/api-server/src/app.ts`, the `X-Request-ID` response header middleware must be registered **before** `app.use("/api", router)`.

**Why:** Express does not invoke remaining app-level middleware after a route handler calls `res.json()` or `res.send()`. Placing the middleware after the router mount means it is never reached for any real API response — only for unmatched routes that fall through. The bug was silent: the server appeared healthy, but no API client ever received the `X-Request-ID` header.

**How to apply:** Keep the block in the order: `app.use(parseAuth)` → X-Request-ID middleware → `app.use("/api", router)`. If this middleware ever gets moved (e.g. during a refactor), verify it stays above the router mount.
