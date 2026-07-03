---
name: Niakofa Jest ESM test setup
description: How the api-server Jest config must be structured for real ESM + ts-jest, and a known unresolved limitation with jest.mock() factories under --experimental-vm-modules.
---

**Jest config must not be TypeScript when run without ts-node.** `jest.config.ts` requires
`ts-node` to parse; if it's not installed, Jest fails before running anything. Use a plain
`jest.config.mjs` (JSDoc `@type` comment for typing, no `import type`).

**Invoke Jest via `node_modules/jest/bin/jest.js`, not `node_modules/.bin/jest`,** when running
under `node --experimental-vm-modules` — the `.bin` shim can break the flag propagation in this
project's setup.

**`@types/jest` alone is enough for typecheck** — you don't need `import { jest, describe, ... }
from "@jest/globals"` just to satisfy `tsc`. But you DO need the `@jest/globals` import at
*runtime* in this project's ESM config, because `injectGlobals` behaves as if disabled under true
ESM test files (no import → `ReferenceError: jest is not defined`).

**Known unresolved issue:** with the `@jest/globals` import present, `jest.mock("&lt;module&gt;", factory)`
factories that call `jest.fn()` produce functions that are NOT recognized as real Jest mocks
(`jest.isMockFunction()` returns false, `.mockClear`/`.mockReturnThis` are undefined) — even though
the same file's own `jest.mock()` call registers fine. This reproduces consistently for `@workspace/db`
mocks in this repo's test files under `--experimental-vm-modules`. Root cause not fully isolated;
suspect a real ESM incompatibility between hoisted `jest.mock()` factories and the `@jest/globals`
proxy object during vm-module linking. The Jest-recommended workaround (not yet applied here) is to
switch these tests from `jest.mock()` to `jest.unstable_mockModule()`, which is the documented ESM
mocking API and is not hoisted — call it before the dynamic `await import()` of the module under test.

**Why:** several test suites (`users.test.ts`, `bug-15b-15c.test.ts`, etc.) fail individual
assertions with `db.select.mockClear is not a function` despite the test runner itself working.

**How to apply:** if asked to make these specific suites pass (not just "runnable"), migrate their
`jest.mock("@workspace/db", factory)` calls to `jest.unstable_mockModule` + move the dynamic
`import()` of the router under test to after the mock registration.
