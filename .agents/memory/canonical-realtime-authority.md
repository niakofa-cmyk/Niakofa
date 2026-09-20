---
name: Canonical realtime authority
description: Durable ordering and projection rules for Niakofa's unified realtime conversation state
---

Canonical realtime events and server read state are the authority. Durable
event identity must be resolved from the persisted row before any live frame
is delivered, and retries using an idempotency key must reuse that row's
identity and payload.

**Why:** Delivery, replay, unread summaries, and UI projections can happen in
different processes or tabs. If any of them becomes an independent authority,
duplicate messages, stale cursors, and cross-device read-state drift are
possible.

**How to apply:** Persist canonical events before WebSocket delivery; serialize
replay ahead of queued live events and deduplicate by durable UUID; reject
unknown cursors instead of replaying from an implicit origin; publish read
events only after the authoritative database update succeeds. Keep legacy
frames and local conversation/unread state as compatibility projections.