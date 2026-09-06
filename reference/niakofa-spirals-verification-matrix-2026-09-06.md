# Niakofa Spirals Verification Matrix — 2026-09-06

| Gate | Expected | Current evidence |
|---|---|---|
| Canonical public brand | Spirals | Implemented in user-facing routes/copy |
| Canonical URLs | `/audio-spirals`, `/audio-spiral/:id` | Implemented |
| Legacy compatibility | Circle aliases remain functional | Preserved intentionally |
| Mapbox reverse geocode | v6 endpoint without invalid v5 `limit`/multi-type combination | Implemented in location policy |
| Fresh GPS | Server validates freshness/accuracy | Implemented |
| Fort Worth host fence | FW + explicit enclave aliases can host | Implemented/tested |
| Outside-city host fence | Other cities cannot host FW Spiral | Preserved/tested |
| Outside-city joining | Join does not require host eligibility | Preserved |
| Location denial diagnostics | Resolved city + required Spiral city available to UI | Implemented |
| Host signal | Ready/blocked signal rendered before host submission | Implemented |
| Neighborhood identity | Spiral is associated with its named neighborhood | Implemented |
| Neighborhood GPS hint | Mapbox neighborhood can be surfaced as a hint | Implemented |
| Neighborhood geofence | Polygon/radius-backed verification | **Not implemented: source data has no authoritative geometry** |
| LiveKit server readiness | Authenticated endpoint reachability | Previously verified |
| Real WebRTC media | Two-device microphone test | **Physical-device acceptance still required** |

## Rule

Do not weaken the city host fence to make a GPS error disappear. If a user is outside the host city, deny hosting but keep joining available and explain the resolved city.
