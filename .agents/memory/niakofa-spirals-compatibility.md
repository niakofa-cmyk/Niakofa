---
name: Niakofa Spirals compatibility boundary
description: Durable migration rule for the Circles-to-Spirals product transition.
---

Niakofa Spirals is the canonical user-facing identity and route namespace.
Circle-era URLs, API contracts, persisted records, database names, internal
types, and realtime event names remain supported compatibility surfaces until a
separately governed sunset.

**Why:** A global rename would break active rooms, recordings, notifications,
bookmarks, generated clients, and historical data. The product metaphor can
evolve without destroying established technical identity.

**How to apply:** New UI links and shared URLs use Spiral routes and language.
Normalize canonical API prefixes into the existing shared handlers before every
Circle lifecycle/media router. Do not rename internal Circle identifiers merely
for branding, and keep old routes behaviorally equivalent.