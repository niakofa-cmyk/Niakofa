---
name: Niakofa test mock bleeding
description: Jest ESM mock bleeding rules for api-server test suite; pre-existing test failures; required request body fields.
---

## Rule: use mockReset() not mockClear() in beforeEach

`mockClear()` does NOT clear the `specificMockImpls` queue (the `mockResolvedValueOnce` / `mockReturnValueOnce` backlog). If a test sets up a `mockResolvedValueOnce(X)` but the route returns early (e.g. Zod validation failure) without consuming it, the value stays in the queue and poisons the NEXT test.

**Fix**: Use `mockReset()` in every `beforeEach`, then re-wire default implementations:
```js
(db.limit as jest.Mock).mockReset().mockImplementation(() => Promise.resolve([]));
(db.select as jest.Mock).mockReset().mockReturnThis();
```

**Why this caused real failures**: register tests 2, 3, 4 in users.test.ts sent request bodies without `tos_accepted: true`, causing Zod to reject before any DB call. Their `mockResolvedValueOnce` setups never got consumed and leaked into the login test suite, making login "no account" return 403 (consumed a leaked `[{id:1}]` mock from the 409 test) and breaking the next two login tests in sequence.

## Register body requires tos_accepted + account_type

The register route validates `tos_accepted: true` (boolean) via Zod BEFORE any DB call. All register test bodies MUST include:
```js
{ name: "...", email: "...", password: "...", tos_accepted: true, account_type: "individual" }
```

Missing either field → Zod 400 → DB mock never consumed → once-mock bleeds to next test.

## Password-less registration no longer works via public API

The legacy "no password" registration path was tested as a 201. That path was removed — the route now requires password. The test was updated to expect 400 for a missing password.

## Resolved suite failures from shared-module imports

When production code adds a named import from a shared module, every native ESM
`jest.unstable_mockModule` factory for that module must expose the named export,
even if the test does not call it. Otherwise Jest fails during module linking
with “does not provide an export named ...” before any test runs. For the
queue module, the shared Redis accessor is mocked as `null` so tests never open
network connections.

**Why this caused real failures:** the rate-limit store began importing the
queue's shared Redis accessor, but several route-test mocks still modeled the
older queue surface. Seven suites failed at import time until their factories
were updated.

**How to apply:** after adding a named import, search all
`jest.unstable_mockModule` factories for that module and keep their export
surfaces aligned with the production module.

## jest.config.mjs esModuleInterop

Added `esModuleInterop: true` to the ts-jest tsconfig section in `jest.config.mjs`. This is needed so that `import request from "supertest"` and `import express from "express"` work as default imports in ESM test files.
