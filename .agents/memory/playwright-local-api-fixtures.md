---
name: Playwright local API fixtures
description: Reliable forwarding from intercepted browser requests to an ephemeral local Express test server.
---

For browser acceptance tests that use an in-process Express fixture server, keep browser requests same-origin by forwarding them through the Playwright worker's Node `fetch` and fulfilling the intercepted route. In this workspace run, `route.fetch` to the fixture server left forwarded requests pending even though the API routes worked in-process.

Preserve the request method, authorization and content headers, and JSON body; remove transport headers that are invalid for the new request; relay the response status, content type, and body; and apply a bounded timeout that fails the test instead of silently mocking a missing response. Use only disposable test accounts and databases.

**Why:** The opt-in A/B/C browser checks passed after switching the local fixture bridge to worker-side `fetch` plus route fulfillment; unresolved requests had previously prevented meaningful browser assertions.

**How to apply:** Use this only for the isolated local API fixture in browser acceptance tests. Do not forward production requests or reuse saved-account browser states.
