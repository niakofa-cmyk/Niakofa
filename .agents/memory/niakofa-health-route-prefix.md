---
name: Niakofa health route prefix
description: health.ts must use bare "/admin/worker-health" path — NOT "/api/admin/worker-health" — because all routes are already mounted under /api in app.ts/index.ts.
---

## Rule

`artifacts/api-server/src/routes/health.ts` registers routes WITHOUT the `/api` prefix:
- ✅ `router.get("/admin/worker-health", ...)` → resolves to `/api/admin/worker-health`
- ❌ `router.get("/api/admin/worker-health", ...)` → resolves to `/api/api/admin/worker-health` (double-prefix, silent 404)

**Why:** The health router is mounted under `/api` in `index.ts` (along with all other route files). Adding `/api` again in the route definition creates a path that is never matched.

**How to apply:** Any new route added to `health.ts` (or any other route file already mounted under `/api`) must use paths starting with `/` but NOT include the `/api` segment. Only `index.ts` itself uses the full `/api` prefix when calling `app.use("/api", healthRouter)`.
