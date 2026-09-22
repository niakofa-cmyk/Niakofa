---
name: Niakofa SankofaBird error boundary pattern
description: SankofaBird must be wrapped in ErrorBoundary in both map screens; fallback is a teal dot.
---

## Rule

`<SankofaBird>` is wrapped in `<ErrorBoundary fallback={<div className="w-3 h-3 rounded-full bg-primary shadow-[0_0_8px_rgba(0,212,255,0.9)]" />}>` in **both**:
- `artifacts/pay-it-forward/src/pages/map.tsx` — inside the main map Marker
- `artifacts/pay-it-forward/src/pages/request-active.tsx` — inside the navigation Marker

**Why:** SankofaBird is a complex SVG+CSS component. If a CSS animation, SVG path, or RAF loop throws, the global ErrorBoundary (App.tsx) would unmount the entire app. The component-level boundary constrains failure to a teal dot fallback — map and navigation remain usable.

**How to apply:** Any new render site for `<SankofaBird>` must also wrap it in `<ErrorBoundary fallback={...}>`. Import from `@/components/ErrorBoundary`.

## Keyframe inventory (all defined inside SankofaBird.tsx's `<style>` block)
All these `@keyframes` exist and match their `animation:` references:
`sankofa-float`, `sankofa-flap`, `sankofa-flap-right`, `sankofa-flap-banked-left`, `sankofa-flap-banked-right`, `sankofa-glide`, `sankofa-glide-wing-left`, `sankofa-glide-wing-right`, `sankofa-tail-sway`, `sankofa-tail-bank`, `sankofa-neck-flex`, `sankofa-blink`, `sankofa-iridescent`, `sankofa-trail-fade`, `sankofa-burst`, `sankofa-golden-burst`, `sankofa-egg-glow`, `sankofa-egg-glow-gold`, `sankofa-heart-pulse-ring`, `sankofa-hop`, `sankofa-perch`, `sankofa-shimmer`, `sankofa-head-tilt`, `sankofa-wing-flick`, `sankofa-wing-stretch-left`, `sankofa-wing-stretch-right`, `sankofa-legs-perch`, `sankofa-legs-step`, `sankofa-legs-dangle`, `sankofa-legs-land`.

Note: `sankofa-heart-pulse`, `sankofa-particle`, `sankofa-golden-sparkle` are CSS **class names**, not keyframe names — they reference `sankofa-heart-pulse-ring` etc. as their animation target.
