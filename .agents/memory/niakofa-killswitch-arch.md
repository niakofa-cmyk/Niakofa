---
name: Niakofa kill-switch architecture
description: How the Nia kill-switch works end-to-end after the July 2026 fix — single source of truth, fail-closed everywhere, workers gated.
---

# Niakofa Kill-Switch Architecture (post-July 2026 fix)

## The Rule
`niaEnabled` state lives **only in AppContext** (polled every 60s + instant WS `nia_status` event). Every component that renders any part of Nia reads `niaEnabled` from `useAppContext()`. Never duplicate the poll/WS logic in a local component state.

## Frontend data flow
- `AppContext` owns `niaEnabled: boolean | null` — polls `/api/admin/nia-status` + subscribes to `nia_status` WS events.
- `App.tsx → NiaGlobal` reads `niaEnabled` from context; no local state.
- `TopBar.tsx` reads `niaEnabled` from context; orb is dormant (desaturated, no pulse, tooltip-on-tap) when `niaEnabled !== true`.

## The map-route bug (now fixed)
Old `NiaGlobal` did `if (niaEnabled === null || hideNiaFab) return null` which bailed out the whole component on the map route — `<NiaDrawer>` was never mounted, so `window.openNia()` from TopBar's orb fired but nothing responded.

Fix: on map route, only hide the floating FAB div; `<NiaDrawer>` stays mounted everywhere. `NiaDrawer`'s `open` prop is hard-gated on `niaEnabled === true && niaOpen` so it can never actually open while disabled.

## Backend — fail-closed everywhere
`nia-service/src/lib/db.ts` `isNiaEnabled()`:
- `row.rows.length > 0 && row.rows[0].value === "true"` (explicit true only)
- catch → `false` (DB error = disabled)
- Matches `api-server/routes/nia-proxy.ts` semantics exactly.

**Why:** Previously fail-open (`row missing → true`, `catch → true`) meant any DB hiccup at startup silently enabled Nia despite the toggle being off.

## Workers gated by kill-switch
These three check `isNiaEnabled()` at the top of each cycle and skip entirely when false:
- `ambient-presence-worker.ts`
- `general-checkin-worker.ts`
- `continuous-learning-worker.ts`

## Crisis-followup exemption (INTENTIONAL — never "fix" without deliberate decision)
`crisis-followup-worker.ts` does NOT check `isNiaEnabled()`. This is a safety decision: crisis follow-ups (48–72h gentle check-in after a hard conversation) should not be suppressed by a product-level toggle. Documented in both the worker file and `REPLIT_GODFATHER.md` section 7.

## Seed row
`nia-service/migrate.sql` now seeds `nia_enabled = 'false'` with `ON CONFLICT DO NOTHING` so "no row yet" is never an ambiguous state. Nia must be explicitly enabled by an admin.

## Deleted dead code
`artifacts/pay-it-forward/src/components/NiaGlobal.tsx` was orphaned (never imported). Deleted. The live NiaGlobal is the function inside `App.tsx`.
