# Sankofa Bird — Rive State Machine Specification

_For the Niakofa community app mascot_

> **Who this is for:** The designer creating `sankofa-bird.riv` in the Rive editor.
> Once the file is placed in `public/` and `VITE_USE_RIVE_BIRD=true` is set in Replit Secrets,
> the React app automatically switches from the SVG bird to the Rive bird.

---

## 1. File & artboard

| Property | Value |
|---|---|
| **File name** | `sankofa-bird.riv` |
| **Export path** | `artifacts/pay-it-forward/public/sankofa-bird.riv` |
| **Artboard name** | `SankofaBird` |
| **Artboard size** | 200 × 200 px (React scales it to the `size` prop × 1.6) |
| **State machine name** | `BirdStateMachine` ← **exact name, case-sensitive** |

---

## 2. State machine inputs

These are the values the React component sets. Name them **exactly** as listed.

### Number inputs

| Input name | Range | Description |
|---|---|---|
| `heading` | 0–359 | World-frame compass heading (degrees). 0 = north. |
| `speed` | 0–300 | Ground speed in m/s. Walking ≈ 1.4, running ≈ 3, driving ≈ 14, airplane ≈ 250. |
| `mapZoom` | 0–22 | Mapbox zoom level — drives level-of-detail. < 10 = simplified, ≥ 15 = cinematic. |
| `mapBearing` | 0–359 | Map camera bearing. Difference (heading − mapBearing) = on-screen rotation. |
| `trustLevel` | 0–1 | Helper trust score normalized to the bird's trust-tier plumage. |

### Boolean inputs

| Input name | Description |
|---|---|
| `navigating` | True during turn-by-turn navigation. Triggers takeoff/landing transitions. |
| `celebrating` | True when a help request is completed. Triggers shimmer + egg glow. |
| `newNotification` | True when a nearby help request appears. Triggers head tilt + wing flick. |
| `accepted` | True when a request is claimed. Triggers hop + wing stretch. |
| `donated` | True when a pledge is paid. Triggers gold egg glow + sparkle particles. |
| `nearbyUser` | True when another helper is within ~200 m. Triggers wing salute. |
| `upcomingTurnLeft` | True when the next navigation instruction is a left turn. Bird glances left. |
| `upcomingTurnRight` | True when the next navigation instruction is a right turn. Bird glances right. |
| `approaching` | True when within ~50 m of destination. Triggers deceleration descent bob, slower flap, egg glow intensifies. |
| `isHelping` | True when the user has an active accepted request and is en route. Triggers warm-gold body shimmer, gold-tinted wing iridescence, and mission-glow on egg. Distinct from `celebrating` (teal burst on *completion*) and `donated` (pledge payment). |
| `batterySaver` | True when device reports low battery, data-saving mode is on, or user opts in via accessibility. Suppresses all feather-detail, iridescence, particle, and glow animations — LOD3 minimal silhouette. |
| `wairMode` | True for wing-assisted incline running. |
| `soaring` | True for dynamic soaring. |
| `matingDisplay` | True for the courtship display. |
| `missionComplete` | True for the mission-complete ripple/glow. |
| `chirp` | True for the beak/ring chirp micro-reaction. |
| `communityMilestone` | True for the community milestone shimmer. |
| `nightMode` | True for the night plumage and softer luminary palette. |
| `weatherWindy` | True when shared `weather` is `windy`. |
| `weatherRain` | True when shared `weather` is `rain`. |
| `weatherSnow` | True when shared `weather` is `snow`. |

> **Total inputs:** 5 number + 21 boolean = **26 inputs**

### Official iridescent palette

Use these stops in the Rive feather and glow gradients so the Rive and SVG
renderers match on the live map:

`#0FE5D4` → `#2B83AB` → `#0D77AA` → `#095E5A` → `#062E2E`

The highlight should be a soft opacity pulse, not a continuously animated
blur/filter. This avoids paint invalidation and visible flicker on older
iPhones and Android devices. `batterySaver=true` and reduced-motion must hold
the luminary layers at their rest opacity.

---

## 3. Animation states

Design these as a state machine with blended transitions.

```
                ┌─────────┐
           ┌───▶│  Idle   │◀──────────────────────────────────┐
           │    └────┬────┘                                    │
           │         │ navigating = true                       │
           │    ┌────▼────┐                                    │
           │    │ Takeoff │  (1.2 s one-shot, then auto→Cruise) │
           │    └────┬────┘                                    │
           │         │                                         │
           │    ┌────▼────┐                                    │
           │    │ Cruise  │◀──────────────────────────────┐    │
           │    └────┬────┘                               │    │
           │         │ navigating = false                 │    │
           │    ┌────▼────┐                               │    │
           │    │  Dive   │  (0.6 s one-shot)             │    │
           │    └────┬────┘                               │    │
           │    ┌────▼────┐                               │    │
           │    │SlowFlap │  (0.8 s, looping)             │    │
           │    └────┬────┘                               │    │
           │    ┌────▼────┐                               │    │
           │    │  Hover  │  (1.4 s, looping)             │    │
           │    └────┬────┘                               │    │
           │    ┌────▼────┐                               │    │
           │    │  Perch  │  (2.0 s, forwards)────────────┘    │
           │    └────┬────┘                                    │
           └─────────┘────────────────────────────────────────┘

Micro-reactions (layer on top of base state, auto-exit when input resets):
  Celebrate       (loop while celebrating = true)
  Notification    (3 × then exit)
  Accepted        (2 × then exit)
  Donated         (4 × then exit)
  WingSalute      (2 × then exit, triggered by nearbyUser)
  AnticipateLeft  (loop while upcomingTurnLeft = true)
  AnticipateRight (loop while upcomingTurnRight = true)
  Approaching     (loop while approaching = true — deceleration bob)
  Helping         (loop while isHelping = true — gold shimmer overlay)
```

---

## 4. Layer structure (body parts)

Animate each as a **separate layer** in the Rive artboard so they can move independently.

```
Layer 13 — TrailingParticles    (3 dots/streaks, visible while speed > 0.5 m/s)
Layer 12 — EggOrbitParticle     (tiny dot orbiting the egg, visible during Celebrate/Donated)
Layer 11 — RightLeg + foot      (3 toes: forward, down, backward)
Layer 10 — LeftLeg + foot       (3 toes)
Layer  9 — EggCounterRotation   (group: Egg + specular highlight — see §6 Egg stabilisation)
Layer  8 — Beak                 (upper + lower, slight open/close during Takeoff/Accepted)
Layer  7 — EyePupil             (+ corneal catchlight)
Layer  6 — Head                 (rotates for head-lead + anticipatory glances)
Layer  5 — Neck                 (slight opacity/width flex for breathing)
Layer  4 — BodyChest            (+ breast sheen — hosts breathing scale animation)
Layer  3 — WingLeft             (+ primary feather tips 1–5 + covert highlight)
Layer  2 — WingRight            (+ primary feather tips 1–5 + covert highlight)
Layer  1 — Tail                 (5 feather paths: center, left×2, right×2)
Layer  0 — GroundShadow         (ellipse, scales with speed)
```

---

## 5. Key animation behaviours

### Wings
- **Idle flap:** ±15° rotation around the wing root (shoulder joint), 1.4 s period.
- **Right wing lags left by ~18 ms** — slight timing offset creates natural asymmetry.
- **Primary feather lag:** feather-tip sub-layers delay 12% of the flap period vs. the main wing.
- **Banked flight:** outside wing extends 8–12° beyond normal flap arc; inside wing folds 8–12° below.
- **Gliding (speed > 50 m/s):** wings hold a shallow spread position, oscillating gently over 4 s.
- **Iridescent highlight:** a semi-transparent overlay on the upper wing surface pulses with a hue-rotation
  shift (emerald → turquoise → aqua → silver → deep teal → back), cycling at flap period × 1.7.
- **5 primary feather tips per wing:** cascade from outermost (moves first) to innermost (lags most).

### Body
- **Idle float:** body translates 0 → −2 px → 0 px vertically at the flap period.
- **Cruise lean:** body rotates forward ~6° and holds a gentle thermal-ride oscillation (±1° variance).
- **Breathing:** chest layer scales 1–2% at 2.8× the flap period. Almost imperceptible, but the brain reads it as life.
- **Ground shadow:** ellipse RX grows with speed (stretched at cruise, small while hovering).
- **Back (dorsal):** darker teal overlay on upper body half, opposite-phase shimmer to belly.
- **Belly (ventral):** lighter cream-teal underside, breathes with 0.4 s phase lag after chest.

### Eyes
Full 7-second cycle:
1. Forward gaze (0–35%)
2. Blink (close/open, 37–41%)
3. Look left — pupil translates −0.45 px in local space (48–62%)
4. Blink (66–72%)
5. Look right — pupil translates +0.45 px (78–90%)
6. Return forward (95–100%)

Also add a tiny **corneal catchlight** that shifts slightly as the pupil moves.

### Tail
- Idle: gentle side-to-side sway at 2.4× the flap period.
- Cruise: tighter sway locked to flap period, bends toward the turn direction.

### Legs
- Idle: slow perch sway (weight shift), ±2° rotation, 1.6× flap period.
- Cruise: alternating left/right skew at the flap period (running cadence).
- Hover/SlowFlap: legs dangle loose below body.
- Perch: snap to touch-down position.

---

## 6. Egg stabilisation (critical)

The Sankofa bird carries an egg in its beak. The egg must **remain perfectly level** while the bird banks.

**How it works in Rive:**
- The body/rig layer rotates by `bankDeg` (driven by heading-change rate, max ±25°).
- The egg is in a nested group that applies an **equal-and-opposite rotation** centred on the rig pivot
  (100px × 124px in a 200×200 artboard).
- Net rotation on the egg = 0° at all times.

This is the central visual metaphor: "carrying wisdom forward regardless of the journey."

> **Tip:** In Rive, bind the egg group's rotation to `−1 × rig.rotation` using a constraint or an expression.

---

## 7. Iridescent material

The vision calls for colours that shift as the bird rotates, like a hummingbird or kingfisher.

Implement with a **gradient overlay layer** on the wing and chest surfaces:

```
Gradient stops (animate hue-rotation 0° → 30° → -10° → 20° → 0° over 2.4 s loop):
  Emerald   hsl(160, 80%, 45%)
  Turquoise hsl(180, 100%, 50%)
  Aqua      hsl(190, 100%, 65%)
  Silver    hsl(200, 30%, 80%)
  Deep Teal hsl(195, 90%, 38%)
```

Layer blend mode: **Screen** at 25–35% opacity.

---

## 8. Level-of-detail (LOD)

React passes `mapZoom` (0–22). Hide layers based on this value:

| zoom | Visible layers |
|---|---|
| < 10 | Body, Wings (no feather tips), Head, Tail |
| 10–14 | All above + feather tips, highlight, legs |
| ≥ 15 | All layers + full breathing + iridescent shimmer enhanced |

When `batterySaver = true`, apply LOD3 regardless of zoom: body silhouette only, no feather tips, no iridescence, no particles, no glow.

---

## 9. Micro-reaction playbook

| Reaction | What the bird does | Duration |
|---|---|---|
| **Celebrate** | Body + egg glow teal. Feathers shimmer (hue-shift). Heart pulse ring expands. 8 teal particles burst outward. | Loops while `celebrating = true` |
| **Notification** | Head snaps up → tilts 12° → returns. Right wing flicks up and back. Teal pulse. Crown feathers spike. | 3× then auto-exit |
| **Accepted** | Body hops up 4 px → down. Both wings stretch outward then fold. | 2× then auto-exit |
| **Donated** | Egg turns gold, glows warm. 6 gold diamond sparkles burst outward. | 4× then auto-exit |
| **WingSalute** | Head turns slightly toward a passing user → left wing lifts to ~−42° (salute) → holds → returns. | 2× then auto-exit |
| **AnticipateLeft** | Head rotates −10° and translates −1.5 px upward (glance left). Returns. | Loops while `upcomingTurnLeft = true` |
| **AnticipateRight** | Head rotates +10° and translates −1.5 px upward (glance right). Returns. | Loops while `upcomingTurnRight = true` |
| **Approaching** | Body bobs gently downward (2.5 px amplitude). Flap rate slows 1.45×. Trail opacity drops. Egg glow intensifies expectantly. | Loops while `approaching = true` |
| **Helping** | Warm gold drop-shadow halo pulses on body. Wing iridescence tilts warm-amber. Trail carries warm-gold tint. Egg carries steady gold inner light. Crown feathers tinge gold at high zoom. | Loops while `isHelping = true` |

---

## 10. Checklist before export

- [ ] State machine named exactly `BirdStateMachine`
- [ ] All 15 inputs present with correct names and types (§2)
- [ ] Egg counter-rotation constraint working (stays level during bank)
- [ ] Eye blink + look cycle works (7 s loop)
- [ ] Takeoff one-shot (1.2 s) → auto-transition to Cruise
- [ ] Dive → SlowFlap → Hover → Perch → Idle chain timing matches §3
- [ ] LOD layers respond to `mapZoom` input
- [ ] `batterySaver = true` forces LOD3 regardless of zoom
- [ ] Iridescent overlay uses Screen blend mode
- [ ] `isHelping` gold shimmer distinct from `celebrating` (teal) and `donated` (gold sparkle)
- [ ] `approaching` triggers descent bob — egg stays perfectly level
- [ ] Test on a 34 × 34 px canvas (smallest real usage size) — silhouette still reads

---

_Reference: the existing SVG implementation is in `SankofaBirdSvg.tsx`. All timings and angles there are the ground truth for what this Rive file should reproduce and surpass._
