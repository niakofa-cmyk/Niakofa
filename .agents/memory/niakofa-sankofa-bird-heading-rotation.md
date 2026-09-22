---
name: Niakofa SankofaBird heading rotation — upright-body design
description: How the bird's directional heading is expressed; why full rotate() is wrong for a side-profile bird; the correct scaleX approach.
---

## Rule
Never apply full `rotate()` to the `.sankofa-bird-heading-wrapper` `<g>`.  
The bird SVG is a **side-profile flying bird** with the head on the LEFT side in SVG coords. Rotating the entire anatomy 180° (east heading) makes the belly face up — the bird appears upside-down. At 270° (south) it is fully inverted.

## Correct design (Phase 19 upright-body intent)
Direction of travel is communicated by **four independent channels**, never by body rotation:

1. **`scaleX` flip** on `.sankofa-bird-heading-wrapper`:
   - `scaleX(-1)` when `facingRight=true` (screenRotationDeg 10°–170°, i.e. east-half headings)
   - `scaleX(+1)` otherwise (west-half, N, S — bird naturally faces left in SVG)
   - `0.38s cubic-bezier(0.45,0,0.55,1)` transition makes it look like banking
   - `transition: none` when `batterySaver=true` or `navLod >= 2`

2. **Gaze system** (`--gaze-rotate-deg`) — head element turns toward the heading direction (already computed by `computeGazeRotateDeg()` in `sankofa-bird-math.ts`)

3. **Body banking** (`effectiveBankDeg ±25°` on `.sankofa-bird-rig`) — lean into turns

4. **`data-heading-quadrant` CSS posture** (phase-14-19.ts P19.1/P19.2):
   - N/NE/NW: neck cranes forward (−1.5° / −0.8°)
   - S/SE/SW: head dips + tail fans (scaleX 1.06 / 1.03)
   - E/W: scaleX flip is the sole cue; no extra rules needed

## facingRight signal (from Compass.ts)
```ts
const rawFacingRight = hasHeading && screenRotationDeg > 10 && screenRotationDeg < 170;
```
- `facingSign = facingRight ? -1 : 1` — negates `--head-lead-deg` and `--neck-curve-deg` inside the mirrored `<g>` coordinate space so forward is always "toward heading"

## Why not full rotate()
- Works for top-down arrow/chevron icons (rotationally symmetric)
- Fails for side-profile birds: belly/back axis gets inverted at east/south headings
- `cumulativeHeadingRef` (unwrapped cumulative for smooth U-turns) was only used by the now-removed rotate() path — no longer passed to `Renderer`

**Why:** User-visible bug confirmed: bird appeared upside-down at east/southeast headings with the full-rotate approach.

**How to apply:** Any future heading-animation change must keep the body upright. Only the scaleX flip may change left/right orientation; posture cues handle N/S subtlety.
