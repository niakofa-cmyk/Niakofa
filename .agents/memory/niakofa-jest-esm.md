---
name: Niakofa Jest ESM test setup
description: How the api-server Jest config must be structured for real ESM + ts-jest, config/mocking gotchas, and a known unresolved limitation with jest.mock() factories under --experimental-vm-modules.
---

**Setup:**
- `jest`, `ts-jest`, `supertest`, `@types/jest`, `@types/supertest` in `@workspace/api-server` devDependencies.
- Config must be plain `jest.config.mjs` (JSDoc `@type` comment, no `import type`) — a TypeScript `jest.config.ts` requires `ts-node` and fails before running anything if it's not installed.
- `testEnvironment: "node"`, `extensionsToTreatAsEsm: [".ts"]`; run via `node --experimental-vm-modules node_modules/jest/bin/jest.js --passWithNoTests` (the `.bin` shim can break flag propagation — invoke `jest/bin/jest.js` directly).
- `__tests__` folder is excluded from the main `tsconfig.json` (`"exclude": ["src/__tests__"]`) so jest globals don't conflict with the node-only tsconfig; `types: ["node", "jest"]` still set so test files can import shared types.
- `transformIgnorePatterns` default ignores all of node_modules, which also matches pnpm-workspace symlinks like `node_modules/@workspace/trust-tiers -> ../../../../lib/trust-tiers`. Fix: `transformIgnorePatterns: ["/node_modules/(?!@workspace)"]`.

**Mocking pattern:**
- `jest.unstable_mockModule("@workspace/db", () => ({ db: mockChainable, ...tables }))` is the ESM-correct mocking API (not hoisted — call before the dynamic `await import()` of the module under test).
- The mock object must export EVERY table symbol the route/lib under test transitively imports — a missing key throws "does not provide an export named X" at import time, not a clean test failure.
- A chainable mock db (select/from/where/limit/returning each returning "this" or a resolved promise) must have EVERY method reference the SAME shared object. A method accidentally returning a separate `{}` literal breaks the chain, but a route's own try/catch can swallow the resulting throw and return a fail-closed value that coincidentally matches most assertions — silent-catch masking a totally broken mock as "the fail-closed path works." Use `mockReset()` not `mockClear()` in `beforeEach`, or queued once-values bleed across tests.
- `requireApproved()` (auth.ts) does its own `db.select().from(usersTable).where().limit()` lookup before route handlers run — integration tests that only mock `db.returning` for the route's own insert still 401 with "User not found" unless they also queue a `db.limit` mockResolvedValueOnce with an approved user row first.

**Known unresolved issue:** with the `@jest/globals` import present (required at runtime under true ESM — `injectGlobals` behaves as disabled without it, causing `ReferenceError: jest is not defined`), `jest.mock("<module>", factory)` factories that call `jest.fn()` produce functions NOT recognized as real Jest mocks (`jest.isMockFunction()` false, `.mockClear`/`.mockReturnThis` undefined) even though the same file's own `jest.mock()` call registers fine. Reproduces for `@workspace/db` mocks under `--experimental-vm-modules`. Root cause not fully isolated. The Jest-recommended workaround is exactly the `jest.unstable_mockModule` pattern above — migrate any suite still using `jest.mock()` for this if its assertions fail with `db.select.mockClear is not a function`.
