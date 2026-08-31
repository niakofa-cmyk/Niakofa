---
name: Census ACS geography endpoint
description: Current Census geography endpoint and response-name normalization required for Niakofa coverage seeding.
---

Use the available Census 2024 ACS5 dataset for geography-only county and place
lookups. The older PEP population paths tested on August 31, 2026 returned
404s even with a valid key.

**Why:** Census dataset availability is not interchangeable across vintages,
while the coverage seed only needs `NAME`, state FIPS, county FIPS, and place
FIPS.

**How to apply:** Keep the endpoint in the shared Census helper, fail closed on
non-JSON/provider errors, and strip the trailing `, State` from ACS `NAME`
values before removing county/place type suffixes.