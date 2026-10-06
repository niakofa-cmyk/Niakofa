# Diaspora live-presence wiring fix — 2026-09-07

## Gaps closed

1. **Route mounted** — `diasporaLivePresenceRouter` is imported and mounted in `artifacts/api-server/src/routes/index.ts`, immediately after `griotRouter`.
2. **GPS freshness guaranteed** — `PATCH /users/:id/location` is restored exactly from `main`, while `stamp-location-updated-at.ts` wraps successful location responses and persists the dedicated `users.location_updated_at` timestamp before the response is sent. It never reuses `updated_at`.
3. **Dashboard + Globe anchors** — `GlobeJourneyChips`, already rendered by the Diaspora dashboard and Globe, now includes the compact `DiasporaLivePresence` surface. This gives both `/diaspora` and `/globe` a real live-presence anchor.
4. **Stationary heartbeat** — the live-presence surface sends a GPS PATCH heartbeat every 60 seconds while the page is visible. Movement-threshold logic elsewhere remains battery-friendly; the heartbeat prevents a stationary user from aging out of the 10-minute freshness window.

## Implementation notes

The branch intentionally restores `users.ts` byte-for-byte from `main` rather than carrying the earlier corrupted rewrite. The freshness write is isolated in middleware so the existing user route remains untouched and future GPS handlers cannot accidentally reuse `updated_at` for presence semantics.

`scripts/legacy/patches/0133-location-updated-at.patch` remains as the historical one-line equivalent for teams that prefer the freshness field to live directly in the route's first update. It is retained for audit only; do not apply it without reviewing the current source.

## Metric separation

| Metric | Meaning |
|---|---|
| `member_count` | Hub/community membership |
| `live_user_count` | Users with GPS fresher than 10 minutes inside `presence_radius_km` |
| Neighborhood `live_user_count` | Only when `geometry_verified` and point is inside verified geometry |
| Spiral presence | Separate live-audio host fence; never inferred from Diaspora hub radius |

## Privacy

The live-presence endpoint remains authenticated and aggregate-only. Exact live counts are not exposed with raw user coordinates, names, or IDs. Public Globe aggregation should use future privacy buckets (0, 1–5, 6–20, 20+), not exact counts.

## Production acceptance

After Railway deploys the merged `main` commit, verify:

- authenticated `GET /api/griot/live-presence`
- successful GPS PATCH advances `location_updated_at`
- stationary heartbeat keeps freshness alive
- live counts change with real devices
- `/diaspora` and `/globe` render `Live Diaspora Presence`
