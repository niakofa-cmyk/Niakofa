---
name: Production fail-closed boundaries
description: Security and deployment rules for CORS configuration and database migrations.
---

Production must fail closed at two boundaries: the API cannot start with an
empty CORS allowlist, and the deployment cannot start services after all
database migration retries fail.

**Why:** An open production CORS policy expands the browser trust boundary
silently, while booting against an unknown schema lets partial failures reach
users instead of preserving the previous healthy deployment.

**How to apply:** Keep development fallbacks explicit and environment-gated.
Require `ALLOWED_ORIGIN` in production and make migration failure exit
non-zero after bounded retries.