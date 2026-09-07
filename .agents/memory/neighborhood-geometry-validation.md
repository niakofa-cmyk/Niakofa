---
name: Neighborhood geometry validation
description: Reviewed geofence polygons must be wholly valid before they can affect host eligibility.
---

Verified neighborhood geometry must fail closed when any vertex is malformed or outside valid longitude/latitude ranges; never filter bad vertices and continue with a changed boundary.

**Why:** Silently dropping invalid vertices can change the reviewed boundary while still granting or denying hosting as if the geometry were authoritative.

**How to apply:** Validate every coordinate before polygon evaluation, and keep regression coverage for mixed valid/invalid and out-of-range vertices.