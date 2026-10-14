---
name: Node TSX harness boundaries
description: File-based execution and one shared loader graph for TypeScript-enabled ESM harnesses.
---

In this workspace, launching `node --import tsx --input-type=module` with a
stdin script fails with `ERR_INPUT_TYPE_NOT_ALLOWED` before application code
runs. A temporary `.mjs` file launched with `node --import tsx` works.

**Why:** The TSX loader's worker startup conflicts with Node's input-type mode
for stdin in this environment; the error is about the harness launch, not the
application modules.

**How to apply:** Put a one-off ESM harness under `/tmp`, run it from the
package directory with `node --import tsx /tmp/harness.mjs`, and resolve
workspace packages from the package's `package.json` when the harness itself
lives outside the workspace.

Broad route harnesses should use one registered TSX loader with ordinary
dynamic imports instead of separate namespaced `tsImport` module graphs.

**Why:** Repeated namespaced imports around the account routes hung without
database waits; moving the import order did not resolve it, while a shared
registered loader did.

**How to apply:** When a multi-router harness hangs during imports, use
`register()` from `tsx/esm/api` once, then native imports so auth, routers and
the database pool resolve in the same module graph.
