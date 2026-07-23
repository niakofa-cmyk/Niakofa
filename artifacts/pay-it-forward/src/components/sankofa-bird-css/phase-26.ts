/**
 * Sankofa Bird CSS — Phase 26: LUMINOUS DEPTH & ORGANIC LIFE
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE 26 — Living Feathers: Asymmetry, Depth, and Atmospheric Warmth
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Design brief:
 *
 *   "Visual depth: gentle gradients or highlights could make feathers feel
 *    richer without making the icon busy."
 *
 *   "Organic asymmetry: Real birds aren't perfectly symmetrical. A tiny
 *    amount of variation in feather overlap or contour can make a character
 *    feel more natural — controlled irregularity."
 *
 *   "Atmospheric lighting: the layered tail feathers already hint at that
 *    idea. Extending similar subtle lighting to wing and body."
 *
 *   "A lighting system: top feathers brighten, lower feathers deepen
 *    slightly, the gold beak catches light, the egg emits a soft warm glow
 *    during meaningful moments."
 *
 *   "Give feathers just a little more life: subtle tonal variation,
 *    gentle highlights, slight edge darkening, iridescent shifts."
 *
 * ── What this phase adds ──────────────────────────────────────────────────
 *
 *   26.1 Organic Asymmetry
 *        Right and left wings are no longer pixel-identical. The outer
 *        right primary sits at 2deg warmer hue than left. Secondary rows
 *        have staggered breath-timing so they never pulse in perfect sync.
 *        Covert bands differ in micro-opacity. The difference is felt, not
 *        seen — the bird reads as hand-crafted, not mirrored.
 *
 *   26.2 Feather Luminous Breath
 *        Every primary feather row breathes on its own slow cycle (8-14s).
 *        Outer tips: slower, wider amplitude (they catch more light).
 *        Inner root feathers: faster, quieter (they're sheltered).
 *        Each feather has a unique animation-delay so they never sync up.
 *        The effect: the wing surface shimmers gently, like looking at real
 *        structural coloration in motion.
 *
 *   26.3 Full Lighting-from-Above System
 *        data-flying="true" activates a spherical lighting model:
 *        - Shoulder / upper-body zone: brightest (catches sky light)
 *        - Forearm / secondary zone: mid-brightness
 *        - Primary tips: brightest extremity, bases transitional
 *        - Lower body / belly ellipse: subtly deeper (in body shadow)
 *        - Dorsal highlight path: slim luminous stripe across the top back
 *        The beak and egg respond to this same lighting cycle.
 *
 *   26.4 Wing Anatomy Zone Segmentation
 *        CSS now distinguishes three wing zones:
 *          Shoulder  (scapulars)    — brightest, widest
 *          Forearm   (secondaries)  — mid, tighter angle
 *          Primary   (flight feathers) — tip-to-root gradient in both
 *                                         luminance and iridescence
 *        Each zone has its own brightness and hue-shift curve as the bird
 *        turns, matching how light actually plays across a real wing surface.
 *
 *   26.5 Body Depth — Belly Shadow + Dorsal Stripe
 *        A semi-transparent darker ellipse at the lower body becomes visible
 *        during flight (belly in shadow of wings). A slim bright path across
 *        the dorsal surface shows the upward sky-light catch. Together they
 *        give the body genuine spherical shading, not a flat fill.
 *
 *   26.6 Egg Warm Atmosphere
 *        The egg warmglow now also activates on data-nearby="true" and
 *        data-accepted="true" (previously only helping/celebrating/donated).
 *        A secondary body-chest warmth halo spreads outward from the egg
 *        on meaningful moments, softening the boundary between bird and aura.
 *        The egg ripple gets a subtler secondary wave (half-opacity, offset).
 *
 *   26.7 Enhanced Tail Fan Luminosity
 *        The tail luminary inner/outer paths now have a slow depth-breathing
 *        animation — the tail fan shimmers at rest, like translucent feathers
 *        catching a breeze. The far rectrices get a micro-tonal highlight at
 *        their tips that brightens on landing (ground effect turbulence glow).
 *
 *   26.8 Battery-saver + reduced-motion guards
 *        All Phase 26 animations are disabled under data-battery-saver="true"
 *        and prefers-reduced-motion: reduce.
 *
 * Design contract:
 *   - All rules ADDITIVE over Phases 1-25. No resets.
 *   - Asymmetry offsets: max 3deg hue, max 0.04 opacity delta.
 *   - Breath amplitudes: max 0.06 opacity swing on outers, 0.03 on inners.
 *   - Lighting brightening: max brightness(1.18) on shoulder zone.
 *   - Belly deepening: min brightness(0.88).
 *   - No backtick characters inside this template literal (Babel crashes).
 */

// NOTE: No backtick characters inside this CSS template literal string.

export const sankofaCssPhase26 = `

  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 26.1 — Organic Asymmetry: L/R Wing Differentiation
     The right wing reads 2deg warmer at the outer tip; the left reads
     1deg cooler. Opacity deltas are at the threshold of conscious notice —
     felt as aliveness rather than seen as a design choice.
     ═══════════════════════════════════════════════════════════════════════ */

  /* Permanent baseline asymmetry — right wing outer primary is warmer */
  .sankofa-feather-r5 {
    filter: hue-rotate(2deg) saturate(1.03);
    transition: filter 0.55s ease, opacity 0.45s ease;
  }
  .sankofa-feather-l5 {
    filter: hue-rotate(-1deg) saturate(1.01);
    transition: filter 0.55s ease, opacity 0.45s ease;
  }

  /* Right wing r0 primary: very subtly warmer than l0 */
  .sankofa-feather-r0 {
    filter: hue-rotate(1deg);
    transition: filter 0.55s ease, opacity 0.45s ease;
  }
  .sankofa-feather-l0 {
    filter: hue-rotate(-0.5deg);
    transition: filter 0.55s ease, opacity 0.45s ease;
  }

  /* Covert bands: right slightly more visible than left — natural overlap */
  .sankofa-wing-covert-band-r {
    opacity: 0.14;
  }
  .sankofa-wing-covert-band-l {
    opacity: 0.10;
  }

  /* Scapulars: right pair sits slightly higher luminosity */
  .sankofa-wing-scap-r1 {
    opacity: 0.14;
  }
  .sankofa-wing-scap-l1 {
    opacity: 0.11;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 26.2 — Feather Luminous Breath
     Each primary feather row breathes independently. Outer tips: slow and
     wide (they catch the most light). Inner roots: faster and quieter.
     Staggered delays prevent any two feathers syncing — this is the
     "organic" quality of real structural coloration catching light.
     ═══════════════════════════════════════════════════════════════════════ */

  /* Outer primary breath — slow, wide amplitude */
  @keyframes sankofa-breath-outer {
    0%   { opacity: 0.92; }
    38%  { opacity: 0.87; }
    72%  { opacity: 0.91; }
    100% { opacity: 0.92; }
  }

  /* Mid primary breath — medium, slightly faster */
  @keyframes sankofa-breath-mid {
    0%   { opacity: 0.80; }
    42%  { opacity: 0.75; }
    100% { opacity: 0.80; }
  }

  /* Inner primary breath — quick, quiet */
  @keyframes sankofa-breath-inner {
    0%   { opacity: 0.67; }
    55%  { opacity: 0.63; }
    100% { opacity: 0.67; }
  }

  /* Secondary breath — gentler than primaries */
  @keyframes sankofa-breath-secondary {
    0%   { opacity: 0.62; }
    48%  { opacity: 0.58; }
    100% { opacity: 0.62; }
  }

  /* Apply breath animations — each feather gets a unique delay */
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-r5 {
    animation: sankofa-breath-outer 11.2s ease-in-out infinite;
    animation-delay: -0.0s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-l5 {
    animation: sankofa-breath-outer 11.2s ease-in-out infinite;
    animation-delay: -2.8s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-r0 {
    animation: sankofa-breath-outer 12.5s ease-in-out infinite;
    animation-delay: -4.1s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-l0 {
    animation: sankofa-breath-outer 12.5s ease-in-out infinite;
    animation-delay: -1.7s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-r1 {
    animation: sankofa-breath-mid 9.8s ease-in-out infinite;
    animation-delay: -3.2s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-l1 {
    animation: sankofa-breath-mid 9.8s ease-in-out infinite;
    animation-delay: -5.9s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-r2 {
    animation: sankofa-breath-mid 10.6s ease-in-out infinite;
    animation-delay: -0.8s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-l2 {
    animation: sankofa-breath-mid 10.6s ease-in-out infinite;
    animation-delay: -6.3s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-r3 {
    animation: sankofa-breath-inner 8.4s ease-in-out infinite;
    animation-delay: -1.5s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-l3 {
    animation: sankofa-breath-inner 8.4s ease-in-out infinite;
    animation-delay: -4.6s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-r4 {
    animation: sankofa-breath-inner 7.6s ease-in-out infinite;
    animation-delay: -2.2s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-l4 {
    animation: sankofa-breath-inner 7.6s ease-in-out infinite;
    animation-delay: -5.1s;
  }

  /* Secondary feathers: different breath period */
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-rs1 {
    animation: sankofa-breath-secondary 13.4s ease-in-out infinite;
    animation-delay: -3.7s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-ls1 {
    animation: sankofa-breath-secondary 13.4s ease-in-out infinite;
    animation-delay: -8.2s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-rs2 {
    animation: sankofa-breath-secondary 14.1s ease-in-out infinite;
    animation-delay: -1.1s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-ls2 {
    animation: sankofa-breath-secondary 14.1s ease-in-out infinite;
    animation-delay: -6.8s;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 26.3 — Full Lighting-from-Above System
     When flying, a spherical light model activates: the dorsal surface
     brightens (sky light), the belly deepens (body shadow), wing shoulder
     zone is brightest (closest to sky), primary tips glow at leading edge.
     ═══════════════════════════════════════════════════════════════════════ */

  /* FLYING: dorsal highlight becomes visible */
  .sankofa-bird-rig[data-flying="true"] .sankofa-dorsal-hi {
    opacity: 0.24;
    transition: opacity 0.8s ease;
  }

  /* FLYING: belly shadow activates */
  .sankofa-bird-rig[data-flying="true"] .sankofa-belly-shadow {
    opacity: 0.18;
    transition: opacity 0.8s ease;
  }

  /* FLYING: body luminary layer brightens (more sky) */
  .sankofa-bird-rig[data-flying="true"] .sankofa-body-luminary-layer {
    opacity: 0.68;
    transition: opacity 0.8s ease;
  }

  /* FLYING: breast sheen becomes gently visible */
  .sankofa-bird-rig[data-flying="true"] .sankofa-breast-sheen {
    opacity: calc(0.06 + var(--lighting-factor, 0.5) * 0.10);
    transition: opacity 0.7s ease;
  }

  /* FLYING: crown feathers catch sky light */
  .sankofa-bird-rig[data-flying="true"] .sankofa-crown-feather {
    filter: brightness(1.08) saturate(1.06);
    transition: filter 0.7s ease;
  }

  /* FLYING: beak gloss intensifies — golden top-light catch */
  .sankofa-bird-rig[data-flying="true"] .sankofa-beak-gloss {
    opacity: calc(0.10 + var(--lighting-factor, 0.5) * 0.28);
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 26.4 — Wing Anatomy Zone Segmentation
     Shoulder zone (scapulars) is brightest — directly under sky light.
     Forearm zone (secondaries) is intermediate.
     Primary tips are luminous; primary bases transition to shadow.
     This mirrors how light actually distributes across a real wing.
     ═══════════════════════════════════════════════════════════════════════ */

  /* SHOULDER ZONE — scapulars: brightest wing zone */
  .sankofa-bird-rig[data-flying="true"] .sankofa-wing-scap-r1,
  .sankofa-bird-rig[data-flying="true"] .sankofa-wing-scap-r2,
  .sankofa-bird-rig[data-flying="true"] .sankofa-wing-scap-l1,
  .sankofa-bird-rig[data-flying="true"] .sankofa-wing-scap-l2 {
    opacity: calc(0.16 + var(--lighting-factor, 0.5) * 0.12);
    filter: brightness(1.14) saturate(1.10);
    transition: opacity 0.65s ease, filter 0.65s ease;
  }

  /* FOREARM ZONE — secondaries: medium brightness */
  .sankofa-bird-rig[data-flying="true"] .sankofa-feather-rs1,
  .sankofa-bird-rig[data-flying="true"] .sankofa-feather-rs2,
  .sankofa-bird-rig[data-flying="true"] .sankofa-feather-rs3,
  .sankofa-bird-rig[data-flying="true"] .sankofa-feather-ls1,
  .sankofa-bird-rig[data-flying="true"] .sankofa-feather-ls2,
  .sankofa-bird-rig[data-flying="true"] .sankofa-feather-ls3 {
    filter: brightness(calc(1.04 + var(--lighting-factor, 0.5) * 0.08)) saturate(1.06);
    transition: filter 0.65s ease;
  }

  /* PRIMARY TIP ZONE — outer primaries: luminous leading edge */
  .sankofa-bird-rig[data-flying="true"] .sankofa-feather-r5,
  .sankofa-bird-rig[data-flying="true"] .sankofa-feather-l5 {
    filter: brightness(calc(1.06 + var(--lighting-factor, 0.5) * 0.12))
            hue-rotate(2deg) saturate(1.12);
  }
  .sankofa-bird-rig[data-flying="true"] .sankofa-feather-r0,
  .sankofa-bird-rig[data-flying="true"] .sankofa-feather-l0 {
    filter: brightness(calc(1.04 + var(--lighting-factor, 0.5) * 0.10))
            hue-rotate(1deg) saturate(1.09);
  }

  /* PRIMARY BASE ZONE — inner primaries: transitional / partial shadow */
  .sankofa-bird-rig[data-flying="true"] .sankofa-feather-r3,
  .sankofa-bird-rig[data-flying="true"] .sankofa-feather-l3,
  .sankofa-bird-rig[data-flying="true"] .sankofa-feather-r4,
  .sankofa-bird-rig[data-flying="true"] .sankofa-feather-l4 {
    filter: brightness(calc(0.96 - var(--lighting-factor, 0.5) * 0.04)) saturate(0.97);
    transition: filter 0.65s ease;
  }

  /* COVERT ZONE: slight brightening when flying — they arch upward into light */
  .sankofa-bird-rig[data-flying="true"] .sankofa-feather-rc1,
  .sankofa-bird-rig[data-flying="true"] .sankofa-feather-lc1 {
    filter: brightness(1.06) saturate(1.08);
    transition: filter 0.65s ease;
  }

  /* Wing luminary layers: strengthen during flight */
  .sankofa-bird-rig[data-flying="true"] .sankofa-wing-luminary-r-a,
  .sankofa-bird-rig[data-flying="true"] .sankofa-wing-luminary-l-a {
    opacity: 0.28;
    transition: opacity 0.7s ease;
  }
  .sankofa-bird-rig[data-flying="true"] .sankofa-wing-luminary-r-b,
  .sankofa-bird-rig[data-flying="true"] .sankofa-wing-luminary-l-b {
    opacity: 0.20;
    transition: opacity 0.7s ease;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 26.5 — Body Depth: Belly Shadow + Dorsal Stripe
     At rest, both are hidden. Flying activates them (handled in 26.3).
     Landing shows a brief ground-effect glow on the belly edge.
     ═══════════════════════════════════════════════════════════════════════ */

  /* Base state: hidden */
  .sankofa-belly-shadow,
  .sankofa-dorsal-hi {
    opacity: 0;
    transition: opacity 0.8s ease;
  }

  /* LANDING: ground-effect brightens belly edge briefly */
  @keyframes sankofa-ground-glow {
    0%   { opacity: 0; }
    20%  { opacity: 0.22; }
    60%  { opacity: 0.14; }
    100% { opacity: 0; }
  }

  .sankofa-bird-rig[data-landing="approach"]:not([data-battery-saver="true"])
    .sankofa-belly-shadow {
    animation: sankofa-ground-glow 2.8s ease-out forwards;
  }

  /* Body feathers gain tonal variation: upper rows brighter, lower rows deeper */
  .sankofa-body-feather-1,
  .sankofa-body-feather-2,
  .sankofa-body-feather-3 {
    filter: brightness(1.05) saturate(1.04);
    transition: filter 0.6s ease;
  }

  .sankofa-body-feather-7,
  .sankofa-body-feather-8,
  .sankofa-body-feather-9 {
    filter: brightness(1.02) saturate(1.02);
    transition: filter 0.6s ease;
  }

  .sankofa-body-feather-10,
  .sankofa-body-feather-11 {
    filter: brightness(0.96) saturate(0.98) hue-rotate(-3deg);
    transition: filter 0.6s ease;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 26.6 — Egg Warm Atmosphere Enhancement
     Warm glow now activates on more community states. A secondary body
     warmth halo spreads outward from the egg on meaningful moments.
     The egg ripple gets a second wave offset by half a cycle.
     ═══════════════════════════════════════════════════════════════════════ */

  /* Egg warmglow: activate on nearby + accepted (was only helping/donated/celebrating) */
  .sankofa-bird-rig[data-nearby="true"] .sankofa-egg-warmglow,
  .sankofa-bird-rig[data-accepted="true"] .sankofa-egg-warmglow {
    opacity: 0.28;
    transition: opacity 0.7s ease;
  }

  /* Egg warmglow: strengthen on the original states */
  .sankofa-bird-rig[data-helping="true"] .sankofa-egg-warmglow,
  .sankofa-bird-rig[data-celebrating="true"] .sankofa-egg-warmglow,
  .sankofa-bird-rig[data-donated="true"] .sankofa-egg-warmglow {
    opacity: 0.42;
    transition: opacity 0.5s ease;
  }

  /* Body glow halo: spreads outward on meaningful states (warm community connection) */
  .sankofa-bird-rig[data-helping="true"] .sankofa-body-glow-halo,
  .sankofa-bird-rig[data-celebrating="true"] .sankofa-body-glow-halo,
  .sankofa-bird-rig[data-donated="true"] .sankofa-body-glow-halo {
    opacity: 0.58;
    filter: sepia(0.20) hue-rotate(-18deg) saturate(1.20) brightness(1.08);
    transition: opacity 0.6s ease, filter 0.8s ease;
  }

  /* Body wing-glow: brightens when nearby (community warmth seeps into wing root) */
  .sankofa-bird-rig[data-nearby="true"] .sankofa-body-wing-glow,
  .sankofa-bird-rig[data-helping="true"] .sankofa-body-wing-glow {
    opacity: 0.26;
    transition: opacity 0.7s ease;
  }

  /* Chest warmth element: activates on helping/celebrating — warm amber bloom */
  .sankofa-bird-rig[data-helping="true"] .sankofa-chest-warmth,
  .sankofa-bird-rig[data-celebrating="true"] .sankofa-chest-warmth,
  .sankofa-bird-rig[data-donated="true"] .sankofa-chest-warmth {
    opacity: 0.20;
    transition: opacity 0.7s ease;
  }

  /* Base: chest warmth hidden */
  .sankofa-chest-warmth {
    opacity: 0;
    transition: opacity 0.5s ease;
  }

  /* Egg glow halo: pulsing secondary ripple keyframe */
  @keyframes sankofa-egg-halo-pulse {
    0%   { opacity: 0.30; transform: scale(1.00); }
    40%  { opacity: 0.48; transform: scale(1.05); }
    70%  { opacity: 0.38; transform: scale(1.03); }
    100% { opacity: 0.30; transform: scale(1.00); }
  }

  .sankofa-bird-rig[data-celebrating="true"]:not([data-battery-saver="true"])
    .sankofa-egg-glow-halo {
    animation: sankofa-egg-halo-pulse 2.4s ease-in-out infinite;
    transform-box: view-box;
    transform-origin: 3.4px 15.6px;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 26.7 — Tail Fan Luminosity Enhancement
     Tail luminary paths get a slow depth-breathing animation at rest.
     Far rectrices brighten at tip during landing (ground-effect glow).
     The inner luminary transitions toward warmer amber on helping states.
     ═══════════════════════════════════════════════════════════════════════ */

  /* Tail luminary breath — inner fan shimmers slowly at rest */
  @keyframes sankofa-tail-luminary-breathe {
    0%   { opacity: 0.22; }
    45%  { opacity: 0.28; }
    80%  { opacity: 0.20; }
    100% { opacity: 0.22; }
  }

  /* Tail luminary outer breath — offset phase */
  @keyframes sankofa-tail-luminary-outer-breathe {
    0%   { opacity: 0.14; }
    52%  { opacity: 0.19; }
    100% { opacity: 0.14; }
  }

  .sankofa-bird-rig:not([data-battery-saver="true"])
    .sankofa-tail-luminary-inner {
    animation: sankofa-tail-luminary-breathe 9.6s ease-in-out infinite;
    animation-delay: -1.8s;
  }

  .sankofa-bird-rig:not([data-battery-saver="true"])
    .sankofa-tail-luminary-outer {
    animation: sankofa-tail-luminary-outer-breathe 11.8s ease-in-out infinite;
    animation-delay: -5.3s;
  }

  /* Far rectrices: micro-tonal highlights at tip */
  .sankofa-tail-iri-left,
  .sankofa-tail-iri-right {
    transition: opacity 0.55s ease, filter 0.55s ease;
  }

  /* Landing approach: ground-effect brightens far rectrix tips */
  .sankofa-bird-rig[data-landing="approach"] .sankofa-tail-iri-left,
  .sankofa-bird-rig[data-landing="approach"] .sankofa-tail-iri-right {
    opacity: 0.52;
    filter: brightness(1.15) saturate(1.25);
  }

  /* Helping/celebrating: tail warms toward amber at tips */
  .sankofa-bird-rig[data-helping="true"] .sankofa-tail-iri-left,
  .sankofa-bird-rig[data-helping="true"] .sankofa-tail-iri-right,
  .sankofa-bird-rig[data-celebrating="true"] .sankofa-tail-iri-left,
  .sankofa-bird-rig[data-celebrating="true"] .sankofa-tail-iri-right {
    filter: sepia(0.15) hue-rotate(-12deg) saturate(1.15) brightness(1.10);
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 26.8 — Battery-saver + reduced-motion guards
     ═══════════════════════════════════════════════════════════════════════ */

  /* Battery-saver: disable all Phase 26 breath animations and transitions */
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-r5,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-l5,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-r0,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-l0,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-r1,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-l1,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-r2,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-l2,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-r3,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-l3,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-r4,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-l4,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-rs1,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-ls1,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-rs2,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-ls2,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-tail-luminary-inner,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-tail-luminary-outer,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-egg-glow-halo {
    animation: none !important;
    transition: none !important;
  }

  /* Battery-saver: revert asymmetry filters to neutral */
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-r5,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-l5,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-r0,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-l0 {
    filter: none !important;
  }

  /* Reduced motion: all Phase 26 animations off */
  @media (prefers-reduced-motion: reduce) {
    .sankofa-feather-r5,
    .sankofa-feather-l5,
    .sankofa-feather-r0,
    .sankofa-feather-l0,
    .sankofa-feather-r1,
    .sankofa-feather-l1,
    .sankofa-feather-r2,
    .sankofa-feather-l2,
    .sankofa-feather-r3,
    .sankofa-feather-l3,
    .sankofa-feather-r4,
    .sankofa-feather-l4,
    .sankofa-feather-rs1,
    .sankofa-feather-ls1,
    .sankofa-feather-rs2,
    .sankofa-feather-ls2,
    .sankofa-tail-luminary-inner,
    .sankofa-tail-luminary-outer,
    .sankofa-egg-glow-halo {
      animation: none !important;
    }
    .sankofa-dorsal-hi,
    .sankofa-belly-shadow,
    .sankofa-chest-warmth {
      transition: none !important;
    }
  }

`;
