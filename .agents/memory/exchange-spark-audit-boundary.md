---
name: Exchange Spark deletion audit boundary
description: Distinguishes a Spark delete request from confirmed cleanup while keeping lifecycle logs content-free.
---

An Exchange Spark delete request only marks the row `deletion_pending`; it is not proof that the Spark was removed. The cleanup worker should report `deleted: true` only when the database delete returns the row, and should report failures with allowlisted reason codes. Keep the user ID and Spark ID for attribution, mark worker events as system actions, and never log captions, media URLs, storage keys, or raw cleanup errors.

**Why:** Request acceptance, storage cleanup, and database deletion are separate outcomes. Treating them as one success can misstate whether content was actually removed, while raw storage/database errors may expose private content or object keys.

**How to apply:** Preserve separate request and cleanup-result events whenever Spark deletion behavior changes; base the final boolean on the database delete result and sanitize every reason at runtime.