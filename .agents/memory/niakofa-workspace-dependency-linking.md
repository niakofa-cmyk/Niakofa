---
name: Workspace dependency linking
description: Environment-specific pnpm relink failure affecting managed workflows and standalone verification
---

The workspace can have a valid lockfile while its local pnpm worker and package
symlinks are missing after a managed dependency restore. This causes workflows
to fail before application code runs, often with missing `vite`,
`esbuild-plugin-pino`, or `node_modules/pnpm/dist/worker.js`.

**Why:** A workspace-wide relink attempted during standalone extraction
verification reproduced the previously documented pnpm bootstrap/resource
failure and left the managed workflow links incomplete.

**How to apply:** Check direct binaries and workflow logs before debugging app
code. Keep the root manifests authoritative; if a standalone package must be
verified, use an isolated temporary Node tool installation and do not commit
generated `node_modules` or `dist` output.