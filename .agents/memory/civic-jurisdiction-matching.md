---
name: Civic jurisdiction matching
description: Durable guidance for geocoder metadata, canonical civic coverage, and cached jurisdiction responses.
---

External geocoders may return a human-readable region label such as “Texas” while the civic registry uses a canonical code such as “TX”. Treat structured country-qualified short codes as authoritative, validate them against the supported U.S. geography set, and use a validated name-to-code fallback for partial responses.

**Why:** Matching a display label directly to canonical coverage can silently produce an empty local-resource result even when the county and city data are present.

**How to apply:** Keep display labels separate from canonical matching fields, fail closed for unknown/non-U.S. values, and bump location-response cache keys whenever jurisdiction matching or response shape changes so stale empty or incompatible payloads cannot remain authoritative.