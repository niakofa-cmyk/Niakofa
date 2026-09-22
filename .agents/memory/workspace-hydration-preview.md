---
name: Workspace hydration and preview limits
description: Constraints that can make a hydrated source checkout differ from a runnable authenticated preview.
---

Authenticated GitHub hydration can provide the application source without every workspace helper used by an automatically generated workflow. A healthy Vite preview only proves the web artifact boots; it does not prove API, database, authentication, production parity, or physical-device behavior.

**Why:** A prior hydrated checkout was missing the local Postgres workflow helper, so the web workflow ran while the API workflow could not start.

**How to apply:** Verify source contracts and the web build independently, then verify API/database startup and physical-device flows separately. Never turn a local preview screenshot into production or device certification evidence.