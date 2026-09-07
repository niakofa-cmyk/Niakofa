# Diaspora Live Presence

## Purpose

Niakofa distinguishes **membership** from **physical presence**. `member_count`
remains a database-backed community membership aggregate. `live_user_count` is a
separate aggregate derived from recently server-synced GPS.

## Freshness

A GPS fix is considered live for 10 minutes after the server receives an accepted
location update. The freshness timestamp is stored separately as
`users.location_updated_at`; `users.updated_at` is intentionally not used.

## Hub assignment

Each fresh user is assigned to at most one approved Diaspora hub: the nearest hub
whose configured `presence_radius_km` contains the fix. The radius is an
operational presence radius, not a legal city or neighborhood boundary.

## Neighborhood presence

Neighborhood counts are shown as **GPS verified** only when a neighborhood has
an admin-verified, effective geometry from `city_neighborhoods` and the current
GPS point is inside that polygon/radius. Missing or unverified geometry does not
invent a boundary.

## Privacy boundary

The live-presence endpoint is authenticated and returns aggregate counts only.
It does not return user names, IDs, raw coordinates, or location history.

## UX

The `DiasporaLivePresence` component provides the current derived hub, freshness,
aggregate live count, and a manual high-accuracy GPS refresh. Keep membership
counts and live-presence counts separately labeled in the UI.

## Acceptance

Production acceptance requires an approved disposable account and explicit E2E
guards. The live spec validates:

1. authenticated `/api/griot/live-presence` response;
2. 10-minute freshness contract;
3. aggregate-only response shape;
4. verified neighborhood count shape when geometry exists;
5. `/diaspora` and `/globe` display the live-presence surface.
