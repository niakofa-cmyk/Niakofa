---
name: Legacy API contracts
description: Current data sources for Legacy journey, welcome, and calendar UI
---

Legacy journey UI must derive its daily experience from the supported ancestor,
chapter, and active-session endpoints. World activity belongs to the
world-evolution version summary, and calendar entries belong to seasonal events;
the old Game Master today, daily-welcome, and emotional-calendar endpoints are
not part of the current API surface.

**Why:** Retired endpoint fan-out caused avoidable 404s across multiple Legacy
screens even though equivalent live data was already available.

**How to apply:** When adding or changing Legacy screens, search for those
retired endpoint names and normalize current API responses at the UI boundary.