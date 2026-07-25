/**
 * Sankofa Bird CSS — Phase 27: Living Feathers & Natural Light
 *
 * Additive visual details for the modular bird.  This phase deliberately
 * avoids the transform channels owned by useAnimationMixer: the new feather
 * layers use their own rotate property and the neck additions are overlays.
 *
 * Safari notes:
 * - custom properties used by keyframes are registered with @property
 * - transform-box uses view-box and origins are supplied by the SVG elements
 * - the reduced-motion media query stays top-level (no nested CSS)
 * - no template-literal backticks are used in this stylesheet
 *
 * Speed tiers in the live codebase: idle / walking / running / driving / airplane
 * (the spec "fast" tier maps to "driving" here)
 */

export const sankofaCssPhase27 = `
  /* iOS Safari: register all custom properties used inside keyframes.
     Without @property Safari ignores animated custom-property changes.
     These extend the Phase 22/24/26 list non-destructively. */

  @property --p27-iri-hue {
    syntax: "<angle>";
    inherits: false;
    initial-value: 0deg;
  }

  @property --p27-shoulder-angle {
    syntax: "<angle>";
    inherits: false;
    initial-value: 0deg;
  }

  @property --p27-neck-mid-opacity {
    syntax: "<number>";
    inherits: false;
    initial-value: 0;
  }

  @property --p27-ambient-opacity {
    syntax: "<number>";
    inherits: false;
    initial-value: 0.04;
  }


  /* =======================================================================
     PHASE 27.1 — Night Mode Atmosphere
     ======================================================================= */

  /* Night: iri-edge feather highlights become more luminous */
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-feather-iri-edge {
    opacity: 0.68;
    filter: brightness(1.20) saturate(1.25) hue-rotate(4deg);
    transition: opacity 0.85s ease, filter 0.85s ease;
  }

  /* Night: outer primaries retain luminosity */
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-feather-r5,
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-feather-l5,
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-feather-r0,
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-feather-l0 {
    filter: brightness(1.08) saturate(1.12);
    transition: filter 0.75s ease;
  }

  /* Night: wing luminary layers strengthen */
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-wing-luminary-r-a,
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-wing-luminary-l-a {
    opacity: 0.20;
    transition: opacity 0.85s ease;
  }
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-wing-luminary-r-b,
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-wing-luminary-l-b {
    opacity: 0.13;
    transition: opacity 0.85s ease;
  }

  /* Night: body luminary layer lifts to keep the body visible */
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-body-luminary-layer {
    opacity: 0.62;
    transition: opacity 0.85s ease;
  }

  /* Night: crown feathers brighten */
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-crown-feather {
    filter: brightness(1.12) saturate(1.15);
    transition: filter 0.75s ease;
  }

  /* Night: covert bands stay visible — r and l have slightly different weights */
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-wing-covert-band-r {
    opacity: 0.20;
    transition: opacity 0.75s ease;
  }
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-wing-covert-band-l {
    opacity: 0.16;
    transition: opacity 0.75s ease;
  }

  /* Night + flying: dorsal highlight remains active */
  .sankofa-bird-rig[data-night-mode="true"][data-flying="true"] .sankofa-dorsal-hi {
    opacity: 0.20;
    filter: brightness(1.10) hue-rotate(8deg) saturate(1.08);
    transition: opacity 0.80s ease, filter 0.80s ease;
  }

  /* Night: atmosphere layers on wing surface subtly visible */
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-wing-atmos-r,
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-wing-atmos-l {
    opacity: 0.10;
    transition: opacity 0.85s ease;
  }

  /* Night: shoulder feathers slightly brighter */
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-shoulder-feather {
    opacity: 0.58;
    filter: brightness(1.10) saturate(1.10);
    transition: opacity 0.75s ease, filter 0.75s ease;
  }

  /* Night: neck segments slightly brighter */
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-neck-seg-1 {
    opacity: 0.28;
    transition: opacity 0.75s ease;
  }
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-neck-seg-2 {
    opacity: 0.22;
    transition: opacity 0.75s ease;
  }


  /* =======================================================================
     PHASE 27.2 — Natural Feather Iridescence Cycle
     Slow 22-28s keyframe animations cycling hue-rotate on iri-edge elements.
     Different delays on R/L and per-feather position prevent unison cycling.
     ======================================================================= */

  @keyframes sankofa-p27-iri-natural {
    0%   { filter: hue-rotate(0deg)   brightness(1.00) saturate(1.00); }
    15%  { filter: hue-rotate(-14deg) brightness(1.03) saturate(1.04); }
    32%  { filter: hue-rotate(-8deg)  brightness(1.01) saturate(1.06); }
    50%  { filter: hue-rotate(0deg)   brightness(1.02) saturate(1.05); }
    68%  { filter: hue-rotate(10deg)  brightness(1.06) saturate(1.08); }
    82%  { filter: hue-rotate(38deg)  brightness(1.08) saturate(0.96); }
    100% { filter: hue-rotate(0deg)   brightness(1.00) saturate(1.00); }
  }

  @keyframes sankofa-p27-iri-natural-l {
    0%   { filter: hue-rotate(10deg)  brightness(1.04) saturate(1.06); }
    18%  { filter: hue-rotate(38deg)  brightness(1.07) saturate(0.95); }
    35%  { filter: hue-rotate(0deg)   brightness(1.00) saturate(1.00); }
    55%  { filter: hue-rotate(-12deg) brightness(1.02) saturate(1.04); }
    75%  { filter: hue-rotate(-6deg)  brightness(1.01) saturate(1.05); }
    100% { filter: hue-rotate(10deg)  brightness(1.04) saturate(1.06); }
  }

  /* Right iri-edge elements */
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-iri-r5 {
    animation: sankofa-p27-iri-natural 24.0s ease-in-out infinite;
    animation-delay: -0.0s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-iri-r0 {
    animation: sankofa-p27-iri-natural 26.5s ease-in-out infinite;
    animation-delay: -8.2s;
  }

  /* Left iri-edge elements — L variant + unique delays */
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-iri-l5 {
    animation: sankofa-p27-iri-natural-l 22.8s ease-in-out infinite;
    animation-delay: -5.4s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-iri-l0 {
    animation: sankofa-p27-iri-natural-l 28.1s ease-in-out infinite;
    animation-delay: -14.6s;
  }


  /* =======================================================================
     PHASE 27.3 — Enhanced Feather Translucency
     ======================================================================= */

  /* Flying: outer primaries slightly more translucent — stack shows through */
  .sankofa-bird-rig[data-flying="true"] .sankofa-feather-r5,
  .sankofa-bird-rig[data-flying="true"] .sankofa-feather-l5 {
    opacity: 0.87;
    transition: opacity 0.80s ease;
  }
  .sankofa-bird-rig[data-flying="true"] .sankofa-feather-r0,
  .sankofa-bird-rig[data-flying="true"] .sankofa-feather-l0 {
    opacity: 0.82;
    transition: opacity 0.75s ease;
  }

  /* Covert band and scapular upper layer: subtle translucency transitions */
  .sankofa-wing-covert-band {
    transition: opacity 0.70s ease;
  }
  .sankofa-wing-scap-r1,
  .sankofa-wing-scap-l1 {
    transition: opacity 0.65s ease, filter 0.65s ease;
  }


  /* =======================================================================
     PHASE 27.4 — Shoulder Feather Flex Animation
     Counter-phase to wing upstroke. Keyed to --flap-period.
     ======================================================================= */

  /* Resting baseline */
  .sankofa-shoulder-feather {
    opacity: 0.45;
    transform-box: view-box;
    transition: opacity 0.55s ease, filter 0.55s ease;
  }

  /* Shoulder counter-flex keyframes */
  @keyframes sankofa-p27-shoulder-flex-r {
    0%   { rotate: 0deg;    opacity: 0.50; }
    25%  { rotate: -3.5deg; opacity: 0.55; }
    50%  { rotate: -1.5deg; opacity: 0.48; }
    75%  { rotate: 2.0deg;  opacity: 0.52; }
    100% { rotate: 0deg;    opacity: 0.50; }
  }

  @keyframes sankofa-p27-shoulder-flex-l {
    0%   { rotate: 0deg;    opacity: 0.50; }
    25%  { rotate: 3.5deg;  opacity: 0.55; }
    50%  { rotate: 1.5deg;  opacity: 0.48; }
    75%  { rotate: -2.0deg; opacity: 0.52; }
    100% { rotate: 0deg;    opacity: 0.50; }
  }

  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"]) .sankofa-shoulder-r1,
  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"]) .sankofa-shoulder-r3 {
    animation: sankofa-p27-shoulder-flex-r var(--flap-period, 800ms) ease-in-out infinite;
    animation-delay: -0ms;
    transform-box: view-box;
  }
  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"]) .sankofa-shoulder-r2 {
    animation: sankofa-p27-shoulder-flex-r var(--flap-period, 800ms) ease-in-out infinite;
    animation-delay: calc(var(--flap-period, 800ms) * -0.15);
    transform-box: view-box;
  }

  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"]) .sankofa-shoulder-l1,
  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"]) .sankofa-shoulder-l3 {
    animation: sankofa-p27-shoulder-flex-l var(--flap-period, 800ms) ease-in-out infinite;
    animation-delay: -0ms;
    transform-box: view-box;
  }
  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"]) .sankofa-shoulder-l2 {
    animation: sankofa-p27-shoulder-flex-l var(--flap-period, 800ms) ease-in-out infinite;
    animation-delay: calc(var(--flap-period, 800ms) * -0.15);
    transform-box: view-box;
  }

  /* Flying: shoulder feathers brighten — catch sky light from above */
  .sankofa-bird-rig[data-flying="true"] .sankofa-shoulder-r1,
  .sankofa-bird-rig[data-flying="true"] .sankofa-shoulder-r2 {
    filter: brightness(1.08) saturate(1.06);
  }
  .sankofa-bird-rig[data-flying="true"] .sankofa-shoulder-l1,
  .sankofa-bird-rig[data-flying="true"] .sankofa-shoulder-l2 {
    filter: brightness(1.05) saturate(1.04);
  }


  /* =======================================================================
     PHASE 27.5 — Wingtip Flex
     ======================================================================= */

  /* Base: wingtips rest at normal position */
  .sankofa-wingtip-feather {
    transform-box: view-box;
    transition: opacity 0.55s ease, filter 0.55s ease;
  }

  /* Fast flight (driving/airplane): wingtips curl — high-speed primary tip separation */
  .sankofa-bird-rig[data-speed="driving"] .sankofa-wingtip-feather,
  .sankofa-bird-rig[data-speed="airplane"] .sankofa-wingtip-feather {
    opacity: 0.78;
    filter: brightness(1.10) saturate(1.12) hue-rotate(4deg);
    transition: opacity 0.55s ease, filter 0.55s ease;
  }

  /* Gliding: wingtips flatten — swept back feel */
  .sankofa-bird-rig[data-gliding="true"] .sankofa-wingtip-feather {
    opacity: 0.65;
    filter: brightness(1.04) saturate(1.06);
    transition: opacity 0.80s ease, filter 0.80s ease;
  }

  /* Landing approach: wingtips spread wide — braking, high lift */
  .sankofa-bird-rig[data-landing="slowflap"] .sankofa-wingtip-feather,
  .sankofa-bird-rig[data-landing="hover"] .sankofa-wingtip-feather,
  .sankofa-bird-rig[data-landing="perch"] .sankofa-wingtip-feather {
    opacity: 0.88;
    filter: brightness(1.06) saturate(1.08);
    transition: opacity 0.45s ease, filter 0.45s ease;
  }

  /* Wingtip iridescence: tips catch the most light so they cycle faster */
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-wingtip-r-a {
    animation: sankofa-p27-iri-natural 18.5s ease-in-out infinite;
    animation-delay: -3.2s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-wingtip-r-b {
    animation: sankofa-p27-iri-natural 21.0s ease-in-out infinite;
    animation-delay: -9.8s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-wingtip-l-a {
    animation: sankofa-p27-iri-natural-l 17.8s ease-in-out infinite;
    animation-delay: -6.5s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-wingtip-l-b {
    animation: sankofa-p27-iri-natural-l 20.2s ease-in-out infinite;
    animation-delay: -12.1s;
  }


  /* =======================================================================
     PHASE 27.6 — Ambient Reflected Light (Golden Hour Quality)
     The sankofa-ambient-warmth element driven by --lighting-factor.
     ======================================================================= */

  /* Ambient warmth: always present, driven by --lighting-factor */
  .sankofa-ambient-warmth {
    opacity: calc(0.04 + var(--lighting-factor, 0.5) * 0.10);
    transition: opacity 1.2s ease;
  }

  /* Flying: ambient warmth strengthens slightly */
  .sankofa-bird-rig[data-flying="true"] .sankofa-ambient-warmth {
    opacity: calc(0.06 + var(--lighting-factor, 0.5) * 0.14);
    transition: opacity 0.95s ease;
  }

  /* Night: ambient warmth becomes a cooler ambient (city light) */
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-ambient-warmth {
    opacity: 0.03;
    filter: hue-rotate(180deg) brightness(0.7);
    transition: opacity 1.0s ease, filter 1.0s ease;
  }

  /* Helping/celebrating/donated: ambient warmth blooms */
  .sankofa-bird-rig[data-helping="true"] .sankofa-ambient-warmth,
  .sankofa-bird-rig[data-celebrating="true"] .sankofa-ambient-warmth,
  .sankofa-bird-rig[data-donated="true"] .sankofa-ambient-warmth {
    opacity: calc(0.12 + var(--lighting-factor, 0.5) * 0.18);
    transition: opacity 0.70s ease;
  }


  /* =======================================================================
     PHASE 27.7 — Living Neck Organic Wave
     ======================================================================= */

  /* S-wave overlay segments — subtly visible at rest */
  .sankofa-neck-seg-1 {
    opacity: 0.18;
    transition: opacity 0.65s ease;
  }
  .sankofa-neck-seg-2 {
    opacity: 0.14;
    transition: opacity 0.65s ease;
  }

  /* Flying: neck segments strengthen */
  .sankofa-bird-rig[data-flying="true"] .sankofa-neck-seg-1 {
    opacity: 0.30;
    transition: opacity 0.55s ease;
  }
  .sankofa-bird-rig[data-flying="true"] .sankofa-neck-seg-2 {
    opacity: 0.22;
    transition: opacity 0.55s ease;
  }

  /* Living neck organic luminous wave keyframes */
  @keyframes sankofa-p27-neck-wave-lower {
    0%   { opacity: 0.18; }
    30%  { opacity: 0.32; }
    55%  { opacity: 0.22; }
    80%  { opacity: 0.28; }
    100% { opacity: 0.18; }
  }

  @keyframes sankofa-p27-neck-wave-upper {
    0%   { opacity: 0.14; }
    35%  { opacity: 0.26; }
    60%  { opacity: 0.16; }
    85%  { opacity: 0.23; }
    100% { opacity: 0.14; }
  }

  @keyframes sankofa-p27-neck-wave-mid {
    0%   { opacity: 0.00; }
    20%  { opacity: 0.28; }
    45%  { opacity: 0.18; }
    70%  { opacity: 0.34; }
    100% { opacity: 0.00; }
  }

  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-neck-seg-1 {
    animation: sankofa-p27-neck-wave-lower 4.8s ease-in-out infinite;
    animation-delay: -0.6s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-neck-seg-2 {
    animation: sankofa-p27-neck-wave-upper 4.8s ease-in-out infinite;
    animation-delay: -1.8s;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-neck-mid-organic {
    animation: sankofa-p27-neck-wave-mid 5.2s ease-in-out infinite;
    animation-delay: -1.2s;
  }

  /* Neck top-sheen: base transition + flying activation */
  .sankofa-neck-top-sheen {
    transition: opacity 0.65s ease;
  }
  .sankofa-bird-rig[data-flying="true"] .sankofa-neck-top-sheen {
    opacity: 0.55;
    filter: brightness(1.12) saturate(1.10);
    transition: opacity 0.55s ease, filter 0.55s ease;
  }


  /* =======================================================================
     PHASE 27.8 — Eye Expressiveness
     ======================================================================= */

  /* Eyelid: always faintly visible at rest */
  .sankofa-bird-eyelid {
    opacity: 0.18;
    transition: opacity 0.35s ease;
  }
  .sankofa-bird-lower-eyelid {
    opacity: 0.10;
    transition: opacity 0.35s ease;
  }

  /* Flying: eyelids partially close (nictitating membrane protection) */
  .sankofa-bird-rig[data-flying="true"] .sankofa-bird-eyelid {
    opacity: 0.28;
    transition: opacity 0.50s ease;
  }

  /* Fast flight: eyelids more closed — airstream protection */
  .sankofa-bird-rig[data-speed="driving"] .sankofa-bird-eyelid,
  .sankofa-bird-rig[data-speed="airplane"] .sankofa-bird-eyelid {
    opacity: 0.38;
    filter: brightness(0.95);
    transition: opacity 0.40s ease;
  }

  /* Night mode: pupil dilated — iris ring barely visible */
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-bird-iris {
    transform: scale(0.85);
    filter: brightness(0.75) saturate(0.60);
    transition: transform 0.80s ease, filter 0.80s ease;
  }

  /* Focus pulse: approaching / newNotification — eye briefly widens */
  @keyframes sankofa-p27-eye-focus-pulse {
    0%   { transform: scale(1.00); opacity: 0.88; }
    15%  { transform: scale(1.12); opacity: 0.95; }
    35%  { transform: scale(1.06); opacity: 0.90; }
    65%  { transform: scale(1.08); opacity: 0.92; }
    100% { transform: scale(1.00); opacity: 0.88; }
  }

  .sankofa-bird-rig[data-approaching="true"]:not([data-battery-saver="true"]) .sankofa-bird-iris {
    animation: sankofa-p27-eye-focus-pulse 2.4s ease-in-out infinite;
    transform-box: view-box;
    transform-origin: 7.1px 12.2px;
  }
  .sankofa-bird-rig[data-notification="true"]:not([data-battery-saver="true"]) .sankofa-bird-iris {
    animation: sankofa-p27-eye-focus-pulse 1.8s ease-in-out infinite;
    transform-box: view-box;
    transform-origin: 7.1px 12.2px;
  }

  /* Activity high/peak: micro-scan group speeds up */
  .sankofa-bird-rig[data-activity="busy"] .sankofa-eye-scan-group,
  .sankofa-bird-rig[data-activity="peak"] .sankofa-eye-scan-group {
    animation-duration: 11s;
  }

  /* Nictitating membrane: briefly visible during landing approach */
  .sankofa-bird-rig[data-landing="dive"] .sankofa-nictitating,
  .sankofa-bird-rig[data-landing="slowflap"] .sankofa-nictitating {
    opacity: 0.40;
    transition: opacity 0.30s ease;
  }

  /* Catchlight: brighter when approaching target */
  .sankofa-bird-rig[data-approaching="true"] .sankofa-bird-eye-catchlight {
    opacity: 0.90;
    transition: opacity 0.45s ease;
  }


  /* =======================================================================
     PHASE 27.9 — Aerodynamic Behavior CSS
     Wings flex under load, tail opens in turns, neck stretches in
     acceleration, chest leans into direction of travel, body banks before
     completing turns. All expressed through directional light, not transforms.
     ======================================================================= */

  /* -- WING FLEX UNDER LOAD (data-wing-pose) --------------------------------
     Phase 21 drives the wing rig rotation. Phase 27 adds feather-level
     response: leading-edge highlight shifts, iri-edge brightens on power
     stroke (down) and fades on back (glide). */

  /* Wing pose "down" — power stroke: leading edge luminous, coverts bright */
  .sankofa-bird-rig[data-wing-pose="down"] .sankofa-bird-wing-right-highlight,
  .sankofa-bird-rig[data-wing-pose="down"] .sankofa-bird-wing-left-highlight {
    opacity: 0.68;
    filter: brightness(1.10) saturate(1.12);
    transition: opacity 0.25s ease, filter 0.25s ease;
  }
  .sankofa-bird-rig[data-wing-pose="down"] .sankofa-feather-iri-edge {
    opacity: 0.60;
    filter: brightness(1.14) saturate(1.18);
    transition: opacity 0.25s ease, filter 0.25s ease;
  }
  .sankofa-bird-rig[data-wing-pose="down"] .sankofa-feather-rc1,
  .sankofa-bird-rig[data-wing-pose="down"] .sankofa-feather-lc1 {
    filter: brightness(1.12) saturate(1.14);
    transition: filter 0.25s ease;
  }

  /* Wing pose "up" — upstroke / hover: wing surfaces slightly paler */
  .sankofa-bird-rig[data-wing-pose="up"] .sankofa-wing-luminary-r-a,
  .sankofa-bird-rig[data-wing-pose="up"] .sankofa-wing-luminary-l-a {
    opacity: 0.14;
    transition: opacity 0.25s ease;
  }

  /* Wing pose "forward" — braking: coverts and shoulder feathers load up */
  .sankofa-bird-rig[data-wing-pose="forward"] .sankofa-shoulder-feather {
    filter: brightness(1.06) saturate(1.08);
    transition: filter 0.30s ease;
  }

  /* Wing pose "back" — glide: outer primaries slightly translucent, swept */
  .sankofa-bird-rig[data-wing-pose="back"] .sankofa-feather-r5,
  .sankofa-bird-rig[data-wing-pose="back"] .sankofa-feather-l5,
  .sankofa-bird-rig[data-wing-pose="back"] .sankofa-feather-r0,
  .sankofa-bird-rig[data-wing-pose="back"] .sankofa-feather-l0 {
    filter: brightness(1.04) hue-rotate(-6deg) saturate(1.06);
    transition: filter 0.55s ease;
  }

  /* -- TAIL OPENS IN TURNS (data-tail-pose="flare") -------------------------
     The outer rectrices brighten and the tail luminary layers intensify. */

  .sankofa-bird-rig[data-tail-pose="flare"] .sankofa-tail-luminary-inner {
    opacity: 0.36;
    filter: brightness(1.08) saturate(1.10);
    transition: opacity 0.30s ease, filter 0.30s ease;
  }
  .sankofa-bird-rig[data-tail-pose="flare"] .sankofa-tail-luminary-outer {
    opacity: 0.26;
    filter: brightness(1.06) saturate(1.08);
    transition: opacity 0.30s ease, filter 0.30s ease;
  }
  .sankofa-bird-rig[data-tail-pose="flare"] .sankofa-tail-iri-left,
  .sankofa-bird-rig[data-tail-pose="flare"] .sankofa-tail-iri-right {
    opacity: 0.54;
    filter: brightness(1.14) saturate(1.22);
    transition: opacity 0.30s ease, filter 0.30s ease;
  }

  /* Tail pose "stream" — high-speed glide: narrow, luminous leading edge */
  .sankofa-bird-rig[data-tail-pose="stream"] .sankofa-tail-luminary-inner {
    opacity: 0.18;
    filter: brightness(1.04) hue-rotate(-4deg);
    transition: opacity 0.45s ease, filter 0.45s ease;
  }

  /* -- NECK STRETCHES IN ACCELERATION ----------------------------------------
     At driving/airplane speed, neck sheen and luminary strengthen. */

  .sankofa-bird-rig[data-speed="driving"] .sankofa-neck-top-sheen,
  .sankofa-bird-rig[data-speed="airplane"] .sankofa-neck-top-sheen {
    opacity: 0.62;
    filter: brightness(1.16) saturate(1.12);
    transition: opacity 0.40s ease, filter 0.40s ease;
  }
  .sankofa-bird-rig[data-speed="driving"] .sankofa-neck-luminary,
  .sankofa-bird-rig[data-speed="airplane"] .sankofa-neck-luminary {
    opacity: 0.28;
    transition: opacity 0.40s ease;
  }

  /* -- CHEST LEANS INTO DIRECTION OF TRAVEL ----------------------------------
     At fast speed with flying, breast sheen shifts forward. */

  .sankofa-bird-rig[data-speed="driving"][data-flying="true"] .sankofa-breast-sheen,
  .sankofa-bird-rig[data-speed="airplane"][data-flying="true"] .sankofa-breast-sheen {
    opacity: calc(0.08 + var(--lighting-factor, 0.5) * 0.16);
    filter: brightness(1.10) saturate(1.10);
    transition: opacity 0.40s ease, filter 0.40s ease;
  }

  /* -- BODY BANKS BEFORE COMPLETING TURNS ------------------------------------
     When bank-dir is set, dorsal highlight shifts to the rising side. */

  .sankofa-bird-rig[data-bank-dir="left"][data-flying="true"] .sankofa-dorsal-hi {
    opacity: 0.26;
    filter: brightness(1.08) saturate(1.06);
    transition: opacity 0.45s ease, filter 0.45s ease;
  }
  .sankofa-bird-rig[data-bank-dir="right"][data-flying="true"] .sankofa-dorsal-hi {
    opacity: 0.26;
    filter: brightness(1.08) saturate(1.06);
    transition: opacity 0.45s ease, filter 0.45s ease;
  }


  /* =======================================================================
     PHASE 27.10 — Battery-saver + Reduced-motion guards
     All Phase 27 animations disabled.
     ======================================================================= */

  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-iri-r5,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-iri-r0,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-iri-l5,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-iri-l0,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-wingtip-r-a,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-wingtip-r-b,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-wingtip-l-a,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-wingtip-l-b,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-shoulder-r1,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-shoulder-r2,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-shoulder-r3,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-shoulder-l1,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-shoulder-l2,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-shoulder-l3,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-neck-seg-1,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-neck-seg-2,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-neck-mid-organic,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-iris {
    animation: none !important;
    transition: none !important;
  }

  @media (prefers-reduced-motion: reduce) {
    .sankofa-feather-iri-r5,
    .sankofa-feather-iri-r0,
    .sankofa-feather-iri-l5,
    .sankofa-feather-iri-l0,
    .sankofa-wingtip-r-a,
    .sankofa-wingtip-r-b,
    .sankofa-wingtip-l-a,
    .sankofa-wingtip-l-b,
    .sankofa-shoulder-r1,
    .sankofa-shoulder-r2,
    .sankofa-shoulder-r3,
    .sankofa-shoulder-l1,
    .sankofa-shoulder-l2,
    .sankofa-shoulder-l3,
    .sankofa-neck-seg-1,
    .sankofa-neck-seg-2,
    .sankofa-neck-mid-organic,
    .sankofa-bird-iris {
      animation: none !important;
    }
    .sankofa-ambient-warmth,
    .sankofa-shoulder-feather,
    .sankofa-wingtip-feather,
    .sankofa-bird-eyelid,
    .sankofa-bird-lower-eyelid {
      transition: none !important;
    }
  }
`;
