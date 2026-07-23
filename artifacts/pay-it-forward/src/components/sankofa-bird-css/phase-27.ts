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
 */

export const sankofaCssPhase27 = `
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

  /* 27.1 — readable night atmosphere */
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-feather-iri-edge {
    opacity: 0.68;
    filter: brightness(1.2) saturate(1.22);
    transition: opacity 0.85s ease, filter 0.85s ease;
  }

  .sankofa-bird-rig[data-night-mode="true"] .sankofa-feather-r5,
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-feather-r0,
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-feather-l5,
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-feather-l0,
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-shoulder-feather,
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-wingtip-feather {
    filter: brightness(1.08) saturate(1.14);
    transition: filter 0.8s ease;
  }

  .sankofa-bird-rig[data-night-mode="true"] .sankofa-wing-luminary-r-a,
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-wing-luminary-l-a {
    opacity: 0.30;
    transition: opacity 0.85s ease;
  }

  .sankofa-bird-rig[data-night-mode="true"] .sankofa-wing-luminary-r-b,
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-wing-luminary-l-b {
    opacity: 0.20;
    transition: opacity 0.85s ease;
  }

  .sankofa-bird-rig[data-night-mode="true"] .sankofa-body-luminary-layer,
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-wing-covert-band-r,
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-wing-covert-band-l {
    opacity: 0.62;
    transition: opacity 0.85s ease;
  }

  .sankofa-bird-rig[data-night-mode="true"] .sankofa-crown-feather,
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-neck-seg-1,
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-neck-seg-2,
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-neck-mid-organic {
    filter: brightness(1.12) saturate(1.15);
    transition: filter 0.75s ease;
  }

  .sankofa-bird-rig[data-night-mode="true"] .sankofa-wing-atmos-r,
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-wing-atmos-l {
    opacity: 0.10;
    transition: opacity 0.85s ease;
  }

  /* 27.2 — slow structural-color cycle. Only edge layers animate, keeping
     the bird's base identity stable while the reflected color moves. */
  @keyframes sankofa-p27-iri-natural {
    0%   { filter: hue-rotate(0deg) brightness(1) saturate(1); }
    15%  { filter: hue-rotate(-14deg) brightness(1.03) saturate(1.04); }
    32%  { filter: hue-rotate(-8deg) brightness(1.01) saturate(1.06); }
    50%  { filter: hue-rotate(10deg) brightness(1.04) saturate(1.08); }
    68%  { filter: hue-rotate(38deg) brightness(1.08) saturate(0.96); }
    84%  { filter: hue-rotate(18deg) brightness(1.04) saturate(1.02); }
    100% { filter: hue-rotate(0deg) brightness(1) saturate(1); }
  }

  @keyframes sankofa-p27-iri-natural-l {
    0%   { filter: hue-rotate(10deg) brightness(1.04) saturate(1.06); }
    18%  { filter: hue-rotate(38deg) brightness(1.07) saturate(0.95); }
    35%  { filter: hue-rotate(0deg) brightness(1) saturate(1); }
    55%  { filter: hue-rotate(-12deg) brightness(1.02) saturate(1.04); }
    75%  { filter: hue-rotate(-6deg) brightness(1.01) saturate(1.05); }
    100% { filter: hue-rotate(10deg) brightness(1.04) saturate(1.06); }
  }

  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-iri-r5 {
    animation: sankofa-p27-iri-natural 24s ease-in-out infinite;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-iri-r0 {
    animation: sankofa-p27-iri-natural 26.5s ease-in-out -8.2s infinite;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-iri-l5 {
    animation: sankofa-p27-iri-natural-l 22.8s ease-in-out -5.4s infinite;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-feather-iri-l0 {
    animation: sankofa-p27-iri-natural-l 28.1s ease-in-out -14.6s infinite;
  }

  /* The added wing layers are intentionally translucent. */
  .sankofa-bird-rig[data-flying="true"] .sankofa-feather-r5,
  .sankofa-bird-rig[data-flying="true"] .sankofa-feather-l5 {
    opacity: 0.84;
  }
  .sankofa-bird-rig[data-flying="true"] .sankofa-feather-r0,
  .sankofa-bird-rig[data-flying="true"] .sankofa-feather-l0 {
    opacity: 0.80;
  }
  .sankofa-wing-covert-band,
  .sankofa-wing-scap-r1,
  .sankofa-wing-scap-l1 {
    transition: opacity 0.7s ease, filter 0.7s ease;
  }

  /* 27.3 — articulated shoulder feathers. The CSS rotate property is
     independent from the mixer’s wing rotation and is iOS-safe. */
  @keyframes sankofa-p27-shoulder-flex-r {
    0%, 100% { rotate: 0deg; opacity: 0.45; }
    25% { rotate: -3.5deg; opacity: 0.55; }
    50% { rotate: -1.5deg; opacity: 0.48; }
    75% { rotate: 2deg; opacity: 0.52; }
  }
  @keyframes sankofa-p27-shoulder-flex-l {
    0%, 100% { rotate: 0deg; opacity: 0.45; }
    25% { rotate: 3.5deg; opacity: 0.55; }
    50% { rotate: 1.5deg; opacity: 0.48; }
    75% { rotate: -2deg; opacity: 0.52; }
  }

  .sankofa-shoulder-feather {
    transform-box: view-box;
    transition: opacity 0.55s ease, filter 0.55s ease;
    opacity: 0.45;
  }
  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"]) .sankofa-shoulder-r1,
  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"]) .sankofa-shoulder-r3 {
    animation: sankofa-p27-shoulder-flex-r var(--flap-period, 800ms) ease-in-out infinite;
  }
  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"]) .sankofa-shoulder-r2 {
    animation: sankofa-p27-shoulder-flex-r var(--flap-period, 800ms) ease-in-out -120ms infinite;
  }
  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"]) .sankofa-shoulder-l1,
  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"]) .sankofa-shoulder-l3 {
    animation: sankofa-p27-shoulder-flex-l var(--flap-period, 800ms) ease-in-out infinite;
  }
  .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"]) .sankofa-shoulder-l2 {
    animation: sankofa-p27-shoulder-flex-l var(--flap-period, 800ms) ease-in-out -120ms infinite;
  }
  .sankofa-bird-rig[data-flying="true"] .sankofa-shoulder-r1,
  .sankofa-bird-rig[data-flying="true"] .sankofa-shoulder-r2,
  .sankofa-bird-rig[data-flying="true"] .sankofa-shoulder-l1,
  .sankofa-bird-rig[data-flying="true"] .sankofa-shoulder-l2 {
    filter: brightness(1.08) saturate(1.06);
  }

  /* 27.4 — split wingtip primaries flex with speed, glide and landing. */
  .sankofa-wingtip-feather {
    transform-box: view-box;
    transition: opacity 0.55s ease, filter 0.55s ease;
  }
  .sankofa-bird-rig[data-speed="driving"] .sankofa-wingtip-feather,
  .sankofa-bird-rig[data-speed="airplane"] .sankofa-wingtip-feather {
    opacity: 0.78;
    filter: brightness(1.1) saturate(1.12) hue-rotate(4deg);
  }
  .sankofa-bird-rig[data-gliding="true"] .sankofa-wingtip-feather {
    opacity: 0.65;
    filter: brightness(1.04) saturate(1.06);
  }
  .sankofa-bird-rig[data-landing="slowflap"] .sankofa-wingtip-feather,
  .sankofa-bird-rig[data-landing="hover"] .sankofa-wingtip-feather,
  .sankofa-bird-rig[data-landing="perch"] .sankofa-wingtip-feather {
    opacity: 0.88;
    filter: brightness(1.06) saturate(1.08);
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-wingtip-r-a {
    animation: sankofa-p27-iri-natural 18.5s ease-in-out -3.2s infinite;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-wingtip-r-b {
    animation: sankofa-p27-iri-natural 21s ease-in-out -9.8s infinite;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-wingtip-l-a {
    animation: sankofa-p27-iri-natural-l 17.8s ease-in-out -6.5s infinite;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-wingtip-l-b {
    animation: sankofa-p27-iri-natural-l 20.2s ease-in-out -12.1s infinite;
  }

  /* 27.5 — reflected ambient light, not a neon aura. */
  .sankofa-ambient-warmth {
    opacity: calc(0.04 + var(--lighting-factor, 0.5) * 0.10);
    transition: opacity 1.2s ease, filter 1.2s ease;
  }
  .sankofa-bird-rig[data-flying="true"] .sankofa-ambient-warmth {
    opacity: calc(0.06 + var(--lighting-factor, 0.5) * 0.14);
  }
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-ambient-warmth {
    opacity: 0.03;
    filter: hue-rotate(180deg) brightness(0.7);
  }
  .sankofa-bird-rig[data-helping="true"] .sankofa-ambient-warmth,
  .sankofa-bird-rig[data-celebrating="true"] .sankofa-ambient-warmth,
  .sankofa-bird-rig[data-donated="true"] .sankofa-ambient-warmth {
    opacity: calc(0.12 + var(--lighting-factor, 0.5) * 0.18);
  }

  /* 27.6 — living neck overlays. Static and dynamic paths remain intact;
     these additions never change the mixer’s dynamic path or static fallback. */
  .sankofa-neck-seg-1 { opacity: 0.18; transition: opacity 0.65s ease; }
  .sankofa-neck-seg-2 { opacity: 0.14; transition: opacity 0.65s ease; }
  .sankofa-bird-rig[data-flying="true"] .sankofa-neck-seg-1 { opacity: 0.30; }
  .sankofa-bird-rig[data-flying="true"] .sankofa-neck-seg-2 { opacity: 0.22; }

  @keyframes sankofa-p27-neck-wave-lower {
    0%, 100% { opacity: 0.18; }
    30% { opacity: 0.32; }
    55% { opacity: 0.22; }
    80% { opacity: 0.28; }
  }
  @keyframes sankofa-p27-neck-wave-upper {
    0%, 100% { opacity: 0.14; }
    35% { opacity: 0.26; }
    60% { opacity: 0.16; }
    85% { opacity: 0.23; }
  }
  @keyframes sankofa-p27-neck-wave-mid {
    0%, 100% { opacity: 0.10; }
    25% { opacity: 0.30; }
    65% { opacity: 0.18; }
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-neck-seg-1 {
    animation: sankofa-p27-neck-wave-lower 4.8s ease-in-out -0.6s infinite;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-neck-seg-2 {
    animation: sankofa-p27-neck-wave-upper 4.8s ease-in-out -1.8s infinite;
  }
  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-neck-mid-organic {
    animation: sankofa-p27-neck-wave-mid 5.2s ease-in-out -1.2s infinite;
  }
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-neck-seg-1 { opacity: 0.28; }
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-neck-seg-2 { opacity: 0.22; }

  /* 27.7 — eyes keep the existing pupil tracking and gain readable
     lids/focus cues. The mixer still owns --sme-eye-x/y. */
  .sankofa-bird-eyelid { opacity: 0.18; transition: opacity 0.35s ease; }
  .sankofa-bird-lower-eyelid { opacity: 0.10; transition: opacity 0.35s ease; }
  .sankofa-bird-rig[data-flying="true"] .sankofa-bird-eyelid { opacity: 0.28; }
  .sankofa-bird-rig[data-speed="driving"] .sankofa-bird-eyelid,
  .sankofa-bird-rig[data-speed="airplane"] .sankofa-bird-eyelid { opacity: 0.38; }
  .sankofa-bird-rig[data-night-mode="true"] .sankofa-bird-iris {
    filter: brightness(0.75) saturate(0.60);
    transition: filter 0.8s ease;
  }
  @keyframes sankofa-p27-eye-focus-pulse {
    0%, 100% { transform: scale(1); opacity: 0.88; }
    16% { transform: scale(1.12); opacity: 0.95; }
    38% { transform: scale(1.04); opacity: 0.90; }
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
  .sankofa-bird-rig[data-approaching="true"] .sankofa-bird-eye-catchlight {
    opacity: 0.90;
    transition: opacity 0.45s ease;
  }
  .sankofa-bird-rig[data-landing="dive"] .sankofa-nictitating,
  .sankofa-bird-rig[data-landing="slowflap"] .sankofa-nictitating {
    opacity: 0.40;
    transition: opacity 0.3s ease;
  }

  /* 27.8 — aerodynamic lighting cues: load, acceleration and pre-turn
     behavior are expressed through directional light, not body transforms. */
  .sankofa-bird-rig[data-speed="driving"] .sankofa-neck-top-sheen,
  .sankofa-bird-rig[data-speed="airplane"] .sankofa-neck-top-sheen {
    opacity: 0.55;
    filter: brightness(1.12) saturate(1.10);
  }
  .sankofa-bird-rig[data-speed="driving"][data-flying="true"] .sankofa-breast-sheen,
  .sankofa-bird-rig[data-speed="airplane"][data-flying="true"] .sankofa-breast-sheen {
    opacity: calc(0.08 + var(--lighting-factor, 0.5) * 0.16);
    filter: brightness(1.10) saturate(1.10);
  }
  .sankofa-bird-rig[data-bank-dir="left"][data-flying="true"] .sankofa-dorsal-hi,
  .sankofa-bird-rig[data-bank-dir="right"][data-flying="true"] .sankofa-dorsal-hi {
    opacity: 0.26;
    filter: brightness(1.08) saturate(1.06);
  }

  /* Battery saver is explicit and complete for all Phase 27 animation
     targets. Reduced motion is a separate user preference guard. */
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-iri-edge,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-wingtip-feather,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-shoulder-feather,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-neck-seg-1,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-neck-seg-2,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-neck-mid-organic,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-iris {
    animation: none !important;
    transition: none !important;
  }

  @media (prefers-reduced-motion: reduce) {
    .sankofa-feather-iri-edge,
    .sankofa-wingtip-feather,
    .sankofa-shoulder-feather,
    .sankofa-neck-seg-1,
    .sankofa-neck-seg-2,
    .sankofa-neck-mid-organic,
    .sankofa-bird-iris {
      animation: none !important;
    }
    .sankofa-ambient-warmth,
    .sankofa-bird-eyelid,
    .sankofa-bird-lower-eyelid {
      transition: none !important;
    }
  }
`;