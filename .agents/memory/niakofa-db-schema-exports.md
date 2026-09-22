---
name: Niakofa DB schema exports
description: How schema files must be registered to be available in the api-server build
---

## Rule
Every new schema file in `lib/db/src/schema/` must be added to `lib/db/src/schema/index.ts` with `export * from "./filename"`. Missing this causes esbuild to fail with "No matching export" at build time.

## Why
`lib/db/src/index.ts` does `export * from "./schema"` which re-exports the schema index. If a table isn't listed in schema/index.ts, it won't be visible to packages importing from `@workspace/db`.

## How to apply
When adding a new schema file (e.g., `push-subscriptions.ts`), immediately add the export line to `lib/db/src/schema/index.ts`. Then run `pnpm --filter @workspace/db run push` to sync the schema to the DB.
