---
name: Niakofa SankofaBird Phase 11
description: Gap-closure finalization (P11): battery-saver idle-settle guard, nav-lod opacity fixes, helping full-body crane, wing-tip flex, crown sway tiers, GPU promotion, mid-zoom shimmer.
---

# SankofaBird Phase 11 — Finalization

## Key rules

- **Idle-settle battery guard**: selector must be `:not([data-battery-saver="true"])` or the `sankofa-idle-settle` animation on the rig element conflicts with `sankofa-lod3-enter` from P7.5 — two animation values clobber each other.

- **nav-lod=2 trail + body-feather**: MUST use `opacity:0 !important; pointer-events:none; transition:opacity 0.55s ease-out` — NOT `display:none` which causes an instant visual pop on long navigation sessions.

- **Helping body lean uses `rotate:` individual property** (not `transform:` shorthand) so it composes additively with E7/P8.1 banking `rotate:`. Body and tail both lean when `data-helping="true"`. Return-to-zero rules for head/neck needed (`:not([data-helping])` selector).

- **Wing-tip flex**: `sankofa-wingtip-flex` keyframe on `.sankofa-feather-l4/.sankofa-feather-r4` at `data-speed="driving"` and `data-speed="airplane"`. Right wing has +20ms phase offset.

- **Crown sway speed tiers**: quiet=5.2s, normal=3.6s (explicit baseline added in P11), busy=2.4s, peak=1.6s/1.1s. During helping, crown speed forced to 2.0s (alert posture). All via `animation-duration: Xs !important`.

- **Mid-zoom helping neck**: uses `translate:` individual property (not `transform:`) — `@supports (translate: 0px)` guard required.

- **will-change promotion**: `will-change: transform` on wing+body during `data-flying="true"`, `will-change: auto` when perched (must release layer or memory climbs on long idle sessions).

- **Safari @property fallback**: all `@property` custom vars have `initial-value` and all use sites have `var(--prop, safe-fallback)`. No breakage on browsers that don't support `@property`.

**Why:** CSS individual transform properties (`rotate:`, `translate:`, `scale:`) compose additively — using `transform:` shorthand anywhere in the same cascade replaces the prior shorthand, not composes. Always use individual properties for multi-source transforms (banking + helping + glide-pitch).
