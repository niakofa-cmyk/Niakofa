---
name: Niakofa auth fixture contract
description: Native ESM API tests must model token-version lookups and concurrent authenticated requests explicitly.
---

Native ESM route tests that mock the database must export every selected schema field, including `usersTable.token_version`, and queue a current user row for each `requireAuth` call before route-specific rows. Concurrent requests need one row per request; reset chain mocks between tests so one-time responses cannot bleed into later cases.

**Why:** Production authentication intentionally fails closed when the user row is missing or the embedded token version is stale. A single legacy fixture row makes valid requests appear revoked, and `mockClear()` leaves queued one-time responses behind.

**How to apply:** When adding or updating protected-route tests, count middleware DB lookups separately from handler lookups, seed realistic account rows in that order, and use `mockReset()` for ordered Drizzle-chain mocks.