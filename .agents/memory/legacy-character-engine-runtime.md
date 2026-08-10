---
name: Legacy Character Engine Runtime
description: Stable asset registry and licensing boundary for Legacy character rendering.
---

The Legacy renderer stores stable asset IDs and resolves only explicitly
approved runtime layers. The uploaded generator archive is a source library,
not a browser bundle; Face, TVD, SV, Variation, and unapproved layers stay
catalog-only until licensing is confirmed.

**Why:** Raw generator paths and default-body-only rendering made the asset
library hard to evolve and could imply a family likeness from incomplete data.

**How to apply:** Add new layers by updating the catalog, promoting only
licensed runtime files, and extending the resolver with explicit compatibility
checks. Never infer identity, gender, history, or relationships from filenames.
The evolution API must carry verified birth/death years through to the resolver;
use recorded death year for deceased life-stage rendering, and treat
future/contradictory dates as unknown rather than choosing a fallback profile.
Unknown adult gender remains unspecified unless an explicit override exists.