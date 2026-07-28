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

## Pre-existing failing test suites (not caused by audit-fix session)

- `bug-15b-15c.test.ts` — fails with `TypeError: request is not a function` (supertest ESM interop issue in that specific test file's setup). Was already failing before `esModuleInterop: true` was added (was `express_1.default is not a function`). The esModuleInterop change actually improved it from 0 passing → 2 passing.
- `integration-lifecycle.test.ts` — fails with 401 on POST /api/requests; needs real DB or different auth mock setup.
- `lifecycle.test.ts` — similar pre-existing DB dependency failures.

Do NOT attempt to fix these in passing; they require dedicated test infra work.

## jest.config.mjs esModuleInterop

Added `esModuleInterop: true` to the ts-jest tsconfig section in `jest.config.mjs`. This is needed so that `import request from "supertest"` and `import express from "express"` work as default imports in ESM test files.
