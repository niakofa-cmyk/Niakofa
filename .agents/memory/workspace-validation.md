---
name: Workspace validation
description: Practical constraints for validating this Replit workspace.
---

Use Corepack's pinned pnpm version for workspace installs and run package-local binaries when validating an app. Replit's webview requires the workflow-assigned preview port rather than a hard-coded local port.

**Why:** The ambient pnpm shim attempted an environment-specific self-prepare, and fixed port assumptions can obscure an otherwise healthy preview.

**How to apply:** Install with the workspace's available pnpm binary and package-manager self-management disabled when the declared version cannot be bootstrapped; use the workflow's actual preview port.