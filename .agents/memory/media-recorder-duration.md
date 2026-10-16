---
name: Browser recording duration
description: Live WebM recordings can be valid without container duration metadata.
---

Accepting browser recordings must not depend solely on a container duration header. When it is absent, derive a bounded duration from server-inspected packet timestamps, never from a client claim.

**Why:** MediaRecorder-style live WebM can contain playable frames and valid dimensions while omitting both stream and container durations. Header-only validation incorrectly rejects these recordings as unsupported content.

**How to apply:** Exercise the same validation in upload completion and workers with an actual live WebM fixture. Keep signature, dimensions, duration, timeout, and output-memory checks intact; an unmeasurable or malformed file must still fail.
