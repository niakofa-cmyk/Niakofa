---
name: Exchange browser timeout recovery
description: Avoid timing races and fixture residue in local multi-party Exchange browser acceptance.
---

For local buyer–seller browser journeys, do not depend on a background tab's automatic polling to expose the peer's latest Exchange state. A reload or explicit UI return path is more deterministic. Prefer durable status and database evidence over short-lived toast text.

**Why:** A timed Exchange run stalled on the background-page refresh, then further waits exposed a tab/button role mismatch and a transient notification assertion. A separate 90-second timeout left its disposable fixture rows behind, so inline cleanup must not be assumed to have finished after a timeout.

**How to apply:** Re-enter through a UI path that fetches current server state, use the rendered control's actual accessible role, and after a failed local run verify cleanup for that exact fixture before retrying. Keep background-refresh behavior in a separate focused test.
