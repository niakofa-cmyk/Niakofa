---
name: Story deletion rate-limit boundary
description: How production Story cleanup behaves under account-scoped community write limits.
---

A Community Story DELETE shares the account-level community write limit (5 per 15 minutes). A rapid cleanup retry loop can return only 429 responses without entering the delete handler. A 404 from the Moment composition route alone does not prove the parent Story row is gone. Preserve the original acceptance failure when cleanup also fails; a throw from `finally` otherwise masks the useful diagnosis.

**Why:** A production Story remained in the owner's feed even though its composition route returned 404, while cleanup requests were rejected by the rate limit.

**How to apply:** Send one owner-authenticated DELETE. Continue only when its response contains `deleted: true`, then independently verify the unique Story is absent from the owner feed and its exact media assets and upload sessions are absent. On 429, stop and use the server's reset metadata for a later retry; never spin. Report both the test failure and cleanup failure.
