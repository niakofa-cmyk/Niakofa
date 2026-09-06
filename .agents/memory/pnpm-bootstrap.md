---
name: Workspace package-manager bootstrap
description: The workspace declares pnpm 11.22.0, while the shell may only provide pnpm 10 and try an unavailable bootstrap.
---

When the shell's `pnpm` command loops while trying to install the declared package-manager version, use the installed pnpm binary with package-manager self-management disabled. Keep the install frozen so the lockfile remains authoritative.

**Why:** The development environment can lack the declared pnpm version and the bootstrap path can time out before any project dependency is installed.

**How to apply:** Prefer the installed pnpm executable with `--config.manage-package-manager-versions=false`; use the frozen lockfile and only allow network access through the Replit package firewall when the local store is incomplete.