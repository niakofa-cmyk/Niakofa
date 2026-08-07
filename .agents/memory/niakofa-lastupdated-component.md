---
name: Niakofa LastUpdated shared component
description: Reusable "how fresh is this" indicator for any page that polls for data.
---
- A shared `LastUpdated` component (refresh button + "Xm ago" text, switches to an amber "stale" style past a configurable threshold) exists for any page that polls for server data — reuse it rather than hand-rolling another one-off timestamp label.
- **Why:** several pages (admin live banner, Griot Globe hub panel, hub-leader dashboard) each independently invented their own "last refreshed" UI before this existed; consolidating avoids a fourth divergent implementation and keeps the "is this data current" affordance visually consistent app-wide.
- **How to apply:** any new page with a polling/background-refresh data fetch should track a `lastUpdated: Date | null` + `refreshing: boolean` state pair and render this component next to the section title, passing its own refetch function as `onRefresh`.
