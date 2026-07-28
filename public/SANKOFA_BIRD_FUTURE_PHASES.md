# Sankofa Bird — Future Phase Ideas & Vision Document

**Last updated:** 2026-07-20  
**Current build:** Phase 16 complete  
**Source documents:** Vision docs uploaded July 20 2026 (7 files)

This file is the canonical reference for future phase enhancements to the
SankofaBird SVG component. Ideas are drawn from the original vision documents,
in-app observations, and the community's evolving needs.

---

## Summary of Completed Phases (1–16)

| Phase | Name | Key Effects |
|-------|------|-------------|
| 1 | Core Flight System | Speed tiers, flap rate, lean, banking, trail particles, takeoff/landing |
| 2 | Iridescence + Eye Detail | Per-feather iridescence, directional lighting, eye catchlight, breast sheen |
| 3 | Beyond-Rive Compound Effects | Vortex rings, body elongation, isHelping gold shimmer, idle weight-shift |
| 4 | Environmental Physics Vars | Walk-dust puffs, --bank-angle CSS var, @property declarations |
| 5 | Advanced Feather Rendering | Feather-slot on takeoff/hover, body feather layers 1–11, zoom LOD |
| 6 | Solar / Environmental / LOD | Off-screen pause, pupil dilation, golden breast, twilight desaturation, navLod |
| 7 | Biomechanics | Egg pendulum, head stabilization, curiosity tilt, stochastic wingbeat |
| 8 | Vision-Doc Biomechanical | Wing asymmetry +18ms, feather lag cascade, shadow warp, wing salute |
| 9 | Composition / Interaction Tests | Compound selectors: glide+bank, night+flying, LOD2+bank, golden+fly |
| 10 | Night-Mode Plumage | Pupil shimmer, moonlit wing rim, nocturnal breathing, bio-glow, lunar egg pearl |
| 11 | Gap-Closure Finalization | Battery-saver idle-settle, navLod opacity, full-body helping crane, GPU will-change |
| 12 | 8-Direction Gaze System | computeGazeVector(), data-gaze (9 dirs), iris+head+neck+body chain, auto-saccade |
| 13 | Full Authentic Aerodynamics | Figure-8 wing stroke, WAIR, dynamic soaring, mating display, murmuration wave |
| 14 | Living Companion | Chirp beak, mission-complete ripple, community milestone shimmer, trust Adinkra, weather, nictitating |
| 15 | Solar-Reactive Night Suite | Night silver trail, golden feather cascade, twilight heartbeat, circadian breathing, thermal ring, bioluminescence |
| 16 | Dynamic Aerial Movement | Hover wrist flex, enhanced murmurations, night light streaks, ground effect ripple, aurora burst, dawn stretch |

---

## Phase 17 — Sound Integration & Vibrotactile Feedback

### Vision
The bird becomes audible. Very subtle, documentary-quality sound — not cartoon effects.

### Proposed Effects
- **P17.1 Wing flutter micro-audio** — Soft, barely-perceptible feather flutter sound using Web Audio API oscillators (no audio files needed). Frequency scales with flap rate.
- **P17.2 Chirp audio** — A real bird chirp tone (generated via Web Audio FM synthesis) fires with `data-chirp=true`. 200–400ms duration, natural decay.
- **P17.3 Vibrotactile takeoff** — Short haptic pulse (navigator.vibrate([15])) when takeoff animation fires on mobile.
- **P17.4 Haptic milestone** — Double-tap vibration pattern on missionComplete.
- **P17.5 Wind ambience** — At airplane speed, a low wind-noise layer (Web Audio noise generator, very quiet).
- **P17.6 Audio kill-switch** — Entire audio system gated by user preference + battery-saver mode.

### Implementation notes
- Web Audio API is available in all modern mobile browsers
- Use AudioContext.createOscillator() for tones — no asset files needed
- Gate all audio on `document.hidden` (Page Visibility API) to avoid background drain
- Respect prefers-reduced-motion as an implied audio-off signal
- Store user audio preference in localStorage key `niakofa_bird_audio`

---

## Phase 18 — Flocking / Community Presence

### Vision
When multiple Niakofa helpers are visible on the map, their Sankofa Birds form a loose flock. Two birds meeting to complete a request briefly circle each other.

### Proposed Effects
- **P18.1 Helper mini-birds** — Other online helpers within 500m render as small translucent Sankofa Birds (size=18) with simplified animations (LOD1).
- **P18.2 Formation flight** — When 3+ helpers are nearby, the birds subtly shift into a V-formation offset relative to the user's bird.
- **P18.3 Circle greeting** — When two users converge to complete a request, their birds briefly orbit a shared midpoint before landing.
- **P18.4 Flock coherence wave** — A murmuration wave propagates across all visible birds simultaneously (WS broadcast triggers it).
- **P18.5 Separation on missionComplete** — Birds in a flock gently disperse outward on community milestone.

### Implementation notes
- Requires WS `helper_location` events to include bird state props
- Mini-birds reuse SankofaBirdSvg with heading/speed from the WS payload
- Performance: cap at 8 visible mini-birds; LOD system auto-degrades at 5+
- Flocking math: Reynolds' Boids rules (separation, alignment, cohesion) at reduced fidelity

---

## Phase 19 — Progressive Trust Evolution (Visual Leveling)

### Vision
As the user accumulates trust score, the bird visibly evolves. Not cosmetic clutter — earned behaviors and new capabilities.

### Proposed Effects
- **P19.1 Feather vibrancy scaling** — Saturation scales from 0.85× (new) to 1.25× (elder) over the 0–1 trust range.
- **P19.2 Adinkra pattern animation** — At trust ≥ 0.55 the Adinkra covert pattern gently pulses (opacity 0.55 → 0.78 → 0.55, 4s).
- **P19.3 Crown height scaling** — Crown feathers scale taller as trust increases (transform: scaleY(1.0) → scaleY(1.35) over 0.25–0.80).
- **P19.4 Elder tail fan** — At trust ≥ 0.80, the tail permanently fans 15% wider during flight.
- **P19.5 Elder golden ambient** — At elder trust, the glow-layer permanently shows a faint warm-gold ambient (0.08 opacity, no animation needed).
- **P19.6 Trust milestone burst** — When crossing a trust tier boundary, fire a community-milestone-style shimmer wave automatically.

### Implementation notes
- trustLevel prop already exists (Phase 14)
- trustTier CSS data attr already drives Adinkra visibility
- P19 extends the existing trust system with new animations per tier

---

## Phase 20 — Seasonal & Weather Advanced System

### Vision
The bird reflects the real season and advanced weather conditions, not just rain/snow.

### Proposed Effects
- **P20.1 Wind direction** — When device compass + weather API reports wind direction, feathers lean into the wind independently of flight heading.
- **P20.2 Fog/mist** — At high humidity + low visibility, a soft blur vignette rings the bird. Feathers appear slightly damp.
- **P20.3 Thunderstorm alert** — When weather API reports lightning risk, the bird becomes alert (head up, crown erect) and the egg pulses rapidly.
- **P20.4 Heat shimmer** — At extreme heat (>38°C), a subtle heat-haze distortion filter appears under the bird.
- **P20.5 Seasonal plumage** — Spring: brighter teal + mild breast flush. Summer: full saturation baseline. Autumn: warm amber tint on wing tips. Winter: fluffed feathers + slight brightness reduction.
- **P20.6 Moon phase awareness** — At night, the intensity of crown phosphorescence (P15.8) scales with the real moon phase (0=new moon → 1=full moon).

### Implementation notes
- Requires a useWeather() hook connecting to a free weather API (OpenWeatherMap free tier)
- Moon phase is pure math (no API needed) — synodic period 29.53 days
- Season detection from latitude + date
- All effects gated behind battery-saver + prefers-reduced-motion

---

## Phase 21 — Navigation Cinematic Mode

### Vision
When turn-by-turn navigation starts, the camera and bird enter a cinematic presentation mode.

### Proposed Effects
- **P21.1 Approach anticipation head-turn** — 3s before a turn instruction, the bird head fully turns to look at the upcoming direction.
- **P21.2 Destination descent arc** — As the user approaches the final destination, the bird begins a visible descending arc (y position shifts on the map marker).
- **P21.3 Arrival celebration sequence** — Full choreographed 3s sequence: dive → hover → land → egg-glow → teal particle burst → mission ring.
- **P21.4 Route-progress shimmer** — The bird's trust-tier pattern brightens slightly as each navigation segment completes.
- **P21.5 Landmark callout** — When passing a civic resource (library, food bank) the bird briefly looks toward it and the egg glows softly.

### Implementation notes
- Requires upcomingTurnDirection + distance-to-destination from navigation context
- Arrival trigger: GPS within 15m of destination
- Cinematic camera work: separate from bird animation, implemented in map.tsx

---

## Phase 22 — Accessibility & Inclusive Design

### Vision
The bird is equally expressive for users who rely on reduced motion, screen readers, or high contrast.

### Proposed Effects
- **P22.1 High-contrast mode** — When prefers-contrast: more, the bird increases its shadow and outline thickness. Crown tips become white outline strokes.
- **P22.2 Screen reader state announcements** — An aria-live region outside the SVG announces bird state changes ("Sankofa Bird is navigating", "help request nearby").
- **P22.3 Reduced-motion rich mode** — Instead of animation:none, reduced-motion users see a single static pose per state (flying=forward lean, helping=open wings, celebrating=egg glow). No keyframe loops.
- **P22.4 Color-blind iridescence alternatives** — When forced-colors is active, iridescence is replaced with pattern fills (hatching on wings, dots on tail).
- **P22.5 Large-text / zoom resilience** — At browser zoom > 150%, the bird scales via CSS clamp() to remain legible without overflowing its container.

---

## Phase 23 — Rive State Machine Production Build

### Vision
Replace the CSS animation rig entirely with a production Rive state machine, keeping all Phase 1–22 behaviors as named Rive inputs.

### Proposed Rive inputs (all existing CSS data-attrs become Rive booleans/numbers)
```
heading:            number   (degrees 0–360)
speed:              number   (m/s 0–100)
isNavigating:       boolean
isHelping:          boolean
hasNotification:    boolean
celebrating:        boolean
missionComplete:    boolean
skyTier:            number   (0=day, 1=golden, 2=twilight, 3=night)
trustLevel:         number   (0–1)
activityLevel:      number   (0–1)
batterySaver:       boolean
wairMode:           boolean
soaring:            boolean
matingDisplay:      boolean
communityMilestone: boolean
weather:            number   (0=clear, 1=rain, 2=snow)
```

### State machine layout
```
Flight Controller
  ├── Idle → Hover → Takeoff → Cruise → Glide → Landing → Perch
  ├── Banking L / Banking R (transition on heading delta)
  └── Compound overlays (all boolean inputs):
       celebrating / notification / accepted / donated
       helping / missionComplete / milestone / chirp

Sky Tier Mixer
  └── day / golden / twilight / night (lerp between plumage colour sets)

Trust Tier Animator
  └── none / growing / trusted / elder (drives Adinkra layer opacity)
```

### Implementation notes
- SVG bird stays as fallback (VITE_USE_RIVE_BIRD=false by default)
- SankofaBird.tsx already lazy-loads Rive behind a build flag
- public/SANKOFA_BIRD_RIVE_SPEC.md contains the full Rive spec
- Estimated timeline: 3–4 weeks for a production-quality Rive file

---

## Deferred Ideas (from vision documents, not yet phased)

These items from the original 7 vision documents are not yet assigned to a phase:

### Egg Physics (doc: "egg swings slightly on turns")
- The egg currently compensates neck rotation to stay level (Sankofa symbolism).
- A future phase could add a tiny pendulum swing (±2px, ~3° tilt) that returns to level over 400ms, reinforcing the "even while moving forward, carrying wisdom" metaphor.
- Implementation: CSS rotate on the egg element using --bank-angle CSS var at a 0.12× scale factor.

### Curiosity micro-behaviour (doc: "head tilts, eyes focus, tiny chirp → help request appears")
- Currently: notification fires head-tilt + wing-flick.
- Enhancement: add a 300ms "scanning" phase before the notification appears where the head makes a small left-right sweep, then locks toward the incoming request direction.

### Community Request Glow Radius (doc: "egg emits soft pulse that travels outward like a ripple")
- Currently: mission-complete ripple is tied to missionComplete prop.
- Enhancement: when a community has > N open requests, the egg permanently shows a faint pulsing halo at low zoom, acting as a "community health indicator" visible from a wide map view.

### Compass Button Integration (doc: "tap once: bird rotates. Tap twice: map rotates with bird")
- Not a bird animation per se, but the bird's heading behaviour should be integrated with a future compass button UI element that lets users toggle heading-up / north-up mode via the bird itself.

### Flapping rhythm variability (doc: "±5–15% random timing offsets")
- Currently: --flap-period drives a perfectly regular animation.
- Enhancement: A small random ±8% jitter could be added via a JavaScript setInterval that updates --flap-period with a noise function. Needs careful implementation to avoid jank.

### Leg animation on walking (doc: "tiny stepping motion")
- Currently: legs extend on landing but don't step during walking.
- Enhancement: At walking speed (data-speed=walking), the leg elements could alternate with a tiny 2px vertical offset to suggest stepping.

---

## Architecture Notes for Future Phases

### Adding a new data attribute
1. Add the prop to `SankofaBirdProps` interface in SankofaBirdSvg.tsx
2. Add a matching parameter in the function signature with a default value
3. Add the data attribute to the rig div (line ~820 in SankofaBirdSvg.tsx)
4. Add CSS selectors using the new data attribute
5. Update bird-test.tsx to expose a control for the new prop
6. Add a PCard demonstration in bird-phase-audit.tsx

### Adding a new CSS variable
1. Declare @property at the top of the style block (after existing @property declarations)
2. Add the var to the rig div's inline style object
3. Use var() in keyframes that need it

### Performance budget
- Target: 60 FPS on a 2019 mid-range Android (Snapdragon 710 / Mali-G76)
- Battery-saver mode must achieve this on a 2017 entry-level device
- Each new phase should be profiled on mobile before merge
- Rule: if a new effect causes > 2ms paint time increase on DevTools Performance panel, it must be guarded by battery-saver AND navLod

### iOS Safari-specific rules
- All CSS transforms on SVG elements must use `transform-box: view-box`
- @property declarations required for all CSS custom properties used in keyframes
- overflow: visible required at 3 levels: svg, container div, page body
- input font-size >= 16px to prevent Safari zoom (not bird-specific but affects adjacent UI)
