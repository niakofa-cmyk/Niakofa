---
name: Node TSX harness stdin boundary
description: A workspace-specific limitation when launching temporary TypeScript-enabled ESM harnesses.
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
