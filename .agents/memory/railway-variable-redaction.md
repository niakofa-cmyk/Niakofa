---
name: Railway variable redaction
description: Safely determine production configuration state when Railway variable values are withheld.
---

Do not infer a Railway flag value from variable presence when the connected OAuth variable inventory reports values as redacted. If project listing works but environment or service inspection fails with a viewer-role denial, treat those references as unverified. Prefer non-secret readiness signals and never bypass access controls or print secrets.

**Why:** Railway may return variable names while withholding values, or allow project listing while denying environment and service inspection to a viewer role. Neither case proves which resource a reference resolves to.

**How to apply:** During read-only production checks, report variable presence separately from effective runtime state. On permission denial, ask an authorized operator to verify references rather than probing around the role boundary. Before changing live configuration, explain user-visible consequences and obtain approval for any deployment-triggering change.