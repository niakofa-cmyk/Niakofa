# Sankofa Bird — Official SVG Asset Pipeline Reference

**Reference image:** `SANKOFA_BIRD_PIPELINE_REF.png` (saved alongside this file)

---

## Asset Metadata

| Field | Value |
|---|---|
| Asset Type | Vector (SVG) — React component |
| Style | Layered Gradient Vector |
| Render targets | SVG / Rive / Lottie / Canvas |
| Coordinate system | Center Origin, 0 0 40 40 viewBox |
| Default viewport | 1024 × 1024 (CSS scaled to `size` prop) |
| Pivot (0,0) | Body Center |

---

## Layer Hierarchy (from SankofaBirdSvg.tsx)

```
SankofaBird
  └── Root (Group)
        ├── Defs (Gradients, Masks, Clips)
        └── Body
              ├── Chest
              ├── Back
              └── Underbody
        ├── Neck
        │     ├── Crest
        │     ├── Eye
        │     ├── Beak (Upper)
        │     └── Beak (Lower)
        ├── Egg
        ├── Left Wing
        │     ├── Left Wing (Top)
        │     └── Left Wing (Bottom)
        ├── Right Wing
        │     ├── Right Wing (Top)
        │     └── Right Wing (Bottom)
        ├── Tail
        │     └── Tail Feathers
        └── Legs
              ├── Left Leg
              └── Right Leg
```

---

## Pivot Centers (SVG coordinate space, 40×40 viewBox)

| Bone | X | Y | Notes |
|---|---|---|---|
| Body Center | 20 | 22 | Main rig pivot |
| Left Wing Base | 20 | 17 | Wing root — flap pivot |
| Right Wing Base | 20 | 17 | Wing root — flap pivot |
| Neck Base | 18 | 16 | S-curve base |
| Head | 8 | 13 | Head sphere center |
| Tail Base | 20 | 28 | Tail fan pivot |
| Left Leg Base | 16.5 | 30 | Walking stride |
| Right Leg Base | 23.5 | 30 | Walking stride |
| Egg Center | 3.4 | 15.6 | Held in beak |

---

## 360° View Map (9 primary directions)

| View Name | Heading Range | Sprite | Pose |
|---|---|---|---|
| Front | 337.5° – 22.5° (N ±22.5°) | FrontView.tsx | Wings spread L/R, chest visible, Sankofa head turned right |
| Front 3/4 Right | 22.5° – 67.5° (NE) | Side + LEFT_45 skew | Right wing compressed to 55% |
| Right Side | 67.5° – 112.5° (E) | SideView (default) | Side profile, beak faces screen-right |
| Back 3/4 Right | 112.5° – 157.5° (SE) | Side → Back + RIGHT_45 | Left wing compressed, dorsal surface |
| Back | 157.5° – 202.5° (S ±22.5°) | BackView.tsx | Wide tail fan, dorsal wings, nape visible |
| Back 3/4 Left | 202.5° – 247.5° (SW) | Back → Side + LEFT_45 | Right wing compressed (mirrored) |
| Left Side | 247.5° – 292.5° (W) | SideView (scaleX flip) | Side profile, beak faces screen-left |
| Front 3/4 Left | 292.5° – 337.5° (NW) | Side → Front + RIGHT_45 | Left wing compressed |
| *(Up View)* | altitude > threshold | *(planned)* | Dorsal top-down, wings spread wide |
| *(Down View)* | altitude < threshold | *(planned)* | Ventral bottom-up, chest/belly visible |

---

## Wing Deformation Poses (5 states)

| Pose | CSS trigger | Description |
|---|---|---|
| **Wings Up** / High Stretch | `data-landing="takeoff"` | Arms above body, primaries fully fanned; power launch |
| **Wings Mid** / Cruise | `data-flying="true"` (default flap) | Neutral cruise position; SME drives continuous flap |
| **Wings Down** / Power Stroke | `data-aero-mode="hover"` | Below body centreline; undersurface briefly visible |
| **Wings Forward** / Braking | `data-approaching="true"` or `data-landing="slowflap"` | Swept forward past body; pitch-up attitude |
| **Wings Back** / Glide | `data-gliding="true"` or `data-soaring="true"` | Swept back in swept-delta; minimum drag, high speed |

---

## Tail Deformation Poses (4 states)

| Pose | CSS trigger | Description |
|---|---|---|
| **Tail Flare** / Wide | `data-celebrating="true"` or `data-mating="true"` | Full tail-fan deployment; peacock spread |
| **Tail Narrow** / Speed | `data-speed="driving"` + `data-flying="true"` | Closed stream, low drag; scaleX ~0.78 |
| **Tail Folded** / Braking | `data-approaching="true"` | Fanned flat against drag, tilted forward |
| **Tail Stream** / Glide | `data-gliding="true"` | Maximum narrowing, flows back; scaleX ~0.60 |

---

## Color Palette (sampled from SVG gradients)

| Swatch | Hex | Usage |
|---|---|---|
| Primary bright | `#0FE5D4` | Wing tips, eye catchlight, chirp rings |
| Primary mid | `#2683A8` | Wing body, neck main stroke |
| Mid-shadow | `#0D77A` | Back dorsal, secondary feathers |
| Deep shadow | `#095E5A` | Tail base, deep body shadow |
| Darkest | `#062E2E` | Beak, pupil, deep ocular shadow |
| Beak / Claws | `#1a2733` | Beak upper/lower fill |
| Egg highlight | `hsl(190,100%,90%)` | Egg inner glow catchlight |

---

## Gradient System

### Major Feather Gradient (wing body)
```
hsl(190,100%,52%) → hsl(190,82%,38%) → hsl(188,60%,22%)
```
Direction: wing root → tip (bright → dark)

### Body Gradient
```
hsl(190,88%,46%) → hsl(190,80%,34%) → hsl(186,58%,20%)
```
Direction: chest → tail (lighter → darker)

### Egg Gradient (normal)
```
hsl(190,100%,90%) → hsl(190,100%,70%) → hsl(190,85%,42%)
```
Radial: inner bright → outer deep

### Egg Gradient (celebration / donated)
```
#fff8d6 → #ffe066 → #b87200
```
Gold specular highlight with amber rim

---

## Sankofa Motion Engine (SME) — Pipeline Architecture

```
Master SVG (SankofaBirdSvg.tsx)
    ↓
Rig (SankofaRig.ts — Pivots, constraints, parenting)
    ↓
Flight Physics (FlightPhysics.ts — Heading, velocity, turn rate)
    ↓
Motion Solver (MotionSolver.ts — Head→tail rotation chain, exponential damping)
    ↓
Sensor Engine (SensorEngine.ts — Wind, light, zoom, events)
    ↓
Animation Mixer (useAnimationMixer.ts — Spring physics, blends all channels)
    ↓
CSS / DOM Renderer (Renderer.tsx — Reads --sme-* and --mixer-* CSS vars)
```

### SME CSS Variable Namespace

| Variable | Type | Source | Effect |
|---|---|---|---|
| `--sme-head-deg` | angle | MotionSolver | Head kinematic rotation |
| `--sme-neck-upper-deg` | angle | MotionSolver | Neck upper segment |
| `--sme-neck-lower-deg` | angle | MotionSolver | Neck lower segment |
| `--sme-body-roll-deg` | angle | MotionSolver | Chest body roll |
| `--sme-tail-deg` | angle | MotionSolver | Tail rudder angle |
| `--sme-lwing-upper-deg` | angle | MotionSolver | Left wing upper rotation |
| `--sme-rwing-upper-deg` | angle | MotionSolver | Right wing upper rotation |
| `--sme-eye-x` / `--sme-eye-y` | px | MotionSolver | Iris/pupil translate |
| `--sme-flap-phase` | number (rad) | MotionSolver | Continuous flap phase |
| `--sme-flap-amplitude` | 0..1 | MotionSolver | Smoothed wing amplitude |
| `--sme-notification-pulse` | 0..1 | MotionSolver | Notification glow intensity |
| `--sme-wind-strength` | 0..1 | MotionSolver | Crosswind feather ruffle |
| `--mixer-bank-deg` | angle | AnimationMixer | Spring-smoothed body bank |
| `--mixer-head-lead-deg` | angle | AnimationMixer | Spring-smoothed head lead |
| `--mixer-neck-curve-deg` | angle | AnimationMixer | Spring-smoothed neck curve |
| `--mixer-tail-bend-deg` | angle | AnimationMixer | Spring-smoothed tail bend |
| `--mixer-left-wing-extra` | angle | AnimationMixer | Differential wing bank extra |
| `--mixer-inside-wing-tuck` | 0..1 | AnimationMixer | Inside-turn wing fold |

---

## Data Attribute State Machine (full inventory)

| Attribute | Values | Controls |
|---|---|---|
| `data-flying` | true/false | All flight animations |
| `data-gliding` | true/false | Wing/tail glide deformation |
| `data-landing` | flying/dive/slowflap/hover/perch/idle/takeoff | Landing sequence phases |
| `data-celebrating` | true/false | Gold egg, celebration particles |
| `data-notification` | true/false | Notification micro-reaction |
| `data-accepted` | true/false | Wing salute accepted |
| `data-donated` | true/false | Gold egg donation pulse |
| `data-upcoming-turn` | left/right/none | Anticipatory gaze glance |
| `data-zoom` | low/mid/high/street | LOD rendering tier |
| `data-hard-bank` | true/false | >20° bank magnitude |
| `data-nearby-user` | true/false | Wing salute greeting |
| `data-speed` | idle/walking/running/driving/airplane | Speed tier CSS |
| `data-approaching` | true/false | Braking deceleration |
| `data-helping` | true/false | Helper posture forward crane |
| `data-battery-saver` | true/false | LOD3 minimal animation |
| `data-night-mode` | true/false | Nocturnal plumage |
| `data-sky-tier` | day/golden/twilight/night | Sky lighting tier |
| `data-activity` | low/mid/high/peak | Community activity level |
| `data-nav-lod` | 0/1/2 | Navigation LOD escalation |
| `data-off-screen` | true/false | Off-screen culling |
| `data-gaze` | forward/left/right/up/down/upleft/upright/downleft/downright | Gaze direction |
| `data-wair` | true/false | Wing-Assisted Incline Running |
| `data-soaring` | true/false | Dynamic soaring mode |
| `data-mating` | true/false | Courtship display |
| `data-aero-mode` | flap/soar/hover/wair/mating/idle | Aerodynamic mode |
| `data-chirp` | true/false | Beak open + chirp rings |
| `data-mission-complete` | true/false | Mission ripple cascade |
| `data-community-milestone` | true/false | Gold milestone pulse |
| `data-trust-tier` | none/growing/trusted/elder | Trust level iridescence |
| `data-weather` | clear/windy/rain/snow | Weather feather response |
| `data-turn-dir` | left/right/none | Current turn direction |
| `data-facing` | left/right | Body horizontal facing |
| `data-heading-quadrant` | N/NE/E/SE/S/SW/W/NW | 8-compass heading quadrant |
| `data-view-angle` | front/front-diagonal/side/back-diagonal/back | Current sprite zone |
| `data-donated` | true/false | Donation gold state |

---

## Current Build Phase: Phase 21 (July 2026)

### Phase History
| Phase | Description |
|---|---|
| 1–2 | Core SVG anatomy (body, head, neck, wings, tail, egg) |
| 3–11 | Flight physics, landing, banking, gaze system, night mode, LOD |
| 12–13 | Real-time gaze (8-dir saccade), full aerodynamics (figure-8, WAIR, soaring, mating) |
| 14–19 | Mission rings, chirp, weather, trust tiers, P17 kinematics, P18 iOS Safari, P19 heading fix |
| 20 | SME v2/v3 physics CSS (notification pulse, body roll, flap amplitude, wind ruffle, idle breath) |
| **21** | **Wing/tail deformation (5+4 poses), back-diagonal CSS, FrontView/BackView SME wing drive** |

---

## Animation Recommendations (from pipeline spec)

- Use turn sequence for idle / look-around animations (12-step in turnaround HTML)
- Wing deformations follow speed cycle: Up → Mid → Down → Mid (flap pattern)
- Tail deformations for speed / braking are critical for motion reading
- Add slight head-bob for natural motion
- `SANKOFA_BIRD_RIVE_SPEC.md` describes the Rive state machine if you export to Rive

---

## Export Guidelines (for Rive / Lottie / Spine)

- Keep viewport 1024×1024 with center origin (0,0)
- Maintain center origin (0,0) for all exports
- Enable "Responsive = false" for pixel-perfect
- Use SVGO with "floatPrecision: 3"
- Pipeline compatibility: SVG ✓ · Rive ✓ · Lottie ✓ · Spine 2D ✓ · Canvas/Pixi ✓
