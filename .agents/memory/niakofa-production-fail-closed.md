---
name: Production fail-closed boundaries
description: Security and deployment rules for CORS configuration and database migrations.
---

Production must fail closed at three boundaries: the API cannot start with an
empty CORS allowlist, static SPA assets must not be routed through API CORS
validation, and the deployment cannot start services after all database
migration retries fail.

**Why:** An open production CORS policy expands the browser trust boundary
silently, while booting against an unknown schema lets partial failures reach
users instead of preserving the previous healthy deployment. Browser module and
stylesheet requests can include an Origin header on same-origin navigation; a
global CORS validator can therefore turn a valid SPA asset into a 500 when the
public host is not repeated in ALLOWED_ORIGIN.

**How to apply:** Keep development fallbacks explicit and environment-gated.
Require `ALLOWED_ORIGIN` in production, mount CORS on `/api` rather than the
whole Express app, and make migration failure exit non-zero after bounded
retries.

Development preview origins must be matched against this workspace's runtime-assigned domains, not all Replit domains, even when a production allowlist is inherited by development.

**Why:** GET requests without an Origin header can work while same-origin browser publishing POSTs fail with CORS before reaching the route. An inherited production allowlist does not necessarily contain the current ephemeral preview host.

**How to apply:** Preserve exact-origin production checks and its startup guard. Keep the runtime-preview exception development-only and verify an actual browser POST or preflight through the current preview address.