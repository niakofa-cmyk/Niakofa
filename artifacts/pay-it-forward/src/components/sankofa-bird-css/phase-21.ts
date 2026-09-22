/**
 * Sankofa Bird CSS — Phase 21: Advanced Wing/Tail Deformation + Back Diagonal Poses
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE 21 — Pipeline Reference Implementation (July 2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Implements the official Sankofa Bird SVG Asset Pipeline spec:
 *   public/SANKOFA_BIRD_VISUAL_REFERENCE.md + SANKOFA_BIRD_PIPELINE_REF.png
 *
 * ── Wing Deformation (5 poses from pipeline image) ───────────────────────
 *   1. Wings Up / High Stretch  → data-landing="takeoff"
 *   2. Wings Mid / Cruise       → data-flying="true" (default flap position)
 *   3. Wings Down / Power Stroke→ data-aero-mode="hover"
 *   4. Wings Forward / Braking  → data-approaching="true" | data-landing="slowflap"
 *   5. Wings Back / Glide       → data-gliding="true" | data-soaring="true"
 *
 * ── Tail Deformation (4 poses from pipeline image) ────────────────────────
 *   1. Tail Flare / Wide        → data-celebrating="true" | data-landing="perch"
 *   2. Tail Narrow / Speed      → data-speed="driving" while data-flying="true"
 *   3. Tail Folded / Braking    → data-approaching="true" | data-landing="slowflap"
 *   4. Tail Stream / Glide      → data-gliding="true" | data-soaring="true"
 *
 * ── Back Diagonal (SE/SW headings, data-view-angle="back-diagonal") ──────
 * The BackView sprite gains a subtle perspective skew for SE (135°) and
 * SW (225°) headings, matching the pipeline's "Back 3/4 Left/Right" views.
 *
 * ── SME Direct Rig Drives ────────────────────────────────────────────────
 * --sme-lwing-upper-deg / --sme-rwing-upper-deg (written by useAnimationMixer
 * every rAF frame) now explicitly drive the wing-left/right rig groups via
 * CSS individual `rotate:` property — no keyframe animation conflict.
 *
 * Design contract:
 *   • All Phase 21 rules are additive — they gate on specific data-* attribute
 *     combinations and do NOT reset Phase 1–20 defaults.
 *   • Wing/tail deformation rules use transform-box:view-box + transform-origin
 *     matching the SVG pivot points from Skeleton/Pivots.ts.
 *   • Battery-saver + prefers-reduced-motion guards at the bottom.
 *   • No backtick characters inside template literal string content (Babel crashes).
 */

// NOTE: Backtick characters inside CSS template literal strings crash Babel.
// Use only single/double quotes inside this string.

export const sankofaCssPhase21 = `

  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 21 — Custom property declarations for new vars
     ═══════════════════════════════════════════════════════════════════════ */

  @property --p21-wing-up-angle {
    syntax: "<angle>";
    inherits: true;
    initial-value: 0deg;
  }
  @property --p21-tail-spread {
    syntax: "<number>";
    inherits: true;
    initial-value: 0;
  }
  @property --p21-back-skew {
    syntax: "<number>";
    inherits: true;
    initial-value: 0;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 21.1 — Wing Deformation: High Stretch (Takeoff / Power Launch)
     Pipeline: "Wings Up — High Stretch" pose.
     Wings sweep upward aggressively, primaries fan wide.
     data-landing="takeoff" activates this pose.
     ═══════════════════════════════════════════════════════════════════════ */

  .sankofa-bird-rig[data-landing="takeoff"]:not([data-battery-saver="true"])
    .sankofa-sme-wing-right-rig,
  .sankofa-bird-rig[data-landing="takeoff"]:not([data-battery-saver="true"])
    .sankofa-sme-wing-left-rig {
    transition: rotate 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  /* Takeoff: right wing sweeps up-back, left mirrors */
  .sankofa-bird-rig[data-landing="takeoff"]:not([data-battery-saver="true"])
    .sankofa-sme-wing-right-rig {
    rotate: var(--sme-rwing-upper-deg, -28deg);
  }
  .sankofa-bird-rig[data-landing="takeoff"]:not([data-battery-saver="true"])
    .sankofa-sme-wing-left-rig {
    rotate: var(--sme-lwing-upper-deg, 28deg);
  }

  /* Takeoff: feather primaries fan to maximum spread */
  .sankofa-bird-rig[data-landing="takeoff"]:not([data-battery-saver="true"])[data-zoom="mid"]
    .sankofa-feather-r5,
  .sankofa-bird-rig[data-landing="takeoff"]:not([data-battery-saver="true"])[data-zoom="high"]
    .sankofa-feather-r5,
  .sankofa-bird-rig[data-landing="takeoff"]:not([data-battery-saver="true"])[data-zoom="street"]
    .sankofa-feather-r5 {
    opacity: 0.92;
    filter: brightness(1.15) drop-shadow(0 0 2px rgba(0,212,255,0.6));
  }
  .sankofa-bird-rig[data-landing="takeoff"]:not([data-battery-saver="true"])[data-zoom="mid"]
    .sankofa-feather-l5,
  .sankofa-bird-rig[data-landing="takeoff"]:not([data-battery-saver="true"])[data-zoom="high"]
    .sankofa-feather-l5,
  .sankofa-bird-rig[data-landing="takeoff"]:not([data-battery-saver="true"])[data-zoom="street"]
    .sankofa-feather-l5 {
    opacity: 0.92;
    filter: brightness(1.15) drop-shadow(0 0 2px rgba(0,212,255,0.6));
  }

  /* Takeoff: covert bands glow bright on power stroke */
  .sankofa-bird-rig[data-landing="takeoff"]:not([data-battery-saver="true"])
    .sankofa-wing-covert-band-r,
  .sankofa-bird-rig[data-landing="takeoff"]:not([data-battery-saver="true"])
    .sankofa-wing-covert-band-l {
    opacity: 0.88;
    transition: opacity 0.12s ease-out;
  }

  /* Takeoff: wing-joint shoulder catchlights visible */
  .sankofa-bird-rig[data-landing="takeoff"]:not([data-battery-saver="true"])
    .sankofa-wing-joint {
    opacity: 0.72;
    transition: opacity 0.15s ease-out;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 21.2 — Wing Deformation: Hover / Power Stroke Down
     Pipeline: "Wings Down — Power Stroke" pose.
     The downstroke power phase — wings sweep below the body centreline.
     Wrist leads, elbow follows. Wing undersurface briefly visible.
     data-aero-mode="hover" activates full downstroke depth.
     ═══════════════════════════════════════════════════════════════════════ */

  /* Hover: wing undersurface pathways (wing-right-btm / wing-left-btm) appear */
  .sankofa-bird-rig[data-aero-mode="hover"]:not([data-battery-saver="true"])
    .sankofa-bird-wing-right-btm,
  .sankofa-bird-rig[data-aero-mode="hover"]:not([data-battery-saver="true"])
    .sankofa-bird-wing-left-btm {
    opacity: 0.62;
    transition: opacity 0.2s ease-out;
  }

  /* Hover: scapular shoulder feathers fully deployed */
  .sankofa-bird-rig[data-aero-mode="hover"]:not([data-battery-saver="true"])[data-zoom="mid"]
    .sankofa-wing-scap,
  .sankofa-bird-rig[data-aero-mode="hover"]:not([data-battery-saver="true"])[data-zoom="high"]
    .sankofa-wing-scap,
  .sankofa-bird-rig[data-aero-mode="hover"]:not([data-battery-saver="true"])[data-zoom="street"]
    .sankofa-wing-scap {
    opacity: 0.78;
    transition: opacity 0.18s ease-out;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 21.3 — Wing Deformation: Braking / Wings Forward
     Pipeline: "Wings Forward — Braking" pose.
     Wings swept forward past the body; strong pitch-up attitude.
     Primaries splay wide laterally. Activated on approach deceleration.
     data-approaching="true" OR data-landing="slowflap"
     ═══════════════════════════════════════════════════════════════════════ */

  /* Braking: body pitches up (head high, tail low) */
  .sankofa-bird-rig[data-approaching="true"]:not([data-battery-saver="true"])
    .sankofa-bird-chest,
  .sankofa-bird-rig[data-landing="slowflap"]:not([data-battery-saver="true"])
    .sankofa-bird-chest {
    transform: rotate(-6deg);
    transform-box: view-box;
    transform-origin: 20px 22px;
    transition: transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  }

  /* Braking: primaries splay outward (forward-swept look) */
  .sankofa-bird-rig[data-approaching="true"]:not([data-battery-saver="true"])[data-zoom="mid"]
    .sankofa-bird-wing-right-feathers,
  .sankofa-bird-rig[data-approaching="true"]:not([data-battery-saver="true"])[data-zoom="high"]
    .sankofa-bird-wing-right-feathers,
  .sankofa-bird-rig[data-approaching="true"]:not([data-battery-saver="true"])[data-zoom="street"]
    .sankofa-bird-wing-right-feathers,
  .sankofa-bird-rig[data-approaching="true"]:not([data-battery-saver="true"])[data-zoom="mid"]
    .sankofa-bird-wing-left-feathers,
  .sankofa-bird-rig[data-approaching="true"]:not([data-battery-saver="true"])[data-zoom="high"]
    .sankofa-bird-wing-left-feathers,
  .sankofa-bird-rig[data-approaching="true"]:not([data-battery-saver="true"])[data-zoom="street"]
    .sankofa-bird-wing-left-feathers {
    opacity: 0.88;
    filter: brightness(1.08);
    transition: opacity 0.3s ease-out, filter 0.3s ease-out;
  }

  /* Descent bob: slight scale-Y squish on body when approaching */
  .sankofa-bird-rig[data-approaching="true"]:not([data-battery-saver="true"]) {
    animation: sankofa-descent-bob 2.2s ease-in-out infinite;
  }

  @keyframes sankofa-descent-bob {
    0%, 100% { transform: translateZ(0) rotate(var(--mixer-bank-deg, 0deg)); }
    50%       { transform: translateZ(0) rotate(var(--mixer-bank-deg, 0deg)) translateY(2.5px); }
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 21.4 — Wing Deformation: Glide / Wings Back
     Pipeline: "Wings Back — Glide" pose.
     Wings swept backward in a swept-delta configuration.
     Alula tucked, primaries closely packed, minimum drag.
     data-gliding="true" OR data-soaring="true"
     ═══════════════════════════════════════════════════════════════════════ */

  /* Glide: wing root highlight brightens (high-speed leading edge lit) */
  .sankofa-bird-rig[data-gliding="true"]:not([data-battery-saver="true"])[data-zoom="mid"]
    .sankofa-bird-wing-right-highlight,
  .sankofa-bird-rig[data-gliding="true"]:not([data-battery-saver="true"])[data-zoom="high"]
    .sankofa-bird-wing-right-highlight,
  .sankofa-bird-rig[data-gliding="true"]:not([data-battery-saver="true"])[data-zoom="street"]
    .sankofa-bird-wing-right-highlight,
  .sankofa-bird-rig[data-gliding="true"]:not([data-battery-saver="true"])[data-zoom="mid"]
    .sankofa-bird-wing-left-highlight,
  .sankofa-bird-rig[data-gliding="true"]:not([data-battery-saver="true"])[data-zoom="high"]
    .sankofa-bird-wing-left-highlight,
  .sankofa-bird-rig[data-gliding="true"]:not([data-battery-saver="true"])[data-zoom="street"]
    .sankofa-bird-wing-left-highlight {
    opacity: 0.68;
    filter: brightness(1.22);
    transition: opacity 0.6s ease-out, filter 0.6s ease-out;
  }

  /* Soaring: slow dynamic flap driven by --sme-lwing-upper-deg at 4s period */
  .sankofa-bird-rig[data-soaring="true"]:not([data-battery-saver="true"])
    .sankofa-sme-wing-right-rig,
  .sankofa-bird-rig[data-soaring="true"]:not([data-battery-saver="true"])
    .sankofa-sme-wing-left-rig {
    transition: rotate 0.8s cubic-bezier(0.45, 0, 0.55, 1);
  }

  /* Glide: body elongates slightly (horizontal posture illusion) */
  .sankofa-bird-rig[data-gliding="true"]:not([data-battery-saver="true"]) .sankofa-bird-chest {
    transform: scaleX(1.035) rotate(12deg);
    transform-box: view-box;
    transform-origin: 20px 22px;
    transition: transform 0.55s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  }

  /* Glide: speed-shimmer specular on leading edge */
  .sankofa-bird-rig[data-gliding="true"]:not([data-battery-saver="true"])[data-zoom="high"]
    .sankofa-bird-wing-right,
  .sankofa-bird-rig[data-gliding="true"]:not([data-battery-saver="true"])[data-zoom="street"]
    .sankofa-bird-wing-right,
  .sankofa-bird-rig[data-gliding="true"]:not([data-battery-saver="true"])[data-zoom="high"]
    .sankofa-bird-wing-left,
  .sankofa-bird-rig[data-gliding="true"]:not([data-battery-saver="true"])[data-zoom="street"]
    .sankofa-bird-wing-left {
    filter: brightness(1.12) saturate(1.15);
    transition: filter 0.5s ease-out;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 21.5 — Tail Deformation: Flare / Wide Fan
     Pipeline: "Tail Flare — Wide" pose.
     Full tail-fan deployment during celebrations, perching, and greetings.
     data-celebrating="true" OR data-landing="idle" at high zoom.
     ═══════════════════════════════════════════════════════════════════════ */

  /* Tail Flare: SVG tail paths widen via scale and brightness */
  .sankofa-bird-rig[data-celebrating="true"]:not([data-battery-saver="true"])[data-zoom="mid"]
    .sankofa-bird-tail,
  .sankofa-bird-rig[data-celebrating="true"]:not([data-battery-saver="true"])[data-zoom="high"]
    .sankofa-bird-tail,
  .sankofa-bird-rig[data-celebrating="true"]:not([data-battery-saver="true"])[data-zoom="street"]
    .sankofa-bird-tail {
    transform: scaleX(1.28) rotate(calc(var(--mixer-tail-bend-deg, 0deg) * 0.6));
    transform-box: view-box;
    transform-origin: 20px 28px;
    filter: brightness(1.18) saturate(1.20)
            drop-shadow(0 0 4px rgba(0,212,255,0.5));
    transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1),
                filter 0.35s ease-out;
  }

  /* Mating display: full peacock-spread tail fan */
  .sankofa-bird-rig[data-mating="true"]:not([data-battery-saver="true"]) .sankofa-bird-tail {
    transform: scaleX(1.55) scaleY(1.15);
    transform-box: view-box;
    transform-origin: 20px 28px;
    filter: brightness(1.25) saturate(1.35)
            drop-shadow(0 0 8px rgba(0,212,255,0.65));
    transition: transform 0.55s cubic-bezier(0.34, 1.56, 0.64, 1),
                filter 0.5s ease-out;
    animation: sankofa-tail-fan-pulse 2.4s ease-in-out infinite;
  }

  @keyframes sankofa-tail-fan-pulse {
    0%, 100% { filter: brightness(1.25) saturate(1.35) drop-shadow(0 0 8px rgba(0,212,255,0.65)); }
    50%       { filter: brightness(1.38) saturate(1.50) drop-shadow(0 0 14px rgba(0,212,255,0.85)); }
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 21.6 — Tail Deformation: Narrow / Speed Stream
     Pipeline: "Tail Narrow — Speed" and "Tail Stream — Glide" poses.
     At driving speed the tail closes into a narrow, low-drag stream.
     data-speed="driving" + data-flying="true" (not gliding).
     data-gliding="true" produces an even more extreme stream (soar pose).
     ═══════════════════════════════════════════════════════════════════════ */

  /* Speed tail: slightly narrowed, angled backward */
  .sankofa-bird-rig[data-speed="driving"][data-flying="true"]:not([data-gliding="true"]):not([data-battery-saver="true"])
    .sankofa-bird-tail {
    transform: scaleX(0.78) rotate(calc(var(--mixer-tail-bend-deg, 0deg)));
    transform-box: view-box;
    transform-origin: 20px 28px;
    transition: transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
  }

  /* Glide tail stream: maximum narrowing, flows back like a kite tail */
  .sankofa-bird-rig[data-gliding="true"]:not([data-battery-saver="true"]) .sankofa-bird-tail {
    transform: scaleX(0.60) scaleY(1.12) rotate(calc(var(--mixer-tail-bend-deg, 0deg) * 0.5));
    transform-box: view-box;
    transform-origin: 20px 28px;
    filter: brightness(0.92);
    transition: transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                filter 0.5s ease-out;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 21.7 — Tail Deformation: Folded / Braking Spread
     Pipeline: "Tail Folded — Braking" pose.
     On deceleration the tail fans out flat against drag, folding forward.
     data-approaching="true" OR data-landing="slowflap"
     ═══════════════════════════════════════════════════════════════════════ */

  /* Braking tail: spreads wide and tilts forward */
  .sankofa-bird-rig[data-approaching="true"]:not([data-battery-saver="true"]) .sankofa-bird-tail,
  .sankofa-bird-rig[data-landing="slowflap"]:not([data-battery-saver="true"]) .sankofa-bird-tail {
    transform: scaleX(1.18) rotate(calc(var(--mixer-tail-bend-deg, 0deg) + 8deg));
    transform-box: view-box;
    transform-origin: 20px 28px;
    filter: brightness(1.06);
    transition: transform 0.45s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                filter 0.35s ease-out;
  }

  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 21.7A — Independent Rectrix Fan
     The parent tail handles the broad pose/bend. Each feather now reacts
     independently on top of that pose:
       • braking: inner → outer → far feathers open in a staggered drag wave
       • banking: the outside side fans wider while the inside side tucks
     The center rectrices remain stable as the visual hinge of the fan.
     ═══════════════════════════════════════════════════════════════════════ */

  /* Use explicit signed keyframes instead of multiplying angle values in
     calc(); that keeps the motion reliable in Safari's SVG compositor. */
  @keyframes sankofa-tail-brake-inner-left {
    0%, 100% { rotate: -3deg; }
    50% { rotate: -8deg; }
  }
  @keyframes sankofa-tail-brake-inner-right {
    0%, 100% { rotate: 3deg; }
    50% { rotate: 8deg; }
  }
  @keyframes sankofa-tail-brake-outer-left {
    0%, 100% { rotate: -5deg; }
    50% { rotate: -14deg; }
  }
  @keyframes sankofa-tail-brake-outer-right {
    0%, 100% { rotate: 5deg; }
    50% { rotate: 14deg; }
  }
  @keyframes sankofa-tail-brake-far-left {
    0%, 100% { rotate: -8deg; }
    50% { rotate: -22deg; }
  }
  @keyframes sankofa-tail-brake-far-right {
    0%, 100% { rotate: 8deg; }
    50% { rotate: 22deg; }
  }
  @keyframes sankofa-tail-bank-inside-left {
    0%, 100% { rotate: -1deg; }
    50% { rotate: -4deg; }
  }
  @keyframes sankofa-tail-bank-inside-right {
    0%, 100% { rotate: 1deg; }
    50% { rotate: 4deg; }
  }
  @keyframes sankofa-tail-bank-outside-left {
    0%, 100% { rotate: -4deg; }
    50% { rotate: -18deg; }
  }
  @keyframes sankofa-tail-bank-outside-right {
    0%, 100% { rotate: 4deg; }
    50% { rotate: 18deg; }
  }

  /* Braking / approach: the feather fan opens progressively from the
     center toward the far rectrices, rather than moving as one rigid plate.
     Triggers: proxy states (data-approaching, data-landing) AND the
     authoritative data-tail-pose="folded" attr set by Bird.tsx. */
  .sankofa-bird-rig:is([data-approaching="true"], [data-landing="slowflap"], [data-landing="perch"], [data-tail-pose="folded"]):not([data-battery-saver="true"])
    .sankofa-tail-inner-left {
    animation: sankofa-tail-brake-inner-left 1.05s ease-in-out 0s infinite !important;
  }
  .sankofa-bird-rig:is([data-approaching="true"], [data-landing="slowflap"], [data-landing="perch"], [data-tail-pose="folded"]):not([data-battery-saver="true"])
    .sankofa-tail-inner-right {
    animation: sankofa-tail-brake-inner-right 1.05s ease-in-out 90ms infinite !important;
  }
  .sankofa-bird-rig:is([data-approaching="true"], [data-landing="slowflap"], [data-landing="perch"], [data-tail-pose="folded"]):not([data-battery-saver="true"])
    .sankofa-tail-outer-left {
    animation: sankofa-tail-brake-outer-left 1.05s ease-in-out 180ms infinite !important;
  }
  .sankofa-bird-rig:is([data-approaching="true"], [data-landing="slowflap"], [data-landing="perch"], [data-tail-pose="folded"]):not([data-battery-saver="true"])
    .sankofa-tail-outer-right {
    animation: sankofa-tail-brake-outer-right 1.05s ease-in-out 270ms infinite !important;
  }
  .sankofa-bird-rig:is([data-approaching="true"], [data-landing="slowflap"], [data-landing="perch"], [data-tail-pose="folded"]):not([data-battery-saver="true"])
    .sankofa-tail-far-left {
    animation: sankofa-tail-brake-far-left 1.05s ease-in-out 360ms infinite !important;
  }
  .sankofa-bird-rig:is([data-approaching="true"], [data-landing="slowflap"], [data-landing="perch"], [data-tail-pose="folded"]):not([data-battery-saver="true"])
    .sankofa-tail-far-right {
    animation: sankofa-tail-brake-far-right 1.05s ease-in-out 450ms infinite !important;
  }

  /* Tail flare individual rectrix splay: activates on data-tail-pose="flare"
     (wide steering turn or celebration). Each pair fans outward from center.
     LOD-gated to mid/high/street — feather geometry not worth animating at low zoom. */
  .sankofa-bird-rig[data-tail-pose="flare"]:not([data-battery-saver="true"])[data-zoom="mid"]
    .sankofa-tail-inner-left,
  .sankofa-bird-rig[data-tail-pose="flare"]:not([data-battery-saver="true"])[data-zoom="high"]
    .sankofa-tail-inner-left,
  .sankofa-bird-rig[data-tail-pose="flare"]:not([data-battery-saver="true"])[data-zoom="street"]
    .sankofa-tail-inner-left {
    animation: sankofa-tail-brake-inner-left 1.25s ease-in-out 0s infinite !important;
  }
  .sankofa-bird-rig[data-tail-pose="flare"]:not([data-battery-saver="true"])[data-zoom="mid"]
    .sankofa-tail-inner-right,
  .sankofa-bird-rig[data-tail-pose="flare"]:not([data-battery-saver="true"])[data-zoom="high"]
    .sankofa-tail-inner-right,
  .sankofa-bird-rig[data-tail-pose="flare"]:not([data-battery-saver="true"])[data-zoom="street"]
    .sankofa-tail-inner-right {
    animation: sankofa-tail-brake-inner-right 1.25s ease-in-out 60ms infinite !important;
  }
  .sankofa-bird-rig[data-tail-pose="flare"]:not([data-battery-saver="true"])[data-zoom="mid"]
    .sankofa-tail-outer-left,
  .sankofa-bird-rig[data-tail-pose="flare"]:not([data-battery-saver="true"])[data-zoom="high"]
    .sankofa-tail-outer-left,
  .sankofa-bird-rig[data-tail-pose="flare"]:not([data-battery-saver="true"])[data-zoom="street"]
    .sankofa-tail-outer-left {
    animation: sankofa-tail-brake-outer-left 1.25s ease-in-out 130ms infinite !important;
  }
  .sankofa-bird-rig[data-tail-pose="flare"]:not([data-battery-saver="true"])[data-zoom="mid"]
    .sankofa-tail-outer-right,
  .sankofa-bird-rig[data-tail-pose="flare"]:not([data-battery-saver="true"])[data-zoom="high"]
    .sankofa-tail-outer-right,
  .sankofa-bird-rig[data-tail-pose="flare"]:not([data-battery-saver="true"])[data-zoom="street"]
    .sankofa-tail-outer-right {
    animation: sankofa-tail-brake-outer-right 1.25s ease-in-out 200ms infinite !important;
  }
  .sankofa-bird-rig[data-tail-pose="flare"]:not([data-battery-saver="true"])[data-zoom="mid"]
    .sankofa-tail-far-left,
  .sankofa-bird-rig[data-tail-pose="flare"]:not([data-battery-saver="true"])[data-zoom="high"]
    .sankofa-tail-far-left,
  .sankofa-bird-rig[data-tail-pose="flare"]:not([data-battery-saver="true"])[data-zoom="street"]
    .sankofa-tail-far-left {
    animation: sankofa-tail-brake-far-left 1.25s ease-in-out 270ms infinite !important;
  }
  .sankofa-bird-rig[data-tail-pose="flare"]:not([data-battery-saver="true"])[data-zoom="mid"]
    .sankofa-tail-far-right,
  .sankofa-bird-rig[data-tail-pose="flare"]:not([data-battery-saver="true"])[data-zoom="high"]
    .sankofa-tail-far-right,
  .sankofa-bird-rig[data-tail-pose="flare"]:not([data-battery-saver="true"])[data-zoom="street"]
    .sankofa-tail-far-right {
    animation: sankofa-tail-brake-far-right 1.25s ease-in-out 340ms infinite !important;
  }

  /* Banking: a right turn makes the left side the outside of the turn;
     a left turn mirrors the response. The outside rectrices open farther.
     LOD-gated: :not([data-nav-lod="2"]) prevents these per-feather animations
     at low zoom where the individual rectrix geometry is too small to animate. */
  .sankofa-bird-rig[data-flying="true"][data-turn-dir="right"]:not([data-battery-saver="true"]):not([data-nav-lod="2"])
    .sankofa-tail-inner-left,
  .sankofa-bird-rig[data-flying="true"][data-turn-dir="right"]:not([data-battery-saver="true"]):not([data-nav-lod="2"])
    .sankofa-tail-outer-left,
  .sankofa-bird-rig[data-flying="true"][data-turn-dir="right"]:not([data-battery-saver="true"]):not([data-nav-lod="2"])
    .sankofa-tail-far-left {
    animation: sankofa-tail-bank-outside-left 1.25s ease-in-out infinite !important;
  }
  .sankofa-bird-rig[data-flying="true"][data-turn-dir="right"]:not([data-battery-saver="true"]):not([data-nav-lod="2"])
    .sankofa-tail-inner-right,
  .sankofa-bird-rig[data-flying="true"][data-turn-dir="right"]:not([data-battery-saver="true"]):not([data-nav-lod="2"])
    .sankofa-tail-outer-right,
  .sankofa-bird-rig[data-flying="true"][data-turn-dir="right"]:not([data-battery-saver="true"]):not([data-nav-lod="2"])
    .sankofa-tail-far-right {
    animation: sankofa-tail-bank-inside-right 1.25s ease-in-out 70ms infinite !important;
  }
  .sankofa-bird-rig[data-flying="true"][data-turn-dir="left"]:not([data-battery-saver="true"]):not([data-nav-lod="2"])
    .sankofa-tail-inner-left,
  .sankofa-bird-rig[data-flying="true"][data-turn-dir="left"]:not([data-battery-saver="true"]):not([data-nav-lod="2"])
    .sankofa-tail-outer-left,
  .sankofa-bird-rig[data-flying="true"][data-turn-dir="left"]:not([data-battery-saver="true"]):not([data-nav-lod="2"])
    .sankofa-tail-far-left {
    animation: sankofa-tail-bank-inside-left 1.25s ease-in-out 70ms infinite !important;
  }
  .sankofa-bird-rig[data-flying="true"][data-turn-dir="left"]:not([data-battery-saver="true"]):not([data-nav-lod="2"])
    .sankofa-tail-inner-right,
  .sankofa-bird-rig[data-flying="true"][data-turn-dir="left"]:not([data-battery-saver="true"]):not([data-nav-lod="2"])
    .sankofa-tail-outer-right,
  .sankofa-bird-rig[data-flying="true"][data-turn-dir="left"]:not([data-battery-saver="true"]):not([data-nav-lod="2"])
    .sankofa-tail-far-right {
    animation: sankofa-tail-bank-outside-right 1.25s ease-in-out infinite !important;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 21.8 — Back-Diagonal View Enhancement
     When data-view-angle="back-diagonal" (SE 112.5°–157.5° or SW 202.5°–247.5°),
     the BackView sprite gains a subtle brightness gradient shift to sell depth.
     The perspective matrix is already applied by Renderer.tsx at these headings;
     this CSS adds the lighting differential that 2D perspective skew alone lacks.
     ═══════════════════════════════════════════════════════════════════════ */

  /* Back-diagonal: dorsal surface lit from diagonal NW sun source */
  .sankofa-bird-rig[data-view-angle="back-diagonal"]:not([data-battery-saver="true"])
    .sankofa-back-view {
    filter: brightness(calc(0.85 + var(--lighting-factor, 0.5) * 0.22));
    transition: filter 0.28s ease;
  }

  /* Back-diagonal: near wing brighter (toward viewer), far wing darker */
  .sankofa-bird-rig[data-view-angle="back-diagonal"][data-facing="right"]:not([data-battery-saver="true"])
    .sankofa-bv-wing-right {
    filter: brightness(1.14);
    transition: filter 0.28s ease;
  }
  .sankofa-bird-rig[data-view-angle="back-diagonal"][data-facing="right"]:not([data-battery-saver="true"])
    .sankofa-bv-wing-left {
    filter: brightness(0.82) opacity(0.9);
    transition: filter 0.28s ease, opacity 0.28s ease;
  }
  .sankofa-bird-rig[data-view-angle="back-diagonal"][data-facing="left"]:not([data-battery-saver="true"])
    .sankofa-bv-wing-left {
    filter: brightness(1.14);
    transition: filter 0.28s ease;
  }
  .sankofa-bird-rig[data-view-angle="back-diagonal"][data-facing="left"]:not([data-battery-saver="true"])
    .sankofa-bv-wing-right {
    filter: brightness(0.82) opacity(0.9);
    transition: filter 0.28s ease, opacity 0.28s ease;
  }

  /* Back-diagonal: tail fan slightly asymmetric (near side wider) */
  .sankofa-bird-rig[data-view-angle="back-diagonal"]:not([data-battery-saver="true"])
    .sankofa-bv-tail {
    transform: skewX(calc(var(--diagonal-pose-intensity, 0) * 5deg));
    transform-box: view-box;
    transform-origin: 20px 27px;
    transition: transform 0.3s ease;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 21.9 — FrontView Enhanced Wing Flap
     FrontView wing groups (sankofa-fv-wing-left/right) gain SME-driven
     rotation using --sme-lwing-upper-deg / --sme-rwing-upper-deg.
     Pivot at wing root (20px 18px) matches FrontView.tsx transform-origin.
     ═══════════════════════════════════════════════════════════════════════ */

  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-front-view .sankofa-fv-wing-left {
    rotate: var(--sme-lwing-upper-deg, 0deg);
    transform-box: view-box;
    transform-origin: 20px 18px;
  }

  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-front-view .sankofa-fv-wing-right {
    rotate: calc(-1 * var(--sme-rwing-upper-deg, 0deg));
    transform-box: view-box;
    transform-origin: 20px 18px;
  }

  /* FrontView takeoff: wings raise up dramatically */
  .sankofa-bird-rig[data-landing="takeoff"]:not([data-battery-saver="true"])
    .sankofa-front-view .sankofa-fv-wing-left {
    animation: sankofa-fv-wing-takeoff-left 0.28s ease-out 2;
  }
  .sankofa-bird-rig[data-landing="takeoff"]:not([data-battery-saver="true"])
    .sankofa-front-view .sankofa-fv-wing-right {
    animation: sankofa-fv-wing-takeoff-right 0.28s ease-out 2;
  }

  @keyframes sankofa-fv-wing-takeoff-left {
    0%   { rotate: 0deg; }
    40%  { rotate: -38deg; }
    100% { rotate: 12deg; }
  }
  @keyframes sankofa-fv-wing-takeoff-right {
    0%   { rotate: 0deg; }
    40%  { rotate: 38deg; }
    100% { rotate: -12deg; }
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 21.10 — BackView Enhanced Wing Flap
     BackView wing groups (sankofa-bv-wing-left/right) gain SME-driven
     rotation using the same solver vars.
     Pivot at (20px 17px) matches BackView.tsx transform-origin.
     ═══════════════════════════════════════════════════════════════════════ */

  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-back-view .sankofa-bv-wing-left {
    rotate: var(--sme-lwing-upper-deg, 0deg);
    transform-box: view-box;
    transform-origin: 20px 17px;
  }

  .sankofa-bird-rig:not([data-battery-saver="true"]) .sankofa-back-view .sankofa-bv-wing-right {
    rotate: calc(-1 * var(--sme-rwing-upper-deg, 0deg));
    transform-box: view-box;
    transform-origin: 20px 17px;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 21.11 — Mission Complete Cascade
     On missionComplete, an iridescent rainbow shimmer cascades head→tail.
     Multi-stage brightness cascade using animation-delay offsets.
     ═══════════════════════════════════════════════════════════════════════ */

  .sankofa-bird-rig[data-mission-complete="true"]:not([data-battery-saver="true"])
    .sankofa-bird-head {
    animation: sankofa-mission-shimmer 1.8s ease-in-out;
    animation-delay: 0ms;
  }
  .sankofa-bird-rig[data-mission-complete="true"]:not([data-battery-saver="true"])
    .sankofa-bird-chest {
    animation: sankofa-mission-shimmer 1.8s ease-in-out;
    animation-delay: 120ms;
  }
  .sankofa-bird-rig[data-mission-complete="true"]:not([data-battery-saver="true"])
    .sankofa-sme-wing-right-rig,
  .sankofa-bird-rig[data-mission-complete="true"]:not([data-battery-saver="true"])
    .sankofa-sme-wing-left-rig {
    animation: sankofa-mission-shimmer 1.8s ease-in-out;
    animation-delay: 240ms;
  }
  .sankofa-bird-rig[data-mission-complete="true"]:not([data-battery-saver="true"])
    .sankofa-bird-tail {
    animation: sankofa-mission-shimmer 1.8s ease-in-out;
    animation-delay: 380ms;
  }

  @keyframes sankofa-mission-shimmer {
    0%   { filter: none; }
    20%  { filter: brightness(1.45) saturate(1.5) hue-rotate(15deg)
                   drop-shadow(0 0 6px rgba(0,255,200,0.8)); }
    55%  { filter: brightness(1.20) saturate(1.25) hue-rotate(-8deg)
                   drop-shadow(0 0 4px rgba(0,212,255,0.6)); }
    100% { filter: none; }
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 21.12 — Community Milestone Cascade
     When communityMilestone briefly fires, the whole rig pulses gold→teal.
     ═══════════════════════════════════════════════════════════════════════ */

  .sankofa-bird-rig[data-community-milestone="true"]:not([data-battery-saver="true"])
    .sankofa-bird-body {
    animation: sankofa-milestone-gold 1.2s ease-out;
  }

  @keyframes sankofa-milestone-gold {
    0%   { filter: none; }
    30%  { filter: brightness(1.55) sepia(0.6) hue-rotate(-25deg)
                   drop-shadow(0 0 8px rgba(255,215,0,0.9)); }
    70%  { filter: brightness(1.25) sepia(0.2) hue-rotate(-10deg)
                   drop-shadow(0 0 4px rgba(255,215,0,0.5)); }
    100% { filter: none; }
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 21.13 — WAIR Mode (Wing-Assisted Incline Running)
     Wings pump in a tight rapid arc, body pitched forward ~35°.
     data-wair="true"
     ═══════════════════════════════════════════════════════════════════════ */

  .sankofa-bird-rig[data-wair="true"]:not([data-battery-saver="true"]) .sankofa-bird-chest {
    transform: rotate(-18deg);
    transform-box: view-box;
    transform-origin: 20px 22px;
    transition: transform 0.3s ease-out;
  }

  .sankofa-bird-rig[data-wair="true"]:not([data-battery-saver="true"])
    .sankofa-sme-wing-right-rig,
  .sankofa-bird-rig[data-wair="true"]:not([data-battery-saver="true"])
    .sankofa-sme-wing-left-rig {
    transition: rotate 0.12s linear;
  }

  /* WAIR wings: visible in tighter rapid arc at shorter amplitude */
  .sankofa-bird-rig[data-wair="true"]:not([data-battery-saver="true"])[data-zoom="mid"]
    .sankofa-wing-joint,
  .sankofa-bird-rig[data-wair="true"]:not([data-battery-saver="true"])[data-zoom="high"]
    .sankofa-wing-joint,
  .sankofa-bird-rig[data-wair="true"]:not([data-battery-saver="true"])[data-zoom="street"]
    .sankofa-wing-joint {
    opacity: 0.82;
    transition: opacity 0.2s ease;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 21.14 — Heading-Quadrant Forward Crane (Helping mode)
     When isHelping=true and the bird is moving, the whole body pitches
     slightly forward with a "crane neck forward" posture — alert, engaged.
     data-helping="true" + data-flying="true"
     ═══════════════════════════════════════════════════════════════════════ */

  .sankofa-bird-rig[data-helping="true"][data-flying="true"]:not([data-battery-saver="true"])
    .sankofa-bird-head {
    rotate: calc(var(--gaze-rotate-deg, 0deg) - 4deg);
    transition: rotate 0.5s ease-out;
  }

  .sankofa-bird-rig[data-helping="true"][data-flying="true"]:not([data-battery-saver="true"])
    .sankofa-bird-chest {
    transform: rotate(3deg);
    transform-box: view-box;
    transform-origin: 20px 22px;
    transition: transform 0.5s ease-out;
  }

  /* Helping: egg emits gentle pulse (treasure being carried) */
  .sankofa-bird-rig[data-helping="true"]:not([data-battery-saver="true"])[data-zoom="mid"]
    .sankofa-bird-egg,
  .sankofa-bird-rig[data-helping="true"]:not([data-battery-saver="true"])[data-zoom="high"]
    .sankofa-bird-egg,
  .sankofa-bird-rig[data-helping="true"]:not([data-battery-saver="true"])[data-zoom="street"]
    .sankofa-bird-egg {
    animation: sankofa-egg-carry-pulse 3.0s ease-in-out infinite;
  }

  @keyframes sankofa-egg-carry-pulse {
    0%, 100% { filter: drop-shadow(0 0 2px rgba(0,212,255,0.4)); }
    50%       { filter: drop-shadow(0 0 5px rgba(0,212,255,0.7)) brightness(1.12); }
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 21.15 — Weather: Rain / Snow Feather Response
     Feathers ruffle more aggressively in rain/snow; body hunkered.
     data-weather="rain" OR data-weather="snow"
     ═══════════════════════════════════════════════════════════════════════ */

  /* Rain: primaries darken (wet feathers absorb light) */
  .sankofa-bird-rig[data-weather="rain"]:not([data-battery-saver="true"])
    .sankofa-bird-wing-right,
  .sankofa-bird-rig[data-weather="rain"]:not([data-battery-saver="true"])
    .sankofa-bird-wing-left {
    filter: brightness(0.82) saturate(0.75);
    transition: filter 0.8s ease-out;
  }
  .sankofa-bird-rig[data-weather="rain"]:not([data-battery-saver="true"])
    .sankofa-bird-body {
    filter: brightness(0.88) saturate(0.8);
    transition: filter 0.8s ease-out;
  }

  /* Snow: body brightens (snow reflects ambient) */
  .sankofa-bird-rig[data-weather="snow"]:not([data-battery-saver="true"])
    .sankofa-bird-body {
    filter: brightness(1.10) saturate(0.7);
    transition: filter 0.8s ease-out;
  }

  /* Rain/Snow: hunkered posture — head lower, tail up */
  .sankofa-bird-rig[data-weather="rain"]:not([data-battery-saver="true"])
    .sankofa-bird-head,
  .sankofa-bird-rig[data-weather="snow"]:not([data-battery-saver="true"])
    .sankofa-bird-head {
    rotate: calc(var(--gaze-rotate-deg, 0deg) + 8deg);
    transition: rotate 0.6s ease-out;
  }

  /* Rain: beak gloss visible (beak wet = shiny) */
  .sankofa-bird-rig[data-weather="rain"]:not([data-battery-saver="true"])[data-zoom="high"]
    .sankofa-beak-gloss,
  .sankofa-bird-rig[data-weather="rain"]:not([data-battery-saver="true"])[data-zoom="street"]
    .sankofa-beak-gloss {
    opacity: 0.55;
    transition: opacity 0.5s ease-out;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 21.16 — Trust Tier Wing Iridescence
     Higher trust tiers show richer iridescent overlay on wings.
     Pipeline: Adinkra/Kente patterns emerge at trusted+ tiers.
     Complements AdinkraOverlay.tsx (the SVG overlay shapes).
     ═══════════════════════════════════════════════════════════════════════ */

  /* Elder trust: deep golden iridescence on entire wing surface */
  .sankofa-bird-rig[data-trust-tier="elder"]:not([data-battery-saver="true"])[data-zoom="high"]
    .sankofa-bird-wing-right,
  .sankofa-bird-rig[data-trust-tier="elder"]:not([data-battery-saver="true"])[data-zoom="street"]
    .sankofa-bird-wing-right,
  .sankofa-bird-rig[data-trust-tier="elder"]:not([data-battery-saver="true"])[data-zoom="high"]
    .sankofa-bird-wing-left,
  .sankofa-bird-rig[data-trust-tier="elder"]:not([data-battery-saver="true"])[data-zoom="street"]
    .sankofa-bird-wing-left {
    filter: brightness(1.12) saturate(1.35) hue-rotate(-12deg);
    transition: filter 1.2s ease-out;
  }

  /* Trusted tier: subtle teal shimmer */
  .sankofa-bird-rig[data-trust-tier="trusted"]:not([data-battery-saver="true"])[data-zoom="high"]
    .sankofa-wing-covert-band-r,
  .sankofa-bird-rig[data-trust-tier="trusted"]:not([data-battery-saver="true"])[data-zoom="street"]
    .sankofa-wing-covert-band-r,
  .sankofa-bird-rig[data-trust-tier="trusted"]:not([data-battery-saver="true"])[data-zoom="high"]
    .sankofa-wing-covert-band-l,
  .sankofa-bird-rig[data-trust-tier="trusted"]:not([data-battery-saver="true"])[data-zoom="street"]
    .sankofa-wing-covert-band-l {
    opacity: 0.68;
    filter: brightness(1.18);
    transition: opacity 0.8s ease-out, filter 0.8s ease-out;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 21.17 — Accepted Micro-Reaction: Hop + Wing-Salute
     When data-accepted="true", a quick joyful hop + left-wing raise.
     ═══════════════════════════════════════════════════════════════════════ */

  .sankofa-bird-rig[data-accepted="true"]:not([data-battery-saver="true"])
    .sankofa-sme-wing-left-rig {
    animation: sankofa-wing-salute-accepted 0.55s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes sankofa-wing-salute-accepted {
    0%   { rotate: var(--sme-lwing-upper-deg, 0deg); }
    38%  { rotate: 32deg; }
    75%  { rotate: -6deg; }
    100% { rotate: var(--sme-lwing-upper-deg, 0deg); }
  }

  /* Accepted: egg brightens briefly */
  .sankofa-bird-rig[data-accepted="true"]:not([data-battery-saver="true"]) .sankofa-bird-egg {
    animation: sankofa-egg-accepted 0.7s ease-out;
  }

  @keyframes sankofa-egg-accepted {
    0%   { filter: none; }
    35%  { filter: brightness(1.6) drop-shadow(0 0 6px rgba(0,212,255,0.9)); }
    100% { filter: none; }
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 21.18 — Nearby User Wing Salute Enhancement
     Upgrades the existing wing-salute (Phase 9) with a brighter flash.
     ═══════════════════════════════════════════════════════════════════════ */

  .sankofa-bird-rig[data-nearby-user="true"]:not([data-battery-saver="true"])
    .sankofa-sme-wing-left-rig {
    animation: sankofa-nearby-salute 0.65s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .sankofa-bird-rig[data-nearby-user="true"]:not([data-battery-saver="true"])
    .sankofa-bird-wing-left {
    animation: sankofa-nearby-salute-glow 0.65s ease-out;
  }

  @keyframes sankofa-nearby-salute {
    0%   { rotate: var(--sme-lwing-upper-deg, 0deg); }
    40%  { rotate: 26deg; }
    80%  { rotate: -4deg; }
    100% { rotate: var(--sme-lwing-upper-deg, 0deg); }
  }

  @keyframes sankofa-nearby-salute-glow {
    0%   { filter: none; }
    40%  { filter: brightness(1.4) drop-shadow(0 0 5px rgba(0,212,255,0.75)); }
    100% { filter: none; }
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 21.19 — Battery-Saver: Suppress all Phase 21 effects
     ═══════════════════════════════════════════════════════════════════════ */

  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-chest,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-tail {
    transform: none !important;
    filter: none !important;
    animation: none !important;
    transition: none !important;
  }
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-tail-inner-left,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-tail-inner-right,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-tail-outer-left,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-tail-outer-right,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-tail-far-left,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-tail-far-right {
    rotate: 0deg !important;
    animation: none !important;
    transition: none !important;
  }
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-head {
    rotate: var(--gaze-rotate-deg, 0deg) !important;
    animation: none !important;
  }
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-front-view .sankofa-fv-wing-left,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-front-view .sankofa-fv-wing-right,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-back-view .sankofa-bv-wing-left,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-back-view .sankofa-bv-wing-right {
    rotate: none !important;
    animation: none !important;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 21.20 — prefers-reduced-motion guard for all Phase 21 effects
     ═══════════════════════════════════════════════════════════════════════ */

  @media (prefers-reduced-motion: reduce) {
    html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-chest,
    html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-tail {
      transform: none !important;
      filter: none !important;
      animation: none !important;
      transition: none !important;
    }
    html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-tail-inner-left,
    html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-tail-inner-right,
    html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-tail-outer-left,
    html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-tail-outer-right,
    html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-tail-far-left,
    html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-tail-far-right {
      rotate: 0deg !important;
      animation: none !important;
      transition: none !important;
    }
    html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-head {
      rotate: var(--gaze-rotate-deg, 0deg) !important;
      animation: none !important;
    }
    html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-fv-wing-left,
    html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-fv-wing-right,
    html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bv-wing-left,
    html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bv-wing-right {
      rotate: none !important;
      animation: none !important;
    }
  }
`;
