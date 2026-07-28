---
name: Niakofa Express 5 async error handling
description: Express 5 auto-handles async rejections — no shim needed; global handler is in app.ts.
---

## Rule
Express **5** (currently `^5.2.1`) automatically catches errors thrown from async route handlers and forwards them to the 4-argument error handler.

**Why:** Express 4 required `express-async-errors` or explicit `next(err)` calls. Express 5 wraps async handlers natively. Routes without try/catch are safe as long as the global 4-arg error handler exists.

**How to apply:** The global error handler lives at the bottom of `artifacts/api-server/src/app.ts` (line ~165). Do not remove or relocate it — it MUST be the last `app.use()` call. Do NOT install `express-async-errors`; it's redundant and can conflict.
