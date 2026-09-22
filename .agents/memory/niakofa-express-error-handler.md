---
name: Niakofa Express global error handler placement
description: Error handler must go AFTER static/SPA middleware to be truly global
---

## Rule
The Express 4-arg error handler `(err, req, res, next) => {}` must be the **very last** `app.use()` call — after API routes AND after static/SPA fallback handlers.

**Why:** Express processes middleware in registration order. An error handler placed before static/SPA handlers won't catch errors thrown inside those later handlers. The comment "last app.use() before listen()" must be enforced structurally, not just in comments.

**How to apply:** In app.ts, the order must be:
1. All API routes (`app.use("/api", router)`)
2. Static file serving + SPA fallback (if SERVE_FRONTEND=true)
3. Global error handler (4-arg middleware)
4. `export default app`
