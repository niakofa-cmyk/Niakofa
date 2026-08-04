/**
 * Sankofa Bird CSS — Phase 22: LUMINARY EDITION
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE 22 — Illustration DNA Merge (July 2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This phase merges the visual richness of the original hand-composed
 * illustration bird (public/sankofa-bird-illustration-reference.svg)
 * into the anatomically correct rigged bird.
 *
 * Official iridescent palette: #0FE5D4 / #2B83AB / #0D77AA, overlapping
 * semi-transparent layers, luminous feather edges, soft inner glow.
 *
 * Design brief:
 *   "Keep the current skeletal proportions, rig, pivots, and animation system.
 *    Reintroduce the early bird's luminous color language. Use dynamic lighting
 *    and iridescent feather highlights so the bird changes appearance as it
 *    moves, rather than relying on permanently psychedelic colors."
 *
 * ── What this phase adds ─────────────────────────────────────────────────
 *
 *   22.1 @property declarations for iridescent CSS vars
 *   22.2 Controlled iridescence — feather colors shift cyan→turquoise→emerald
 *   22.3 Wing luminary overlay — #0FE5D4 luminous surface, context-driven
 *   22.4 Body luminary layer — inner-glow radial, pulsed on events
 *   22.5 Sankofa spiral — Adinkra spiral brightens on celebration/milestone
 *   22.6 Crown luminary — crown glow on activity / community events
 *   22.7 Egg luminary glow — #0FE5D4 halo pulsing on mission / help events
 *   22.8 Neck luminary — luminous neck overlay at mid/high zoom
 *   22.9 Wing arc details — Adinkra flow lines at mid/high zoom
 *   22.10 Dynamic lighting — breast sheen + body shimmer shift with heading
 *   22.11 Night mode luminary — softer blue-teal glow in dark environments
 *   22.12 Celebration luminary — full #0FE5D4 radiance on celebrate/donate
 *   22.13 Battery-saver + reduced-motion guards (bottom of file)
 *
 * Design contract:
 *   - All Phase 22 rules are ADDITIVE. They gate on data-* attributes and
 *     do NOT reset Phase 1-21 defaults.
 *   - No backtick characters inside this template literal (Babel crashes).
 *   - All opacity values stay <= 0.55 at rest to preserve the realistic
 *     anatomical bird while adding luminosity.
 *   - The color shift is restrained and directional — no rainbow sweep.
 *     Bird at rest = elegant; bird in flight/event = radiant.
 */

// NOTE: Backtick characters inside CSS template literal strings crash Babel.
// Use only single/double quotes inside this string.

export const sankofaCssPhase22 = `

  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 22.1 — Custom property declarations
     ═══════════════════════════════════════════════════════════════════════ */

  @property --iri-phase {
    syntax: "<number>";
    inherits: true;
    initial-value: 0;
  }
  @property --lum-factor {
    syntax: "<number>";
    inherits: true;
    initial-value: 0.5;
  }
  @property --cyan-glow {
    syntax: "<number>";
    inherits: true;
    initial-value: 0;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 22.2 — Iridescent feather shimmer
     Feathers subtly shift in opacity/brightness as the bird moves.
     The effect is tied to flight speed (data-speed attr) and flap cycle.
     "Feathers catch the light — colors shift with angle, iridescence
      appears and disappears." — design brief
     ═══════════════════════════════════════════════════════════════════════ */

  /* Iridescent shimmer animation — subtle opacity cycle on outer primaries.
     Period matches flap cycle so the shimmer feels like caught light. */
  @keyframes sankofa-iri-shimmer {
    0%   { opacity: 0.78; }
    30%  { opacity: 0.92; }
    60%  { opacity: 0.84; }
    80%  { opacity: 0.94; }
    100% { opacity: 0.78; }
  }

  /* Outer primaries shimmer while flying — light plays off feather edges */
  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"])
    .sankofa-feather-r5,
  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"])
    .sankofa-feather-l5 {
    animation: sankofa-iri-shimmer var(--flap-period, 1400ms) ease-in-out infinite;
  }
  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"])
    .sankofa-feather-r0,
  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"])
    .sankofa-feather-l0 {
    animation: sankofa-iri-shimmer var(--flap-period, 1400ms) ease-in-out infinite;
    animation-delay: calc(var(--flap-period, 1400ms) * 0.12);
  }
  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"])
    .sankofa-feather-r1,
  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"])
    .sankofa-feather-l1 {
    animation: sankofa-iri-shimmer calc(var(--flap-period, 1400ms) * 1.15) ease-in-out infinite;
    animation-delay: calc(var(--flap-period, 1400ms) * 0.08);
  }

  /* Iridescent edge highlights — pulse on downstroke */
  @keyframes sankofa-iri-edge-pulse {
    0%, 100% { opacity: 0.40; }
    45%      { opacity: 0.68; }
    50%      { opacity: 0.72; }
  }
  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"])
    .sankofa-feather-iri-edge {
    animation: sankofa-iri-edge-pulse var(--flap-period, 1400ms) ease-in-out infinite;
  }

  /* Controlled structural color: choose the nearest neighboring hue family
     when the bird turns. Opacity follows the existing virtual-light factor,
     so rotation changes sheen strength without repainting every frame with a
     hue filter. */
  .sankofa-feather-iri-edge {
    fill: var(--iri-cyan-fill, #0FE5D4);
    opacity: calc(0.16 + (var(--lighting-factor, 0.5) * 0.54));
    transition: fill 0.5s ease, opacity 0.45s ease;
    mix-blend-mode: screen;
  }
  .sankofa-bird-rig[data-heading-quadrant="NE"] .sankofa-feather-iri-edge,
  .sankofa-bird-rig[data-heading-quadrant="E"] .sankofa-feather-iri-edge,
  .sankofa-bird-rig[data-heading-quadrant="SE"] .sankofa-feather-iri-edge {
    fill: var(--iri-turquoise-fill, #14B8A6);
  }
  .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-feather-iri-edge,
  .sankofa-bird-rig[data-heading-quadrant="SW"] .sankofa-feather-iri-edge,
  .sankofa-bird-rig[data-heading-quadrant="W"] .sankofa-feather-iri-edge {
    fill: var(--iri-emerald-fill, #10B981);
  }
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-iri-edge {
    opacity: 0.18;
    transition: none;
  }
  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"])
    .sankofa-feather-iri-r0 {
    animation-delay: calc(var(--flap-period, 1400ms) * 0.05);
  }
  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"])
    .sankofa-feather-iri-l0 {
    animation-delay: calc(var(--flap-period, 1400ms) * 0.05);
  }

  /* Tail iridescent tips — pulse with tail-sway cycle */
  @keyframes sankofa-tail-iri-pulse {
    0%, 100% { opacity: 0.32; }
    50%      { opacity: 0.55; }
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-tail-iri-left,
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-tail-iri-right {
    animation: sankofa-tail-iri-pulse 3.5s ease-in-out infinite;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 22.3 — Wing luminary overlay
     Luminous #0FE5D4 surface layer — context-driven intensity
     ═══════════════════════════════════════════════════════════════════════ */

  /* Base: luminary overlays at rest (faint ambient). Only opacity is animated:
     filter/drop-shadow animation repeatedly invalidates SVG paint on older
     iOS/Android GPUs and causes shimmer flicker. */
  .sankofa-wing-luminary-r-a,
  .sankofa-wing-luminary-l-a {
    transition: opacity 0.5s ease-out;
    will-change: opacity;
    transform: translate3d(0, 0, 0);
    backface-visibility: hidden;
    isolation: isolate;
  }
  .sankofa-wing-luminary-r-b,
  .sankofa-wing-luminary-l-b {
    will-change: opacity;
    transform: translate3d(0, 0, 0);
    backface-visibility: hidden;
  }

  /* Gliding — wings spread, light catches the full surface */
  .sankofa-bird-rig[data-gliding="true"] .sankofa-wing-luminary-r-a,
  .sankofa-bird-rig[data-gliding="true"] .sankofa-wing-luminary-l-a {
    opacity: 0.40 !important;
  }
  .sankofa-bird-rig[data-gliding="true"] .sankofa-wing-luminary-r-b,
  .sankofa-bird-rig[data-gliding="true"] .sankofa-wing-luminary-l-b {
    opacity: 0.28 !important;
  }

  /* Takeoff — burst of luminance as wings sweep up */
  .sankofa-bird-rig[data-landing="takeoff"] .sankofa-wing-luminary-r-a,
  .sankofa-bird-rig[data-landing="takeoff"] .sankofa-wing-luminary-l-a {
    opacity: 0.48 !important;
  }

  /* Flying at speed — moderate wing luminosity */
  .sankofa-bird-rig[data-flying="true"] .sankofa-wing-luminary-r-a,
  .sankofa-bird-rig[data-flying="true"] .sankofa-wing-luminary-l-a {
    opacity: 0.28 !important;
  }

  /* Wing luminary flicker during flap — light plays off wing surface */
  @keyframes sankofa-wing-lum-flicker {
    0%, 100% { opacity: 0.22; }
    40%      { opacity: 0.38; }
    55%      { opacity: 0.32; }
  }
  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"]) .sankofa-wing-luminary-r-a,
  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"]) .sankofa-wing-luminary-l-a {
    animation: sankofa-wing-lum-flicker var(--flap-period, 1400ms) ease-in-out infinite;
  }
  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"]) .sankofa-wing-luminary-r-b,
  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"]) .sankofa-wing-luminary-l-b {
    animation: sankofa-wing-lum-flicker var(--flap-period, 1400ms) ease-in-out infinite;
    animation-delay: calc(var(--flap-period, 1400ms) * 0.25);
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 22.4 — Body luminary layer
     "A living bird naturally changes appearance as it moves."
     The chest radial glows in context with app events.
     ═══════════════════════════════════════════════════════════════════════ */

  .sankofa-body-luminary-layer {
    transition: opacity 0.6s ease-out;
    will-change: opacity;
    transform: translateZ(0);
  }

  /* Helping someone — warm ambient glow on body */
  .sankofa-bird-rig[data-helping="true"] .sankofa-body-luminary-layer {
    opacity: 0.72 !important;
  }

  /* Flying — moderate body luminosity (light moving across body) */
  .sankofa-bird-rig[data-flying="true"] .sankofa-body-luminary-layer {
    opacity: 0.62 !important;
  }

  /* Body luminary pulse while flying — "living color" */
  @keyframes sankofa-body-lum-pulse {
    0%, 100% { opacity: 0.55; }
    50%      { opacity: 0.68; }
  }
  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"])
    .sankofa-body-luminary-layer {
    animation: sankofa-body-lum-pulse calc(var(--flap-period, 1400ms) * 1.5) ease-in-out infinite;
  }

  /* Body cyan shimmer highlight */
  .sankofa-body-cyan-shimmer {
    transition: opacity 0.5s ease-out;
  }
  .sankofa-bird-rig[data-celebrating="true"] .sankofa-body-cyan-shimmer {
    opacity: 0.48 !important;
  }
  .sankofa-bird-rig[data-flying="true"] .sankofa-body-cyan-shimmer {
    opacity: 0.30 !important;
  }

  /* Body glow halo — ambient light beneath egg */
  .sankofa-body-glow-halo {
    transition: opacity 0.8s ease-out;
  }
  .sankofa-bird-rig[data-celebrating="true"] .sankofa-body-glow-halo {
    opacity: 0.65 !important;
  }
  .sankofa-bird-rig[data-donated="true"] .sankofa-body-glow-halo {
    opacity: 0.55 !important;
  }
  @keyframes sankofa-halo-breathe {
    0%, 100% { opacity: 0.38; }
    50%      { opacity: 0.52; }
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]):not([data-celebrating="true"])
    .sankofa-body-glow-halo {
    animation: sankofa-halo-breathe 4.5s ease-in-out infinite;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 22.5 — Sankofa spiral — Adinkra identity marker
     "Go back and fetch it" — the symbolic heart of the design.
     Subtly present at rest; brightens on cultural moments.
     ═══════════════════════════════════════════════════════════════════════ */

  .sankofa-adinkra-spiral {
    transition: opacity 0.8s ease-out;
  }

  /* Always faintly visible — cultural identity is always present */
  /* (base opacity 0.18 set inline in AdinkraOverlay.tsx) */

  /* Community milestone — spiral glows */
  .sankofa-bird-rig[data-community-milestone="true"] .sankofa-adinkra-spiral {
    opacity: 0.65 !important;
  }

  /* Celebration — spiral brightens */
  .sankofa-bird-rig[data-celebrating="true"] .sankofa-adinkra-spiral {
    opacity: 0.55 !important;
  }

  /* Helping — moderate symbolic presence */
  .sankofa-bird-rig[data-helping="true"] .sankofa-adinkra-spiral {
    opacity: 0.38 !important;
  }

  /* Spiral gentle pulse at rest — "the bird is alive" */
  @keyframes sankofa-spiral-breathe {
    0%, 100% { opacity: 0.16; }
    50%      { opacity: 0.24; }
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]):not([data-celebrating="true"]):not([data-community-milestone="true"])
    .sankofa-adinkra-spiral {
    animation: sankofa-spiral-breathe 6.0s ease-in-out infinite;
  }

  /* Mid/high zoom only — too small to see at low zoom */
  .sankofa-bird-rig[data-zoom="low"] .sankofa-adinkra-spiral {
    opacity: 0 !important;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 22.6 — Crown luminary
     Crown feathers glow on activity / community events.
     ═══════════════════════════════════════════════════════════════════════ */

  .sankofa-crown-luminary {
    transition: opacity 0.5s ease-out;
    will-change: opacity;
    transform: translateZ(0);
  }

  /* Peak activity — crown glows brighter */
  .sankofa-bird-rig[data-activity="peak"] .sankofa-crown-luminary {
    opacity: 0.32 !important;
  }
  .sankofa-bird-rig[data-activity="busy"] .sankofa-crown-luminary {
    opacity: 0.22 !important;
  }

  /* Celebrating — crown flares */
  .sankofa-bird-rig[data-celebrating="true"] .sankofa-crown-luminary {
    opacity: 0.45 !important;
  }

  /* Crown luminary ambient pulse */
  @keyframes sankofa-crown-lum-pulse {
    0%, 100% { opacity: 0.10; }
    50%      { opacity: 0.18; }
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]):not([data-celebrating="true"])
    .sankofa-crown-luminary {
    animation: sankofa-crown-lum-pulse 5.0s ease-in-out infinite;
  }

  /* Head luminary — pulses with celebration */
  .sankofa-head-luminary {
    transition: opacity 0.4s ease-out;
  }
  @keyframes sankofa-head-lum-celebrate {
    0%, 100% { opacity: 0.30; }
    40%      { opacity: 0.55; }
  }
  .sankofa-bird-rig[data-celebrating="true"]:not([data-battery-saver="true"])
    .sankofa-head-luminary {
    animation: sankofa-head-lum-celebrate 0.6s ease-in-out 5 !important;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 22.7 — Egg luminary glow
     "A gentle glow around the egg during meaningful app events"
     "When idle: soft glow. When helping: brighter pulse. When completing: radiance."
     ═══════════════════════════════════════════════════════════════════════ */

  .sankofa-egg-glow-halo {
    transition: opacity 0.6s ease-out;
    will-change: opacity;
    transform: translateZ(0);
  }

  /* Idle breathing glow — "the egg always holds a soft inner light" */
  @keyframes sankofa-egg-halo-idle {
    0%, 100% { opacity: 0.28; }
    50%      { opacity: 0.42; }
  }
  .sankofa-bird-rig:not([data-celebrating="true"]):not([data-donated="true"]):not([data-battery-saver="true"])
    .sankofa-egg-glow-halo {
    animation: sankofa-egg-halo-idle 4.0s ease-in-out infinite;
  }

  /* Helping — brighter egg pulse */
  @keyframes sankofa-egg-halo-helping {
    0%, 100% { opacity: 0.45; }
    50%      { opacity: 0.72; }
  }
  .sankofa-bird-rig[data-helping="true"]:not([data-battery-saver="true"])
    .sankofa-egg-glow-halo {
    animation: sankofa-egg-halo-helping 2.2s ease-in-out infinite !important;
  }

  /* Celebration — full radiance burst */
  @keyframes sankofa-egg-halo-celebrate {
    0%   { opacity: 0.30; }
    20%  { opacity: 0.85; }
    50%  { opacity: 0.70; }
    80%  { opacity: 0.90; }
    100% { opacity: 0.30; }
  }
  .sankofa-bird-rig[data-celebrating="true"]:not([data-battery-saver="true"])
    .sankofa-egg-glow-halo {
    animation: sankofa-egg-halo-celebrate 0.55s ease-in-out 6 !important;
  }

  /* Donated: warm tint on glow halo */
  .sankofa-bird-rig[data-donated="true"] .sankofa-egg-glow-halo {
    opacity: 0.58 !important;
  }

  /* Mission complete — sustained warm radiance */
  .sankofa-bird-rig[data-mission-complete="true"] .sankofa-egg-glow-halo {
    opacity: 0.65 !important;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 22.8 — Neck luminary
     Semi-transparent glow sheen over the neck at mid/high zoom.
     ═══════════════════════════════════════════════════════════════════════ */

  .sankofa-neck-luminary {
    transition: opacity 0.4s ease-out;
  }
  .sankofa-neck-luminary-2 {
    transition: opacity 0.4s ease-out;
  }

  /* Low zoom: hide neck details */
  .sankofa-bird-rig[data-zoom="low"] .sankofa-neck-luminary,
  .sankofa-bird-rig[data-zoom="low"] .sankofa-neck-luminary-2 {
    opacity: 0 !important;
  }

  /* Mid zoom: subtle neck glow */
  .sankofa-bird-rig[data-zoom="mid"] .sankofa-neck-luminary {
    opacity: 0.25;
  }
  .sankofa-bird-rig[data-zoom="mid"] .sankofa-neck-luminary-2 {
    opacity: 0.40;
  }

  /* High / street zoom: full neck luminosity */
  .sankofa-bird-rig[data-zoom="high"] .sankofa-neck-luminary,
  .sankofa-bird-rig[data-zoom="street"] .sankofa-neck-luminary {
    opacity: 0.22;
  }
  .sankofa-bird-rig[data-zoom="high"] .sankofa-neck-luminary-2,
  .sankofa-bird-rig[data-zoom="street"] .sankofa-neck-luminary-2 {
    opacity: 0.42;
  }

  /* Neck top sheen: mid zoom+ only */
  .sankofa-neck-top-sheen {
    transition: opacity 0.4s ease-out;
  }
  .sankofa-bird-rig[data-zoom="low"] .sankofa-neck-top-sheen {
    opacity: 0 !important;
  }

  /* Celebration: neck flares with head glow */
  .sankofa-bird-rig[data-celebrating="true"] .sankofa-neck-luminary {
    opacity: 0.38 !important;
  }
  .sankofa-bird-rig[data-celebrating="true"] .sankofa-neck-luminary-2 {
    opacity: 0.60 !important;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 22.9 — Wing arc details (Adinkra flow lines)
     Subtle flowing lines on wing surface — the original illustration's
     "flowing curves" quality — visible at mid/high zoom only.
     ═══════════════════════════════════════════════════════════════════════ */

  .sankofa-adinkra-wing-arc {
    transition: opacity 0.5s ease-out;
  }

  /* Mid+ zoom: show subtle wing arcs */
  .sankofa-bird-rig[data-zoom="mid"] .sankofa-adinkra-wing-arc {
    opacity: 0.30 !important;
  }
  .sankofa-bird-rig[data-zoom="high"] .sankofa-adinkra-wing-arc {
    opacity: 0.40 !important;
  }
  .sankofa-bird-rig[data-zoom="street"] .sankofa-adinkra-wing-arc {
    opacity: 0.45 !important;
  }

  /* Wing arcs pulse with flap — they "breathe" with the bird */
  @keyframes sankofa-wing-arc-breathe {
    0%, 100% { opacity: 0.35; }
    40%      { opacity: 0.50; }
  }
  .sankofa-bird-rig[data-zoom="high"]:not([data-battery-saver="true"])
    .sankofa-adinkra-wing-arc,
  .sankofa-bird-rig[data-zoom="street"]:not([data-battery-saver="true"])
    .sankofa-adinkra-wing-arc {
    animation: sankofa-wing-arc-breathe var(--flap-period, 1400ms) ease-in-out infinite;
  }

  /* Covert band: always slightly visible (was 0 before) */
  .sankofa-wing-covert-band {
    transition: opacity 0.4s ease-out;
  }
  .sankofa-bird-rig:not([data-zoom="low"]) .sankofa-wing-covert-band {
    opacity: 0.18 !important;
  }
  .sankofa-bird-rig[data-celebrating="true"] .sankofa-wing-covert-band {
    opacity: 0.38 !important;
  }

  /* Wing scapulars: visible at mid+ zoom */
  .sankofa-wing-scap {
    transition: opacity 0.4s ease-out;
  }
  .sankofa-bird-rig[data-zoom="mid"] .sankofa-wing-scap {
    opacity: 0.18 !important;
  }
  .sankofa-bird-rig[data-zoom="high"] .sankofa-wing-scap,
  .sankofa-bird-rig[data-zoom="street"] .sankofa-wing-scap {
    opacity: 0.22 !important;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 22.10 — Dynamic lighting — "bird changes appearance as it moves"
     Breast sheen + body shimmer respond to heading and speed.
     ═══════════════════════════════════════════════════════════════════════ */

  /* Body wing-glow overlay: responsive to flight state */
  .sankofa-body-wing-glow {
    transition: opacity 0.5s ease-out;
  }
  .sankofa-bird-rig[data-flying="true"] .sankofa-body-wing-glow {
    opacity: 0.32 !important;
  }
  .sankofa-bird-rig[data-gliding="true"] .sankofa-body-wing-glow {
    opacity: 0.45 !important;
  }

  /* Wing highlight luminance boost while flying */
  .sankofa-bird-wing-right-highlight,
  .sankofa-bird-wing-left-highlight {
    transition: opacity 0.4s ease-out;
  }
  .sankofa-bird-rig[data-gliding="true"] .sankofa-bird-wing-right-highlight,
  .sankofa-bird-rig[data-gliding="true"] .sankofa-bird-wing-left-highlight {
    opacity: 0.72 !important;
  }
  .sankofa-bird-rig[data-flying="true"] .sankofa-bird-wing-right-highlight,
  .sankofa-bird-rig[data-flying="true"] .sankofa-bird-wing-left-highlight {
    opacity: 0.62 !important;
  }

  /* Wing highlight shimmer on flap */
  @keyframes sankofa-highlight-shimmer {
    0%, 100% { opacity: 0.55; }
    35%      { opacity: 0.80; }
    70%      { opacity: 0.62; }
  }
  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"])
    .sankofa-bird-wing-right-highlight,
  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"])
    .sankofa-bird-wing-left-highlight {
    animation: sankofa-highlight-shimmer var(--flap-period, 1400ms) ease-in-out infinite;
  }

  /* Body feather visibility boost at mid/high zoom */
  .sankofa-bird-rig[data-zoom="mid"] .sankofa-body-feather {
    opacity: calc(var(--base-feather-opacity, 0.22) * 1.4);
  }
  .sankofa-bird-rig[data-zoom="high"] .sankofa-body-feather,
  .sankofa-bird-rig[data-zoom="street"] .sankofa-body-feather {
    opacity: calc(var(--base-feather-opacity, 0.22) * 1.8);
  }
  /* Flying: feathers more visible (catching air) */
  .sankofa-bird-rig[data-flying="true"][data-zoom="mid"] .sankofa-body-feather,
  .sankofa-bird-rig[data-flying="true"][data-zoom="high"] .sankofa-body-feather,
  .sankofa-bird-rig[data-flying="true"][data-zoom="street"] .sankofa-body-feather {
    opacity: calc(var(--base-feather-opacity, 0.22) * 2.2);
  }

  /* Tail fan luminary layers — responsive to tail pose */
  .sankofa-tail-luminary {
    transition: opacity 0.4s ease-out;
  }
  .sankofa-bird-rig[data-tail-pose="flare"] .sankofa-tail-luminary-inner {
    opacity: 0.38 !important;
  }
  .sankofa-bird-rig[data-tail-pose="flare"] .sankofa-tail-luminary-outer {
    opacity: 0.24 !important;
  }
  .sankofa-bird-rig[data-tail-pose="stream"] .sankofa-tail-luminary-inner {
    opacity: 0.28 !important;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 22.11 — Night mode luminary
     "Night mode: deeper blues with subdued highlights" — design brief
     Softer blue-cyan glow replaces the daytime teal luminosity.
     ═══════════════════════════════════════════════════════════════════════ */

  /* Night: wing luminary shifts to deeper blue tone */
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-wing-luminary-r-a,
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-wing-luminary-l-a {
    filter: hue-rotate(15deg) brightness(0.65);
    opacity: 0.35 !important;
  }
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-wing-luminary-r-b,
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-wing-luminary-l-b {
    filter: hue-rotate(20deg) brightness(0.55);
    opacity: 0.22 !important;
  }

  /* Night: body luminary stays bright — the bird glows against the dark map */
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-body-luminary-layer {
    opacity: 0.65 !important;
    filter: hue-rotate(10deg);
  }

  /* Night: egg halo more visible (moonlit effect) */
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-egg-glow-halo {
    opacity: 0.50 !important;
  }

  /* Night: Sankofa spiral becomes more visible in darkness */
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-adinkra-spiral {
    opacity: 0.30 !important;
  }

  /* Night: crown dims slightly */
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-crown-luminary {
    opacity: 0.08 !important;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 22.12 — Celebration luminary
     Full #0FE5D4 radiance during celebrate / donate events.
     "When completing a request: subtle radiance." — design brief
     ═══════════════════════════════════════════════════════════════════════ */

  /* Celebration: wing primaries brighten with opacity only. */
  @keyframes sankofa-celebrate-lum {
    0%   { opacity: 0.78; }
    20%  { opacity: 1; }
    50%  { opacity: 0.9; }
    80%  { opacity: 1; }
    100% { opacity: 0.78; }
  }
  .sankofa-bird-rig[data-celebrating="true"]:not([data-battery-saver="true"])
    .sankofa-feather-r5,
  .sankofa-bird-rig[data-celebrating="true"]:not([data-battery-saver="true"])
    .sankofa-feather-l5,
  .sankofa-bird-rig[data-celebrating="true"]:not([data-battery-saver="true"])
    .sankofa-feather-r0,
  .sankofa-bird-rig[data-celebrating="true"]:not([data-battery-saver="true"])
    .sankofa-feather-l0 {
    animation: sankofa-celebrate-lum 0.55s ease-in-out 5 !important;
  }

  /* Celebration: tail fan luminary flares */
  .sankofa-bird-rig[data-celebrating="true"]:not([data-battery-saver="true"])
    .sankofa-tail-luminary-inner {
    opacity: 0.50 !important;
  }
  .sankofa-bird-rig[data-celebrating="true"]:not([data-battery-saver="true"])
    .sankofa-tail-luminary-outer {
    opacity: 0.32 !important;
  }

  /* Celebration: Sankofa spiral glows with mission success */
  @keyframes sankofa-spiral-celebrate {
    0%, 100% { opacity: 0.52; }
    40%      { opacity: 0.80; }
  }
  .sankofa-bird-rig[data-celebrating="true"]:not([data-battery-saver="true"])
    .sankofa-adinkra-spiral {
    animation: sankofa-spiral-celebrate 0.6s ease-in-out 4 !important;
  }

  /* Nearby user notification — cyan pulse on body */
  @keyframes sankofa-nearby-pulse {
    0%, 100% { opacity: 0.40; }
    50%      { opacity: 0.70; }
  }
  .sankofa-bird-rig[data-nearby-user="true"]:not([data-battery-saver="true"])
    .sankofa-body-luminary-layer {
    animation: sankofa-nearby-pulse 1.8s ease-in-out infinite !important;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 22.12b — Speed-tier live-map shimmer
     "Make the Sankofa Bird glow and shimmer as it moves on the live map."
     Faster movement = more luminous wing overlays + intensified feather shimmer.
     All gated on :not([data-battery-saver="true"]) for low-end phone safety.
     ═══════════════════════════════════════════════════════════════════════ */

  /* Walking speed — first hint of shimmer (just arrived in motion).
     SpeedTier="walking" matches getSpeedTier() in sankofa-bird-math.ts. */
  .sankofa-bird-rig[data-speed="walking"]:not([data-battery-saver="true"])
    .sankofa-wing-luminary-r-a,
  .sankofa-bird-rig[data-speed="walking"]:not([data-battery-saver="true"])
    .sankofa-wing-luminary-l-a {
    opacity: 0.24 !important;
  }

  /* Running speed — feathers catch the air, shimmer intensifies */
  .sankofa-bird-rig[data-speed="running"]:not([data-battery-saver="true"])
    .sankofa-wing-luminary-r-a,
  .sankofa-bird-rig[data-speed="running"]:not([data-battery-saver="true"])
    .sankofa-wing-luminary-l-a {
    opacity: 0.34 !important;
  }
  .sankofa-bird-rig[data-speed="running"]:not([data-battery-saver="true"])
    .sankofa-body-luminary-layer {
    opacity: 0.58 !important;
  }

  /* Driving speed — live-map speed: full iridescent luminance */
  .sankofa-bird-rig[data-speed="driving"]:not([data-battery-saver="true"])
    .sankofa-wing-luminary-r-a,
  .sankofa-bird-rig[data-speed="driving"]:not([data-battery-saver="true"])
    .sankofa-wing-luminary-l-a {
    opacity: 0.42 !important;
  }
  .sankofa-bird-rig[data-speed="driving"]:not([data-battery-saver="true"])
    .sankofa-body-luminary-layer {
    opacity: 0.65 !important;
  }

  /* Airplane — maximum shimmer: the bird blazes across the map */
  @keyframes sankofa-speed-shimmer {
    0%, 100% { opacity: 0.42; }
    35%      { opacity: 0.60; }
    70%      { opacity: 0.50; }
  }
  .sankofa-bird-rig[data-speed="airplane"]:not([data-battery-saver="true"])
    .sankofa-wing-luminary-r-a,
  .sankofa-bird-rig[data-speed="airplane"]:not([data-battery-saver="true"])
    .sankofa-wing-luminary-l-a {
    opacity: 0.50 !important;
    animation: sankofa-speed-shimmer 1.1s ease-in-out infinite !important;
  }
  .sankofa-bird-rig[data-speed="airplane"]:not([data-battery-saver="true"])
    .sankofa-body-luminary-layer {
    opacity: 0.72 !important;
  }

  /* Speed shimmer: egg glow intensifies with movement — "living bird" */
  .sankofa-bird-rig[data-speed="running"]:not([data-battery-saver="true"])
    .sankofa-egg-glow-halo,
  .sankofa-bird-rig[data-speed="driving"]:not([data-battery-saver="true"])
    .sankofa-egg-glow-halo,
  .sankofa-bird-rig[data-speed="airplane"]:not([data-battery-saver="true"])
    .sankofa-egg-glow-halo {
    opacity: 0.48 !important;
  }

  /* GPU compositing: promote the rig to its own compositor layer.
     contain:layout+style prevents the luminary opacity animations from
     triggering layout on parent elements — critical for 60fps on low-end phones.
     isolation:isolate confines mix-blend-mode/filter stacking to the rig. */
  .sankofa-bird-rig {
    contain: layout style;
    isolation: isolate;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 22.13 — Battery-saver + reduced-motion guards
     All luminary animations are disabled in battery-saver mode.
     Reduced-motion: all animations suppressed, opacity stays at rest values.
     ═══════════════════════════════════════════════════════════════════════ */

  /* Battery-saver: disable all Phase 22 animations */
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-wing-luminary-r-a,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-wing-luminary-r-b,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-wing-luminary-l-a,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-wing-luminary-l-b,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-body-luminary-layer,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-body-cyan-shimmer,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-body-glow-halo,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-egg-glow-halo,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-crown-luminary,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-head-luminary,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-neck-luminary,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-neck-luminary-2,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-adinkra-spiral,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-adinkra-wing-arc,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-tail-luminary,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-iri-edge,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-tail-iri-left,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-tail-iri-right {
    animation: none !important;
  }

  /* Reduced-motion: suppress all Phase 22 transitions + animations */
  @media (prefers-reduced-motion: reduce) {
    .sankofa-wing-luminary-r-a,
    .sankofa-wing-luminary-r-b,
    .sankofa-wing-luminary-l-a,
    .sankofa-wing-luminary-l-b,
    .sankofa-body-luminary-layer,
    .sankofa-body-cyan-shimmer,
    .sankofa-body-glow-halo,
    .sankofa-egg-glow-halo,
    .sankofa-crown-luminary,
    .sankofa-head-luminary,
    .sankofa-neck-luminary,
    .sankofa-neck-luminary-2,
    .sankofa-adinkra-spiral,
    .sankofa-adinkra-wing-arc,
    .sankofa-tail-luminary,
    .sankofa-feather-iri-edge,
    .sankofa-tail-iri-left,
    .sankofa-tail-iri-right {
      animation: none !important;
      transition: none !important;
    }
    .sankofa-feather-iri-edge {
      transition: none !important;
    }
  }

`;
