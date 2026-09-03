---
name: Provider release gates
description: How Niakofa provider configuration becomes release evidence rather than merely secret presence.
---

Treat provider secret presence as configuration only, not certification. After
changing payment or media credentials, restart the API and run the scoped
readiness check plus authenticated release smoke. The core Circles/payments
gate requires migrated database/schema, Stripe secret and webhook signing
secret, and LiveKit URL plus server credentials; Redis and Mapbox should also
be ready. Nia may remain degraded when it is explicitly optional. The
deployed health/readiness response must also identify the commit being
released, and that commit must match the pushed revision.

**Why:** The workflows can start while a provider is incomplete, and an
environment check cannot prove that the server can authenticate to LiveKit or
that Stripe readiness is wired correctly. A stale deployment can also remain
healthy while serving an older revision, so availability alone is not release
evidence.

**How to apply:** Never claim provider production readiness from env-var
existence alone; use the restarted workflow logs, scoped readiness response,
release smoke result, and served-commit comparison as the evidence. Verify the
deployed URL separately from the local preview: production can be healthy while
the development database is unreachable, and the development environment must
not be pointed at production just to make its preview green.