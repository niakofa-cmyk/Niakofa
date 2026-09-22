---
name: Niakofa SankofaBird approach-animation hardening
description: GPS hysteresis, descent bob amplitude, trail transition, reduced-motion, timer leak — all applied July 2026
---

## Rules

**Lighting vs iridescence CSS vars are intentionally different:**
- `--lighting-factor` uses raw world-frame `heading` (sun is fixed at NW 315° in reality)
- `--heading-deg` uses `screenRotationDeg` (iridescence is a viewer-angle effect, correct to use screen-relative)
- Never "fix" `--heading-deg` to raw heading — it would break iridescence on heading-up maps

**Why:** These are two different physical effects with different reference frames. The lighting bug
that was fixed was specifically `--lighting-factor`; `--heading-deg` was always correct.

## GPS Hysteresis (enter ≤50m, exit >60m)

Both `request-active.tsx` and `map.tsx` use a 10m hysteresis band for `birdApproaching`:
```js
setBirdApproaching(prev => {
  if (!prev && dist <= 50) return true;
  if (prev && dist > 60) return false;
  return prev;
});
```

**Why:** Phone GPS noise is ~3–8m CEP. Without hysteresis, jitter right at the 50m boundary
toggles the approach animation on/off every position fix — the bird flickers between normal
flight and approach deceleration. 10m band absorbs noise while clearing promptly.

**How to apply:** Any new approaching threshold (NavigationOverlay, civic mode, etc.) should
use the same pattern with functional setState.

## Approach descent bob amplitude

`sankofa-approach-descent` keyframe peaks at 2.5px (was 1.8px). At 1.8px on a 34px marker,
the bob was invisible at arm's length on a phone screen. 2.5px is the minimum visually
perceptible amplitude at normal viewing distance.

## Trail opacity transition

`.sankofa-trail` has `transition: opacity 0.6s ease-out` so the opacity change when
`data-approaching` fires is a smooth fade, not a snap.

## prefers-reduced-motion coverage gap (fixed)

The generic reduced-motion block suppresses child elements by class name but NOT the rig
element itself. `.sankofa-bird-rig[data-approaching="true"]` has an animation ON THE RIG
that must be explicitly suppressed:
```css
@media (prefers-reduced-motion: reduce) {
  .sankofa-bird-rig[data-approaching="true"] { animation: none !important; }
}
```
**How to apply:** Any future rig-level animation (not on a child element) needs the same
explicit entry in the reduced-motion block.

## ApproachingDemo timer pattern (bird-test.tsx)

Must use closure-scoped vars, not return values, so both farTimer and nearTimer are
reachable from the cleanup function. The old pattern returned nearTimer from the farTimer
callback where it was never accessible to the cleanup.
