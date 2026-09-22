---
name: Orval Zod generation
description: The generator may auto-detect a newer Zod major than the workspace runtime.
---

Keep Orval’s generated Zod major explicitly pinned to the major installed by the workspace catalog, and keep the generated React client’s TypeScript library set compatible with the generator output.

**Why:** A newer Orval release can auto-detect Zod 4 and emit helpers such as `zod.int`, `zod.email`, and `zod.looseObject` even when the application installs Zod 3. The failure appears only when the production codegen step runs, while ordinary CI typecheck can still pass against previously committed generated files.

**How to apply:** When upgrading Orval, run the exact production codegen/build chain before deployment and commit regenerated client/Zod outputs when generator behavior changes.