---
name: Niakofa hub-leader dashboard
description: Single-payload dashboard endpoint for hub leaders and where it lives on the frontend.
---

`GET /griot/hubs/:id/summary` (requireAuth, `artifacts/api-server/src/routes/griot.ts`) is the
consolidated payload backing the hub-leader dashboard — it returns the hub row, ring-fenced
`reserved_balance` (via `getHubReservedBalance`), `open_request_count` + `open_requests` (hub-tagged
`requestsTable` rows), approved `leaders`, `recent_pledges` (last 10 inbound), and `is_leader_or_admin`
computed with the existing `isHubLeaderOrAdmin()` helper (already used by claim/crisis/leader-approve
routes — reused here rather than duplicated).

Frontend: `artifacts/pay-it-forward/src/pages/hub-leader.tsx`, routed at `/hub-leader/:id`, linked from
the Globe hub detail panel (`globe.tsx`) via a "Hub leader dashboard" button shown to any logged-in user.
Non-leaders see a read-only view + an "Apply to lead this hub" button
(`POST /griot/hubs/:id/leaders/apply`); leaders/admins additionally get crisis declare/clear controls
wired to the existing `POST`/`DELETE /griot/hubs/:id/crisis` routes.

**Why:** hub money/crisis/task status was previously scattered across admin analytics, the Globe panel,
and the requests browser — no single view existed for a hub leader to manage their hub.
