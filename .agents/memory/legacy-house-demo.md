---
name: Legacy House Demo
description: Product boundary for the interactive House of Mensah live demo layer.
---

# Legacy House Demo

The House of Mensah demo is intentionally a front-end gameplay layer over the existing Legacy Mode APIs. Artifact placement and playable-map position use the canonical `niakofa:demo:v2` browser state across public and authenticated demo surfaces; this remains local demo state until the backend artifact model is explicitly connected to family-vault records.

**Why:** The requested house-changing loop needs to be playable immediately without inventing or silently persisting family-history records that have not been uploaded or consented to.

**How to apply:** Keep the demo actions visibly tied to real Vault, Map, recording, and Reunion routes. When backend artifact persistence is added, replace the local placement store with consent-aware family-vault mutations and world-regeneration events rather than writing family records from the demo UI.