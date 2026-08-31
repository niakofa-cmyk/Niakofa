---
name: Package manager bootstrap
description: The workspace pnpm shim may fail while bootstrapping the packageManager-declared version under constrained process resources.
---

When dependency installation fails inside this environment with repeated pnpm self-bootstrap aborts, disable pnpm's package-manager version management for the local command and use CI/noninteractive mode; this allows frozen-lockfile installation without changing the manifest. Recursive `pnpm run` checks can still trigger a dependency-status reinstall, so invoke installed tool binaries directly after the restore.

**Why:** The project declares pnpm 11, but the environment-provided shim can repeatedly abort while attempting to bootstrap it even though the lockfile is valid.

**How to apply:** Use `--config.manage-package-manager-versions=false`, `CI=true`, and low concurrency for local installation. For validation, prefer direct `node_modules` binaries when recursive scripts recreate dependencies; never commit these flags or use them as a project dependency decision.

In a fresh workspace where the shim times out before producing output, install the
lockfile's pinned pnpm version through the package-management tool first, then
retry the frozen install. The retry can complete normally without changing the
repository manifest.