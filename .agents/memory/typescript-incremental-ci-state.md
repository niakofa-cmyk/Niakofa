---
name: TypeScript incremental CI state
description: Why generated TypeScript incremental metadata must stay out of source control when declaration outputs are not committed.
---

Do not track TypeScript `tsbuildinfo` files when their corresponding emitted declaration directories are intentionally untracked.

**Why:** A clean checkout can contain incremental metadata that says a composite project is current while its declaration outputs are absent. `tsc --build` may then skip emission, causing downstream packages to fail with TS6305 even though a dirty local workspace passes.

**How to apply:** Keep incremental metadata ignored and untracked. Reproduce declaration-build failures after deleting both emitted outputs and incremental metadata, then run the same root typecheck command used by CI.

Restoring tracked declaration output from Git does not necessarily invalidate a local incremental build cache; a composite package may still skip emitting declarations that no longer match its source.

**Why:** An API typecheck can report missing schema exports after generated declarations are restored, even though the source has the exports. A forced declaration build refreshes the output before the normal workspace checks.

**How to apply:** When source and emitted declarations disagree, run the package's TypeScript build with `--force`, then run the full root typecheck/build. Restore generated artifacts before staging if repository policy excludes them.