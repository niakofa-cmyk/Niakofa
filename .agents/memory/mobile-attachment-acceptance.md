---
name: Mobile attachment acceptance
description: Constraints for running authenticated two-account attachment checks safely.
---

Deployed two-account acceptance should use pre-provisioned approved storage states rather than repeatedly registering temporary users; the production auth limiter intentionally caps registration and login attempts.

**Why:** Repeated controlled retries can consume the deployment's shared 15-minute authentication budget even when every temporary account is deleted successfully.

**How to apply:** Keep User A and User B states outside the repository, validate them before the run, and use the explicit disposable-account gate. For mobile UI checks, wait for the inbox preview, open the conversation from the visible list, and then assert the blob-backed media after reload instead of depending only on a direct conversation URL.