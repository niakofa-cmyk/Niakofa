---
name: Deployed browser runner boundary
description: Workspace-specific requirements for authenticated Playwright acceptance against deployed Niakofa.
---

Deployed browser acceptance must run through the repository Playwright CLI with the canonical `USER_A_STATE` variable and the configured system Chromium executable. A direct root Node import of Playwright is not equivalent in this pnpm workspace and may fail before loading the test.

**Why:** The repository config enforces `USER_A_STATE` for deployed targets and the workspace can expose the runner without making the Playwright library importable from an arbitrary root script.

**How to apply:** Use the guarded acceptance runner or the repository CLI, provide `USER_A_STATE` plus any role-specific state variables, and keep all state files outside the checkout with restrictive permissions.