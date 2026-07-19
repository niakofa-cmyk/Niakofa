---
name: Niakofa Jest mock-reset pattern
description: Why all DB chain mocks must use mockReset() not mockClear() in lifecycle.test.ts beforeEach
---

# Rule
In `artifacts/api-server/src/__tests__/lifecycle.test.ts`, every DB chain mock in `beforeEach` must use `mockReset()`, not `mockClear()`.

**Why:** `mockClear()` clears call history but leaves `mockResolvedValueOnce()` queues intact. Those stale queued values bleed into the next test and shift the DB-response queue by one, turning a 403 into a 409 (or vice versa). `mockReset()` wipes both call history AND all queued return-value overrides.

**How to apply:**
- All 8 chain methods (select, update, insert, delete, from, where, set, values): `mockReset().mockReturnThis()`
- limit, returning: `mockReset().mockImplementation(() => Promise.resolve([]))`
- then: `mockReset().mockImplementation((resolve, reject) => Promise.resolve([]).then(resolve, reject))`
- transaction: `mockReset().mockImplementation(async (cb) => cb(db))`
- execute: `mockReset().mockResolvedValue({ rows: [] })`
- onConflictDoNothing, onConflictDoUpdate: `mockReset().mockResolvedValue([])`

Then queue the `requireApproved` seed value AFTER all resets:
`(db.limit as jest.Mock).mockResolvedValueOnce([{ is_suspended: false, trust_score: 50, approval_status: "approved", token_version: 0 }]);`
