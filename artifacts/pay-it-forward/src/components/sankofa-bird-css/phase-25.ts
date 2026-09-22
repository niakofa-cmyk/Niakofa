/**
 * Sankofa Bird CSS — Phase 25: IRIDESCENCE DEPTH & ATMOSPHERIC RICHNESS
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE 25 — Living Color: Per-Feather Cascade + Layered Atmosphere
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Design brief:
 *
 *   "As the bird turns: cyan shifts toward turquoise, teal deepens toward
 *    emerald, highlights move across the feathers. Real birds often display
 *    this kind of structural coloration."
 *
 *   "Add more visual atmosphere: layered translucency, richer gradient
 *    transitions."
 *
 *   "Give the feathers just a little more life: subtle tonal variation,
 *    gentle highlights, slight edge darkening, iridescent shifts as the
 *    bird moves."
 *
 * ── What this phase adds ─────────────────────────────────────────────────
 *
 *   25.1 Iridescent edge fill activation (fill-swap via CSS custom props)
 *        The --iri-cyan-fill / --iri-turquoise-fill / --iri-emerald-fill
 *        gradient references are set in Wings.tsx inline style but were
 *        never read by CSS. Phase 25 activates them: outer feather edge
 *        paths FILL-SWAP to the correct iridescent gradient per heading.
 *        NE/E = cyan gradient; SE = turquoise; S/SW = emerald; W = deep.
 *
 *   25.2 Per-feather outer-to-inner hue cascade
 *        Outer primaries (r5/l5) shift MORE hue than inner primaries (r3/r4).
 *        This creates a genuine colour GRADIENT across the wing:
 *        outer tips → vivid cyan/emerald, inner root → steady teal.
 *        Matches how structural coloration works on real bird wings.
 *
 *   25.3 Wing atmosphere third layer (emerald translucency)
 *        A third semi-transparent overlay (sankofa-wing-atmos-r/l) using
 *        the emerald gradient appears on SW/W/S headings and the gliding
 *        sweep. Creates the "layered translucency" depth the brief asks for.
 *
 *   25.4 Body and head heading-reactive colour
 *        The whole body/head takes on a subtle hue shift that matches the
 *        wing direction — the bird cohesively reads as one living surface,
 *        not a body with separate wings.
 *
 *   25.5 Neck luminous heading shimmer
 *        The dynamic neck path (sankofa-neck-dynamic) shifts toward cyan
 *        on NE/E turns and deepens toward emerald on S/W turns — matching
 *        the wing's structural colour for visual unity.
 *
 *   25.6 Richer gradient transitions between headings
 *        SW/NW transitional headings now get their own intermediate blend
 *        instead of snapping between their neighbours.
 *
 *   25.7 Enhanced feather edge darkening (shadow side depth)
 *        When the bird faces away from the light, inner primaries deepen
 *        more than outer ones (outer catch any scattered light; inner are
 *        fully in shadow). Creates genuine light-fall depth.
 *
 *   25.8 Beak warm-glow atmosphere
 *        The beak catchlight now transitions from amber to gold-white at
 *        peak lighting angles, adding the metallic quality real curved
 *        keratin shows in sunlight.
 *
 *   25.9 Battery-saver + reduced-motion guards
 *
 * Design contract:
 *   - All rules ADDITIVE over Phases 1–24. No resets.
 *   - filter magnitudes: hue-rotate max +-28deg outer / +-12deg inner.
 *   - The cascade must be perceptible but subtle: not a palette swap,
 *     just the kind of living colour shift you see when a kingfisher turns.
 *   - No backtick characters inside this template literal (Babel crashes).
 */

// NOTE: Backtick characters inside CSS template literal strings crash Babel.
// Use only single/double quotes inside this string.

export const sankofaCssPhase25 = `

  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 25.1 — Iridescent edge fill activation (CSS custom property fill-swap)
     Wings.tsx sets --iri-cyan-fill / --iri-turquoise-fill / --iri-emerald-fill
     on the iri-edge paths via inline style. This CSS now reads them as fill.
     Outer feathers (r5/l5, r0/l0) do the full colour swap per heading.
     ═══════════════════════════════════════════════════════════════════════ */

  /* Transition the fill and filter on ALL iri-edge paths */
  .sankofa-feather-iri-edge {
    transition: fill 0.55s ease, opacity 0.45s ease, filter 0.55s ease;
  }

  /* NE heading: outer edges → vivid cyan gradient fill */
  .sankofa-bird-rig[data-heading-quadrant="NE"] .sankofa-feather-iri-r5,
  .sankofa-bird-rig[data-heading-quadrant="NE"] .sankofa-feather-iri-l5 {
    fill: var(--iri-cyan-fill, #22D3EE);
    opacity: calc(0.55 + var(--lighting-factor, 0.5) * 0.40);
  }
  .sankofa-bird-rig[data-heading-quadrant="NE"] .sankofa-feather-iri-r0,
  .sankofa-bird-rig[data-heading-quadrant="NE"] .sankofa-feather-iri-l0 {
    fill: var(--iri-cyan-fill, #00D4FF);
    opacity: calc(0.45 + var(--lighting-factor, 0.5) * 0.34);
  }

  /* E heading: maximum cyan — outermost feather edges blaze */
  .sankofa-bird-rig[data-heading-quadrant="E"] .sankofa-feather-iri-r5,
  .sankofa-bird-rig[data-heading-quadrant="E"] .sankofa-feather-iri-l5 {
    fill: var(--iri-cyan-fill, #22D3EE);
    filter: brightness(1.18) saturate(1.42) hue-rotate(12deg);
    opacity: calc(0.62 + var(--lighting-factor, 0.5) * 0.36);
  }
  .sankofa-bird-rig[data-heading-quadrant="E"] .sankofa-feather-iri-r0,
  .sankofa-bird-rig[data-heading-quadrant="E"] .sankofa-feather-iri-l0 {
    fill: var(--iri-cyan-fill, #00D4FF);
    filter: brightness(1.12) saturate(1.32) hue-rotate(8deg);
    opacity: calc(0.52 + var(--lighting-factor, 0.5) * 0.30);
  }

  /* SE heading: turquoise territory — teal meets green */
  .sankofa-bird-rig[data-heading-quadrant="SE"] .sankofa-feather-iri-r5,
  .sankofa-bird-rig[data-heading-quadrant="SE"] .sankofa-feather-iri-l5 {
    fill: var(--iri-turquoise-fill, #14B8A6);
    filter: brightness(1.06) saturate(1.24) hue-rotate(-8deg);
    opacity: calc(0.48 + var(--lighting-factor, 0.5) * 0.32);
  }
  .sankofa-bird-rig[data-heading-quadrant="SE"] .sankofa-feather-iri-r0,
  .sankofa-bird-rig[data-heading-quadrant="SE"] .sankofa-feather-iri-l0 {
    fill: var(--iri-turquoise-fill, #0D9488);
    filter: brightness(1.03) saturate(1.16) hue-rotate(-5deg);
  }

  /* S heading: emerald — classic structural green */
  .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-feather-iri-r5,
  .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-feather-iri-l5 {
    fill: var(--iri-emerald-fill, #10B981);
    filter: brightness(1.05) saturate(1.22) hue-rotate(-15deg);
    opacity: calc(0.44 + var(--lighting-factor, 0.5) * 0.30);
  }
  .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-feather-iri-r0,
  .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-feather-iri-l0 {
    fill: var(--iri-emerald-fill, #10B981);
    filter: brightness(1.02) saturate(1.14) hue-rotate(-12deg);
  }

  /* SW heading: deep emerald, feathers catching angle backlight */
  .sankofa-bird-rig[data-heading-quadrant="SW"] .sankofa-feather-iri-r5,
  .sankofa-bird-rig[data-heading-quadrant="SW"] .sankofa-feather-iri-l5,
  .sankofa-bird-rig[data-heading-quadrant="SW"] .sankofa-feather-iri-r0,
  .sankofa-bird-rig[data-heading-quadrant="SW"] .sankofa-feather-iri-l0 {
    fill: var(--iri-emerald-fill, #0F766E);
    filter: brightness(1.02) saturate(1.14) hue-rotate(-20deg);
    opacity: calc(0.38 + var(--lighting-factor, 0.5) * 0.30);
  }

  /* W heading: deepest emerald with cool blue undertone */
  .sankofa-bird-rig[data-heading-quadrant="W"] .sankofa-feather-iri-r5,
  .sankofa-bird-rig[data-heading-quadrant="W"] .sankofa-feather-iri-l5,
  .sankofa-bird-rig[data-heading-quadrant="W"] .sankofa-feather-iri-r0,
  .sankofa-bird-rig[data-heading-quadrant="W"] .sankofa-feather-iri-l0 {
    fill: var(--iri-emerald-fill, #0F766E);
    filter: brightness(0.97) saturate(1.08) hue-rotate(-26deg);
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 25.2 — Per-feather outer-to-inner hue cascade
     Outer primaries shift MORE hue than inner ones. The wing surface already
     gets a heading-reactive filter (Phase 23). This adds per-feather offsets
     on top so outer tips vs inner root read as genuinely different colours.
     "Structural coloration: hue shifts as viewing angle changes." — brief
     ═══════════════════════════════════════════════════════════════════════ */

  /* E heading: outer primaries add extra cyan shift on top of wing filter */
  .sankofa-bird-rig[data-heading-quadrant="E"] .sankofa-feather-r5,
  .sankofa-bird-rig[data-heading-quadrant="E"] .sankofa-feather-l5 {
    filter: brightness(calc(0.92 + var(--lighting-factor, 0.5) * 0.26))
            hue-rotate(8deg) saturate(1.20);
    transition: filter 0.50s ease;
  }
  .sankofa-bird-rig[data-heading-quadrant="E"] .sankofa-feather-r0,
  .sankofa-bird-rig[data-heading-quadrant="E"] .sankofa-feather-l0 {
    filter: brightness(calc(0.90 + var(--lighting-factor, 0.5) * 0.24))
            hue-rotate(5deg) saturate(1.14);
    transition: filter 0.50s ease;
  }
  /* Inner primaries on E heading stay closer to base teal */
  .sankofa-bird-rig[data-heading-quadrant="E"] .sankofa-feather-r3,
  .sankofa-bird-rig[data-heading-quadrant="E"] .sankofa-feather-l3,
  .sankofa-bird-rig[data-heading-quadrant="E"] .sankofa-feather-r4,
  .sankofa-bird-rig[data-heading-quadrant="E"] .sankofa-feather-l4 {
    filter: brightness(calc(0.89 + var(--lighting-factor, 0.5) * 0.18))
            hue-rotate(-4deg) saturate(0.96);
    transition: filter 0.50s ease;
  }

  /* NE heading: lighter outer cascade */
  .sankofa-bird-rig[data-heading-quadrant="NE"] .sankofa-feather-r5,
  .sankofa-bird-rig[data-heading-quadrant="NE"] .sankofa-feather-l5 {
    filter: brightness(calc(0.91 + var(--lighting-factor, 0.5) * 0.24))
            hue-rotate(5deg) saturate(1.14);
    transition: filter 0.50s ease;
  }

  /* S heading: outer primaries deepen to emerald more than inner */
  .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-feather-r5,
  .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-feather-l5 {
    filter: brightness(calc(0.90 + var(--lighting-factor, 0.5) * 0.18))
            hue-rotate(-10deg) saturate(1.18);
    transition: filter 0.50s ease;
  }
  .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-feather-r0,
  .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-feather-l0 {
    filter: brightness(calc(0.90 + var(--lighting-factor, 0.5) * 0.16))
            hue-rotate(-7deg) saturate(1.12);
    transition: filter 0.50s ease;
  }
  /* Inner primaries: resist the emerald shift, stay more teal */
  .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-feather-r3,
  .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-feather-l3,
  .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-feather-r4,
  .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-feather-l4 {
    filter: brightness(calc(0.90 + var(--lighting-factor, 0.5) * 0.14))
            hue-rotate(3deg) saturate(0.98);
    transition: filter 0.50s ease;
  }

  /* SW heading: deep emerald outer, muted inner */
  .sankofa-bird-rig[data-heading-quadrant="SW"] .sankofa-feather-r5,
  .sankofa-bird-rig[data-heading-quadrant="SW"] .sankofa-feather-l5 {
    filter: brightness(calc(0.88 + var(--lighting-factor, 0.5) * 0.16))
            hue-rotate(-16deg) saturate(1.14);
    transition: filter 0.50s ease;
  }
  .sankofa-bird-rig[data-heading-quadrant="SW"] .sankofa-feather-r3,
  .sankofa-bird-rig[data-heading-quadrant="SW"] .sankofa-feather-l3,
  .sankofa-bird-rig[data-heading-quadrant="SW"] .sankofa-feather-r4,
  .sankofa-bird-rig[data-heading-quadrant="SW"] .sankofa-feather-l4 {
    filter: brightness(calc(0.88 + var(--lighting-factor, 0.5) * 0.12))
            hue-rotate(5deg);
    transition: filter 0.50s ease;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 25.3 — Wing atmosphere third layer
     sankofa-wing-atmos-r / sankofa-wing-atmos-l elements (added to Wings.tsx)
     carry a translucent emerald/turquoise gradient. They appear when the bird
     turns into the emerald zone and during gliding, creating a third layer of
     atmospheric depth over the existing two luminary paths.
     "Layered translucency, richer gradient transitions." — design brief
     ═══════════════════════════════════════════════════════════════════════ */

  /* Base: atmosphere layers are invisible at rest */
  .sankofa-wing-atmos-r,
  .sankofa-wing-atmos-l {
    opacity: 0;
    transition: opacity 0.60s ease, filter 0.60s ease;
    pointer-events: none;
  }

  /* SE heading: gentle turquoise shimmer begins */
  .sankofa-bird-rig[data-heading-quadrant="SE"] .sankofa-wing-atmos-r,
  .sankofa-bird-rig[data-heading-quadrant="SE"] .sankofa-wing-atmos-l {
    opacity: 0.09;
    filter: hue-rotate(-8deg) saturate(1.18);
  }

  /* S heading: emerald atmosphere strengthens */
  .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-wing-atmos-r,
  .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-wing-atmos-l {
    opacity: 0.13;
    filter: hue-rotate(-15deg) saturate(1.25);
  }

  /* SW heading: deepest atmosphere — the richest emerald moment */
  .sankofa-bird-rig[data-heading-quadrant="SW"] .sankofa-wing-atmos-r,
  .sankofa-bird-rig[data-heading-quadrant="SW"] .sankofa-wing-atmos-l {
    opacity: 0.17;
    filter: hue-rotate(-22deg) saturate(1.22);
  }

  /* W heading: atmosphere lingers at medium intensity */
  .sankofa-bird-rig[data-heading-quadrant="W"] .sankofa-wing-atmos-r,
  .sankofa-bird-rig[data-heading-quadrant="W"] .sankofa-wing-atmos-l {
    opacity: 0.12;
    filter: hue-rotate(-26deg) saturate(1.14);
  }

  /* Gliding: slow atmosphere sweep (the "wings spread in sun" quality) */
  @keyframes sankofa-atmos-sweep {
    0%   { opacity: 0.08; filter: hue-rotate(-8deg)  saturate(1.12); }
    35%  { opacity: 0.18; filter: hue-rotate(-20deg) saturate(1.30); }
    60%  { opacity: 0.14; filter: hue-rotate(-14deg) saturate(1.22); }
    80%  { opacity: 0.10; filter: hue-rotate(-8deg)  saturate(1.16); }
    100% { opacity: 0.08; filter: hue-rotate(-8deg)  saturate(1.12); }
  }

  .sankofa-bird-rig[data-gliding="true"]:not([data-battery-saver="true"])
    .sankofa-wing-atmos-r,
  .sankofa-bird-rig[data-gliding="true"]:not([data-battery-saver="true"])
    .sankofa-wing-atmos-l {
    animation: sankofa-atmos-sweep 6.5s ease-in-out infinite;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 25.4 — Body and head heading-reactive colour
     The body and head take on a subtle unified hue shift that matches the
     wing direction — the whole bird reads as one coherent living surface.
     "Highlights move across the feathers." — design brief
     ═══════════════════════════════════════════════════════════════════════ */

  /* Transition the body and head for smooth heading changes */
  .sankofa-bird-body,
  .sankofa-bird-body-ellipse,
  .sankofa-head-luminary {
    transition: filter 0.65s ease;
  }

  /* NE / E headings: body brightens and shifts cyan */
  .sankofa-bird-rig[data-heading-quadrant="NE"] .sankofa-bird-body,
  .sankofa-bird-rig[data-heading-quadrant="NE"] .sankofa-bird-body-ellipse {
    filter: hue-rotate(5deg) saturate(1.08) brightness(1.04);
  }
  .sankofa-bird-rig[data-heading-quadrant="E"] .sankofa-bird-body,
  .sankofa-bird-rig[data-heading-quadrant="E"] .sankofa-bird-body-ellipse {
    filter: hue-rotate(10deg) saturate(1.12) brightness(1.06);
  }

  /* S / SW headings: body subtly deepens toward emerald */
  .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-bird-body,
  .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-bird-body-ellipse {
    filter: hue-rotate(-8deg) saturate(1.10) brightness(1.02);
  }
  .sankofa-bird-rig[data-heading-quadrant="SW"] .sankofa-bird-body,
  .sankofa-bird-rig[data-heading-quadrant="SW"] .sankofa-bird-body-ellipse {
    filter: hue-rotate(-12deg) saturate(1.08) brightness(0.98);
  }
  .sankofa-bird-rig[data-heading-quadrant="W"] .sankofa-bird-body,
  .sankofa-bird-rig[data-heading-quadrant="W"] .sankofa-bird-body-ellipse {
    filter: hue-rotate(-16deg) saturate(1.06) brightness(0.96);
  }

  /* Head luminary follows the body colour shift */
  .sankofa-bird-rig[data-heading-quadrant="NE"] .sankofa-head-luminary,
  .sankofa-bird-rig[data-heading-quadrant="E"] .sankofa-head-luminary {
    filter: hue-rotate(8deg) saturate(1.15) brightness(1.08);
  }
  .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-head-luminary,
  .sankofa-bird-rig[data-heading-quadrant="SW"] .sankofa-head-luminary,
  .sankofa-bird-rig[data-heading-quadrant="W"] .sankofa-head-luminary {
    filter: hue-rotate(-10deg) saturate(1.12) brightness(0.96);
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 25.5 — Neck luminous heading shimmer
     The dynamic neck (sankofa-neck-dynamic) shifts toward cyan during NE/E
     turns and deepens toward emerald on S/W turns, matching the wing's
     structural colour. The neck is the bridge between head and body —
     it should feel like one living surface, not a separate element.
     ═══════════════════════════════════════════════════════════════════════ */

  .sankofa-neck-dynamic,
  .sankofa-neck-dynamic-halo,
  .sankofa-neck-lower-seg,
  .sankofa-neck-upper-seg {
    transition: filter 0.55s ease, opacity 0.15s ease;
  }

  /* E / NE: neck brightens and shifts cyan with the wings */
  .sankofa-bird-rig[data-heading-quadrant="E"] .sankofa-neck-dynamic,
  .sankofa-bird-rig[data-heading-quadrant="E"] .sankofa-neck-lower-seg,
  .sankofa-bird-rig[data-heading-quadrant="E"] .sankofa-neck-upper-seg {
    filter: brightness(calc(0.95 + var(--lighting-factor, 0.5) * 0.28))
            hue-rotate(10deg) saturate(1.20);
  }
  .sankofa-bird-rig[data-heading-quadrant="NE"] .sankofa-neck-dynamic,
  .sankofa-bird-rig[data-heading-quadrant="NE"] .sankofa-neck-lower-seg,
  .sankofa-bird-rig[data-heading-quadrant="NE"] .sankofa-neck-upper-seg {
    filter: brightness(calc(0.93 + var(--lighting-factor, 0.5) * 0.25))
            hue-rotate(6deg) saturate(1.14);
  }

  /* S / SW / W: neck deepens toward emerald */
  .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-neck-dynamic,
  .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-neck-lower-seg,
  .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-neck-upper-seg {
    filter: brightness(calc(0.90 + var(--lighting-factor, 0.5) * 0.22))
            hue-rotate(-10deg) saturate(1.16);
  }
  .sankofa-bird-rig[data-heading-quadrant="W"] .sankofa-neck-dynamic,
  .sankofa-bird-rig[data-heading-quadrant="W"] .sankofa-neck-lower-seg,
  .sankofa-bird-rig[data-heading-quadrant="W"] .sankofa-neck-upper-seg {
    filter: brightness(calc(0.88 + var(--lighting-factor, 0.5) * 0.20))
            hue-rotate(-16deg) saturate(1.12);
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 25.6 — Richer gradient transitions (SW/NW blends)
     SW and NW are the two transitional headings in the 8-direction system.
     Give them their own intermediate filter so heading changes feel like
     continuous turning, not discrete state jumps.
     ═══════════════════════════════════════════════════════════════════════ */

  /* NW: returning toward teal from W — intermediate blend */
  .sankofa-bird-rig[data-heading-quadrant="NW"] .sankofa-bird-wing-right,
  .sankofa-bird-rig[data-heading-quadrant="NW"] .sankofa-bird-wing-left {
    filter: hue-rotate(-5deg) saturate(1.04) brightness(0.99);
    transition: filter 0.65s ease;
  }

  /* NW feather iri-edges: gentle pull back toward default teal */
  .sankofa-bird-rig[data-heading-quadrant="NW"] .sankofa-feather-iri-r5,
  .sankofa-bird-rig[data-heading-quadrant="NW"] .sankofa-feather-iri-l5,
  .sankofa-bird-rig[data-heading-quadrant="NW"] .sankofa-feather-iri-r0,
  .sankofa-bird-rig[data-heading-quadrant="NW"] .sankofa-feather-iri-l0 {
    opacity: calc(0.30 + var(--lighting-factor, 0.5) * 0.36);
    filter: brightness(1.05) saturate(1.08);
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 25.7 — Enhanced shadow-side feather depth
     When facing away from the light (SE/S heading), inner primaries deepen
     MORE than outer ones. Outer feathers catch scattered/reflected light;
     inner ones, tucked against the body, fall into genuine shadow.
     "Slight edge darkening." — design brief
     ═══════════════════════════════════════════════════════════════════════ */

  /* SE/S: inner primaries darker — genuine depth in the shadow zone */
  .sankofa-bird-rig[data-heading-quadrant="SE"] .sankofa-feather-r3,
  .sankofa-bird-rig[data-heading-quadrant="SE"] .sankofa-feather-l3,
  .sankofa-bird-rig[data-heading-quadrant="SE"] .sankofa-feather-r4,
  .sankofa-bird-rig[data-heading-quadrant="SE"] .sankofa-feather-l4 {
    filter: brightness(calc(0.90 - var(--lighting-factor, 0.5) * 0.06))
            saturate(0.94);
    transition: filter 0.50s ease;
  }

  /* Secondary feathers: deepest on S heading (fully in shadow under primaries) */
  .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-feather-rs1,
  .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-feather-ls1,
  .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-feather-rs2,
  .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-feather-ls2 {
    filter: brightness(calc(0.88 - var(--lighting-factor, 0.5) * 0.08))
            saturate(0.90) hue-rotate(-5deg);
    transition: filter 0.50s ease;
  }

  /* Covert band: on SE/S heading, the forearm zone sinks into shadow */
  .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-wing-covert-band,
  .sankofa-bird-rig[data-heading-quadrant="SE"] .sankofa-wing-covert-band {
    opacity: calc(0.06 + var(--lighting-factor, 0.5) * 0.08);
    transition: opacity 0.45s ease;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 25.8 — Beak warm-glow atmosphere (metallic keratin quality)
     At maximum lighting angles, the beak catchlight transitions from warm
     amber to near-white gold — the metallic sheen of curved keratin in
     direct sunlight. A secondary micro-glint appears on the beak ridge.
     ═══════════════════════════════════════════════════════════════════════ */

  /* Peak beak warmth: NW heading at high lighting-factor */
  @keyframes sankofa-beak-gold-peak {
    0%   { filter: sepia(0.65) hue-rotate(-28deg) saturate(2.0) brightness(1.35); }
    45%  { filter: sepia(0.45) hue-rotate(-18deg) saturate(1.80) brightness(1.55); }
    80%  { filter: sepia(0.70) hue-rotate(-30deg) saturate(2.1)  brightness(1.32); }
    100% { filter: sepia(0.65) hue-rotate(-28deg) saturate(2.0) brightness(1.35); }
  }

  /* NW/W with high lighting: subtle slow pulse — "glinting metal" */
  .sankofa-bird-rig[data-heading-quadrant="NW"]:not([data-battery-saver="true"])
    .sankofa-beak-catchlight {
    animation: sankofa-beak-gold-peak 3.8s ease-in-out infinite;
  }

  /* Beak gloss: responds to lighting-factor for more metallic feel */
  .sankofa-beak-gloss {
    opacity: calc(0.06 + var(--lighting-factor, 0.5) * 0.24);
    transition: opacity 0.40s ease;
  }

  /* NW/N headings: beak gloss maximises (light catches the ridge) */
  .sankofa-bird-rig[data-heading-quadrant="NW"] .sankofa-beak-gloss,
  .sankofa-bird-rig[data-heading-quadrant="N"] .sankofa-beak-gloss {
    opacity: calc(0.14 + var(--lighting-factor, 0.5) * 0.30);
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 25.9 — Battery-saver + reduced-motion guards
     ═══════════════════════════════════════════════════════════════════════ */

  /* Battery-saver: strip all Phase 25 filter animations */
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-iri-r5,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-iri-r0,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-iri-l5,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-iri-l0 {
    fill: #00D4FF !important;
    filter: none !important;
    transition: none !important;
  }
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-wing-atmos-r,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-wing-atmos-l {
    opacity: 0 !important;
    animation: none !important;
  }
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-body,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-body-ellipse,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-head-luminary {
    filter: none !important;
    transition: none !important;
  }
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-beak-catchlight {
    animation: none !important;
  }

  /* Reduced-motion: all Phase 25 animations off, filter transitions off */
  @media (prefers-reduced-motion: reduce) {
    .sankofa-feather-iri-r5,
    .sankofa-feather-iri-r0,
    .sankofa-feather-iri-l5,
    .sankofa-feather-iri-l0 {
      fill: #00D4FF !important;
      filter: none !important;
      transition: none !important;
    }
    .sankofa-wing-atmos-r,
    .sankofa-wing-atmos-l {
      opacity: 0 !important;
      animation: none !important;
    }
    .sankofa-bird-body,
    .sankofa-bird-body-ellipse {
      filter: none !important;
      transition: none !important;
    }
    .sankofa-beak-catchlight {
      animation: none !important;
    }
  }

`;
