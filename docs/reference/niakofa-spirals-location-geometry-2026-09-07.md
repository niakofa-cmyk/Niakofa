# Niakofa Spirals — location geometry acceptance

This reference records the location milestone from the September 7, 2026
Spirals review. The canonical product language is **Spiral**; Circle-era route,
database, realtime, and module identifiers remain compatibility internals.

## Required neighborhood boundary metadata

Every reviewed neighborhood boundary must carry:

- `polygon_geojson` or a complete `center_lat`, `center_lng`, `radius_meters`
  geometry;
- `geometry_source`;
- `geometry_version`;
- `geometry_effective_at`;
- `geometry_verified`.

An admin can save a draft boundary, inspect its status, and explicitly mark it
verified. The server rejects malformed coordinates, partial radius geometry,
missing review metadata, and attempts to verify incomplete geometry.

## Runtime contract

- A fresh GPS fix is still required for hosting.
- The server evaluates the GPS point against the reviewed, effective geometry.
- A neighborhood Spiral is promoted as the local Spiral only when the point is
  inside that geometry.
- Missing, unverified, or future geometry does not invent a boundary; the
  response remains city-verified and does not promote a neighborhood hint.
- A verified point outside the boundary returns a server-side outside status.
- Joining remains location-independent.

## Global Village and Hub semantics

- A Hub is a governed cultural/community membership surface. A nearby GPS
  signal produces **live proximity**, not automatic membership or enrollment.
- County/community assignment can move with a fresh GPS fix for county-scoped
  Pool and civic routing. Hub membership remains explicit through community
  membership or a Hub membership/leader record.
- `live_user_count` is a recent server-synced GPS presence metric. It is not
  the same as `member_count`, and raw coordinates never leave the API.
- Global member/helper/request/Pool totals deduplicate people and shared county
  scopes across Hubs. The Places in the story list shows the per-Hub story,
  member, live, helper, request, fulfilled, and Pool metrics.
- `active_neighborhoods` counts only reviewed neighborhoods with at least one
  recent GPS-verified user. Unreviewed geometry is deliberately excluded.

## Acceptance checks

1. Admin GET/PATCH exposes source, version, effective date, verification status,
   polygon/radius data, and a computed geometry status.
2. `/api/audio-circles/location-context` uses server geometry, not a client
   neighborhood heuristic, to choose a local Spiral.
3. `/api/audio-circles/:id/location-check` continues to enforce the same
   geometry at host-start time.
4. Polygon/radius validation fails closed for malformed reviewed data.
5. New provisioned display names use Spiral language; legacy Circle internals
   remain intact.

## Source material

This milestone was based on the attached review notes:

- `Pasted-Review-your-work-and-Verify-That-you-Finish-and-checkpo_1788811122910.txt`
- `Pasted-Bottom-line-Yes-this-is-substantially-closer-to-what-we_1788812070902.txt`
- `Pasted-What-I-would-prioritize-now-1-Real-world-LiveKit-valida_1788812136235.txt`

The repository's earlier uploaded LiveKit and Spirals archives remain under
`reference/uploads/` and were not replaced by this reference.