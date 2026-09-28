---
name: Managed API restart identity
description: Workflow restart readiness may not prove the newly built API owns the listener.
---

Treat managed API workflow restart success as a process-management signal, not
proof that its new process is serving the configured port. Confirm the served
start time and actual listener after a restart when the API has been rebuilt.

**Why:** A restart left an older Node child listening on the API port. The new
build completed and the workflow reported running, but its new child logged
`EADDRINUSE` while health requests still reached the old code.

**How to apply:** Compare runtime health/start time and the listening process
with the restart logs before claiming preview parity. If a port collision
occurs, identify the stale child specifically before stopping it; do not
change the app's configured port or enter a blind restart loop.