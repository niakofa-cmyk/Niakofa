---
name: Legacy runtime boundary
description: Durable architecture rule for Niakofa Legacy RPG work.
---

Niakofa Legacy must remain one React/Vite experience connected to the existing
Family Vault, knowledge graph, and world-state contracts. RPG Maker runtime
files and a second game architecture do not belong in the browser bundle.

**Why:** The Legacy design brief explicitly makes the family platform the
source of truth and the RPG the body that renders it; importing a generic RPG
runtime would split state and move Niakofa away from its living-history
identity.

**How to apply:** Promote only small, auditable, license-reviewed presentation
assets and implement interaction/state transitions in the existing Legacy
components and shared state engine.