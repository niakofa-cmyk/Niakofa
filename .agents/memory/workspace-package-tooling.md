---
name: Workspace package tooling
description: Environment-specific package-manager behavior discovered while validating the monorepo
---

The workspace-local pnpm binary is reliable when invoked through Node directly;
the shell shim can recursively try to install its own package and abort under
resource limits.

**Why:** The project declares pnpm as a package-manager dependency and the
managed shell shim attempted repeated self-bootstrap operations during lockfile
and validation commands.

**How to apply:** Prefer `node node_modules/pnpm/bin/pnpm.mjs ...` for workspace
installation and package scripts when the plain `pnpm` command begins
self-installing or loops.