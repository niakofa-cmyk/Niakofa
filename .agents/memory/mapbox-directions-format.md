---
name: Mapbox Directions request format
description: Mapbox Directions API timestamp constraints for traffic-aware routing.
---

Mapbox Directions `depart_at` accepts second precision but rejects the millisecond precision emitted by JavaScript `Date#toISOString()`.

**Why:** A configured, otherwise valid Mapbox token produced upstream 422 responses when traffic-aware routing sent an ISO timestamp containing milliseconds; the app translated that into an unhelpful 502.

**How to apply:** When constructing a Directions request, remove the `.sss` portion before the trailing `Z` (or otherwise format the value as `YYYY-MM-DDThh:mm:ssZ`) and retain live routing coverage in validation.