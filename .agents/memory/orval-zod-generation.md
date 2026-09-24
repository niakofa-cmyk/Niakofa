---
name: Orval Zod generation
description: Keep Orval output compatible with the workspace Zod major and regenerate-safe at package entrypoints.
---

Keep Orval’s generated Zod major explicitly pinned to the major installed by the workspace catalog, and keep the generated React client’s TypeScript library set compatible with the generator output.

**Why:** A newer Orval release can auto-detect Zod 4 and emit helpers such as `zod.int`, `zod.email`, and `zod.looseObject` even when the application installs Zod 3. The failure appears only when the production codegen step runs, while ordinary CI typecheck can still pass against previously committed generated files.

**How to apply:** When upgrading Orval, run the exact production codegen/build chain before deployment and commit regenerated client/Zod outputs when generator behavior changes.

When split Zod generation creates operation parameter names that also exist as generated TypeScript interfaces, keep the package entrypoint’s type barrel under a namespace and normalize Orval’s appended wildcard export after generation.

**Why:** A clean Railway build runs codegen before typechecking; Orval can append `export * from './generated/types'` to the package entrypoint, causing TS2308 collisions that an incremental local build may not reveal.

**How to apply:** Treat the post-codegen barrel normalization as part of the codegen command, and verify it with a clean production-equivalent codegen/typecheck run.