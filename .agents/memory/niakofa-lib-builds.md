---
name: Niakofa shared lib builds
description: How to generate dist/.d.ts files for lib/api-client-react and lib/db to clear TS6305 project-reference errors.
---

Both `lib/api-client-react` and `lib/db` have `composite: true`, `emitDeclarationOnly: true` in tsconfig.json but **no "build" npm script**.

**Why:** The packages were scaffolded without scripts but TypeScript project references require built declaration files.

**How to apply:** Run from workspace root:
```
node_modules/.bin/tsc --build lib/api-client-react/tsconfig.json lib/db/tsconfig.json
```
This resolves all TS6305 errors and the cascade of TS2339 "property does not exist" errors in consumers (e.g. HelperMarker.tsx) that were actually caused by unresolved imports, not missing properties.
