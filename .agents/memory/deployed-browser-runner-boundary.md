---
name: Deployed browser runner boundary
description: Workspace-specific requirements for authenticated Playwright acceptance against deployed Niakofa.
---

Deployed browser acceptance must run through the repository Playwright CLI with the configured system Chromium executable. Generic acceptance uses `USER_A_STATE`; the admin county-readiness check uses the local `.auth/niakofa-admin.json` state file. `.auth/` is git-ignored. Never paste, display, or commit storage state, and never ask the user to send it in chat.

The user identifies the production acceptance Account A as an approved admin.
This is distinct from Account A in the cross-community media matrix, which is a
synthetic local test user with the default non-admin role.

**Why:** The repository config and workspace runner have specific deployed-browser wiring, and browser storage state contains reusable authentication credentials. A local ignored file lets an authorized operator run the admin check without transferring the session.

**Why:** The same Account A label is used for a production acceptance identity and a local synthetic matrix fixture; substituting the local token would not authenticate the production admin.

**How to apply:** Use only the production account's genuine local session for live admin reads; never substitute the synthetic matrix state. Use the repository Playwright CLI and system Chromium. For the admin county-readiness acceptance, capture a currently signed-in admin session locally into `.auth/niakofa-admin.json`, set `ADMIN_E2E_BASE_URL=https://niakofa.com`, and run the dedicated read-only spec. For other deployed checks, use their documented `USER_A_STATE` inputs. Keep the auth file local and ignored.
