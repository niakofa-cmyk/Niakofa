---
name: Local media verification
description: Real local media acceptance requires an actual queue runtime, not just passing isolated API fixtures.
---

Keep the media API's unavailable-processing guard intact. Verify local browser uploads using real loopback-only Redis workers; do not bypass the guard or substitute mocked processing to claim end-to-end success.

**Why:** Isolated media API tests passed with injected queue handling while the running preview still rejected upload initialization. Enabling the media flag alone did not make processing available.

**How to apply:** Before a signed-in local upload, confirm local storage, queue connectivity, worker startup, and FFmpeg readiness in the actual serving process. Verify persisted media and browser display, then clean exact disposable fixtures. Never reuse production Redis or storage credentials for this acceptance.
