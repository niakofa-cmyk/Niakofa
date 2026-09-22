---
name: Unified messaging boundaries
description: Authorization and product boundaries for the shared Messages surface.
---

Direct messaging must remain limited to authenticated approved, non-suspended
accounts, with conversation membership checks plus user-controlled block and
report protections. Request chat remains request-participant scoped, and
Hub-to-Hub messaging remains approved source-Hub membership scoped.

**Why:** The product combines three conversation kinds in one inbox, but their
trust and governance models are different. Sharing the UI must not flatten
those authorization boundaries or turn GPS/location into Hub membership.

**How to apply:** Add new inbox features behind the existing conversation-kind
guards. Treat realtime delivery, notifications, and moderation tooling as
transport/operations improvements, not reasons to relax these checks.