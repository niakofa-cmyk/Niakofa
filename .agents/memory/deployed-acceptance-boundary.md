---
name: Deployed acceptance boundary
description: Requirements for safe authenticated Niakofa production acceptance and browser/API test authentication.
---

Production acceptance must use a genuinely approved disposable account, an exact served-commit check, and explicit mutation gates. Public signup is not enough because new accounts begin in `pending` status.

Playwright `storageState` restores browser `localStorage`, but it does not automatically turn the stored Niakofa token into an `Authorization` header for `page.request` API calls. Authenticated API assertions must derive the token from the state fixture and send the Bearer header explicitly.

Credential-bearing state must be materialized only outside the repository with restrictive permissions, used for the run, and removed afterward. The acceptance wrapper must also return the test status rather than turning a successful run into a failure through an empty temporary-directory cleanup branch.

**Why:** A green browser navigation can coexist with an unauthenticated API request, and a production test that silently uses a pending account or leaves session state in the checkout is not trustworthy evidence.

**How to apply:** Before claiming production acceptance, verify the approved user, served commit, readiness, API contract, and user-visible Diaspora/Globe route; keep credentials and storage state out of logs, tracked files, and final evidence.

Delayed background shell tasks may remove their associated `/tmp` state tree and task log when they exit, including a recovery record created by an earlier shell call.

**Why:** The delayed Story cleanup completed, but the temporary production-acceptance recovery file was no longer available for the final exact-ID reconciliation.

**How to apply:** Before scheduling delayed production cleanup, copy a minimal token-free recovery note to persistent private storage outside task-local `/tmp`; verify that note still exists after the background task exits. Never persist credentials or bearer tokens.