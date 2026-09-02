---
name: Legacy launch bridge
description: Security and hosting boundary for authenticated launches into the standalone RPG.
---

The standalone Legacy RPG must never receive a platform session credential or family biography. Live launches use a short-lived, one-use opaque ticket issued only after the platform verifies the caller's family membership and character scope; exchange returns only the narrow live context.

**Why:** the RPG is a separate origin and runtime, so passing raw auth state or broad Vault data would expand the platform trust boundary and make replay or URL leakage materially more dangerous.

**How to apply:** keep ticket storage Redis-backed in production, allow only an explicitly bounded non-production fallback, consume tickets atomically, and require either a same-origin `/api` proxy or a configured platform API origin before standalone cutover.