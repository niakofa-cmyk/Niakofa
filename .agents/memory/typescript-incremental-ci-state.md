---
name: TypeScript incremental CI state
description: Why generated TypeScript incremental metadata must stay out of source control when declaration outputs are not committed.
---

Do not track TypeScript `tsbuildinfo` files when their corresponding emitted declaration directories are intentionally untracked.

**Why:** A clean checkout can contain incremental metadata that says a composite project is current while its declaration outputs are absent. `tsc --build` may then skip emission, causing downstream packages to fail with TS6305 even though a dirty local workspace passes.

**How to apply:** Keep incremental metadata ignored and untracked. Reproduce declaration-build failures after deleting both emitted outputs and incremental metadata, then run the same root typecheck command used by CI.