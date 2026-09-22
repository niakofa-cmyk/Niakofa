---
name: Workspace package manager
description: A local package-manager behavior that can block dependency installation in this workspace.
---

When dependency installation is needed, prefer the repository-pinned pnpm version through npm exec if the system pnpm command attempts to self-manage its version or stalls.

**Why:** The Nix-provided pnpm shim can try to install a different pnpm major before running any command and may hang or exhaust the sandbox. The pinned package invoked through npm completed the locked workspace install normally.

**How to apply:** Check the repository packageManager field, then run the matching pnpm version with `npm exec --yes --package=pnpm@<version> -- pnpm ...`. Do not change the lockfile just to work around the shim.