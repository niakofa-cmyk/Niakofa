---
name: Production host verification
description: How to distinguish the active Niakofa production host from stale Railway service domains.
---

Always verify the canonical public domain and its served commit before treating a Railway hostname as production. A stale service hostname can return Railway's fallback 404 while the canonical domain is healthy and serving the current revision.

**Why:** Railway service URLs can outlive or lose their application binding, so a historical or environment-emitted hostname is not reliable evidence of the currently served deployment.

**How to apply:** Use the deployment-configured canonical URL for health, scoped readiness, and visual checks; compare its reported commit with local and origin/main. Treat a Railway fallback 404 as a stale-host signal, not an application regression, unless the canonical URL also fails.