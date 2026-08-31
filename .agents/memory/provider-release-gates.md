---
name: Provider release gates
description: How Niakofa provider configuration becomes release evidence rather than merely secret presence.
---

Treat provider secret presence as configuration only, not certification. After
changing payment or media credentials, restart the API and run the scoped
readiness check plus authenticated release smoke. The core Circles/payments
gate requires migrated database/schema, Stripe secret and webhook signing
secret, and LiveKit URL plus server credentials; Redis and Mapbox should also
be ready. Nia may remain degraded when it is explicitly optional.

**Why:** The workflows can start while a provider is incomplete, and an
environment check cannot prove that the server can authenticate to LiveKit or
that Stripe readiness is wired correctly.

**How to apply:** Never claim provider production readiness from env-var
existence alone; use the restarted workflow logs, scoped readiness response,
and release smoke result as the evidence.