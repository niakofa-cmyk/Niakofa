---
name: Niakofa SankofaBird spec-align Jul 2026
description: Official SVG asset pipeline spec changes — palette, wing/tail deformation, snap saccade, favicon grouping.
---

# Niakofa SankofaBird — Spec Alignment (Jul 2026)

Implemented from the official Sankofa Bird SVG Asset Pipeline reference image.

## 1. Official color palette

**Why:** Old palette used `hsl(190, ...)` (blue-cyan, `#00D4FF` family). Spec shows `#0FE5D4` (hue ≈174, teal-green). This is a perceptible color shift.

**Official palette:**
```
#0FE5D4 — primary teal (bright face-up)    hsl(174, 91%, 47%)
#2B83AB — mid blue-teal (coverts)          hsl(202, 60%, 42%)
#0D77AA — deeper blue-teal (undersides)    hsl(203, 87%, 36%)
#095E5A — shadow teal (body underside)     hsl(178, 83%, 20%)
#062E2E — dark teal (deep shadow)          hsl(180, 77%, 10%)
#041819 — near-black teal (beak/claws)     hsl(183, 72%,  6%)
```

**Note:** Inline anatomy components (Head.tsx, Body.tsx etc.) still use some hardcoded `hsl(190, ...)`; the shared gradients and Phase 22 luminary layers now use the official palette. Keep future visual edits on the shared palette rather than reintroducing the retired blue-cyan stops.

## Low-end rendering rule

Phase 22 shimmer and celebration effects use opacity-only animation with compositor hints. Do not animate SVG `filter`, `hue-rotate`, or `drop-shadow` in the live-map bird; those effects can invalidate SVG paint every frame and flicker on older iOS/Android GPUs. Battery-saver and reduced-motion must hold luminary layers at rest opacity.

**Why:** The bird runs inside a moving Mapbox marker, so repeated filter repainting compounds with map rendering and produces visible flicker or frame drops on low-end phones.

**How to apply:** Add new glow through pre-rendered gradients and opacity transitions/keyframes, and gate it with `data-battery-saver` plus reduced-motion rules.

## Controlled iridescence

**Rule:** Keep feather iridescence inside the cyan, turquoise, and emerald families; select neighboring gradient variants from discrete heading quadrants and modulate sheen with the existing lighting factor. Do not use rainbow-spectrum stops or per-frame hue-rotate animation for the live-map bird.

**Why:** The intended effect is authentic structural coloration that responds to rotation and virtual light, while avoiding a psychedelic rainbow look and repeated SVG filter repainting on mobile GPUs.

**How to apply:** Put new color variants in the shared SVG gradient definitions, apply them to active feather-edge layers, and preserve battery-saver/reduced-motion guards.

## 2. Wing / tail deformation system (Phase 20B)

**Why:** Spec defines 5 wing poses and 4 tail poses as the official animation states. Nothing was wired.

**Wing poses** (`data-wing-pose`):
- `up` — high stretch / hover (slow hover, altitude gain)
- `mid` — relaxed cruise (default — no extra transform)
- `down` — power stroke (fast flap, dive)
- `forward` — braking (landing slow-flap, perch approach)
- `back` — glide (wings swept back)

**Tail poses** (`data-tail-pose`):
- `flare` — wide steering (banking turns > 22°)
- `narrow` — high-speed tuck (speedMs > 18)
- `folded` — braking (slowflap / perch)
- `stream` — default glide

**Computation in Bird.tsx** (after flight physics, before ctx build):
```ts
// wingPose
isGliding → "back"
landingPhase === "dive" → "down"
landingPhase === "slowflap" | "hover" | "perch" → "forward"
isMoving && speedMs <= 4 → "up"
default → "mid"

// tailPose
landingPhase === "slowflap" | "perch" → "folded"
Math.abs(effectiveBankDeg) > 22 && isMoving → "flare"
isGliding → "stream"
speedMs > 18 → "narrow"
default → "stream"
```

**Files changed:**
- `Core/Context.tsx` — `wingPose` + `tailPose` added to `BirdContextValue`
- `Core/Bird.tsx` — computation + ctx passthrough
- `Core/Renderer.tsx` — `data-wing-pose` + `data-tail-pose` attrs
- `Effects/Animations/phase-14-19.ts` — Phase 20B CSS block: 4 wing keyframes + 4 tail keyframes; battery-saver + reduced-motion guards

**Note:** `LandingPhase` valid values are `"flying"|"dive"|"slowflap"|"hover"|"perch"|"idle"|"takeoff"` — no `"stall"`.

## 3. Snap-hold-snap saccade (Phase 20+)

**Why:** Old idle used 3-6s smooth CSS transitions. Real birds snap instantly (saccade) and hold 500-1600ms.

**Key changes:**
- `Behavior/Idle.ts` — self-scheduling timer (not dep on `saccadePhase`); 80ms `saccadeSnapping` flag; 18% double-take probability; tier-scaled dwell (quiet: 900-1600ms, peak: 400-700ms)
- `Core/Context.tsx` — `saccadeSnapping: boolean` added
- `Core/Renderer.tsx` — `data-gaze-snap` attr; `saccadeSnapping` destructured from `useBird()`
- `Effects/Animations/phase-12-13.ts` — CSS block suppresses head/neck/iris transitions to 0ms when `data-gaze-snap="true"`

## 4. favicon.svg grouping

Restructured flat favicon.svg into proper `<g id>` hierarchy matching spec layer map:
```
#sankofa-root → #legs, #tail, #body → #wing, #neck → #head
```
Each group has `data-pivot` for future JS-driven animation.

## Independent rectrix fan

The tail parent owns the broad pose and rudder bend; individual inner, outer,
and far rectrices own the finer fan motion. Braking uses a staggered
center-to-far drag wave, while banking widens the outside side and tucks the
inside side. Keep explicit signed keyframes for Safari SVG compositor
compatibility, and preserve battery-saver/reduced-motion guards.
