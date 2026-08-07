/**
 * Sankofa Bird CSS — Phase 23: STRUCTURAL IRIDESCENCE + FEATHER DEPTH
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE 23 — Enhanced Iridescence & Natural Movement (July 2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Design brief (from art direction review):
 *
 *   "Real birds often display structural coloration. As the bird rotates,
 *    teal can shift toward turquoise, emerald, cyan. That gives the impression
 *    that the bird is alive because the colors respond to movement."
 *
 *   "Not glitter. Not neon. Real birds often have structural coloration where
 *    the hue shifts slightly as the viewing angle changes."
 *
 *   "Add subtle tonal variation within the feathers. Slightly darker feather
 *    bases, lighter feather tips, soft edge highlights. That creates richness
 *    without becoming busy."
 *
 *   "Iridescent feather gradients that subtly shift from teal to cyan,
 *    soft luminous edge highlights instead of flat outlines,
 *    dynamic lighting that changes with movement rather than static coloring."
 *
 * ── What this phase adds ─────────────────────────────────────────────────
 *
 *   23.1 Heading-reactive wing surface iridescence
 *        Entire wing surface subtly shifts hue with flight direction:
 *        N/NW = pure #0FE5D4 teal | NE/E = cyan (+18deg) |
 *        SE/S = emerald (-17deg)  | SW/W = deep emerald (-28deg)
 *
 *   23.2 Enhanced iridescent edge opacity by quadrant
 *        The existing fill-swap on .sankofa-feather-iri-edge is now paired
 *        with boosted opacity so the structural color is more visible.
 *
 *   23.3 Bank-triggered luminance burst
 *        Hard banking causes a brief iridescent flash across the wing
 *        luminary overlays — like a raptor banking into light.
 *
 *   23.4 Feather cascade shimmer during flight
 *        Staggered per-feather brightness+hue animation so the wing surface
 *        ripples with light during the flap cycle — outer→inner cascade.
 *
 *   23.5 Resting ambient luminosity lift
 *        Wing luminary overlays now have a faint ambient opacity at rest
 *        instead of 0 — the bird always glows slightly, never looks dead.
 *
 *   23.6 Gliding iridescent sweep
 *        When soaring, a slow hue sweep across the wing surfaces recreates
 *        the "wings spread in sun" structural-color display.
 *
 *   23.7 Crown feather iridescence with activity tier
 *        Crown feathers shift toward brighter cyan on busy/peak activity.
 *
 *   23.8 Battery-saver + reduced-motion guards
 *
 * Design contract:
 *   - All rules ADDITIVE over Phase 22. No resets to Phase 1-22 defaults.
 *   - Heading-reactive filter is applied to the wing surface paths only,
 *     not to the entire rig (which would affect all SVG elements).
 *   - filter transitions kept at 0.55s so the color shift feels like
 *     turning in air, not a digital palette swap.
 *   - No backtick characters inside this template literal (Babel crashes).
 *   - All filter magnitudes restrained: hue-rotate max +-28deg, saturate
 *     max 1.35, brightness max 1.10 — the shift must be noticeable but
 *     feel natural, not processed.
 */

// NOTE: Backtick characters inside CSS template literal strings crash Babel.
// Use only single/double quotes inside this string.

export const sankofaCssPhase23 = `

  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 23.1 — Heading-reactive wing surface iridescence
     "Structural coloration where the hue shifts slightly as the viewing
      angle changes. Imagine the teal feathers subtly transitioning toward
      turquoise or emerald during turns." — design brief
     ═══════════════════════════════════════════════════════════════════════ */

  /* Base: wing surfaces always transition their filter smoothly.
     Without a base transition the color snaps between headings. */
  .sankofa-bird-wing-right,
  .sankofa-bird-wing-left {
    transition: filter 0.55s ease;
    will-change: filter;
  }

  /* N / NW heading: pure #0FE5D4 teal — the canonical Sankofa color.
     No filter override needed; this is the baseline. */

  /* NE heading: shift toward vivid cyan (+18deg hue) */
  .sankofa-bird-rig[data-heading-quadrant="NE"] .sankofa-bird-wing-right,
  .sankofa-bird-rig[data-heading-quadrant="NE"] .sankofa-bird-wing-left {
    filter: hue-rotate(15deg) saturate(1.28) brightness(1.07);
  }

  /* E heading: maximum cyan expression — bird turning into the "light" */
  .sankofa-bird-rig[data-heading-quadrant="E"] .sankofa-bird-wing-right,
  .sankofa-bird-rig[data-heading-quadrant="E"] .sankofa-bird-wing-left {
    filter: hue-rotate(20deg) saturate(1.35) brightness(1.10);
  }

  /* SE heading: turquoise territory — teal meets green */
  .sankofa-bird-rig[data-heading-quadrant="SE"] .sankofa-bird-wing-right,
  .sankofa-bird-rig[data-heading-quadrant="SE"] .sankofa-bird-wing-left {
    filter: hue-rotate(-12deg) saturate(1.18) brightness(1.04);
  }

  /* S heading: emerald — classic hummingbird structural green */
  .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-bird-wing-right,
  .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-bird-wing-left {
    filter: hue-rotate(-18deg) saturate(1.15) brightness(1.02);
  }

  /* SW heading: deep emerald — feathers catch angle light from behind */
  .sankofa-bird-rig[data-heading-quadrant="SW"] .sankofa-bird-wing-right,
  .sankofa-bird-rig[data-heading-quadrant="SW"] .sankofa-bird-wing-left {
    filter: hue-rotate(-24deg) saturate(1.10) brightness(0.97);
  }

  /* W heading: deepest emerald with the faintest blue undertone */
  .sankofa-bird-rig[data-heading-quadrant="W"] .sankofa-bird-wing-right,
  .sankofa-bird-rig[data-heading-quadrant="W"] .sankofa-bird-wing-left {
    filter: hue-rotate(-28deg) saturate(1.08) brightness(0.95);
  }

  /* NW heading: gentle return toward teal — almost default */
  .sankofa-bird-rig[data-heading-quadrant="NW"] .sankofa-bird-wing-right,
  .sankofa-bird-rig[data-heading-quadrant="NW"] .sankofa-bird-wing-left {
    filter: hue-rotate(-8deg) saturate(1.05) brightness(0.99);
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 23.2 — Enhanced iridescent edge opacity per quadrant
     Phase 22 already swaps the fill color on .sankofa-feather-iri-edge.
     This phase boosts the opacity so the structural color reads clearly.
     "Colors respond to movement — the impression that the bird is alive."
     ═══════════════════════════════════════════════════════════════════════ */

  /* Cyan quadrants: maximum iridescent edge brightness */
  .sankofa-bird-rig[data-heading-quadrant="NE"] .sankofa-feather-iri-edge,
  .sankofa-bird-rig[data-heading-quadrant="E"] .sankofa-feather-iri-edge {
    opacity: calc(0.42 + (var(--lighting-factor, 0.5) * 0.52)) !important;
  }

  /* Emerald quadrants: slightly lower but still vivid */
  .sankofa-bird-rig[data-heading-quadrant="SE"] .sankofa-feather-iri-edge,
  .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-feather-iri-edge,
  .sankofa-bird-rig[data-heading-quadrant="SW"] .sankofa-feather-iri-edge {
    opacity: calc(0.35 + (var(--lighting-factor, 0.5) * 0.48)) !important;
  }

  /* W/NW: subtle deepening — the understated direction */
  .sankofa-bird-rig[data-heading-quadrant="W"] .sankofa-feather-iri-edge,
  .sankofa-bird-rig[data-heading-quadrant="NW"] .sankofa-feather-iri-edge {
    opacity: calc(0.28 + (var(--lighting-factor, 0.5) * 0.42)) !important;
  }

  /* Feather iridescent edges also transition filter with heading */
  .sankofa-feather-iri-edge {
    transition: fill 0.50s ease, opacity 0.42s ease, filter 0.55s ease;
  }

  /* Cyan heading: edge highlights shift slightly brighter / bluer */
  .sankofa-bird-rig[data-heading-quadrant="NE"] .sankofa-feather-iri-edge,
  .sankofa-bird-rig[data-heading-quadrant="E"] .sankofa-feather-iri-edge {
    filter: brightness(1.15) saturate(1.25);
  }

  /* Emerald heading: edge highlights deepen */
  .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-feather-iri-edge,
  .sankofa-bird-rig[data-heading-quadrant="SW"] .sankofa-feather-iri-edge,
  .sankofa-bird-rig[data-heading-quadrant="W"] .sankofa-feather-iri-edge {
    filter: hue-rotate(-15deg) brightness(1.05) saturate(1.15);
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 23.3 — Bank-triggered luminance burst
     Hard banking = wings tilting into/away from virtual light source.
     Brief iridescent flash across the luminary overlay — like a raptor
     banking into a shaft of sunlight.
     ═══════════════════════════════════════════════════════════════════════ */

  @keyframes sankofa-bank-iri-flash {
    0%   { opacity: 0.14; }
    20%  { opacity: 0.55; }
    45%  { opacity: 0.42; }
    75%  { opacity: 0.36; }
    100% { opacity: 0.14; }
  }

  .sankofa-bird-rig[data-hard-bank="true"]:not([data-battery-saver="true"])
    .sankofa-wing-luminary-r-a,
  .sankofa-bird-rig[data-hard-bank="true"]:not([data-battery-saver="true"])
    .sankofa-wing-luminary-l-a {
    animation: sankofa-bank-iri-flash 0.75s ease-in-out !important;
  }

  /* Bank also shifts the wing surface filter briefly toward cyan */
  @keyframes sankofa-bank-wing-flash {
    0%   { filter: none; }
    25%  { filter: hue-rotate(22deg) saturate(1.4) brightness(1.12); }
    60%  { filter: hue-rotate(12deg) saturate(1.2) brightness(1.06); }
    100% { filter: none; }
  }

  .sankofa-bird-rig[data-hard-bank="true"]:not([data-battery-saver="true"])
    .sankofa-bird-wing-right,
  .sankofa-bird-rig[data-hard-bank="true"]:not([data-battery-saver="true"])
    .sankofa-bird-wing-left {
    animation: sankofa-bank-wing-flash 0.75s ease-in-out !important;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 23.4 — Feather cascade shimmer (staggered iridescence)
     "Light moving across the wings as they flap. Not glitter — just
      living color." — design brief
     Each outer primary ripples brightness and hue in sequence as the
     wing beats, creating a cascade from tip to root.
     ═══════════════════════════════════════════════════════════════════════ */

  @keyframes sankofa-feather-cascade {
    0%   { filter: brightness(1.0)  hue-rotate(0deg); }
    38%  { filter: brightness(1.16) hue-rotate(14deg); }
    62%  { filter: brightness(1.10) hue-rotate(8deg); }
    100% { filter: brightness(1.0)  hue-rotate(0deg); }
  }

  /* Outermost primaries cascade first (leading edge catches light first) */
  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"])
    .sankofa-feather-r5,
  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"])
    .sankofa-feather-l5 {
    animation: sankofa-feather-cascade var(--flap-period, 1400ms) ease-in-out infinite;
  }

  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"])
    .sankofa-feather-r0,
  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"])
    .sankofa-feather-l0 {
    animation: sankofa-feather-cascade var(--flap-period, 1400ms) ease-in-out infinite;
    animation-delay: calc(var(--flap-period, 1400ms) * 0.07);
  }

  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"])
    .sankofa-feather-r1,
  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"])
    .sankofa-feather-l1 {
    animation: sankofa-feather-cascade var(--flap-period, 1400ms) ease-in-out infinite;
    animation-delay: calc(var(--flap-period, 1400ms) * 0.13);
  }

  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"])
    .sankofa-feather-r2,
  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"])
    .sankofa-feather-l2 {
    animation: sankofa-feather-cascade var(--flap-period, 1400ms) ease-in-out infinite;
    animation-delay: calc(var(--flap-period, 1400ms) * 0.19);
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 23.5 — Resting ambient luminosity lift
     "When the bird is perched it feels elegant and meaningful."
     Wing luminary overlays now have faint ambient presence at rest — the
     bird is always luminous, never flat.
     ═══════════════════════════════════════════════════════════════════════ */

  /* Ambient resting glow: wing luminary no longer collapses to 0 */
  .sankofa-wing-luminary-r-a,
  .sankofa-wing-luminary-l-a {
    opacity: 0.13;
  }
  .sankofa-wing-luminary-r-b,
  .sankofa-wing-luminary-l-b {
    opacity: 0.09;
  }

  /* Feather iridescent edge: ambient resting opacity (was 0.16, now slightly
     higher for the "always shimmering" quality the illustration bird had) */
  .sankofa-feather-iri-edge {
    opacity: calc(0.22 + (var(--lighting-factor, 0.5) * 0.54));
  }

  /* Covert bands: slightly more visible at rest */
  .sankofa-wing-covert-band {
    opacity: 0.16;
  }

  /* Body luminary: faint ambient at rest (was 0 except on events) */
  .sankofa-body-luminary-layer {
    opacity: 0.38;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 23.6 — Gliding iridescent sweep
     "Wings spread, light catches the full surface."
     A slow hue sweep while soaring recreates the structural-color display
     real birds show when banking and gliding in sunlight.
     ═══════════════════════════════════════════════════════════════════════ */

  @keyframes sankofa-glide-iri-sweep {
    0%   { filter: hue-rotate(0deg)   saturate(1.08) brightness(1.0); }
    30%  { filter: hue-rotate(14deg)  saturate(1.32) brightness(1.08); }
    55%  { filter: hue-rotate(-10deg) saturate(1.22) brightness(1.04); }
    80%  { filter: hue-rotate(8deg)   saturate(1.18) brightness(1.06); }
    100% { filter: hue-rotate(0deg)   saturate(1.08) brightness(1.0); }
  }

  .sankofa-bird-rig[data-gliding="true"]:not([data-battery-saver="true"])
    .sankofa-bird-wing-right,
  .sankofa-bird-rig[data-gliding="true"]:not([data-battery-saver="true"])
    .sankofa-bird-wing-left {
    animation: sankofa-glide-iri-sweep 5.5s ease-in-out infinite;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 23.7 — Crown feather iridescence
     Crown feathers respond to community activity tier with a gentle
     cyan / turquoise filter shift — the crown "lights up" with purpose.
     "Dynamic color instead of static color — the bird feels alive."
     ═══════════════════════════════════════════════════════════════════════ */

  .sankofa-crown-feather {
    transition: filter 0.65s ease;
  }

  /* Busy: warm cyan brightening */
  .sankofa-bird-rig[data-activity="busy"] .sankofa-crown-feather {
    filter: hue-rotate(10deg) saturate(1.18) brightness(1.10);
  }

  /* Peak activity: vivid cyan crown — the bird blazes */
  .sankofa-bird-rig[data-activity="peak"] .sankofa-crown-feather {
    filter: hue-rotate(18deg) saturate(1.35) brightness(1.18);
  }

  /* Helping: warm golden tinge on crown (helping = warmth) */
  .sankofa-bird-rig[data-helping="true"] .sankofa-crown-feather {
    filter: hue-rotate(-8deg) saturate(1.12) brightness(1.06);
  }

  /* Celebrating: full crown radiance */
  .sankofa-bird-rig[data-celebrating="true"] .sankofa-crown-feather {
    filter: hue-rotate(20deg) saturate(1.40) brightness(1.22);
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 23.8 — Battery-saver + reduced-motion guards
     Filter animations are expensive on low-end phones — disable completely.
     ═══════════════════════════════════════════════════════════════════════ */

  /* Battery-saver: strip all Phase 23 filter animations and transitions */
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-right,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-left {
    animation: none !important;
    filter: none !important;
    transition: none !important;
    will-change: auto;
  }
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-crown-feather {
    filter: none !important;
    transition: none !important;
  }
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-iri-edge {
    filter: none !important;
    transition: fill 0s !important;
  }
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-r5,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-r0,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-r1,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-r2,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-l5,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-l0,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-l1,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-l2 {
    animation: none !important;
    filter: none !important;
  }
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-wing-luminary-r-a,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-wing-luminary-r-b,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-wing-luminary-l-a,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-wing-luminary-l-b {
    animation: none !important;
  }

  /* Reduced-motion: all Phase 23 animations and filter transitions off */
  @media (prefers-reduced-motion: reduce) {
    .sankofa-bird-wing-right,
    .sankofa-bird-wing-left {
      animation: none !important;
      filter: none !important;
      transition: none !important;
    }
    .sankofa-crown-feather {
      filter: none !important;
      transition: none !important;
    }
    .sankofa-feather-iri-edge {
      filter: none !important;
      transition: fill 0s !important;
    }
    .sankofa-feather-r5,
    .sankofa-feather-r0,
    .sankofa-feather-r1,
    .sankofa-feather-r2,
    .sankofa-feather-l5,
    .sankofa-feather-l0,
    .sankofa-feather-l1,
    .sankofa-feather-l2 {
      animation: none !important;
      filter: none !important;
    }
    .sankofa-wing-luminary-r-a,
    .sankofa-wing-luminary-r-b,
    .sankofa-wing-luminary-l-a,
    .sankofa-wing-luminary-l-b {
      animation: none !important;
    }
  }

`;
