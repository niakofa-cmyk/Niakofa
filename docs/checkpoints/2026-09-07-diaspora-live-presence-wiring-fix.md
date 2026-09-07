# Diaspora live-presence wiring fix — 2026-09-07

## What PR #38 delivered on main

- `users.location_updated_at` column (migration 0132)
- `diaspora_hubs.presence_radius_km` (default 35)
- `GET /api/griot/live-presence` implementation files
- `diasporaPresence.ts` aggregation
- `DiasporaLivePresence.tsx` UI component
- unit tests + docs

## Gaps found on main after merge

1. **Route not mounted** — `diaspora-live-presence.ts` existed but was not imported in `artifacts/api-server/src/routes/index.ts`, so the endpoint was unreachable.
2. **GPS write path incomplete** — `PATCH /users/:id/location` updated `lat`/`lng` but never set `location_updated_at`, so live counts would stay empty even when GPS syncs ran.
3. **UI page anchors** — `DiasporaLivePresence` component exists; confirm it is imported on `/diaspora` and `/globe` in the deployed frontend (installer may be fail-closed).

## This branch

- Mounts `diasporaLivePresenceRouter` in the API router aggregator.
- Adds `patches/0133-location-updated-at.patch` for the GPS freshness write.

Apply the patch against main if the full `users.ts` rewrite is not landed in this PR:

```bash
patch -p1 < patches/0133-location-updated-at.patch
```

## Metric separation (keep)

| Metric | Meaning |
|---|---|
| `member_count` | Hub/community membership |
| `live_user_count` | Users with GPS fresher than 10 minutes inside `presence_radius_km` |
| Neighborhood `live_user_count` | Only when `geometry_verified` and point is inside polygon/radius |

## Privacy

Endpoint remains authenticated; response is aggregate-only (no coordinates, names, or user IDs).
