---
name: Cover thumbnail job versioning
description: Concurrency and retry rules for regenerating cover thumbnails on ready Story media.
---

A user-selected cover frame is a versioned derivative, not a reason to take the original video offline. Keep the ready asset and previous thumbnail available while a replacement is generated. Give each queued cover request a durable, monotonically increasing version, and let a worker store or finalize output only when the asset's current cover selection still matches that version. Stale jobs must not mark a newer request failed. Use the durable job timestamp to construct a stable queue ID so retries and outbox recovery publish the same request.

**Why:** Concurrent edits, worker overlap, or a Redis publication failure can otherwise let an old frame replace a newer choice or leave a durable queued job with no retry path.

**How to apply:** When adding or changing asynchronous media derivatives, preserve playback while updating, version each request in durable state, compare that version under the media row lock before committing results, and make retries/outbox replay idempotent.