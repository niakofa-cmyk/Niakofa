---
name: Globe to mutual-aid engine connectivity
description: How the Diaspora Globe page links to real request/pool activity, including unclaimed hubs
---

Griot Globe hubs previously only showed live activity (helpers, fulfilled
requests, pool balance) once a community had formally claimed the hub via
`community_id`. That left most hubs on the globe visually disconnected from
the actual mutual-aid engine.

Fix: `GET /griot/hubs` (in `griot.ts`) now also computes `open_requests` —
a `COUNT(*)` from `requestsTable` filtered by `hub_id` + `status='open'` —
independent of whether `community_id` is set. `requestsTable.hub_id` is a
direct column, so this works even for hubs nobody has claimed yet.

Frontend (`globe.tsx`) hub detail panel renders this as an "N open requests"
row with a link to `/requests`, plus `reserved_balance` (ring-fenced pool
funds) when present, alongside the existing claimed-hub activity grid. Also
added a general "Civic needs marketplace" CTA linking to `/civic-needs`.

**Why:** the globe should feel like a live view into where help is actually
happening, not just a story map — the fix is deliberately decoupled from the
community-claim step so it works for any hub with real request volume.
