# Sankofa Motion Engine (SME)
## Architecture Map — Hybrid Procedural Vector Flight Engine

The SME is a layered, 2.5D procedural bird animation system. The SVG artwork is one layer; procedural physics owns everything else.

---

## Layer Stack

```
┌─────────────────────────────────────────────────┐
│ Layer 1 — Rigged SVG (Skeleton/Bones.ts)        │
│  Pure geometry per part: wings, tail, neck,     │
│  beak, eye, egg — no shared coordinates         │
├─────────────────────────────────────────────────┤
│ Layer 2 — Rig (Skeleton/Pivots + Constraints)   │
│  13 named pivot points. Rotating the rig div    │
│  carries all children (head→beak→egg chain).   │
├─────────────────────────────────────────────────┤
│ Layer 3 — Flight Engine (Flight/*)              │
│  FlightPhysics, Banking, Glide, Hover, Wings   │
│  Inputs: speedMs, bankDeg, landingPhase…        │
├─────────────────────────────────────────────────┤
│ Layer 4 — Sensor Engine (Navigation/*)          │
│  Compass, GPSHeading, MapBearing, Altitude,    │
│  ViewSelector (360° sprite cross-fade)          │
├─────────────────────────────────────────────────┤
│ Layer 5 — Animation Mixer (Core/AnimationMixer) │◄─ NEW
│  Critically-damped spring math for all channels │
│  One shared RAF loop — no per-prop CSS easing  │
│  useAnimationMixer writes --mixer-* CSS vars    │
├─────────────────────────────────────────────────┤
│ Layer 6 — Behavior (Behavior/*)                 │
│  Idle, Landing, Aero, Search, Deliver, Takeoff │
│  Feeds continuous CSS vars, NOT FSM clips       │
├─────────────────────────────────────────────────┤
│ Layer 7 — Renderer (Core/Renderer.tsx)          │
│  Reads BirdContextValue, renders DOM+SVG tree   │
│  Reads --mixer-* CSS vars for spring-smoothed  │
│  values; direct inline values are fallback      │
└─────────────────────────────────────────────────┘
```

---

## Mixer Channels

| Channel | Spring Config | CSS Variable |
|---------|--------------|--------------|
| `bankDeg` | k=140, d=1.0 | `--mixer-bank-deg` |
| `leanDeg` | k=130, d=1.05 | `--mixer-lean-deg` |
| `headLeadDeg` | k=220, d=0.95 | `--mixer-head-lead-deg` |
| `neckCurveDeg` | k=190, d=0.98 | `--mixer-neck-curve-deg` |
| `bodyTwistDeg` | k=150, d=1.02 | `--mixer-body-twist-deg` |
| `verticalGazeDeg` | k=200, d=1.0 | `--mixer-vertical-gaze-deg` |
| `tailBendDeg` | k=160, d=0.9 | `--mixer-tail-bend-deg` |
| `leftWingExtra` | k=240, d=1.0 | `--mixer-left-wing-extra` |
| `rightWingExtra` | k=240, d=1.0 | `--mixer-right-wing-extra` |
| `insideWingTuck` | k=240, d=1.0 | `--mixer-inside-wing-tuck` |
| `screenRotationDeg` | k=150, d=1.0 | `--mixer-heading-deg` |

Wings and tail channels are snappier (high stiffness). Body and neck are heavier (lower stiffness). `tailBendDeg` has damping < 1.0 for a small rudder-flex overshoot. `screenRotationDeg` takes the shortest path through 0°/360° wrap.

---

## 3/4-View Diagonal Poses

`Skeleton/Poses.ts` defines `LEFT_45` and `RIGHT_45` — proper 3/4-view perspective poses (skew matrix, wing foreshortening) for NE/SE/SW/NW headings.

`Navigation/ViewSelector.ts` exports `computeDiagonalPoseTransform()` which returns the CSS `matrix()` transform for the current diagonal zone. `Renderer.tsx` applies this to the side-view `<g>` element, providing genuine 2.5D 3/4-view perspective at diagonal headings instead of a plain linear cross-fade.

---

## Wiring Checklist

- [x] `Compass.ts` — derives `facingRight`, `facingSign`, `headingQuadrant`
- [x] `GPSHeading.ts` — consumes `heading` prop (from Mapbox marker) + `mapBearing`
- [x] `MapBearing.ts` — `computeScreenRotation` used in GPSHeading + Bird.tsx
- [x] `Context.tsx` — updates every render from live sensor + physics values
- [x] `Renderer.tsx` — binds computed values to SVG transforms + CSS vars
- [x] `AnimationMixer.ts` — single spring physics loop (Layer 5)
- [x] `useAnimationMixer.ts` — RAF hook writing `--mixer-*` CSS vars to rig ref
- [x] `Bird.tsx` — calls `useAnimationMixer` with all kinematic targets
- [x] `Poses.ts` LEFT_45/RIGHT_45 — wired via `computeDiagonalPoseTransform()`

---

## Battery-Saver / Reduced-Motion Path

When `batterySaver=true` or `prefers-reduced-motion`:
- `useAnimationMixer({ enabled: false })` writes targets straight through — no RAF loop, zero physics cost
- Existing CSS `transition:` declarations in `Effects/Animations/` act as the graceful fallback
- The spring stiffness/damping values are tuned starting points; adjust by eye after first integration
