---
name: Niakofa React Query "flash to empty" fix
description: App-wide keepPreviousData/gcTime defaults + a GPS query-center debounce hook + a last-good-value fallback hook, for any screen whose data seems to "disappear" briefly.
---

Root cause of several "my data disappeared" reports: not real data loss, but React
Query defaulting to `data: undefined` for one render whenever a query's params/key
change (mode toggle, filter change, pagination) or a query is garbage-collected after
being unmounted a few minutes — every `const { data: foo = [] } = useX()` then renders
an empty list for a moment.

**Why:** default `QueryClient` had no `placeholderData` and the library's 5-minute
`gcTime`; live GPS coordinates driving the map's four nearby-* queries also changed the
query cache key on nearly every render while the user moved, since raw lat/lng went
straight into the queryKey.

**How to apply — three pieces, compose per screen:**
1. App-wide `QueryClient` defaults (`artifacts/pay-it-forward/src/App.tsx`):
   `placeholderData: keepPreviousData` + `gcTime: 10 * 60 * 1000`. Covers ordinary
   param/filter changes and short navigation-away-and-back gaps for every query.
2. `useStableCenter(center, { precision, debounceMs })` (`src/hooks/useStableCenter.ts`):
   round + debounce a live GPS/location value before it's used as a query key. Use for
   any query keyed off a coordinate that updates continuously (map nearby-* queries used
   precision 3 / 4000ms); do NOT use it for the rendered map camera itself, only the
   query params — the map should still track the raw position live.
3. `useResilientData(query, fallback)` (`src/hooks/useResilientData.ts`): keeps the last
   *successful* value and returns it instead of `undefined` when a refetch errors —
   `placeholderData` alone only bridges pending fetches, not failed ones.

Left deliberately unfixed: `useGetRoute` (turn-by-turn navigation) — it needs a much
shorter, driving-appropriate debounce than the 3-4s used for the other four queries, so
it wasn't force-fit into `useStableCenter` (tracked as a follow-up).
