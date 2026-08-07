---
name: Niakofa SankofaBird night-mode solar wiring
description: How useTimeOfDay hook drives SankofaBird nightMode prop — algorithm, CSS, and bidirectional transition pattern.
---

## Rule
The SankofaBird nightMode prop is driven by `useTimeOfDay(lat, lng)` — a pure-math solar position hook. No external API needed.

**Why:** nightMode CSS filter is already in SankofaBirdSvg.tsx. The hook just auto-toggles the prop from the live GPS coordinates.

## How to apply
- Hook: `artifacts/pay-it-forward/src/hooks/useTimeOfDay.ts`
  - NOAA solar position algorithm (Jean Meeus), civil twilight threshold −6°, recalculates every 60 s
  - Returns `boolean` — `true` = night
- Usage: `const isNight = useTimeOfDay(myLocation?.lat ?? null, myLocation?.lng ?? null)`
- Wire: pass `nightMode={isNight}` to every `<SankofaBird>` call site
  - map.tsx: 2 instances (idle fallback + GPS marker)
  - request-active.tsx: 2 instances (token-missing fallback + navigation marker)

## CSS details
- Night palette: `hue-rotate(22deg) saturate(0.58) brightness(0.65) !important`
- Celebrating override: `saturate(0.82) brightness(0.80)` (higher specificity, same hue-rotate)
- Donated override: `hue-rotate(12deg) saturate(0.72) brightness(0.74)`
- Bidirectional transition: base `.sankofa-bird-rig { transition: filter 1.8s ease-in-out }` — MUST be on the base class, not only on the `[data-night-mode="true"]` rule, or night→day snaps instantly on some browsers
- Reduced-motion: `.sankofa-bird-rig { transition: filter 0s !important }` in the existing `@media (prefers-reduced-motion: reduce)` block (around line 6181 in SankofaBirdSvg.tsx)

## Solar math verification (Fort Worth TX, July 18 2026)
- Noon CDT: +65.7° → day ✓
- 8:30 PM CDT (sunset): +0.5° → day ✓
- 9:00 PM CDT (civil twilight): −5.2° → day (not yet −6°) ✓ — switches around 9:07 PM
- Midnight CDT: −31.7° → night ✓

## Test harness
- `/bird-test` has NightModeDemo section with ☀️/🌙 toggle
- BirdCard accepts `nightMode?: boolean` prop; also darkens card background in night state
