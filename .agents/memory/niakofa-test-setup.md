---
name: Niakofa test setup
description: Jest + Supertest config for the api-server (ESM workspace, ts-jest).
---

**Setup:**
- `jest`, `ts-jest`, `supertest`, `@types/jest`, `@types/supertest` in `@workspace/api-server` devDependencies
- `jest.config.ts` uses `ts-jest/presets/js-with-ts-esm`, `testEnvironment: "node"`, `extensionsToTreatAsEsm: [".ts"]`
- Test script: `node --experimental-vm-modules node_modules/.bin/jest --passWithNoTests`

**Tsconfig exclusion:**
- `__tests__` folder is excluded from the main `tsconfig.json` via `"exclude": ["src/__tests__"]`
- This prevents jest global types (describe, it, expect, jest) from conflicting with the node-only tsconfig
- The `types: ["node", "jest"]` in tsconfig.json is still set so test files can import shared types

**Mocking pattern:**
- `jest.mock("@workspace/db", () => ({ db: mockChainable, ...tables }))` — mock the entire db module
- Chain methods (select, from, where, limit, returning) each return `this` or a resolved promise
- `(db.limit as jest.Mock).mockResolvedValueOnce([...])` to control per-test DB responses

**Why:** The api-server is ESM (`"type": "module"` in package.json) which requires `--experimental-vm-modules` for Jest to handle ESM imports correctly.
