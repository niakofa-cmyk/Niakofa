---
name: Niakofa TopBar icon-only + BestMatchCard collapsible badge
description: TopBar SOS/helper-toggle/search-pill are icon+aria-label only (no visible text); BestMatchCard starts as a tap-to-expand badge, not a permanent card.
---

Per a mobile-UX pain-points pass: persistent TopBar chrome (SOS button,
helper-online toggle, community "Search this area" pill) was converted from
icon+visible-text to icon-only, matching MapControlsPanel's existing
icon+aria-label+title convention (w-10 h-10 rounded-full, `aria-label` for
screen readers, `title` for the native hover tooltip). Contextual one-off
action prompts (e.g. the `mapStatus` "search-this-area" banner that only
appears after panning the map) were deliberately left with visible text —
the icon-only rule is for chrome that's always on screen, not transient CTAs.

BestMatchCard now defaults to a collapsed pill badge (icon + "Best Match" +
truncated title + chevron) and only renders the full card with details/Accept
button after an explicit tap; a chevron-down button re-collapses it without
dismissing it (dismiss "X" still fully removes it). map.tsx passes
`key={bestMatch.id}` so a new best-match request resets back to the collapsed
badge rather than inheriting the previous one's expanded state.

**Why:** the map screen was accumulating always-expanded floating chrome
(banners, stats, best-match card) that fought the pin layer for attention;
collapsing non-essential elements to badges/icons by default, expandable on
demand, was the agreed de-stacking strategy.

**How to apply:** any new persistent floating UI added to the map screen
should default to its most compact form (icon or badge) and only expand on
explicit user action, following this same pattern rather than a new one.
