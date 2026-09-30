---
name: Community watch privacy
description: Privacy boundaries for creator watch insights and viewer-linked records.
---

Suppress a daily completion rate when that day's cohort has fewer than five bounded plays, even if the creator has already crossed a creator-wide five-play threshold. Keep viewer-linked contributions and idempotency records within the rolling insight window rather than indefinitely.

**Why:** A creator-level threshold alone can expose one viewer's completion on a day with one play. Permanent viewer-linked history is unnecessary for a bounded creator-insight window.

**How to apply:** Enforce cohort suppression on the server before sending daily rates. When changing the insight window, update the viewer-record cleanup, aggregate queries, API wording, and privacy tests together.