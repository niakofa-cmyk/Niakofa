---
name: Workspace package-manager bootstrap
description: The workspace declares pnpm 11.22.0, while the shell may only provide pnpm 10 and try an unavailable bootstrap.
---

When the shell's `pnpm` command loops while trying to install the declared package-manager version, use the pinned Corepack runner (or the installed pnpm binary with package-manager self-management disabled). Keep the install frozen so the lockfile remains authoritative.

**Why:** The development environment can lack the declared pnpm version and the bootstrap path can time out before any project dependency is installed.

**How to apply:** Prefer `corepack pnpm` or an installed pnpm executable with `--config.manage-package-manager-versions=false`; use the frozen lockfile and only allow network access through the Replit package firewall when the local store is incomplete.

When validating several independent checks, do not launch multiple root-level
pnpm commands concurrently: each may trigger the same self-bootstrap and
recreate the shared `node_modules` directory.

**Why:** Concurrent bootstrap attempts exhausted the workspace process budget
and removed root binary links even though the managed app workflows remained
healthy.

**How to apply:** Run package-manager checks serially, or invoke already
installed package-local binaries directly when dependency mutation is not part
of the task.

If the workspace wrapper starts a dependency-status reconciliation and removes
the root links, restore with the cached exact-version Corepack runner (or
standalone pnpm binary) using `CI=true`, `--frozen-lockfile`,
`--child-concurrency=1`, and `--network-concurrency=1`; then invoke local
binaries directly for validation.

**Why:** Non-interactive reconciliation can fail after partially recreating
`node_modules`, leaving package-local pnpm, TypeScript, and ESLint links absent;
the shell's older pnpm may also repeatedly bootstrap the declared version and
abort under the workspace process limit.

**How to apply:** Keep the declared package manager metadata intact in the
final tree; use the temporary metadata override only around dependency
restoration, not as a repository change.