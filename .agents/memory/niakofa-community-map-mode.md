---
name: Niakofa community map mode
description: How the non-helper (community/requester) map experience is split from helper mode — TopBar branching, mode-aware shared components, and where the split is still incomplete.
---

The map/list screen has two fully distinct data domains gated on `helperModeActive`, not on ad hoc feature flags:

- **Helper mode** (unchanged): open help requests (clusters/heatmap/pins), `BottomSheet`, `RequestListView`, urgency+category filters, SOS button, and the helper on/off toggle occupy the TopBar center slot.
- **Community mode** (`!helperModeActive`): online helpers + civic needs + civic resources/help centers render instead of requests. `CommunityBottomSheet`/`CommunityListView` replace the request-only versions. TopBar's left slot becomes a Civic Portal icon (→ `/civic-needs`) instead of SOS, and center becomes a "Search this area" pill instead of the Nia orb — but only when helper mode is OFF; the helper on/off toggle always wins the center slot when helper mode is ON, by design (not a bug if a test expects the Nia orb there while helper mode is active).

**Pattern used**: shared chrome components (`TopBar`, `MapControlsPanel`) got an optional prop (`communityMapMode` / `mode: "helper" | "community"`, default preserves old behavior) rather than new components, since they're one shared strip either way. Data-shaped surfaces (bottom sheet, list view, markers, detail sheet) got **new sibling components** instead of branching inside the existing ones — request/need/resource/helper row shapes, sort keys, and tap targets differ enough that a shared abstraction would need as many branches as separate files. Resources have no dedicated detail page (unlike needs → `/civic-needs?need=id`), so they open a lightweight read-only `ResourceDetailSheet` (Drawer) instead.

**Known gap**: the no-WebGL/token-missing fallback screen in map.tsx still always renders the open-requests list regardless of mode — the one place the community/helper split isn't wired through (tracked as a follow-up, not yet fixed).

**Deep-link pattern reused**: `/civic-needs?need=<id>` follows the same "read `window.location.search` on mount, not Wouter's `useLocation`" convention as other query-param deep links in this app (see niakofa-wouter-location memory) — scroll-into-view + highlight ring on the matching card once loaded.
