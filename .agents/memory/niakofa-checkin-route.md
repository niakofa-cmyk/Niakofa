---
name: Niakofa checkin route mounting
description: The internal Nia checkin route must be mounted at /checkin; it was missing from routes/index.ts.
---

## Rule
`artifacts/api-server/src/routes/checkin.ts` must be imported and mounted at `"/checkin"` in `routes/index.ts`.

**Why:** The nia-checkin-worker calls `POST /api/checkin` as a service-to-service HTTP endpoint (verified by `x-internal-secret` header). Without mounting, the route returns 404 and no checkin AI follow-ups fire.

**How to apply:**
```ts
import checkinRouter from "./checkin";
router.use("/checkin", checkinRouter);
```

This was missing and has been added. The test suite at `__tests__/bug-15b-15c.test.ts` mounts it at `/checkin` which confirmed the expected path.
