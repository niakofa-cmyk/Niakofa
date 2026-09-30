---
name: Railway variable redaction
description: Safely determine production configuration state when Railway variable values are withheld.
---

Do not infer a Railway flag value from variable presence when the connected OAuth variable inventory reports values as redacted. Prefer non-secret application readiness signals for active feature state, and never bypass value redaction or print secrets.

**Why:** The Railway connection can return variable names while withholding values; service readiness may expose safe boolean indicators that establish whether a feature or dependency is active.

**How to apply:** During read-only production checks, report variable presence separately from effective runtime state. Before changing live configuration, explain user-visible consequences and obtain approval for any deployment-triggering change.