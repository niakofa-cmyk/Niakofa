---
name: Niakofa Admin Rate Limiting
description: All admin routes require both requireAdmin() AND adminLimiter. Several route files were missing adminLimiter.
---

# Admin Rate Limiting — Complete Pattern

## Rule
Every admin route must have this exact middleware chain:
```
requireAuth, requireAdmin(), adminLimiter, async (req, res) => { ... }
```

**Why:** `requireAdmin()` is the authorization gate (DB lookup). `adminLimiter` (100/15min) prevents authenticated admin accounts from being used for automated scraping or DoS of internal-only endpoints. One without the other is incomplete.

## Files that needed fixing (2026-07-03)
All five were missing `adminLimiter` import + usage on their admin routes:
- `routes/civic.ts` — GET/PATCH /admin/civic-suggestions
- `routes/reports.ts` — GET /reports, GET /reports/:id, PATCH /reports/:id/review, GET /users/:id/reports  
- `routes/crisis.ts` — POST /crisis/activate, POST /crisis/deactivate
- `routes/community-neighborhoods.ts` — GET/PATCH/DELETE /admin/city-neighborhoods/:id
- `routes/region-crisis-resources.ts` — POST/GET/PATCH/DELETE /admin/region-crisis-resources

## How to apply
Before adding a new admin route, check: (1) `adminLimiter` is imported from `../middlewares/rate-limit`, (2) it appears after `requireAdmin()` in the middleware array. The `paymentLimiter` applies to any route that moves money — including unauthenticated pool donations (`POST /pool/donate`).

Admin authorization is a factory: pass `requireAdmin()` to Express, never the bare `requireAdmin` function. Passing the factory directly returns a middleware without invoking `next()`, so requests can hang until the global timeout.

**Why:** The reconciliation endpoints once appeared protected but stalled in production because the factory was mounted as a middleware. A factory-shaped test mock and a prompt bounded-scan test expose this mistake immediately.

**How to apply:** Keep admin route tests mounted with a mock whose `requireAdmin` returns `(req, res, next) => next()`, and assert the endpoint responds promptly.
