---
name: Niakofa admin two-level nav redesign
description: Group-pill + sub-tab + swipe admin nav — architecture, hook-order pitfall, and constraints.
---

Admin bottom nav is two levels instead of one flat 15-tab scrollable strip:
- Level 1: 4 always-visible group pills (Trust & Safety / Finance / Intelligence / Configure), driven by `TAB_GROUPS` (tab key → group number) and `GROUP_INFO` (group number → label/icon).
- Level 2: a short (3-5 item) sub-tab row for only the active group's own tabs (`tabsInActiveGroup`), plus position dots.
- Swiping left/right on the tab-content area moves between tabs *within the current group only* (`swipeWithinGroup`, clamped at both ends — never wraps into an adjacent group). Crossing groups is a deliberate tap on a pill.
- `lastTabInGroupRef` remembers the last-viewed tab per group so switching groups and back doesn't reset to that group's first tab.

**Why this version, not others:** a large uploaded "admin redesign" zip turned out to be a full historical repo snapshot containing multiple superseded drafts of this same feature (an early one with a "More" grid + `react-swipeable` + haptics, and a final simpler one with just group-pills/sub-tabs/touch-delta swipe). Diffed the zip's admin.tsx directly against the live repo's and ported that exact, already-working diff rather than a hand-rolled reimplementation or the more elaborate earlier draft.

**Hook-order pitfall (hit and fixed):** the admin component has an early `if (!authed) return (...)` gate before the tab-nav code. The nav redesign's `useRef`/`useState` hooks (`lastTabInGroupRef`, `swipeDirection`, `swipeTouchStart`) must be declared *above* that gate, right alongside the existing `activeTab` useState — not down near `TAB_GROUPS`/`TABS` (which is *after* the gate). Declaring hook calls after a conditional early return causes "Rendered more hooks than during the previous render" the moment the gate's condition flips (logged-out → logged-in). Only the hooks themselves need to move; derived consts/functions that use them (`activeGroup`, `goToGroup`, `swipeWithinGroup`, etc.) are fine staying below since they aren't hooks.

**Untouched by design:** `AdminLiveBanner.onNavigate` and `SettingsTab.onNavigate` still call raw `setActiveTab` directly (not the tracked `setActiveTabTracked`) — this is intentional per the original implementation, don't "fix" it.

See also [Niakofa MapControlsPanel consolidation](niakofa-map-controls-panel.md) for a related bottom-nav-clearance bug fixed in the same session.
