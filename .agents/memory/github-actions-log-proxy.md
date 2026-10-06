---
name: GitHub Actions log proxy
description: The shape of job-log responses through the connected GitHub REST proxy.
---

When retrieving GitHub Actions job logs through the connected REST proxy, inspect the HTTP status and content type first: responses can arrive as `text/plain` directly, without a redirect or ZIP archive. Only follow redirects or unpack archives when the actual response requires it.

**Why:** The workspace proxy returned already-followed job logs as plain text; assuming an archive hid the CI failure details.

**How to apply:** Read text responses directly, keep temporary signed redirect URLs private, and filter output to relevant failing lines.
