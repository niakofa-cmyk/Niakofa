---
name: Niakofa Heading-Up navigation fix
description: Root causes and fix approach for the "Heading Up" map mode jumping/malfunctioning bug; GPS+compass fusion architecture.
---

## Root causes of the Heading-Up jump/malfunction bug

1. **Competing animations**: every compass tick (20–60/sec) fired a fresh `map.easeTo({ bearing })`, each interrupting the previous mid-flight. Fixed by decoupling "heading updates a target ref" from "camera moves" — a single `requestAnimationFrame` loop steps the actual bearing toward the target at a capped deg/frame via `map.jumpTo` (no tween queue, can't stack with itself).
2. **Magnetometer-only heading**: compass alone is unreliable in vehicles (metal interference). Fixed via a speed-weighted complementary filter fusing compass with GPS course-over-ground (`myLocation.heading`/`.speed`, already computed in AppContext) — GPS dominates above ~2.5 m/s, compass dominates near-stationary.
3. **Double conflicting `deviceorientation`/`deviceorientationabsolute` listeners**: both were registered simultaneously on Android, racing each other. Fixed by latching onto whichever source fires first per session and ignoring the other.
4. **No screen-orientation compensation or smoothing**: raw `alpha` snaps 90–270° on screen rotation and is noisy. Fixed by subtracting `screen.orientation.angle` and applying circular (mod-360-safe) EMA smoothing.

## Architecture

- `lib/heading-math.ts` — shared circular-angle math (`shortestDelta`, `stepToward`, `smoothHeading`, `weightedCircularMean`). Every heading bug traced back to plain (non-circular) arithmetic breaking at the 359°/0° wrap — centralize here, don't reimplement per-hook.
- `hooks/useDeviceHeading.ts` — raw compass only (source-latched, screen-compensated, smoothed).
- `hooks/useFusedHeading.ts` — blends `useDeviceHeading()` output with GPS heading/speed input; this is what map.tsx should consume for navigation heading, not the raw compass hook directly.
- `hooks/useMapOrientation.ts` — owns the rAF-driven camera-follow loop; also detects user-initiated `rotatestart` to pause auto-follow (`followPaused`/`resumeFollow`), matching Google Maps/Waze UX.

**Why:** any page that wires up heading-up mode should use `useFusedHeading` (not raw `useDeviceHeading`) fed with `myLocation.heading`/`.speed` from AppContext — otherwise it inherits the same vehicle-unreliability problem `useFusedHeading` exists to solve.

**How to apply:** `request-active.tsx` still uses the older `useDeviceHeading`+`useMapOrientation(rawMapRef)` pair directly (not yet migrated to fused heading as of 2026-07-04) — migrate it the same way as `map.tsx` if its heading-up mode is ever reported as jumpy too.

## Stretch ideas not yet implemented (from user's fix-package doc)
- Gyro dead-reckoning between GPS fixes (devicemotion rotation-rate integration) for smooth mid-corner turning.
- Speed-adaptive camera pitch/zoom (pull back + flatten at highway speed).
- Lane-level guidance via Mapbox Directions `bannerInstructions` in `TurnArrowHUD.tsx`.
- Crowd-sourced traffic/hazard detection from helper GPS speed drops over the existing WebSocket stream.
