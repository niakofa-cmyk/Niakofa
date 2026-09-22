---
name: Niakofa navigation route arrived guard
description: Mapbox Directions API rejects zero-length requests; the route endpoint must short-circuit before calling it.
---

`GET /navigation/route` called Mapbox Directions unconditionally. When
start/end coordinates coincide (helper already at the destination, or a
test/mocked GPS fix places both at the same point), Mapbox returns HTTP 422,
which the route mapped to a generic 502 "routing unavailable" — surfacing a
real error to the client at the exact moment a helper arrives.

**Why:** a real navigation UI keeps polling this endpoint during an active
trip, including the final leg where distance approaches zero; that's a normal
in-product state, not bad input.

**How to apply:** the route now computes haversine distance between start/end
first and, if <=15m, returns a trivial `{ distance_meters, duration_seconds:0,
steps: [], arrived: true }` response without calling Mapbox at all. Any future
change to this endpoint must keep that short-circuit before the upstream fetch.
