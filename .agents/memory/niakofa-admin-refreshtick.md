---
name: Niakofa admin refreshTick real polling
description: How refreshTick drives live data refresh in admin tabs
---

## Rule
`refreshTick` from the admin parent component MUST be passed as a prop to every tab that shows live data, and MUST appear in the tab's `useEffect` dependency array.

**Without this the pulsing "LIVE" dot is purely cosmetic — tabs never refetch.**

## Affected components (as of July 7 2026)
- `UsersTab` — accepts `refreshTick?: number`, included in `useEffect` deps for user list + pending counts
- `ReportsTab` — accepts `refreshTick?: number`, included in `useEffect` deps for report list
- `UserReportsSection` — accepts `refreshTick?: number`, included in `useEffect` deps for user reports

## Pattern
```tsx
// In the tab component:
function UsersTab({ refreshTick }: { refreshTick?: number }) {
  useEffect(() => {
    fetchData();
  }, [refreshTick]); // <-- critical: include refreshTick
}

// In admin parent:
<UsersTab refreshTick={refreshTick} />
```

**Why:** The `refreshTick` counter increments every 30s in the admin parent. Without it in deps, the effect runs once on mount and never again on the live tick.
