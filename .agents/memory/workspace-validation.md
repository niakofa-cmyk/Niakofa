---
name: Workspace validation
description: Practical constraints for validating this Replit workspace.
---

Use Corepack's pinned pnpm version for workspace installs and run package-local binaries when validating an app. Shell-based browser tests cannot reach the managed preview through loopback; use the exact `REPLIT_DEV_DOMAIN` host and treat it as a workspace-local target.

**Why:** The ambient pnpm shim attempted an environment-specific self-prepare, and the preview workflow runs outside the shell's loopback network namespace even though it is healthy.

**How to apply:** Install with the workspace's available pnpm binary and package-manager self-management disabled when the declared version cannot be bootstrapped. For Playwright, use `https://${REPLIT_DEV_DOMAIN}` and exempt only that exact host from production storage-state requirements.