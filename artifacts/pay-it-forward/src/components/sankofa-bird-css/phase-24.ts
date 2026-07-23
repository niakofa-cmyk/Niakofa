/**
 * Sankofa Bird CSS — Phase 24: PHOTONIC LIGHTING SYSTEM
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE 24 — Directional Lighting + Feather Depth (July 2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Design brief (from art direction):
 *
 *   "As the bird turns: the top feathers brighten, the lower feathers deepen
 *    slightly, the gold beak catches light, the egg emits a soft warm glow
 *    during meaningful moments."
 *
 *   "Subtle tonal variation, gentle highlights, slight edge darkening,
 *    iridescent shifts as the bird moves."
 *
 *   "The neck is the biggest opportunity — make it communicate flexibility
 *    and elegance during head turns."
 *
 * ── What this phase adds ─────────────────────────────────────────────────
 *
 *   24.1 Directional feather brightening
 *        Outer primaries and crown feathers brighten with --lighting-factor
 *        (virtual sun at NW / 315°). At NW heading: top feathers at max
 *        brightness. At SE: they deepen (backlit silhouette effect).
 *
 *   24.2 Lower-feather shadow deepening
 *        Lower body feathers and inner primaries use (1 - --lighting-factor)
 *        to deepen, creating genuine tonal separation top-to-bottom.
 *
 *   24.3 Beak gold catchlight
 *        Upper beak warm-amber highlight, peaks when facing toward light
 *        (NW/W heading). Gives the beak a metallic gold quality in the light.
 *
 *   24.4 Egg warm glow during meaningful moments
 *        A pulsing amber halo activates on helping / nearby / donated /
 *        accepted / celebrating states. The egg feels like a lantern
 *        that lights up when community connection is active.
 *
 *   24.5 Neck luminosity and S-wave visibility
 *        The neck becomes more luminous when lit from above. S-wave overlay
 *        segments appear during flight/hover/landing for visible flex.
 *        The top sheen brightens with --lighting-factor.
 *
 *   24.6 Wing depth segmentation (shoulder/forearm/primary zones)
 *        Shoulder scapulars brighten most (closest to body heat).
 *        Covert band (forearm zone marker) responds to lighting.
 *        Wing surface highlight peaks with lighting-factor.
 *
 *   24.7 Feather edge darkening on shadow side
 *        When the bird turns away from the light, secondary feathers and
 *        inner primaries develop a subtle shadowed depth on their bases.
 *
 *   24.8 Body feather tonal variation
 *        Upper body feathers brighten, lower body feathers deepen,
 *        creating a spherical shading on the chest/belly ellipse.
 *
 *   24.9 Dynamic neck path visual styling
 *        The .sankofa-neck-dynamic path (driven by cubic-bezier JS in
 *        useAnimationMixer.ts) gets a luminous teal stroke with lighting-
 *        reactive brightness and a soft glow halo for depth.
 *
 *   24.10 Battery-saver + reduced-motion guards
 *
 * Design contract:
 *   - All rules ADDITIVE over Phase 23. No resets.
 *   - filter brightness clamped: max 1.18 on lit side, min 0.82 on shadow.
 *   - The lighting effect is perceptible but never harsh — like soft
 *     north-light through a studio window, not a flashlight.
 *   - No backtick characters inside this template literal (Babel crashes).
 *   - --lighting-factor is registered <number> in base.ts: safe for calc().
 */

// NOTE: Backtick characters inside CSS template literal strings crash Babel.
// Use only single/double quotes inside this string.

export const sankofaCssPhase24 = `

  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 24.1 — Directional outer-feather brightening
     Top feathers face the NW light source most directly. They brighten
     smoothly as --lighting-factor rises (0.18 backlit to 0.82 front-lit).
     "The top feathers brighten as the bird turns." — design brief
     ═══════════════════════════════════════════════════════════════════════ */

  /* Outer primaries (r5/r0/l5/l0) — outermost, highest surface area, catch light first */
  .sankofa-feather-r5,
  .sankofa-feather-r0,
  .sankofa-feather-l5,
  .sankofa-feather-l0 {
    filter: brightness(calc(0.87 + var(--lighting-factor, 0.5) * 0.30));
    transition: filter 0.45s ease;
  }

  /* Mid primaries (r1/r2/l1/l2) — intermediate brightening */
  .sankofa-feather-r1,
  .sankofa-feather-r2,
  .sankofa-feather-l1,
  .sankofa-feather-l2 {
    filter: brightness(calc(0.89 + var(--lighting-factor, 0.5) * 0.22));
    transition: filter 0.45s ease;
  }

  /* Inner primaries (r3/r4/l3/l4) — subtle brightening (under shoulder shadow) */
  .sankofa-feather-r3,
  .sankofa-feather-r4,
  .sankofa-feather-l3,
  .sankofa-feather-l4 {
    filter: brightness(calc(0.90 + var(--lighting-factor, 0.5) * 0.16));
    transition: filter 0.45s ease;
  }

  /* Crown feathers — lit from above, brighten strongly */
  .sankofa-crown-feather {
    filter: brightness(calc(0.88 + var(--lighting-factor, 0.5) * 0.28));
    transition: filter 0.50s ease;
  }

  /* Head sphere — brightens toward light source */
  .sankofa-head-luminary {
    opacity: calc(0.12 + var(--lighting-factor, 0.5) * 0.22);
    transition: opacity 0.40s ease;
  }

  /* Wing highlight — leading-edge strip brightens with lighting */
  .sankofa-bird-wing-right-highlight,
  .sankofa-bird-wing-left-highlight {
    opacity: calc(0.40 + var(--lighting-factor, 0.5) * 0.30);
    transition: opacity 0.40s ease;
  }

  /* Covert band visible at rest, slightly more lit on top-lit headings */
  .sankofa-wing-covert-band {
    opacity: calc(0.13 + var(--lighting-factor, 0.5) * 0.16);
    transition: opacity 0.40s ease;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 24.2 — Lower-feather shadow deepening
     When the top is lit, the underside is in relative shadow.
     Lower body feathers and secondaries deepen on their bases.
     "The lower feathers deepen slightly." — design brief
     ═══════════════════════════════════════════════════════════════════════ */

  /* Secondary feathers (under primary shadow) deepen as top brightens */
  .sankofa-feather-rs1,
  .sankofa-feather-rs2,
  .sankofa-feather-rs3,
  .sankofa-feather-ls1,
  .sankofa-feather-ls2,
  .sankofa-feather-ls3 {
    filter: brightness(calc(1.04 - var(--lighting-factor, 0.5) * 0.18));
    transition: filter 0.45s ease;
  }

  /* Lower body feathers — inverted lighting: deepens when top is lit */
  .sankofa-body-feather-4,
  .sankofa-body-feather-5,
  .sankofa-body-feather-6,
  .sankofa-body-feather-10,
  .sankofa-body-feather-11 {
    filter: brightness(calc(1.06 - var(--lighting-factor, 0.5) * 0.24));
    transition: filter 0.50s ease;
  }

  /* Upper body feathers follow the outer primaries (chest catches light) */
  .sankofa-body-feather-1,
  .sankofa-body-feather-2,
  .sankofa-body-feather-3 {
    filter: brightness(calc(0.90 + var(--lighting-factor, 0.5) * 0.20));
    transition: filter 0.50s ease;
  }

  /* Breast sheen: visible when lit from NW */
  .sankofa-breast-sheen {
    opacity: calc(var(--lighting-factor, 0.5) * 0.28);
    transition: opacity 0.40s ease;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 24.3 — Beak gold catchlight
     The beak catches a warm amber highlight when facing toward the light.
     "The gold beak catches light." — design brief
     Light source at NW (315deg). Max catchlight when beak faces NW/W.
     ═══════════════════════════════════════════════════════════════════════ */

  /* Base: beak catchlight opacity driven by lighting-factor */
  .sankofa-beak-catchlight {
    opacity: calc(0.02 + var(--lighting-factor, 0.5) * 0.56);
    filter: sepia(0.45) hue-rotate(-18deg) saturate(1.6) brightness(1.25);
    transition: opacity 0.40s ease, filter 0.45s ease;
  }

  /* NW/W headings: maximum warm gold (beak faces light source) */
  .sankofa-bird-rig[data-heading-quadrant="NW"] .sankofa-beak-catchlight,
  .sankofa-bird-rig[data-heading-quadrant="W"] .sankofa-beak-catchlight {
    filter: sepia(0.70) hue-rotate(-28deg) saturate(2.0) brightness(1.38);
  }

  /* N heading: strong catchlight (almost facing the light) */
  .sankofa-bird-rig[data-heading-quadrant="N"] .sankofa-beak-catchlight {
    filter: sepia(0.55) hue-rotate(-22deg) saturate(1.75) brightness(1.30);
  }

  /* S/SE/SW headings: beak in shadow — minimal catchlight */
  .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-beak-catchlight,
  .sankofa-bird-rig[data-heading-quadrant="SE"] .sankofa-beak-catchlight,
  .sankofa-bird-rig[data-heading-quadrant="SW"] .sankofa-beak-catchlight {
    filter: sepia(0.10) hue-rotate(0deg) saturate(1.05) brightness(0.90);
  }

  /* Beak gloss: also driven by lighting */
  .sankofa-beak-gloss {
    opacity: calc(0.08 + var(--lighting-factor, 0.5) * 0.18);
    transition: opacity 0.40s ease;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 24.4 — Egg warm glow during meaningful moments
     "The egg emits a soft warm glow during meaningful moments." — design brief
     Triggers: helping, nearby user, donated, accepted, celebrating.
     The egg halo shifts from cool teal to warm amber/gold.
     ═══════════════════════════════════════════════════════════════════════ */

  /* Warm-glow keyframe: subtle pulsing amber light */
  @keyframes sankofa-egg-warmglow {
    0%   { opacity: 0.0; filter: none; }
    35%  { opacity: 0.58; filter: sepia(0.6) hue-rotate(-25deg) saturate(1.8) brightness(1.15); }
    65%  { opacity: 0.52; filter: sepia(0.5) hue-rotate(-20deg) saturate(1.6) brightness(1.10); }
    100% { opacity: 0.0; filter: none; }
  }

  /* Gentle pulse for soft triggers: helping, nearby, accepted */
  .sankofa-bird-rig[data-helping="true"] .sankofa-egg-warmglow,
  .sankofa-bird-rig[data-nearby-user="true"] .sankofa-egg-warmglow,
  .sankofa-bird-rig[data-accepted="true"] .sankofa-egg-warmglow {
    animation: sankofa-egg-warmglow 2.8s ease-in-out infinite;
  }

  /* Donated state: warmer, faster pulse */
  .sankofa-bird-rig[data-donated="true"] .sankofa-egg-warmglow {
    animation: sankofa-egg-warmglow 1.8s ease-in-out infinite;
  }

  /* Celebrating: steady warm radiance, no pulse — just glowing */
  .sankofa-bird-rig[data-celebrating="true"] .sankofa-egg-warmglow {
    opacity: 0.72;
    filter: sepia(0.75) hue-rotate(-30deg) saturate(2.0) brightness(1.20);
    animation: none;
  }

  /* Egg sphere takes on a gentle warmth during these states */
  .sankofa-bird-rig[data-helping="true"] .sankofa-bird-egg,
  .sankofa-bird-rig[data-nearby-user="true"] .sankofa-bird-egg {
    filter: sepia(0.20) hue-rotate(-12deg) saturate(1.15) brightness(1.06);
    transition: filter 0.9s ease;
  }

  /* Egg halo deepens its warm cast on donated/accepted */
  .sankofa-bird-rig[data-donated="true"] .sankofa-egg-glow-halo,
  .sankofa-bird-rig[data-accepted="true"] .sankofa-egg-glow-halo {
    filter: sepia(0.55) hue-rotate(-22deg) saturate(1.7) brightness(1.12);
    transition: filter 0.7s ease;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 24.5 — Neck luminosity and S-wave visibility
     "The neck is the biggest opportunity." — design brief
     The S-wave overlay segments appear during flight/hover/landing to show
     genuine flex. The neck brightens on the lit side.
     ═══════════════════════════════════════════════════════════════════════ */

  /* Dynamic neck path — driven by cubic-bezier JS in useAnimationMixer.
     Starts at opacity 0; JS sets it to 1 once the rAF loop is running.
     Styling: luminous teal, slightly brighter than the static segments. */
  .sankofa-neck-dynamic {
    filter: brightness(calc(0.90 + var(--lighting-factor, 0.5) * 0.28));
    stroke: #0FE5D4;
    transition: filter 0.35s ease;
  }

  /* Static neck segments (hidden when dynamic path takes over) */
  .sankofa-neck-lower-seg,
  .sankofa-neck-upper-seg {
    filter: brightness(calc(0.88 + var(--lighting-factor, 0.5) * 0.26));
    transition: filter 0.35s ease, opacity 0.15s ease;
  }

  /* Neck luminary overlays: respond to lighting direction */
  .sankofa-neck-luminary {
    opacity: calc(0.10 + var(--lighting-factor, 0.5) * 0.20);
    transition: opacity 0.35s ease;
  }

  /* Upper neck secondary sheen: brighter on lit side */
  .sankofa-neck-luminary-2 {
    opacity: calc(0.18 + var(--lighting-factor, 0.5) * 0.30);
    transition: opacity 0.35s ease;
  }

  /* Neck top sheen: the narrow highlight strip on the upper-neck curve */
  .sankofa-neck-top-sheen {
    opacity: calc(0.25 + var(--lighting-factor, 0.5) * 0.48);
    transition: opacity 0.35s ease;
  }

  /* S-wave segments: appear during active states to show flex */
  .sankofa-neck-seg-1,
  .sankofa-neck-seg-2 {
    transition: opacity 0.30s ease;
  }

  /* Flying: S-wave shows gently — neck flexes with the flap cycle */
  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"])
    .sankofa-neck-seg-1 {
    opacity: calc(0.14 + var(--lighting-factor, 0.5) * 0.20);
  }
  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"])
    .sankofa-neck-seg-2 {
    opacity: calc(0.10 + var(--lighting-factor, 0.5) * 0.18);
  }

  /* Gliding: stronger S-curve (neck stretched forward under aero load) */
  .sankofa-bird-rig[data-gliding="true"]:not([data-battery-saver="true"])
    .sankofa-neck-seg-1 {
    opacity: 0.32;
  }
  .sankofa-bird-rig[data-gliding="true"]:not([data-battery-saver="true"])
    .sankofa-neck-seg-2 {
    opacity: 0.24;
  }

  /* Landing: maximum S-curve visibility (head pitches back, neck arches) */
  .sankofa-bird-rig[data-landing="true"]:not([data-battery-saver="true"])
    .sankofa-neck-seg-1 {
    opacity: 0.40;
  }
  .sankofa-bird-rig[data-landing="true"]:not([data-battery-saver="true"])
    .sankofa-neck-seg-2 {
    opacity: 0.32;
  }

  /* Hovering: neck in maximal attention posture */
  .sankofa-bird-rig[data-wing-pose="up"]:not([data-battery-saver="true"])
    .sankofa-neck-seg-1,
  .sankofa-bird-rig[data-wing-pose="forward"]:not([data-battery-saver="true"])
    .sankofa-neck-seg-1 {
    opacity: 0.30;
  }
  .sankofa-bird-rig[data-wing-pose="up"]:not([data-battery-saver="true"])
    .sankofa-neck-seg-2,
  .sankofa-bird-rig[data-wing-pose="forward"]:not([data-battery-saver="true"])
    .sankofa-neck-seg-2 {
    opacity: 0.22;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 24.6 — Wing depth segmentation (shoulder / forearm / primary)
     Each anatomical zone of the wing responds differently to the light.
     "Shoulder to Upper Wing to Forearm to Primary Feathers"
     ═══════════════════════════════════════════════════════════════════════ */

  /* Scapulars (shoulder feathers) — closest to body, lit from above */
  .sankofa-wing-scap {
    opacity: calc(0.08 + var(--lighting-factor, 0.5) * 0.18);
    filter: brightness(calc(0.88 + var(--lighting-factor, 0.5) * 0.24));
    transition: opacity 0.40s ease, filter 0.40s ease;
  }

  /* Covert feather (forearm zone marker) — moderate lighting response */
  .sankofa-feather-rc1,
  .sankofa-feather-lc1 {
    filter: brightness(calc(0.90 + var(--lighting-factor, 0.5) * 0.18));
    transition: filter 0.40s ease;
  }

  /* Wing luminary overlays — shoulder/forearm zone glow with lighting */
  .sankofa-wing-luminary-r-a,
  .sankofa-wing-luminary-l-a {
    opacity: calc(0.10 + var(--lighting-factor, 0.5) * 0.18);
    transition: opacity 0.40s ease;
  }
  .sankofa-wing-luminary-r-b,
  .sankofa-wing-luminary-l-b {
    opacity: calc(0.06 + var(--lighting-factor, 0.5) * 0.12);
    transition: opacity 0.40s ease;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 24.7 — Feather edge darkening on shadow side
     "Slight edge darkening." — design brief
     When lighting-factor is low (backlit/shadow heading), the feather
     iridescent edges darken and the luminary overlays contract.
     ═══════════════════════════════════════════════════════════════════════ */

  /* Feather iridescent edges deepen on shadow headings (E/NE = backlit in NW light) */
  .sankofa-bird-rig[data-heading-quadrant="E"] .sankofa-feather-iri-edge,
  .sankofa-bird-rig[data-heading-quadrant="NE"] .sankofa-feather-iri-edge {
    filter: brightness(0.88) saturate(0.90);
  }

  /* SE/S heading: backlit — deepest edge shadow (silhouette against light) */
  .sankofa-bird-rig[data-heading-quadrant="SE"] .sankofa-feather-iri-edge,
  .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-feather-iri-edge {
    filter: brightness(0.82) saturate(0.85);
  }

  /* Wing surface on shadow headings: slight overall darkening for realism */
  .sankofa-bird-rig[data-heading-quadrant="SE"] .sankofa-bird-wing-right,
  .sankofa-bird-rig[data-heading-quadrant="SE"] .sankofa-bird-wing-left,
  .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-bird-wing-right,
  .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-bird-wing-left {
    filter: hue-rotate(-18deg) saturate(1.15) brightness(0.88);
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 24.8 — Body feather tonal variation (spherical shading)
     Upper body feathers catch the overhead light. Lower belly feathers sit
     in the body shadow. Creates genuine 3D spherical depth on the body.
     "Subtle tonal variation within the feathers." — design brief
     ═══════════════════════════════════════════════════════════════════════ */

  /* Mid body feathers (row 2) — moderate lighting response */
  .sankofa-body-feather-7,
  .sankofa-body-feather-8,
  .sankofa-body-feather-9 {
    filter: brightness(calc(0.92 + var(--lighting-factor, 0.5) * 0.14));
    transition: filter 0.50s ease;
  }

  /* Body luminary layer: strengthens with lighting (chest glows when lit) */
  .sankofa-body-luminary-layer {
    opacity: calc(0.30 + var(--lighting-factor, 0.5) * 0.16);
    transition: opacity 0.40s ease;
  }

  /* Chest glow halo: more visible when facing NW light */
  .sankofa-body-glow-halo {
    opacity: calc(0.28 + var(--lighting-factor, 0.5) * 0.22);
    transition: opacity 0.45s ease;
  }

  /* Body cyan shimmer: brightens when lit from above */
  .sankofa-body-cyan-shimmer {
    opacity: calc(0.16 + var(--lighting-factor, 0.5) * 0.16);
    transition: opacity 0.40s ease;
  }

  /* Wing-root overlap glow: brightest when shoulder faces light */
  .sankofa-body-wing-glow {
    opacity: calc(0.12 + var(--lighting-factor, 0.5) * 0.16);
    transition: opacity 0.40s ease;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 24.9 — Dynamic neck path visual styling
     The .sankofa-neck-dynamic path is written by JS in useAnimationMixer.ts
     on every rAF frame. This CSS styles it so it integrates with the
     existing neck luminary system: luminous teal stroke, lighting-reactive
     brightness, and a glow halo layer for depth.
     ═══════════════════════════════════════════════════════════════════════ */

  /* Dynamic neck: base style identical to main neck segments */
  .sankofa-neck-dynamic {
    stroke-width: 3.2;
    stroke-linecap: round;
    fill: none;
  }

  /* Dynamic neck glow halo — a wider, more transparent copy */
  .sankofa-neck-dynamic-halo {
    stroke-width: 5.2;
    stroke-linecap: round;
    fill: none;
    stroke: #0FE5D4;
    opacity: calc(0.10 + var(--lighting-factor, 0.5) * 0.14);
    pointer-events: none;
    filter: blur(0.8px);
    transition: opacity 0.35s ease;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 24.10 — Battery-saver + reduced-motion guards
     Filter calculations are GPU-intensive. Battery-saver mode strips them.
     ═══════════════════════════════════════════════════════════════════════ */

  /* Battery-saver: disable all Phase 24 filter/opacity animations */
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-r5,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-r0,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-r1,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-r2,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-r3,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-r4,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-l5,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-l0,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-l1,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-l2,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-l3,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-l4 {
    filter: none !important;
    transition: none !important;
  }
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-crown-feather {
    filter: none !important;
    transition: none !important;
  }
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-rs1,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-rs2,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-rs3,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-ls1,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-ls2,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-ls3 {
    filter: none !important;
  }
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-body-feather-1,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-body-feather-2,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-body-feather-3,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-body-feather-4,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-body-feather-5,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-body-feather-6,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-body-feather-7,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-body-feather-8,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-body-feather-9,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-body-feather-10,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-body-feather-11 {
    filter: none !important;
  }
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-beak-catchlight {
    opacity: 0 !important;
    animation: none !important;
  }
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-egg-warmglow {
    opacity: 0 !important;
    animation: none !important;
    filter: none !important;
  }
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-neck-seg-1,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-neck-seg-2 {
    opacity: 0 !important;
  }
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-neck-lower-seg,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-neck-upper-seg,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-neck-dynamic {
    filter: none !important;
  }
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-wing-scap {
    filter: none !important;
  }

  /* Reduced-motion: disable filter transitions and animations */
  @media (prefers-reduced-motion: reduce) {
    .sankofa-feather-r5, .sankofa-feather-r0, .sankofa-feather-r1,
    .sankofa-feather-r2, .sankofa-feather-r3, .sankofa-feather-r4,
    .sankofa-feather-l5, .sankofa-feather-l0, .sankofa-feather-l1,
    .sankofa-feather-l2, .sankofa-feather-l3, .sankofa-feather-l4,
    .sankofa-crown-feather,
    .sankofa-feather-rs1, .sankofa-feather-rs2, .sankofa-feather-rs3,
    .sankofa-feather-ls1, .sankofa-feather-ls2, .sankofa-feather-ls3,
    .sankofa-body-feather-1, .sankofa-body-feather-2, .sankofa-body-feather-3,
    .sankofa-body-feather-4, .sankofa-body-feather-5, .sankofa-body-feather-6,
    .sankofa-body-feather-7, .sankofa-body-feather-8, .sankofa-body-feather-9,
    .sankofa-body-feather-10, .sankofa-body-feather-11,
    .sankofa-neck-lower-seg, .sankofa-neck-upper-seg, .sankofa-neck-dynamic,
    .sankofa-wing-scap, .sankofa-feather-rc1, .sankofa-feather-lc1 {
      filter: none !important;
      transition: none !important;
    }
    .sankofa-beak-catchlight {
      opacity: 0 !important;
      animation: none !important;
    }
    .sankofa-egg-warmglow {
      opacity: 0 !important;
      animation: none !important;
    }
  }

`;
