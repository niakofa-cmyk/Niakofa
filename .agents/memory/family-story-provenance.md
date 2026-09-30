---
name: Family Story provenance
description: Legacy authorship and private event-delivery boundaries for Family Stories.
---

Keep unknown legacy Story authorship unknown; do not assign a plausible family member as a substitute author. Only an active family owner or curator may manage an unowned legacy Story. Do not send Family Story creation or preservation events over a globally broadcast socket.

**Why:** An inferred author falsifies family history, while a global event can reveal private activity and identifiers to unrelated families even when the read route is correctly scoped.

**How to apply:** Preserve null author provenance in migrations and edits, expose management capability separately from authorship, and use authorized per-recipient delivery if realtime Story notifications are introduced.