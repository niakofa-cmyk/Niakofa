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
 *   26.1 Organic Asymmetry (animation-based, no filter conflict)
 *        Right and left wings use DIFFERENT breath keyframes — not just
 *        different delays. The right outer primary breathes at peak 0.93,
 *        the left at peak 0.91. This is the correct way to express permanent
 *        L/R luminance asymmetry: through animation values rather than
 *        static filter rules (which Phase 25 heading selectors override).
 *        Covert bands and scapulars differ in base opacity (no conflict).
 *
 *   26.2 Feather Luminous Breath (staggered independent cycles)
 *        Every primary feather row breathes on its own slow cycle (7-14s).
 *        Right and left variants use slightly different peak values and periods
 *        so the two wings are never in phase. Secondary feathers breathe on
 *        their own longer cycle. The effect: the wing surface shimmers like
 *        real structural coloration in motion — never mechanical, never synced.
 *
 *   26.3 Full Lighting-from-Above System
 *        data-flying="true" activates a spherical lighting model:
 *        - Shoulder / upper-body zone: brightest (catches sky light)
 *        - Forearm / secondary zone: mid-brightness
 *        - Primary tips: luminous leading edge
 *        - Primary bases: transitional shadow
 *        - Belly ellipse: subtly deeper (in wing shadow)
 *        - Dorsal stripe: slim luminous sky-catch across the back
 *        The beak and egg respond to this same lighting cycle.
 *
 *   26.4 Wing Anatomy Zone Depth — Always On (resting + flying)
 *        The zone hierarchy (shoulder brighter than forearm brighter than
 *        primary base) now has a PERMANENT baseline that fires at rest too:
 *          - Scapulars:     brightness(1.05) always (no Phase 25 conflict)
 *          - Secondaries:   brightness(1.02) always
 *          - Covert bands:  subtle always-on luminance stripe
 *          - Inner primaries: deeper via breath animation keyframe values
 *        Flying amplifies these to the full zone segmentation model.
 *        This fixes the gap where the resting bird was still a flat-lit wing.
 *
 *   26.5 Body Depth — Belly Shadow + Dorsal Stripe
 *        A semi-transparent darker ellipse at the lower body becomes visible
 *        during flight (belly in shadow of wings). A slim bright path across
 *        the dorsal surface shows the upward sky-light catch. Together they
 *        give the body genuine spherical shading, not a flat fill.
 *        Body feather rows have permanent tonal variation: upper rows brighter,
 *        lower rows slightly deeper — the brief's "tonal variation" requirement.
 *
 *   26.6 Egg Warm Atmosphere
 *        The egg warmglow now also activates on data-nearby="true" and
 *        data-accepted="true" (previously only helping/celebrating/donated).
 *        A secondary body-chest warmth halo spreads outward from the egg
 *        on meaningful moments. Egg glow halo pulses on celebrating.
 *
 *   26.7 Enhanced Tail Fan Luminosity
 *        The tail luminary inner/outer paths have a slow depth-breathing
 *        animation at rest. Far rectrices brighten at tip during landing
 *        (ground-effect glow). Tail warms toward amber on helping states.
 *
 *   26.8 Battery-saver + reduced-motion guards
 *        All Phase 26 animations disabled under data-battery-saver="true"
 *        and prefers-reduced-motion: reduce.
 *
 *   26.9 Atmosphere: Overlapping Transparent Shapes + Softer Transitions
 *        Additional translucent atmosphere layers inspired by the original
 *        illustration's layered glass-painting technique. Wing surfaces gain
 *        a third semi-opaque teal layer on active states. Body gains a
 *        soft reflected-light ellipse below the belly. All transition
 *        durations softened (0.6-1.0s) for organic flow.
 *
 *   26.10 Iridescent Highlights that Shift with Movement + Banking Lighting
 *        When the bird banks, the upward wing brightens more (it catches the
 *        sky), the downward wing slightly deepens. Banking also triggers a
 *        brief iridescent hue-shift cascade across primaries — the signature
 *        "structural coloration catches a new angle of light" effect.
 *        The wing atmosphere layers brighten on the banking side and a
 *        soft reflected-light tint appears on the underside.
 *
 * ── Design contract ───────────────────────────────────────────────────────
 *   All rules ADDITIVE over Phases 1-25. No resets.
 *
 *   Cascade safety: Phase 25 heading selectors are
 *     .sankofa-bird-rig[data-heading-quadrant="X"] .sankofa-feather-rN
 *   which have specificity (0,2,0). Phase 26 baseline rules for feathers
 *   are .sankofa-feather-rN at (0,1,0) — so Phase 25 heading rules
 *   correctly WIN and add their color logic on top. The asymmetry is
 *   expressed through animation values (which Phase 25 does NOT touch)
 *   so it persists regardless of heading. No conflicts.
 *
 *   No backtick characters inside this template literal (Babel crashes).
 */

// NOTE: No backtick characters inside this CSS template literal string.

export const sankofaCssPhase26 = `

  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 26.1 — Organic Asymmetry: Opacity + Covert/Scapular differentiation
     Static filter rules on feathers conflict with Phase 25 heading selectors
     (higher specificity wins). Instead asymmetry is expressed via:
       a) Different breath keyframe peak values (R brighter than L, see 26.2)
       b) Opacity differences on elements Phase 25 does NOT target
       c) Brightness on scapulars (Phase 25 has NO scapular heading rules)
     ═══════════════════════════════════════════════════════════════════════ */

  /* Covert bands: right slightly more visible than left — natural overlap.
     Phase 25 does NOT set opacity/filter on covert bands, so these hold. */
  .sankofa-wing-covert-band-r {
    opacity: 0.14;
  }
  .sankofa-wing-covert-band-l {
    opacity: 0.10;
  }

  /* Scapulars: right pair sits slightly higher luminosity.
     Phase 25 does NOT target scapulars with heading rules — safe.
     Adding brightness filter here is safe because specificity (0,1,0)
     and Phase 25 has no rule targeting these class names at any specificity. */
  .sankofa-wing-scap-r1 {
    opacity: 0.14;
    filter: brightness(1.06) saturate(1.06);
    transition: filter 0.65s ease, opacity 0.45s ease;
  }
  .sankofa-wing-scap-l1 {
    opacity: 0.11;
    filter: brightness(1.03) saturate(1.04);
    transition: filter 0.65s ease, opacity 0.45s ease;
  }
  .sankofa-wing-scap-r2 {
    opacity: 0.12;
    filter: brightness(1.04) saturate(1.04);
    transition: filter 0.65s ease, opacity 0.45s ease;
  }
  .sankofa-wing-scap-l2 {
    opacity: 0.09;
    filter: brightness(1.02) saturate(1.03);
    transition: filter 0.65s ease, opacity 0.45s ease;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 26.2 — Feather Luminous Breath (animation-based asymmetry)
     RIGHT wing uses slightly higher peak opacity in its keyframes.
     LEFT wing uses slightly lower peak. Different periods on each side.
     The result: R and L are never in phase AND never at the same brightness
     at the same time — genuine organic irregularity that survives Phase 25
     heading filter overrides (animations are a separate cascade axis).
     ═══════════════════════════════════════════════════════════════════════ */

  /* ── Right wing outer breath — peak 0.93, warmer side */
  @keyframes sankofa-breath-outer-r {
    0%   { opacity: 0.93; }
    35%  { opacity: 0.88; }
    70%  { opacity: 0.92; }
    100% { opacity: 0.93; }
  }

  /* ── Left wing outer breath — peak 0.91, cooler side */
  @keyframes sankofa-breath-outer-l {
    0%   { opacity: 0.91; }
    42%  { opacity: 0.86; }
    75%  { opacity: 0.90; }
    100% { opacity: 0.91; }
  }

  /* ── Mid primary breath — right slightly brighter than left */
  @keyframes sankofa-breath-mid-r {
    0%   { opacity: 0.81; }
    40%  { opacity: 0.76; }
    100% { opacity: 0.81; }
  }
  @keyframes sankofa-breath-mid-l {
    0%   { opacity: 0.79; }
    45%  { opacity: 0.74; }
    100% { opacity: 0.79; }
  }

  /* ── Inner primary breath — same both sides, just staggered */
  @keyframes sankofa-breath-inner {
    0%   { opacity: 0.67; }
    55%  { opacity: 0.63; }
    100% { opacity: 0.67; }
  }

  /* ── Secondary breath — R/L variants for organic feel */
  @keyframes sankofa-breath-secondary-r {
    0%   { opacity: 0.63; }
    46%  { opacity: 0.59; }
    100% { opacity: 0.63; }
  }
  @keyframes sankofa-breath-secondary-l {
    0%   { opacity: 0.61; }
    50%  { opacity: 0.57; }
    100% { opacity: 0.61; }
  }

  /* Apply breath animations — each feather gets unique animation name + delay
     Right wing: -r keyframes; left wing: -l keyframes.
     Different periods on R vs L further de-sync the two wings. */

  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-r5 {
    animation: sankofa-breath-outer-r 11.2s ease-in-out infinite;
    animation-delay: -0.0s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-l5 {
    animation: sankofa-breath-outer-l 10.8s ease-in-out infinite;
    animation-delay: -2.8s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-r0 {
    animation: sankofa-breath-outer-r 12.5s ease-in-out infinite;
    animation-delay: -4.1s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-l0 {
    animation: sankofa-breath-outer-l 13.1s ease-in-out infinite;
    animation-delay: -1.7s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-r1 {
    animation: sankofa-breath-mid-r 9.8s ease-in-out infinite;
    animation-delay: -3.2s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-l1 {
    animation: sankofa-breath-mid-l 10.4s ease-in-out infinite;
    animation-delay: -5.9s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-r2 {
    animation: sankofa-breath-mid-r 10.6s ease-in-out infinite;
    animation-delay: -0.8s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-l2 {
    animation: sankofa-breath-mid-l 9.4s ease-in-out infinite;
    animation-delay: -6.3s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-r3 {
    animation: sankofa-breath-inner 8.4s ease-in-out infinite;
    animation-delay: -1.5s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-l3 {
    animation: sankofa-breath-inner 8.9s ease-in-out infinite;
    animation-delay: -4.6s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-r4 {
    animation: sankofa-breath-inner 7.6s ease-in-out infinite;
    animation-delay: -2.2s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-l4 {
    animation: sankofa-breath-inner 8.1s ease-in-out infinite;
    animation-delay: -5.1s;
  }

  /* Secondary feathers: R/L variants with different periods */
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-rs1 {
    animation: sankofa-breath-secondary-r 13.4s ease-in-out infinite;
    animation-delay: -3.7s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-ls1 {
    animation: sankofa-breath-secondary-l 12.8s ease-in-out infinite;
    animation-delay: -8.2s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-rs2 {
    animation: sankofa-breath-secondary-r 14.1s ease-in-out infinite;
    animation-delay: -1.1s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-ls2 {
    animation: sankofa-breath-secondary-l 14.7s ease-in-out infinite;
    animation-delay: -6.8s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-rs3 {
    animation: sankofa-breath-secondary-r 11.6s ease-in-out infinite;
    animation-delay: -7.4s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-ls3 {
    animation: sankofa-breath-secondary-l 12.2s ease-in-out infinite;
    animation-delay: -2.9s;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 26.3 — Full Lighting-from-Above System (flight activation)
     When flying, a spherical light model activates: dorsal surface brightens
     (sky light), belly deepens (body shadow), wing anatomy zone segmentation
     intensifies beyond the resting baseline.
     ═══════════════════════════════════════════════════════════════════════ */

  /* FLYING: dorsal highlight becomes visible */
  .sankofa-bird-rig[data-flying="true"] .sankofa-dorsal-hi {
    opacity: 0.24;
    transition: opacity 0.9s ease;
  }

  /* FLYING: belly shadow activates */
  .sankofa-bird-rig[data-flying="true"] .sankofa-belly-shadow {
    opacity: 0.18;
    transition: opacity 0.9s ease;
  }

  /* FLYING: body luminary layer brightens (more sky light from above) */
  .sankofa-bird-rig[data-flying="true"] .sankofa-body-luminary-layer {
    opacity: 0.68;
    transition: opacity 0.85s ease;
  }

  /* FLYING: breast sheen becomes gently visible */
  .sankofa-bird-rig[data-flying="true"] .sankofa-breast-sheen {
    opacity: calc(0.06 + var(--lighting-factor, 0.5) * 0.10);
    transition: opacity 0.75s ease;
  }

  /* FLYING: crown feathers catch sky light */
  .sankofa-bird-rig[data-flying="true"] .sankofa-crown-feather {
    filter: brightness(1.08) saturate(1.06);
    transition: filter 0.75s ease;
  }

  /* FLYING: beak gloss intensifies — golden top-light catch */
  .sankofa-bird-rig[data-flying="true"] .sankofa-beak-gloss {
    opacity: calc(0.10 + var(--lighting-factor, 0.5) * 0.28);
    transition: opacity 0.75s ease;
  }

  /* FLYING: wing luminary layers strengthen */
  .sankofa-bird-rig[data-flying="true"] .sankofa-wing-luminary-r-a,
  .sankofa-bird-rig[data-flying="true"] .sankofa-wing-luminary-l-a {
    opacity: 0.28;
    transition: opacity 0.75s ease;
  }
  .sankofa-bird-rig[data-flying="true"] .sankofa-wing-luminary-r-b,
  .sankofa-bird-rig[data-flying="true"] .sankofa-wing-luminary-l-b {
    opacity: 0.20;
    transition: opacity 0.75s ease;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 26.4 — Wing Anatomy Zone Depth — Resting Baseline + Flight Boost
     FIX: Zone depth now fires at rest (reduced amplitude) AND intensifies
     when flying (full amplitude). This fixes the gap where the resting bird
     was a flat-lit wing surface.

     Cascade note: Phase 25 sets filters on feathers ONLY with heading-specific
     selectors (.sankofa-bird-rig[data-heading-quadrant="X"] .sankofa-feather-rN)
     which have specificity (0,2,0). Our resting rules here use just the class
     at (0,1,0). Phase 25 heading rules correctly WIN on active headings and
     add their color logic. Our resting rules fire on the default/N heading
     where Phase 25 has no rule. On active headings, zone brightness persists
     via the animation channel (separate from filter).

     For scapulars: Phase 25 has NO heading rules targeting scapulars.
     The brightness rules in 26.1 hold on all headings. Safe.
     ═══════════════════════════════════════════════════════════════════════ */

  /* ── RESTING BASELINE: Scapular zone transitions (brightness set in 26.1) */
  .sankofa-wing-scap-l1,
  .sankofa-wing-scap-l2,
  .sankofa-wing-scap-r1,
  .sankofa-wing-scap-r2 {
    transition: filter 0.65s ease, opacity 0.50s ease;
  }

  /* ── RESTING BASELINE: Secondaries — intermediate zone, always subtly bright
     Phase 25 targets these only with [data-heading-quadrant] selectors at
     specificity (0,2,0). These plain-class rules at (0,1,0) apply when
     no heading-specific Phase 25 rule is active. */
  .sankofa-feather-rs1,
  .sankofa-feather-ls1 {
    filter: brightness(1.025) saturate(1.02);
    transition: filter 0.70s ease;
  }
  .sankofa-feather-rs2,
  .sankofa-feather-ls2 {
    filter: brightness(1.018) saturate(1.015);
    transition: filter 0.70s ease;
  }
  .sankofa-feather-rs3,
  .sankofa-feather-ls3 {
    filter: brightness(1.012) saturate(1.010);
    transition: filter 0.70s ease;
  }

  /* ── RESTING BASELINE: Covert zone — shoulder-forearm junction, gentle glow */
  .sankofa-feather-rc1,
  .sankofa-feather-lc1 {
    filter: brightness(1.04) saturate(1.05);
    transition: filter 0.70s ease;
  }

  /* ── FLYING AMPLIFICATION: Scapular zone reaches full sky-light intensity */
  .sankofa-bird-rig[data-flying="true"] .sankofa-wing-scap-r1,
  .sankofa-bird-rig[data-flying="true"] .sankofa-wing-scap-r2,
  .sankofa-bird-rig[data-flying="true"] .sankofa-wing-scap-l1,
  .sankofa-bird-rig[data-flying="true"] .sankofa-wing-scap-l2 {
    filter: brightness(calc(1.12 + var(--lighting-factor, 0.5) * 0.06)) saturate(1.10);
    opacity: calc(0.16 + var(--lighting-factor, 0.5) * 0.12);
  }

  /* ── FLYING AMPLIFICATION: Secondaries — full forearm zone brightening */
  .sankofa-bird-rig[data-flying="true"] .sankofa-feather-rs1,
  .sankofa-bird-rig[data-flying="true"] .sankofa-feather-rs2,
  .sankofa-bird-rig[data-flying="true"] .sankofa-feather-rs3,
  .sankofa-bird-rig[data-flying="true"] .sankofa-feather-ls1,
  .sankofa-bird-rig[data-flying="true"] .sankofa-feather-ls2,
  .sankofa-bird-rig[data-flying="true"] .sankofa-feather-ls3 {
    filter: brightness(calc(1.04 + var(--lighting-factor, 0.5) * 0.08)) saturate(1.06);
  }

  /* ── FLYING AMPLIFICATION: Primary tip zone — luminous leading edge */
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

  /* ── FLYING AMPLIFICATION: Primary base zone — transitional shadow
     Slightly darker feather bases: inner primaries fall into body shadow. */
  .sankofa-bird-rig[data-flying="true"] .sankofa-feather-r3,
  .sankofa-bird-rig[data-flying="true"] .sankofa-feather-l3,
  .sankofa-bird-rig[data-flying="true"] .sankofa-feather-r4,
  .sankofa-bird-rig[data-flying="true"] .sankofa-feather-l4 {
    filter: brightness(calc(0.94 - var(--lighting-factor, 0.5) * 0.04)) saturate(0.96);
  }

  /* ── FLYING AMPLIFICATION: Covert zone — arch upward into sky */
  .sankofa-bird-rig[data-flying="true"] .sankofa-feather-rc1,
  .sankofa-bird-rig[data-flying="true"] .sankofa-feather-lc1 {
    filter: brightness(1.08) saturate(1.10);
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 26.5 — Body Depth: Belly Shadow + Dorsal Stripe + Tonal Variation
     ═══════════════════════════════════════════════════════════════════════ */

  /* Base state: belly and dorsal elements hidden */
  .sankofa-belly-shadow,
  .sankofa-dorsal-hi {
    opacity: 0;
    transition: opacity 0.9s ease;
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

  /* Permanent tonal variation across body feather rows:
     Upper rows (1-3) brightest — catch dorsal light from above.
     Mid rows (4-6) transitional — intermediate fill.
     Lower-mid rows (7-9) transitional toward shadow.
     Lower rows (10-11) subtly deeper — in belly shadow.
     These are additive with Phase 22 body feather styles. */
  .sankofa-body-feather-1,
  .sankofa-body-feather-2,
  .sankofa-body-feather-3 {
    filter: brightness(1.06) saturate(1.04);
    transition: filter 0.65s ease;
  }

  .sankofa-body-feather-4,
  .sankofa-body-feather-5,
  .sankofa-body-feather-6 {
    filter: brightness(1.02) saturate(1.02);
    transition: filter 0.65s ease;
  }

  .sankofa-body-feather-7,
  .sankofa-body-feather-8,
  .sankofa-body-feather-9 {
    filter: brightness(0.99) saturate(1.00);
    transition: filter 0.65s ease;
  }

  /* Slightly darker feather bases: bottom rows fall into belly shadow */
  .sankofa-body-feather-10,
  .sankofa-body-feather-11 {
    filter: brightness(0.94) saturate(0.96) hue-rotate(-2deg);
    transition: filter 0.65s ease;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 26.6 — Egg Warm Atmosphere Enhancement
     ═══════════════════════════════════════════════════════════════════════ */

  /* Base: chest warmth hidden */
  .sankofa-chest-warmth {
    opacity: 0;
    transition: opacity 0.6s ease;
  }

  /* Egg warmglow: activate on nearby + accepted */
  .sankofa-bird-rig[data-nearby="true"] .sankofa-egg-warmglow,
  .sankofa-bird-rig[data-accepted="true"] .sankofa-egg-warmglow {
    opacity: 0.28;
    transition: opacity 0.75s ease;
  }

  /* Egg warmglow: strengthen on primary states */
  .sankofa-bird-rig[data-helping="true"] .sankofa-egg-warmglow,
  .sankofa-bird-rig[data-celebrating="true"] .sankofa-egg-warmglow,
  .sankofa-bird-rig[data-donated="true"] .sankofa-egg-warmglow {
    opacity: 0.42;
    transition: opacity 0.55s ease;
  }

  /* Body glow halo: spreads outward + warms on community moments */
  .sankofa-bird-rig[data-helping="true"] .sankofa-body-glow-halo,
  .sankofa-bird-rig[data-celebrating="true"] .sankofa-body-glow-halo,
  .sankofa-bird-rig[data-donated="true"] .sankofa-body-glow-halo {
    opacity: 0.58;
    filter: sepia(0.20) hue-rotate(-18deg) saturate(1.20) brightness(1.08);
    transition: opacity 0.65s ease, filter 0.85s ease;
  }

  /* Body wing-glow: brightens on community warmth */
  .sankofa-bird-rig[data-nearby="true"] .sankofa-body-wing-glow,
  .sankofa-bird-rig[data-helping="true"] .sankofa-body-wing-glow {
    opacity: 0.26;
    transition: opacity 0.75s ease;
  }

  /* Chest warmth element: warm amber bloom on helping/celebrating/donated */
  .sankofa-bird-rig[data-helping="true"] .sankofa-chest-warmth,
  .sankofa-bird-rig[data-celebrating="true"] .sankofa-chest-warmth,
  .sankofa-bird-rig[data-donated="true"] .sankofa-chest-warmth {
    opacity: 0.20;
    transition: opacity 0.75s ease;
  }

  /* Egg glow halo: pulsing on celebrating */
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
    transition: opacity 0.60s ease, filter 0.60s ease;
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

  /* Battery-saver: disable all Phase 26 breath + pulse animations */
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
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-rs3,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-ls3,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-tail-luminary-inner,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-tail-luminary-outer,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-egg-glow-halo,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-belly-shadow {
    animation: none !important;
    transition: none !important;
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
    .sankofa-feather-rs3,
    .sankofa-feather-ls3,
    .sankofa-tail-luminary-inner,
    .sankofa-tail-luminary-outer,
    .sankofa-egg-glow-halo,
    .sankofa-belly-shadow {
      animation: none !important;
    }
    .sankofa-dorsal-hi,
    .sankofa-belly-shadow,
    .sankofa-chest-warmth,
    .sankofa-wing-luminary-r-a,
    .sankofa-wing-luminary-l-a,
    .sankofa-wing-luminary-r-b,
    .sankofa-wing-luminary-l-b {
      transition: none !important;
    }
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 26.9 — Atmosphere: Overlapping Transparent Shapes + Softer Transitions
     Additional translucent atmosphere layers inspired by the original
     illustration's layered glass-painting technique.

     Wing surfaces gain a third atmosphere pulse on active/flying states.
     The body-wing-glow reads as a "reflected light from below" fill.
     All new atmosphere transitions use 0.85-1.0s for organic flow.
     ═══════════════════════════════════════════════════════════════════════ */

  /* Wing atmosphere layers: soft ambient baseline at rest (subtle, not zero).
     These layers overlap the wing surface, adding the transparent-shape
     layering that makes the illustration feel hand-painted. */
  .sankofa-wing-luminary-r-a,
  .sankofa-wing-luminary-l-a {
    opacity: 0.10;
    transition: opacity 0.90s ease;
  }
  .sankofa-wing-luminary-r-b,
  .sankofa-wing-luminary-l-b {
    opacity: 0.06;
    transition: opacity 0.90s ease;
  }

  /* Helping/nearby: wing atmosphere warms slightly — overlapping warm haze */
  .sankofa-bird-rig[data-helping="true"] .sankofa-wing-luminary-r-a,
  .sankofa-bird-rig[data-helping="true"] .sankofa-wing-luminary-l-a,
  .sankofa-bird-rig[data-nearby="true"] .sankofa-wing-luminary-r-a,
  .sankofa-bird-rig[data-nearby="true"] .sankofa-wing-luminary-l-a {
    opacity: 0.16;
    transition: opacity 0.85s ease;
  }

  /* Reflected light: the body-wing-glow acts as a "bounce light" from below.
     At rest it's a barely-visible teal shimmer. On flying it softly rises —
     the underside of the wing reflects sky-light back onto the body. */
  .sankofa-body-wing-glow {
    opacity: 0.10;
    transition: opacity 1.0s ease;
  }

  /* Dorsal highlight: always has a barely-visible ambient at rest (very soft) */
  .sankofa-dorsal-hi {
    opacity: 0.04;
    transition: opacity 0.90s ease;
  }

  /* Breast sheen: always slightly visible at rest — reflected light from below */
  .sankofa-breast-sheen {
    opacity: 0.04;
    transition: opacity 0.80s ease;
  }

  /* Body glow halo: always visible at very low opacity (ambient warmth baseline) */
  .sankofa-body-glow-halo {
    opacity: 0.30;
    transition: opacity 0.90s ease, filter 1.0s ease;
  }

  /* Dramatic color interplay: on helping/celebrating, luminary layer saturates
     and blooms wider — the most visually vivid moment of the lifecycle. */
  .sankofa-bird-rig[data-helping="true"] .sankofa-body-luminary-layer,
  .sankofa-bird-rig[data-celebrating="true"] .sankofa-body-luminary-layer {
    opacity: 0.72;
    filter: saturate(1.18) brightness(1.06);
    transition: opacity 0.70s ease, filter 0.80s ease;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 26.10 — Iridescent Highlights that Shift with Movement + Banking
     When the bird banks, the upward wing catches sky light (brightens),
     the downward wing enters shadow (slightly deepens). Banking also
     triggers a brief iridescent hue cascade across the outer primaries —
     structural coloration catching a new angle of light.

     Bank direction uses data-bank-dir="left" / "right" (set by Bird.tsx
     when Math.abs(bankAngle) > 8 degrees).

     Iridescence keyframe: a brief luminous flash then settle-back.
     Keeps it organic — not a held state, just a catch of light.
     ═══════════════════════════════════════════════════════════════════════ */

  /* Banking iridescent flash keyframe — outer primaries catch the new angle.
     Renamed p26- prefix to avoid collision with Phase 23 sankofa-bank-iri-flash. */
  @keyframes sankofa-p26-bank-iri-dir {
    0%   { filter: brightness(1.00) saturate(1.00) hue-rotate(0deg); }
    18%  { filter: brightness(1.18) saturate(1.28) hue-rotate(6deg); }
    45%  { filter: brightness(1.10) saturate(1.16) hue-rotate(4deg); }
    75%  { filter: brightness(1.05) saturate(1.08) hue-rotate(2deg); }
    100% { filter: brightness(1.00) saturate(1.00) hue-rotate(0deg); }
  }

  /* Banking left: right wing rises into sky light, left wing goes lower */
  .sankofa-bird-rig[data-bank-dir="left"]:not([data-battery-saver="true"])
    .sankofa-feather-r5,
  .sankofa-bird-rig[data-bank-dir="left"]:not([data-battery-saver="true"])
    .sankofa-feather-r0 {
    animation: sankofa-p26-bank-iri-dir 1.6s ease-out forwards;
  }

  /* Banking right: left wing rises into sky light */
  .sankofa-bird-rig[data-bank-dir="right"]:not([data-battery-saver="true"])
    .sankofa-feather-l5,
  .sankofa-bird-rig[data-bank-dir="right"]:not([data-battery-saver="true"])
    .sankofa-feather-l0 {
    animation: sankofa-p26-bank-iri-dir 1.6s ease-out forwards;
  }

  /* Banking left: upward (right) wing luminary brightens */
  .sankofa-bird-rig[data-bank-dir="left"] .sankofa-wing-luminary-r-a {
    opacity: 0.36;
    filter: brightness(1.12) saturate(1.15);
    transition: opacity 0.50s ease, filter 0.50s ease;
  }
  .sankofa-bird-rig[data-bank-dir="left"] .sankofa-wing-luminary-r-b {
    opacity: 0.26;
    transition: opacity 0.50s ease;
  }
  /* Banking left: downward (left) wing deepens slightly */
  .sankofa-bird-rig[data-bank-dir="left"] .sankofa-wing-luminary-l-a {
    opacity: 0.07;
    filter: brightness(0.90) saturate(0.90);
    transition: opacity 0.50s ease, filter 0.50s ease;
  }

  /* Banking right: upward (left) wing luminary brightens */
  .sankofa-bird-rig[data-bank-dir="right"] .sankofa-wing-luminary-l-a {
    opacity: 0.36;
    filter: brightness(1.12) saturate(1.15);
    transition: opacity 0.50s ease, filter 0.50s ease;
  }
  .sankofa-bird-rig[data-bank-dir="right"] .sankofa-wing-luminary-l-b {
    opacity: 0.26;
    transition: opacity 0.50s ease;
  }
  /* Banking right: downward (right) wing deepens slightly */
  .sankofa-bird-rig[data-bank-dir="right"] .sankofa-wing-luminary-r-a {
    opacity: 0.07;
    filter: brightness(0.90) saturate(0.90);
    transition: opacity 0.50s ease, filter 0.50s ease;
  }

  /* Banking: scapulars on the rising side brighten (sky-light catch) */
  .sankofa-bird-rig[data-bank-dir="left"] .sankofa-wing-scap-r1,
  .sankofa-bird-rig[data-bank-dir="left"] .sankofa-wing-scap-r2 {
    filter: brightness(1.18) saturate(1.14);
    transition: filter 0.55s ease;
  }
  .sankofa-bird-rig[data-bank-dir="right"] .sankofa-wing-scap-l1,
  .sankofa-bird-rig[data-bank-dir="right"] .sankofa-wing-scap-l2 {
    filter: brightness(1.18) saturate(1.14);
    transition: filter 0.55s ease;
  }

  /* Banking: tail tip iridescence shifts on the rising side — subtle sweep */
  .sankofa-bird-rig[data-bank-dir="left"] .sankofa-tail-iri-right {
    opacity: 0.48;
    filter: brightness(1.12) saturate(1.20) hue-rotate(4deg);
    transition: opacity 0.55s ease, filter 0.55s ease;
  }
  .sankofa-bird-rig[data-bank-dir="right"] .sankofa-tail-iri-left {
    opacity: 0.48;
    filter: brightness(1.12) saturate(1.20) hue-rotate(4deg);
    transition: opacity 0.55s ease, filter 0.55s ease;
  }

  /* Gentle dorsal brightening on banking — the dorsal surface catches sky */
  .sankofa-bird-rig[data-bank-dir="left"] .sankofa-dorsal-hi,
  .sankofa-bird-rig[data-bank-dir="right"] .sankofa-dorsal-hi {
    opacity: 0.18;
    transition: opacity 0.60s ease;
  }

  /* Very soft reflected light below wing during banking:
     The belly-facing side picks up diffuse ground/sky reflection. */
  .sankofa-bird-rig[data-bank-dir="left"] .sankofa-breast-sheen,
  .sankofa-bird-rig[data-bank-dir="right"] .sankofa-breast-sheen {
    opacity: 0.09;
    transition: opacity 0.65s ease;
  }

`;
