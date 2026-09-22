---
name: Spiral catalog location boundary
description: Curated Spiral discovery must remain independent from GIS geometry and legacy inactive-city sentinels.
---

Curated Spirals are a product catalog: supported cities provision one city-wide row and up to nine curated neighborhood rows regardless of geometry verification. GIS fields and Admin boundary review remain reference data only; future migrations must not make them discovery or hosting gates.

**Why:** A legacy visibility trigger hid every unverified neighborhood and city-wide Spiral behind an inactive-city sentinel, so valid curated cities returned empty discovery results even though their rows existed.

**How to apply:** When changing neighborhood or Spiral migrations, preserve canonical city keys for discovery, keep generated hints out of the catalog, and add a forward migration that repairs legacy sentinel rows if an older trigger was already deployed.