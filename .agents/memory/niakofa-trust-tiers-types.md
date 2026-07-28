---
name: Niakofa trust-tiers @types/node
description: lib/trust-tiers was missing @types/node, blocking the entire tsc --build chain with TS2688
---

## Rule
`lib/trust-tiers/package.json` must declare `@types/node` in devDependencies.

## Why
`lib/trust-tiers/tsconfig.json` sets `"types": ["node"]`. Under pnpm's strict per-package isolation, TypeScript resolves `@types/node` from the *package's own* node_modules — not from the workspace root. Without the devDependency declaration, `tsc --build` aborts immediately with TS2688 "Cannot find type definition file for 'node'", cascading to TS6305 errors in every package that imports from `@workspace/trust-tiers` (api-server, scripts, etc.).

## How to apply
Any `lib/*` package whose `tsconfig.json` sets `"types": ["node"]` (or includes any other `@types/*`) must declare those same packages in its own `devDependencies` using `"catalog:"`. Check after adding a new lib package or a new `tsconfig.json` types entry.

Currently affected libs and their status:
- `lib/db` — `@types/node` in devDeps ✅
- `lib/trust-tiers` — `@types/node` added ✅
- `lib/api-client-react` — no `"types"` override, inherits from base ✅
- `lib/api-zod` — no `"types"` override ✅
