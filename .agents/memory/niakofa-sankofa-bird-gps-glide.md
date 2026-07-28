---
name: Niakofa SankofaBird GPS glide + micro-reactions
description: Full implementation details for the SankofaBird animated nav marker — animation architecture, micro-reactions, WS wiring, visual details.
---

## SankofaBird.tsx — current feature set (as of July 15 2026)

### Props
- `heading`: compass bearing (world frame), null if unknown
- `mapBearing`: map camera bearing (0 in north-up mode)
- `speed`: GPS speed in m/s — drives flap rate + lean + glide detection
- `navigating`: true while turn-by-turn nav is active
- `size`: px (map.tsx uses 34)
- `celebrating`: teal shimmer + heart pulse ring + 8-point burst (REQUEST_COMPLETED)
- `newNotification`: head tilt × 3 + wing flick × 2 (REQUEST_CREATED/new_request)
- `accepted`: body hop × 2 + wing stretch (REQUEST_ACCEPTED on own request)
- `donated`: golden sparkle × 6 + egg gold glow (pledge_paid / payment_completed)

### Speed tiers (all from GPS velocity)
- Idle (speedMs ≤ 0.3): 1400ms flap period, 0° lean
- Walking (0.3–2.5): 1–5 flaps/sec, lean 6–15°
- Driving (2.5–50): up to 5 flaps/sec, lean max 15°
- **Airplane (> 50 m/s)**: isGliding=true → 4000ms period + 12° lean → `sankofa-glide-wing-*` CSS (wings spread wide, barely oscillating)

### Landing sequence (navigating true → false)
slowflap (800ms) → hover (1600ms) → perch (2600ms) → idle

### SVG layers (z-order, bottom to top)
1. Tail (base shape + 3 distinct feather tips)
2. Right wing body + 3 separated primary feather tips + iridescent highlight
3. Left wing body + 3 separated primary feather tips + iridescent highlight
4. Body ellipse + breast sheen ellipse
5. Head group: neck path (with flex anim) + head circle + eye + eye glint + beak + egg (teal by default, gold on celebrating/donated) + egg specular highlight

### Egg visual
- Default: teal `hsl(190, 100%, 68%)` with specular white dot — matches reference image
- Celebrating/donated: gold `#ffe066` + gold stroke

### Wing feather sublayer lag
All `*-feathers` paths share the same flap keyframes as their parent wing but `animation-delay: calc(var(--flap-period) * 0.12)` — creates "upper feathers bend, lower feathers lag" effect.

### Iridescent highlight
`.sankofa-bird-wing-*-highlight` paths (lighter teal, opacity 0.28) pulse via `sankofa-iridescent` keyframe. Left highlight has extra delay for asymmetric shimmer.

### Micro-reaction sequence details
- celebrating: heart-pulse-ring × 2 THEN 8-point teal burst THEN shimmer + egg glow
- donated: 6 golden diamond sparkles + egg-glow-gold × 4 alternate
- accepted: body hop × 2, then wing-stretch-left/right × 2 (0.25s delay)
- newNotification: head-tilt × 3 + wing-flick × 2

### WS wiring in map.tsx
- REQUEST_COMPLETED → birdCelebrating 3000ms
- REQUEST_CREATED / new_request → birdNewNotification 2400ms
- REQUEST_ACCEPTED (own request) → birdAccepted 1800ms + navigate to tracking
- pledge_paid / payment_completed → birdDonated 2800ms

**Why:** These are separate state vars (not one shared "reaction" enum) so multiple reactions can overlap without cancelling each other.

### useTweenedPosition
RAF ease-out cubic over 800ms default. Snaps on first fix; cancels mid-tween when new target arrives. Used for `<Marker>` lat/lng; `myLocation` still used for speed/heading.

### CSS data attrs on rig div
`data-flying`, `data-gliding`, `data-landing`, `data-celebrating`, `data-notification`, `data-accepted`, `data-donated`

### Reduced-motion
All animation classes listed in `@media (prefers-reduced-motion: reduce)` → `animation: none !important`.

### Known non-bugs
- DB "relation does not exist" errors in API server logs = expected on fresh import (migrations not run)
- Vite HMR logs "hot updated: /src/index.css" alongside tsx = expected (CSS injected via `<style>` in JSX)
