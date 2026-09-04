---
name: Civic jurisdiction matching
description: Durable guidance for geocoder metadata, canonical civic coverage, and cached jurisdiction responses.
---

External geocoders may return a human-readable region label such as “Texas” while the civic registry uses a canonical code such as “TX”. Treat structured country-qualified short codes as authoritative, validate them against the supported U.S. geography set, and use a validated name-to-code fallback for partial responses.

**Why:** Matching a display label directly to canonical coverage can silently produce an empty local-resource result even when the county and city data are present.

**How to apply:** Keep display labels separate from canonical matching fields, fail closed for unknown/non-U.S. values, and bump location-response cache keys whenever jurisdiction matching or response shape changes so stale empty or incompatible payloads cannot remain authoritative.

Geocoder provider unavailability is a different outcome from a valid no-match. Preserve existing community assignments across transient provider failures; only a verified unmatched location should move a user to the global bucket.

**Why:** Collapsing timeouts, missing credentials, and provider HTTP errors into `null` caused GPS updates to erase an existing assignment even though the user’s location had not been disproven.

**How to apply:** Let assignment callers handle provider failures as non-destructive retries, while registration remains non-blocking and valid no-match resolution continues to fail closed.

Canonical county/state identity must be database-unique, and first-visit provisioning must tolerate concurrent inserts by returning the winning row.

**Why:** A read-then-insert race can split one county's users and money across multiple pools even when later lookups consistently choose only one row.

**How to apply:** Normalize every automatic and admin jurisdiction write, enforce a canonical unique index, and use conflict-safe insertion followed by a winner lookup.