---
name: Deployed browser runner boundary
description: Workspace-specific requirements for authenticated Playwright acceptance against deployed Niakofa.
---

Deployed browser acceptance must run through the repository Playwright CLI with the configured system Chromium executable. Generic acceptance uses `USER_A_STATE`; the admin county-readiness check uses the local `.auth/niakofa-admin.json` state file. `.auth/` is git-ignored. Never paste, display, or commit storage state, and never ask the user to send it in chat.

The user identifies the production acceptance Account A as an approved admin.
This is distinct from Account A in the cross-community media matrix, which is a
synthetic local test user with the default non-admin role.

**Why:** Browser storage state contains reusable credentials, large inline values can be transformed, and the same Account A label is used for a production admin and a synthetic local fixture.

**How to apply:** Use only the production account's genuine local session for live admin reads; never substitute the synthetic matrix state. Use the repository Playwright CLI and system Chromium. For admin readiness, validate `.auth/niakofa-admin.json` before the read-only spec makes a request. In deployed runners, prefer `USER_A_STATE` / `USER_B_STATE` file paths (including ignored `.auth/` files); use `*_STATE_JSON` only when the matching path is unset. An invalid explicit path fails closed. Keep auth files local and ignored.
