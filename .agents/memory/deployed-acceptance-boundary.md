---
name: Deployed acceptance boundary
description: Requirements for safe authenticated Niakofa production acceptance and browser/API test authentication.
---

Production acceptance must use a genuinely approved disposable account, an exact served-commit check, and explicit mutation gates. Public signup is not enough because new accounts begin in `pending` status.

Playwright `storageState` restores browser `localStorage`, but it does not automatically turn the stored Niakofa token into an `Authorization` header for `page.request` API calls. Authenticated API assertions must derive the token from the state fixture and send the Bearer header explicitly.

Credential-bearing state must be materialized only outside the repository with restrictive permissions, used for the run, and removed afterward. The acceptance wrapper must also return the test status rather than turning a successful run into a failure through an empty temporary-directory cleanup branch.

**Why:** A green browser navigation can coexist with an unauthenticated API request, and a production test that silently uses a pending account or leaves session state in the checkout is not trustworthy evidence.

**How to apply:** Before claiming production acceptance, verify the approved user, served commit, readiness, API contract, and user-visible Diaspora/Globe route; keep credentials and storage state out of logs, tracked files, and final evidence.