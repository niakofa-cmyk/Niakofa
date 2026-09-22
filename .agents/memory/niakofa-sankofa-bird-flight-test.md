---
name: Niakofa SankofaBird flight test harness
description: /bird-test page — visual QA route for all SankofaBird flight states; bugs found and fixed across multiple sessions; key rules about bankDeg and transform-box.
---

## /bird-test route

Public route (no auth) that renders SankofaBird in every flight state simultaneously.
Added to App.tsx via the `window.location.pathname` bypass pattern (same as /status and /impact).
Route component: `artifacts/pay-it-forward/src/pages/bird-test.tsx`.

**Sections on the page:**
- Static flight states: idle, idle-north, walking (1.4 m/s), running (5 m/s), driving (14 m/s), gliding (55 m/s), heading-up
- Banking (live): BankingLeftDemo, BankingRightDemo, BankSweepDemo — all use dynamic heading changes
- Micro-reactions (auto-cycling every 3.2s): celebrating, newNotification, accepted, donated
- Dynamic demos (live JS timers): landing sequence, 360° heading sweep, speed ramp 0→60 m/s
- Size comparison: 24/34/48/64px

**Key use:** visit `/bird-test` in dev to visually verify any SankofaBird change without needing GPS or a live server.

## Critical rule: bankDeg needs heading CHANGES, not static values

`bankDeg` inside `SankofaBird` is computed from the DELTA between successive `heading` prop values (via a `useEffect` with `lastHeadingRef`). A static `heading={300}` prop never changes, so `bankDeg` stays 0 forever — the bird shows zero banking regardless of the heading value.

**How to apply:** any test or demo that wants to show banking MUST cycle the heading prop dynamically (setTimeout/setInterval). Static cards in the test harness always have bankDeg=0.

**What we fixed:** original "Banking Left" and "Banking Right" static cards passed fixed headings — they showed zero banking and were misleading. Replaced with `BankingLeftDemo` and `BankingRightDemo` that cycle straight→turn→straight via setTimeout.

**BankSweepDemo:** must use small per-tick increments (2°/50ms) to keep banking visible. If you jump heading by ±30° every 1.2s, the 700ms bank decay means the bank disappears before the next change fires — effectively invisible. Continuous small increments keep bankDeg renewed.

## Critical rule: transform-box: view-box on SVG CSS classes

CSS `transform-origin` pixel values on SVG elements default to `fill-box` (element's bounding box) in some browsers, NOT the SVG viewBox. For `<path>` elements this makes pivot points wrong — `transform-origin: 20px 18px` means 20px from the LEFT EDGE OF THAT PATH'S BOUNDING BOX, not from the SVG origin.

**Fix applied (July 15):** Added `transform-box: view-box` to all 8 affected CSS classes:
- `.sankofa-bird-wing-left/right`
- `.sankofa-bird-wing-left/right-feathers`
- `.sankofa-bird-tail`
- `.sankofa-bird-neck`
- `.sankofa-bird-legs`
- `.sankofa-bird-rig[data-notification="true"] .sankofa-bird-head`

**How to apply:** any new SVG CSS class with pixel `transform-origin` must also have `transform-box: view-box`. Percentage values (50% 62%) don't need it.

## LandingDemo timer pattern

All setTimeouts must be stored in a `useRef<ReturnType<typeof setTimeout>[]>` array and cleared on cleanup. The original single `t` ref only cleared the LAST scheduled timeout — 3 of 4 leaked on unmount.

```tsx
const timers = useRef<...[]>([]);
function schedule(fn, ms) {
  const t = setTimeout(fn, ms);
  timers.current.push(t);
  return t;
}
return () => { timers.current.forEach(clearTimeout); };
```

## Fixes applied across sessions (commits b162f7ce → 197d6d3a)

### Session 1 (41b61110)
- Banked wing keyframes ±15° matched to idle amplitude
- Wing flick/stretch start angles corrected to ±15°
- Burst particle `--deg` CSS var fix (teal + golden) — inline transform overridden by animation

### Session 2 (b162f7ce)
- Trail particles persist during `slowflap` landing phase
- `will-change: transform` on rig div for GPU compositing
- Removed redundant body `transform` property (caused flash-on-start in some browsers)
- `useEffect return undefined` TS7030 fix
- `requests-browse.tsx` + `wallet.tsx`: `keepPreviousData` type fix

### Session 3 (197d6d3a)
- `transform-box: view-box` on all 8 SVG CSS classes (cross-browser pivot correctness)
- Banking demos replaced with live BankingLeftDemo/BankingRightDemo/BankSweepDemo
- LandingDemo timer leak fixed
- Unused `tick` state removed

## What the bank angle looks like visually

- bankDeg > 0 (turning right): left (outside) wing extends higher amplitude, right (inside) folds
- bankDeg < 0 (turning left): right (outside) wing extends, left (inside) folds
- Tail bends toward turn direction (`tailBendDeg = bankDeg * 0.6`)
- Bank decays to 0 after 700ms with no new heading change
- Max ±25°, scaled `delta * 2.8`
- The egg counter-rotates by `-bankDeg` to stay perfectly level in the beak at all times
