---
name: Niakofa BottomSheet collapse pattern
description: How the map's helper-mode BottomSheet collapses/expands and coexists with other floating map UI; use this pattern for any future draggable sheet.
---

## Pattern

`BottomSheet.tsx` on the map screen defaults to a **collapsed** 96px peek
(handle + header + count) instead of an always-expanded panel. It expands via:
- Tap/keyboard on the handle or header (`role="button"`, `aria-expanded`).
- Drag past a distance/velocity threshold (`useDragControls` + `dragListener={false}`
  so only the handle initiates drag, not the whole card / its buttons).
- Automatically, when a **new** emergency request appears while collapsed
  (tracked via a joined-IDs string ref so it only fires once per new
  emergency, not on every re-render).

**Why:** an always-expanded sheet permanently covered the Filters/Layers and
Orientation/Recenter control rows floating above it whenever a helper was
online with nearby requests — those rows became unreachable.

**How to apply:** any new draggable/collapsible overlay on the map should
follow this same shape (collapsed peek height, drag-handle-only listener,
auto-expand only for genuinely urgent content) rather than defaulting open.

## Defense in depth: z-index layering

The persistent Filters/Layers (`bottom-32`) and Orientation/Recenter
(`bottom-48`) control rows are `z-30`; BottomSheet and BestMatchCard are
`z-20`. This is a deliberate belt-and-suspenders rule: **any future
absolutely-positioned overlay on the map screen must stay below z-30**, or
it will cover these two rows again regardless of its own collapse/dismiss
logic.

## BestMatchCard + BottomSheet coexistence

They used to be mutually exclusive (`!showBestMatch` gated the sheet) to
avoid covering each other. Once the sheet defaults to a small collapsed
peek, there's no real overlap — both are now rendered simultaneously. Do not
reintroduce an either/or gate between them without re-checking the pixel
math (BestMatchCard sits at `bottom-44`, sheet's collapsed peek is 96px from
`bottom-16`).

## Pin-to-card linking

Tapping a `RequestMarker` calls an `onSelect(id)` prop that sets
`highlightedRequestId` in `map.tsx`, passed into `BottomSheet`. The sheet
auto-expands and scrolls that card into view (`scrollIntoView` after a short
timeout to let the expand animation settle) with a highlighted border — so a
pin tap is never a dead end even though the sheet defaults collapsed.
Non-helper-mode pin taps (no sheet at all) get their own "View details"
button in the marker's own tooltip instead.

## Marker touch targets & memoization

`RequestMarker`/`HelperMarker` visuals stay their original 32/40px size, but
are wrapped in an invisible 44×44px hit box (WCAG 2.5.5) — pad the wrapper,
don't scale the glyph. Both are now `React.memo`'d with a narrow field-level
comparator (id/lat/lng/urgency/status/etc.) since WS ticks (`helper_location`
in particular) fire far more often than anything visually relevant to a
given marker actually changes.
