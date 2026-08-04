// Sankofa Bird CSS — Phase 12–13 | Real-time gaze system + full aerodynamics
// Auto-split from SankofaBirdSvg.tsx — edit here, not in the monolith

// prettier-ignore
export const sankofaCssPhase12to13 = `
        /* ══ Phase 12 — Real-time 8-direction gaze system ════════════════════════
           data-gaze attr is set by computeGazeVector() in sankofa-bird-math.ts.
           Values: forward | left | right | up | down | upleft | upright | downleft | downright
           Targets: iris (pupil position), head (tilt), neck (extend/retract), body (micro-roll).
           All transitions use ease-out for organic feel. Battery-saver: no gaze transforms. */

        /* ── Iris translation (eye tracking) ───────────────────────────────── */
        .sankofa-bird-rig[data-gaze="left"] .sankofa-bird-iris           { transform: translateX(-1.4px);  transition: transform 0.25s ease-out; }
        .sankofa-bird-rig[data-gaze="right"] .sankofa-bird-iris          { transform: translateX(1.4px);   transition: transform 0.25s ease-out; }
        .sankofa-bird-rig[data-gaze="up"] .sankofa-bird-iris             { transform: translateY(-1.2px);  transition: transform 0.25s ease-out; }
        .sankofa-bird-rig[data-gaze="down"] .sankofa-bird-iris           { transform: translateY(1.2px);   transition: transform 0.25s ease-out; }
        .sankofa-bird-rig[data-gaze="upleft"] .sankofa-bird-iris         { transform: translate(-1.0px, -0.9px); transition: transform 0.25s ease-out; }
        .sankofa-bird-rig[data-gaze="upright"] .sankofa-bird-iris        { transform: translate(1.0px, -0.9px);  transition: transform 0.25s ease-out; }
        .sankofa-bird-rig[data-gaze="downleft"] .sankofa-bird-iris       { transform: translate(-1.0px,  0.9px); transition: transform 0.25s ease-out; }
        .sankofa-bird-rig[data-gaze="downright"] .sankofa-bird-iris      { transform: translate(1.0px,  0.9px);  transition: transform 0.25s ease-out; }
        .sankofa-bird-rig[data-gaze="forward"] .sankofa-bird-iris        { transform: translate(0,0);    transition: transform 0.35s ease-out; }

        /* ── Same for catchlight (must track iris) ────────────────────────── */
        .sankofa-bird-rig[data-gaze="left"] .sankofa-bird-eye-catchlight           { transform: translateX(-1.4px);  transition: transform 0.25s ease-out; }
        .sankofa-bird-rig[data-gaze="right"] .sankofa-bird-eye-catchlight          { transform: translateX(1.4px);   transition: transform 0.25s ease-out; }
        .sankofa-bird-rig[data-gaze="up"] .sankofa-bird-eye-catchlight             { transform: translateY(-1.2px);  transition: transform 0.25s ease-out; }
        .sankofa-bird-rig[data-gaze="down"] .sankofa-bird-eye-catchlight           { transform: translateY(1.2px);   transition: transform 0.25s ease-out; }
        .sankofa-bird-rig[data-gaze="upleft"] .sankofa-bird-eye-catchlight         { transform: translate(-1.0px, -0.9px); transition: transform 0.25s ease-out; }
        .sankofa-bird-rig[data-gaze="upright"] .sankofa-bird-eye-catchlight        { transform: translate(1.0px, -0.9px);  transition: transform 0.25s ease-out; }
        .sankofa-bird-rig[data-gaze="downleft"] .sankofa-bird-eye-catchlight       { transform: translate(-1.0px,  0.9px); transition: transform 0.25s ease-out; }
        .sankofa-bird-rig[data-gaze="downright"] .sankofa-bird-eye-catchlight      { transform: translate(1.0px,  0.9px);  transition: transform 0.25s ease-out; }
        .sankofa-bird-rig[data-gaze="forward"] .sankofa-bird-eye-catchlight        { transform: translate(0,0);    transition: transform 0.35s ease-out; }

        /* ── Head tilt follows gaze (organic eye-head coupling) ───────────── */
        .sankofa-bird-rig:not([data-battery-saver="true"])[data-gaze="left"] .sankofa-bird-head {
          rotate: -8deg; transition: rotate 0.35s ease-out; }
        .sankofa-bird-rig:not([data-battery-saver="true"])[data-gaze="right"] .sankofa-bird-head {
          rotate: 8deg;  transition: rotate 0.35s ease-out; }
        .sankofa-bird-rig:not([data-battery-saver="true"])[data-gaze="up"] .sankofa-bird-head {
          rotate: -5deg; transition: rotate 0.35s ease-out; }
        .sankofa-bird-rig:not([data-battery-saver="true"])[data-gaze="down"] .sankofa-bird-head {
          rotate: 6deg;  transition: rotate 0.35s ease-out; }
        .sankofa-bird-rig:not([data-battery-saver="true"])[data-gaze="upleft"] .sankofa-bird-head {
          rotate: -6deg; transition: rotate 0.35s ease-out; }
        .sankofa-bird-rig:not([data-battery-saver="true"])[data-gaze="upright"] .sankofa-bird-head {
          rotate: 6deg;  transition: rotate 0.35s ease-out; }
        .sankofa-bird-rig:not([data-battery-saver="true"])[data-gaze="downleft"] .sankofa-bird-head {
          rotate: -5deg; transition: rotate 0.35s ease-out; }
        .sankofa-bird-rig:not([data-battery-saver="true"])[data-gaze="downright"] .sankofa-bird-head {
          rotate: 5deg;  transition: rotate 0.35s ease-out; }
        .sankofa-bird-rig[data-gaze="forward"] .sankofa-bird-head {
          rotate: 0deg; transition: rotate 0.45s ease-out; }

        /* ── Neck follows head (S-curve coupling) ─────────────────────────── */
        .sankofa-bird-rig:not([data-battery-saver="true"])[data-gaze="left"] .sankofa-bird-neck {
          rotate: 4deg;  transition: rotate 0.40s ease-out; }
        .sankofa-bird-rig:not([data-battery-saver="true"])[data-gaze="right"] .sankofa-bird-neck {
          rotate: -4deg; transition: rotate 0.40s ease-out; }
        .sankofa-bird-rig:not([data-battery-saver="true"])[data-gaze="up"] .sankofa-bird-neck {
          rotate: -3deg; transition: rotate 0.40s ease-out; }
        .sankofa-bird-rig:not([data-battery-saver="true"])[data-gaze="down"] .sankofa-bird-neck {
          rotate: 3deg;  transition: rotate 0.40s ease-out; }
        .sankofa-bird-rig:not([data-battery-saver="true"])[data-gaze="upleft"] .sankofa-bird-neck {
          rotate: 2deg;  transition: rotate 0.40s ease-out; }
        .sankofa-bird-rig:not([data-battery-saver="true"])[data-gaze="upright"] .sankofa-bird-neck {
          rotate: -2deg; transition: rotate 0.40s ease-out; }
        /* FIX (July 2026): downleft and downright neck S-curve rules were missing.
           The gaze system had iris/catchlight/head rules for all 8 directions but
           the neck only covered 6 of 8 -- diagonal-down gazes left the neck frozen
           at its previous rotate: value instead of following the head downward. */
        .sankofa-bird-rig:not([data-battery-saver="true"])[data-gaze="downleft"] .sankofa-bird-neck {
          rotate: 2deg;  transition: rotate 0.40s ease-out; }
        .sankofa-bird-rig:not([data-battery-saver="true"])[data-gaze="downright"] .sankofa-bird-neck {
          rotate: -2deg; transition: rotate 0.40s ease-out; }
        .sankofa-bird-rig[data-gaze="forward"] .sankofa-bird-neck {
          rotate: 0deg; transition: rotate 0.50s ease-out; }

        /* ── Body micro-roll syncs with strong gaze directions ────────────── */
        .sankofa-bird-rig:not([data-battery-saver="true"])[data-gaze="left"] .sankofa-bird-body {
          rotate: -2deg; transition: rotate 0.45s ease-out; }
        .sankofa-bird-rig:not([data-battery-saver="true"])[data-gaze="right"] .sankofa-bird-body {
          rotate: 2deg;  transition: rotate 0.45s ease-out; }
        .sankofa-bird-rig[data-gaze="forward"] .sankofa-bird-body {
          rotate: 0deg; transition: rotate 0.55s ease-out; }

        /* Suppress gaze during battery-saver — no overhead transforms */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-iris,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-eye-catchlight {
          transform: translate(0,0) !important; transition: none !important; }

        /* Suppress gaze head/neck during upcoming-turn (that animation takes precedence) */
        .sankofa-bird-rig[data-upcoming-turn="left"] .sankofa-bird-head,
        .sankofa-bird-rig[data-upcoming-turn="right"] .sankofa-bird-head,
        .sankofa-bird-rig[data-upcoming-turn="left"] .sankofa-bird-neck,
        .sankofa-bird-rig[data-upcoming-turn="right"] .sankofa-bird-neck {
          /* upcoming-turn rotate: takes priority; gaze rotate: would stack —
             reset to neutral so gaze body-micro-roll doesn't compound */
          /* NOTE: the upcoming-turn rules use rotate: with !important already;
             gaze rotate: is plain (no !important) so specificity is fine. */ }

        /* Reduced-motion: suppress gaze head/neck/body, keep iris shift (informational) */
        @media (prefers-reduced-motion: reduce) {
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-head { rotate: 0deg !important; }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-neck { rotate: 0deg !important; }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-body { rotate: 0deg !important; }
        }

        /* ══ Gap-closure block — 10 remaining Phase-12 audit items ══════════════

           G1: Duplicate sankofa-legs-dangle keyframe
           RESOLVED: Only one definition exists in the file. No fix needed.

           G2: Shadow state coloring ──────────────────────────────────────── */
        @keyframes sankofa-shadow-gold-pulse {
          0%,100% { filter: drop-shadow(0 4px 8px rgba(212,175,55,0.35)); }
          50%      { filter: drop-shadow(0 4px 12px rgba(212,175,55,0.55)); }
        }
        @keyframes sankofa-shadow-teal-pulse {
          0%,100% { filter: drop-shadow(0 3px 7px rgba(0,200,200,0.30)); }
          50%      { filter: drop-shadow(0 3px 10px rgba(0,200,200,0.50)); }
        }
        /* Gold shadow when helping — warm grounded presence */
        .sankofa-bird-rig[data-helping="true"]:not([data-battery-saver="true"]) .sankofa-bird-shadow {
          animation: sankofa-shadow-gold-pulse 2.6s ease-in-out infinite;
        }
        /* Teal shadow during celebration — already had a drop-shadow, consolidate here */
        .sankofa-bird-rig[data-celebrating="true"]:not([data-battery-saver="true"]) .sankofa-bird-shadow {
          animation: sankofa-shadow-teal-pulse 1.4s ease-in-out infinite !important;
        }

        /* G3: data-upcoming-turn body lean anticipation ──────────────────── */
        /* Body leans slightly INTO the turn (weight-shift before banking) */
        .sankofa-bird-rig[data-upcoming-turn="left"][data-flying="true"]:not([data-battery-saver="true"]) .sankofa-bird-body {
          rotate: -3deg; transition: rotate 0.6s ease-out;
        }
        .sankofa-bird-rig[data-upcoming-turn="right"][data-flying="true"]:not([data-battery-saver="true"]) .sankofa-bird-body {
          rotate: 3deg;  transition: rotate 0.6s ease-out;
        }
        /* Outside wing pre-extends slightly (reaches toward the turn arc) */
        .sankofa-bird-rig[data-upcoming-turn="left"][data-flying="true"]:not([data-battery-saver="true"]) .sankofa-bird-wing-right {
          transform-origin: 30% 50%;
          rotate: 4deg;  transition: rotate 0.5s ease-out;
        }
        .sankofa-bird-rig[data-upcoming-turn="right"][data-flying="true"]:not([data-battery-saver="true"]) .sankofa-bird-wing-left {
          transform-origin: 70% 50%;
          rotate: -4deg; transition: rotate 0.5s ease-out;
        }

        /* G4: Gliding thermal lift — body rises slightly on updraft ─────── */
        @keyframes sankofa-thermal-lift {
          0%,100% { translate: 0 0; }
          50%      { translate: 0 -2.5px; }
        }
        .sankofa-bird-rig[data-gliding="true"]:not([data-battery-saver="true"]) .sankofa-bird-body {
          animation: sankofa-thermal-lift 4.0s ease-in-out infinite;
        }

        /* G5: Eye iris micro-saccade on notification ─────────────────────── */
        @keyframes sankofa-iris-alert-saccade {
          0%           { transform: translate(0, 0); }
          15%          { transform: translate(1.8px, -0.8px); }
          30%          { transform: translate(-1.6px, 0.4px); }
          50%          { transform: translate(1.2px, 1.0px); }
          70%          { transform: translate(-0.8px, -1.2px); }
          85%          { transform: translate(0.6px, 0.4px); }
          100%         { transform: translate(0, 0); }
        }
        .sankofa-bird-rig[data-notification="true"]:not([data-battery-saver="true"]) .sankofa-bird-iris {
          animation: sankofa-iris-alert-saccade 0.9s ease-in-out forwards !important;
        }
        .sankofa-bird-rig[data-notification="true"]:not([data-battery-saver="true"]) .sankofa-bird-eye-catchlight {
          animation: sankofa-iris-alert-saccade 0.9s ease-in-out forwards !important;
        }

        /* G6: Per-feather ambient micro-oscillations during flight ─────────
           Each primary feather oscillates at a slightly different period creating
           a living feather-bed effect at street/high zoom during flight. */
        @keyframes sankofa-feather-microwave-a { 0%,100%{rotate:0deg} 50%{rotate:0.5deg} }
        @keyframes sankofa-feather-microwave-b { 0%,100%{rotate:0deg} 50%{rotate:-0.6deg} }
        @keyframes sankofa-feather-microwave-c { 0%,100%{rotate:0deg} 50%{rotate:0.4deg} }
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"]:not([data-battery-saver="true"]) .sankofa-feather-l1,
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"]:not([data-battery-saver="true"]) .sankofa-feather-r1 {
          animation: sankofa-feather-microwave-a 1.7s ease-in-out infinite;
        }
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"]:not([data-battery-saver="true"]) .sankofa-feather-l2,
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"]:not([data-battery-saver="true"]) .sankofa-feather-r2 {
          animation: sankofa-feather-microwave-b 2.1s ease-in-out infinite 0.3s;
        }
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"]:not([data-battery-saver="true"]) .sankofa-feather-l3,
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"]:not([data-battery-saver="true"]) .sankofa-feather-r3 {
          animation: sankofa-feather-microwave-c 1.9s ease-in-out infinite 0.6s;
        }

        /* G7: Pre-bank leading-edge feather compression ──────────────────── */
        /* Inside-turn primaries compress (feathers flatten against airflow).
           FIX (July 2026): original keyframe used bare CSS property shorthand
           (scaleX:0.82) which is NOT valid CSS -- browsers silently ignore it
           and the entire animation produces no visual change. Correct form is
           transform: scaleX(0.82). transform-box/origin added to selectors so
           the scale pivots from each feather's own center, not the SVG viewport. */
        @keyframes sankofa-feather-compress {
          0%, 100% { transform: scaleX(1.0);  }
          50%       { transform: scaleX(0.82); }
        }
        .sankofa-bird-rig[data-upcoming-turn="left"][data-flying="true"]:not([data-battery-saver="true"]) .sankofa-feather-l1,
        .sankofa-bird-rig[data-upcoming-turn="left"][data-flying="true"]:not([data-battery-saver="true"]) .sankofa-feather-l2 {
          animation: sankofa-feather-compress 0.6s ease-out forwards;
          transform-box: view-box;
          transform-origin: 50% 50%;
        }
        .sankofa-bird-rig[data-upcoming-turn="right"][data-flying="true"]:not([data-battery-saver="true"]) .sankofa-feather-r1,
        .sankofa-bird-rig[data-upcoming-turn="right"][data-flying="true"]:not([data-battery-saver="true"]) .sankofa-feather-r2 {
          animation: sankofa-feather-compress 0.6s ease-out forwards;
          transform-box: view-box;
          transform-origin: 50% 50%;
        }

        /* G8: Helping state at low zoom ──────────────────────────────────── */
        /* Minimal gold tint visible even at city scale (data-zoom="low") */
        .sankofa-bird-rig[data-helping="true"][data-zoom="low"] .sankofa-glow-layer {
          opacity: 0.22;
          filter: hue-rotate(-30deg) saturate(1.4) brightness(1.1);
          transition: opacity 0.6s ease, filter 0.6s ease;
        }
        @keyframes sankofa-helping-low-pulse {
          0%,100% { opacity: 0.18; }
          50%      { opacity: 0.30; }
        }
        .sankofa-bird-rig[data-helping="true"][data-zoom="low"]:not([data-battery-saver="true"]) .sankofa-glow-layer {
          animation: sankofa-helping-low-pulse 2.8s ease-in-out infinite;
        }

        /* G9: Speed-correlated crown sway ───────────────────────────────── */
        /* Slow sway at walking speed, progressively faster at driving/airplane */
        .sankofa-bird-rig[data-speed="walking"][data-zoom="high"] .sankofa-crown-feather,
        .sankofa-bird-rig[data-speed="walking"][data-zoom="street"] .sankofa-crown-feather {
          animation-duration: 4.5s !important;
        }
        .sankofa-bird-rig[data-speed="running"][data-zoom="high"] .sankofa-crown-feather,
        .sankofa-bird-rig[data-speed="running"][data-zoom="street"] .sankofa-crown-feather {
          animation-duration: 3.0s !important;
        }
        .sankofa-bird-rig[data-speed="driving"][data-zoom="high"] .sankofa-crown-feather,
        .sankofa-bird-rig[data-speed="driving"][data-zoom="street"] .sankofa-crown-feather {
          animation-duration: 1.4s !important;
        }
        .sankofa-bird-rig[data-speed="airplane"][data-zoom="high"] .sankofa-crown-feather,
        .sankofa-bird-rig[data-speed="airplane"][data-zoom="street"] .sankofa-crown-feather {
          animation-duration: 0.7s !important;
        }

        /* G10: Upcoming-turn wing pre-extension (actual translate+rotate) ── */
        /* Outside wing reaches outward — aerodynamic roll-initiation gesture */
        @keyframes sankofa-wing-preextend { 0%{translate:0 0;rotate:0deg} 100%{translate:2px 0;rotate:-5deg} }
        .sankofa-bird-rig[data-upcoming-turn="left"][data-flying="true"]:not([data-battery-saver="true"]) .sankofa-bird-wing-right {
          animation: sankofa-wing-preextend 0.5s ease-out forwards !important;
        }
        @keyframes sankofa-wing-preextend-r { 0%{translate:0 0;rotate:0deg} 100%{translate:-2px 0;rotate:5deg} }
        .sankofa-bird-rig[data-upcoming-turn="right"][data-flying="true"]:not([data-battery-saver="true"]) .sankofa-bird-wing-left {
          animation: sankofa-wing-preextend-r 0.5s ease-out forwards !important;
        }

        /* =====================================================================
           PHASE 13 -- FULL AUTHENTIC AERODYNAMICS (July 2026)

           P13.1  Figure-8 wing stroke (oval downstroke + shallower upstroke)
           P13.2  WAIR -- Wing-Assisted Incline Running
           P13.3  Dynamic soaring (albatross dive-climb energy exchange)
           P13.4  Mating display (pivot, wing fan, head bow, tail spread)
           P13.5  Hover wrist rotation (lift on both strokes)
           P13.6  Individual knee articulation (tibiotarsus-tarsometatarsus)
           P13.7  Murmuration iridescence wave (driving speed)
           P13.8  Full body gaze chain (shoulder + tail on lateral gaze)
           P13.9  Leading-edge feather slot (takeoff/hover deceleration)
           P13.10 Head stabilization in WAIR
           P13.11 Knee joint visibility system
           P13.12 Wrist stroke pulse at street zoom
           ===================================================================== */

        /* -- P13.1: Figure-8 wing stroke ------------------------------------ */
        @keyframes sankofa-figure8-left {
          0%   { transform: rotate(-32deg); }
          28%  { transform: rotate(-14deg) translateX(-1.2px) translateY(1.2px); }
          55%  { transform: rotate(16deg)  translateX(0.5px)  translateY(-0.6px); }
          78%  { transform: rotate(19deg)  translateX(0.2px)  translateY(-0.2px); }
          100% { transform: rotate(-32deg); }
        }
        @keyframes sankofa-figure8-right {
          0%   { transform: rotate(32deg); }
          28%  { transform: rotate(14deg)  translateX(1.2px) translateY(1.2px); }
          55%  { transform: rotate(-16deg) translateX(-0.5px) translateY(-0.6px); }
          78%  { transform: rotate(-19deg) translateX(-0.2px) translateY(-0.2px); }
          100% { transform: rotate(32deg); }
        }
        .sankofa-bird-rig[data-flying="true"][data-speed="running"]:not([data-battery-saver="true"]):not([data-wair="true"]):not([data-soaring="true"]) .sankofa-bird-wing-left {
          animation: sankofa-figure8-left var(--flap-period, 450ms) ease-in-out infinite !important;
        }
        .sankofa-bird-rig[data-flying="true"][data-speed="running"]:not([data-battery-saver="true"]):not([data-wair="true"]):not([data-soaring="true"]) .sankofa-bird-wing-right {
          /* delay embedded in shorthand — a bare animation-delay after !important is silently ignored */
          animation: sankofa-figure8-right var(--flap-period, 450ms) ease-in-out 18ms infinite !important;
        }
        .sankofa-bird-rig[data-flying="true"][data-speed="driving"]:not([data-battery-saver="true"]):not([data-wair="true"]):not([data-soaring="true"]) .sankofa-bird-wing-left {
          animation: sankofa-figure8-left var(--flap-period, 200ms) ease-in-out infinite !important;
        }
        .sankofa-bird-rig[data-flying="true"][data-speed="driving"]:not([data-battery-saver="true"]):not([data-wair="true"]):not([data-soaring="true"]) .sankofa-bird-wing-right {
          /* delay embedded in shorthand — a bare animation-delay after !important is silently ignored */
          animation: sankofa-figure8-right var(--flap-period, 200ms) ease-in-out 18ms infinite !important;
        }

        /* -- P13.2: WAIR -- Wing-Assisted Incline Running ------------------- */
        @keyframes sankofa-wair-body {
          0%,100% { transform: rotate(28deg)  translateY(1px); }
          40%      { transform: rotate(30deg)  translateY(-1px); }
          70%      { transform: rotate(26deg)  translateY(2px); }
        }
        @keyframes sankofa-wair-wing-left {
          0%   { transform: rotate(-46deg); }
          25%  { transform: rotate(-22deg) translateY(-3px); }
          50%  { transform: rotate(-52deg) translateY(1px); }
          75%  { transform: rotate(-20deg) translateY(-2.5px); }
          100% { transform: rotate(-46deg); }
        }
        @keyframes sankofa-wair-wing-right {
          0%   { transform: rotate(46deg); }
          25%  { transform: rotate(22deg)  translateY(-3px); }
          50%  { transform: rotate(52deg)  translateY(1px); }
          75%  { transform: rotate(20deg)  translateY(-2.5px); }
          100% { transform: rotate(46deg); }
        }
        @keyframes sankofa-wair-legs {
          0%,100% { transform: skewX(-9deg) translateY(-2px); }
          50%      { transform: skewX(9deg)  translateY(-1px); }
        }
        @keyframes sankofa-wair-head {
          0%,100% { transform: rotate(-6deg) translateY(-0.5px); }
          50%      { transform: rotate(-5deg) translateY(0.5px); }
        }
        .sankofa-bird-rig[data-wair="true"]:not([data-battery-saver="true"]) .sankofa-bird-body {
          animation: sankofa-wair-body 0.28s ease-in-out infinite !important;
        }
        .sankofa-bird-rig[data-wair="true"]:not([data-battery-saver="true"]) .sankofa-bird-wing-left {
          animation: sankofa-wair-wing-left 0.22s linear infinite !important;
        }
        .sankofa-bird-rig[data-wair="true"]:not([data-battery-saver="true"]) .sankofa-bird-wing-right {
          /* delay embedded in shorthand — a bare animation-delay after !important is silently ignored */
          animation: sankofa-wair-wing-right 0.22s linear 18ms infinite !important;
        }
        .sankofa-bird-rig[data-wair="true"]:not([data-battery-saver="true"]) .sankofa-bird-legs {
          animation: sankofa-wair-legs 0.22s ease-in-out infinite !important;
        }
        .sankofa-bird-rig[data-wair="true"]:not([data-battery-saver="true"]) .sankofa-bird-head {
          animation: sankofa-wair-head 0.44s ease-in-out infinite !important;
          transform-box: view-box;
          transform-origin: 12px 16px;
        }

        /* -- P13.3: Dynamic soaring (albatross) ------------------------------ */
        @keyframes sankofa-soar-body {
          0%   { transform: rotate(18deg)  translateY(3px); }
          20%  { transform: rotate(12deg)  translateY(4px); }
          35%  { transform: rotate(-2deg)  translateY(0px); }
          55%  { transform: rotate(-12deg) translateY(-4px); }
          70%  { transform: rotate(-8deg)  translateY(-2px); }
          85%  { transform: rotate(5deg)   translateY(1px); }
          100% { transform: rotate(18deg)  translateY(3px); }
        }
        @keyframes sankofa-soar-wing-left {
          0%   { transform: rotate(-10deg); }
          20%  { transform: rotate(-8deg); }
          35%  { transform: rotate(-24deg); }
          55%  { transform: rotate(-28deg); }
          70%  { transform: rotate(-20deg); }
          85%  { transform: rotate(-14deg); }
          100% { transform: rotate(-10deg); }
        }
        @keyframes sankofa-soar-wing-right {
          0%   { transform: rotate(10deg); }
          20%  { transform: rotate(8deg); }
          35%  { transform: rotate(24deg); }
          55%  { transform: rotate(28deg); }
          70%  { transform: rotate(20deg); }
          85%  { transform: rotate(14deg); }
          100% { transform: rotate(10deg); }
        }
        @keyframes sankofa-soar-tail {
          0%   { transform: rotate(8deg)  skewX(4deg); }
          30%  { transform: rotate(-2deg) skewX(0deg); }
          60%  { transform: rotate(-8deg) skewX(-4deg); }
          100% { transform: rotate(8deg)  skewX(4deg); }
        }
        @keyframes sankofa-soar-head {
          0%,100% { transform: rotate(12deg)  translateY(1px); }
          50%      { transform: rotate(-6deg) translateY(-1.5px); }
        }
        .sankofa-bird-rig[data-soaring="true"]:not([data-battery-saver="true"]) .sankofa-bird-body {
          animation: sankofa-soar-body 4.2s ease-in-out infinite !important;
        }
        .sankofa-bird-rig[data-soaring="true"]:not([data-battery-saver="true"]) .sankofa-bird-wing-left {
          animation: sankofa-soar-wing-left 4.2s ease-in-out infinite !important;
        }
        .sankofa-bird-rig[data-soaring="true"]:not([data-battery-saver="true"]) .sankofa-bird-wing-right {
          animation: sankofa-soar-wing-right 4.2s ease-in-out infinite !important;
        }
        .sankofa-bird-rig[data-soaring="true"]:not([data-battery-saver="true"]) .sankofa-bird-tail {
          animation: sankofa-soar-tail 4.2s ease-in-out infinite !important;
        }
        .sankofa-bird-rig[data-soaring="true"]:not([data-battery-saver="true"]) .sankofa-bird-head {
          animation: sankofa-soar-head 4.2s ease-in-out infinite !important;
          transform-box: view-box;
          transform-origin: 12px 16px;
        }

        /* -- P13.4: Mating display ------------------------------------------- */
        @keyframes sankofa-mating-body {
          0%   { transform: rotate(-8deg)  translateX(-1.5px) scaleY(0.96); }
          15%  { transform: rotate(0deg)   translateX(0px)    scaleY(1.04); }
          28%  { transform: rotate(9deg)   translateX(1.5px)  scaleY(0.96); }
          42%  { transform: rotate(0deg)   translateX(0px)    scaleY(1.06); }
          56%  { transform: rotate(-10deg) translateX(-2px)   scaleY(0.93); }
          68%  { transform: rotate(0deg)   translateX(0px)    scaleY(1.02); }
          82%  { transform: rotate(12deg)  translateX(2.5px)  scaleY(0.95); }
          100% { transform: rotate(-8deg)  translateX(-1.5px) scaleY(0.96); }
        }
        @keyframes sankofa-mating-wing-left {
          0%   { transform: rotate(10deg); }
          20%  { transform: rotate(-55deg) scaleX(0.84); }
          36%  { transform: rotate(-40deg); }
          52%  { transform: rotate(-62deg) scaleX(0.80); }
          66%  { transform: rotate(-34deg); }
          82%  { transform: rotate(-52deg) scaleX(0.82); }
          100% { transform: rotate(10deg); }
        }
        @keyframes sankofa-mating-wing-right {
          0%   { transform: rotate(-10deg); }
          20%  { transform: rotate(55deg)  scaleX(0.84); }
          36%  { transform: rotate(40deg); }
          52%  { transform: rotate(62deg)  scaleX(0.80); }
          66%  { transform: rotate(34deg); }
          82%  { transform: rotate(52deg)  scaleX(0.82); }
          100% { transform: rotate(-10deg); }
        }
        @keyframes sankofa-mating-head {
          0%   { transform: rotate(-16deg) translateY(-2px); }
          16%  { transform: rotate(6deg)   translateY(1.5px); }
          30%  { transform: rotate(-22deg) translateY(-3px); }
          50%  { transform: rotate(9deg)   translateY(2px); }
          64%  { transform: rotate(-12deg) translateY(-1px); }
          82%  { transform: rotate(4deg)   translateY(0.5px); }
          100% { transform: rotate(-16deg) translateY(-2px); }
        }
        @keyframes sankofa-mating-tail {
          0%,100% { transform: rotate(-6deg) scaleX(1.0); }
          32%      { transform: rotate(6deg)  scaleX(1.28); }
          62%      { transform: rotate(-9deg) scaleX(1.32); }
        }
        @keyframes sankofa-mating-legs {
          0%,100% { transform: skewX(-10deg) translateY(1px); }
          25%      { transform: skewX(10deg)  translateY(0px); }
          50%      { transform: skewX(-6deg)  translateY(2px); }
          75%      { transform: skewX(8deg)   translateY(0.5px); }
        }
        .sankofa-bird-rig[data-mating="true"]:not([data-battery-saver="true"]) .sankofa-bird-body {
          animation: sankofa-mating-body 1.6s ease-in-out infinite !important;
        }
        .sankofa-bird-rig[data-mating="true"]:not([data-battery-saver="true"]) .sankofa-bird-wing-left {
          animation: sankofa-mating-wing-left 1.6s ease-in-out infinite !important;
        }
        .sankofa-bird-rig[data-mating="true"]:not([data-battery-saver="true"]) .sankofa-bird-wing-right {
          /* delay embedded in shorthand — a bare animation-delay after !important is silently ignored */
          animation: sankofa-mating-wing-right 1.6s ease-in-out 18ms infinite !important;
        }
        .sankofa-bird-rig[data-mating="true"]:not([data-battery-saver="true"]) .sankofa-bird-head {
          animation: sankofa-mating-head 1.6s ease-in-out infinite !important;
          transform-box: view-box;
          transform-origin: 12px 16px;
        }
        .sankofa-bird-rig[data-mating="true"]:not([data-battery-saver="true"]) .sankofa-bird-tail {
          animation: sankofa-mating-tail 1.6s ease-in-out infinite !important;
        }
        .sankofa-bird-rig[data-mating="true"]:not([data-battery-saver="true"]) .sankofa-bird-legs {
          animation: sankofa-mating-legs 0.8s ease-in-out infinite !important;
        }
        .sankofa-bird-rig[data-mating="true"][data-zoom="high"]:not([data-battery-saver="true"]) .sankofa-crown-feather,
        .sankofa-bird-rig[data-mating="true"][data-zoom="street"]:not([data-battery-saver="true"]) .sankofa-crown-feather {
          filter: hue-rotate(-18deg) saturate(2.0) brightness(1.5) !important;
          animation-duration: 0.8s !important;
        }

        /* -- P13.5: Hover wrist rotation (lift on both strokes) -------------- */
        @keyframes sankofa-hover-wrist-left {
          0%   { transform: rotate(-44deg) scaleX(0.84); }
          22%  { transform: rotate(-18deg) scaleX(1.06) translateY(-2.5px); }
          46%  { transform: rotate(10deg)  scaleX(0.88) translateY(-0.5px); }
          68%  { transform: rotate(-26deg) scaleX(1.04) translateY(1px); }
          100% { transform: rotate(-44deg) scaleX(0.84); }
        }
        @keyframes sankofa-hover-wrist-right {
          0%   { transform: rotate(44deg)  scaleX(0.84); }
          22%  { transform: rotate(18deg)  scaleX(1.06) translateY(-2.5px); }
          46%  { transform: rotate(-10deg) scaleX(0.88) translateY(-0.5px); }
          68%  { transform: rotate(26deg)  scaleX(1.04) translateY(1px); }
          100% { transform: rotate(44deg)  scaleX(0.84); }
        }
        .sankofa-bird-rig[data-landing="hover"]:not([data-battery-saver="true"]) .sankofa-bird-wing-left {
          animation: sankofa-hover-wrist-left 680ms ease-in-out infinite !important;
        }
        .sankofa-bird-rig[data-landing="hover"]:not([data-battery-saver="true"]) .sankofa-bird-wing-right {
          animation: sankofa-hover-wrist-right calc(680ms + 18ms) ease-in-out infinite !important;
        }
        .sankofa-bird-rig[data-landing="hover"]:not([data-battery-saver="true"]) .sankofa-bird-wing-left-feathers {
          /* delay embedded in shorthand — a subsequent animation-delay is ignored when animation has !important */
          animation: sankofa-hover-wrist-left 680ms ease-in-out 48ms infinite !important;
        }
        .sankofa-bird-rig[data-landing="hover"]:not([data-battery-saver="true"]) .sankofa-bird-wing-right-feathers {
          animation: sankofa-hover-wrist-right calc(680ms + 18ms) ease-in-out 48ms infinite !important;
        }

        /* -- P13.6: Individual knee articulation ----------------------------- */
        @keyframes sankofa-knee-bob-left {
          0%,100% { transform: rotate(-5deg)  translateY(0px); }
          32%      { transform: rotate(-13deg) translateY(2px); }
          56%      { transform: rotate(2deg)   translateY(-1px); }
          76%      { transform: rotate(-4deg)  translateY(0.5px); }
        }
        @keyframes sankofa-knee-bob-right {
          0%,100% { transform: rotate(5deg)   translateY(0px); }
          32%      { transform: rotate(13deg)  translateY(2px); }
          56%      { transform: rotate(-2deg)  translateY(-1px); }
          76%      { transform: rotate(4deg)   translateY(0.5px); }
        }
        @keyframes sankofa-knee-land-impact {
          0%   { transform: rotate(0deg)   translateY(0px); }
          14%  { transform: rotate(-20deg) translateY(5px); }
          40%  { transform: rotate(-10deg) translateY(2px); }
          100% { transform: rotate(0deg)   translateY(0px); }
        }
        @keyframes sankofa-knee-takeoff {
          0%   { transform: rotate(-15deg) translateY(3px); }
          35%  { transform: rotate(-28deg) translateY(6px); }
          65%  { transform: rotate(8deg)   translateY(-2px); }
          100% { transform: rotate(0deg)   translateY(0px); }
        }
        .sankofa-bird-rig[data-flying="true"][data-speed="walking"]:not([data-battery-saver="true"]) .sankofa-leg-left {
          animation: sankofa-knee-bob-left 0.9s ease-in-out infinite !important;
        }
        .sankofa-bird-rig[data-flying="true"][data-speed="walking"]:not([data-battery-saver="true"]) .sankofa-leg-right {
          /* delay in shorthand — animation-delay is overridden when animation has !important */
          animation: sankofa-knee-bob-right 0.9s ease-in-out 0.45s infinite !important;
        }
        .sankofa-bird-rig[data-flying="true"][data-speed="running"]:not([data-battery-saver="true"]) .sankofa-leg-left {
          animation: sankofa-knee-bob-left 0.45s ease-in-out infinite !important;
        }
        .sankofa-bird-rig[data-flying="true"][data-speed="running"]:not([data-battery-saver="true"]) .sankofa-leg-right {
          animation: sankofa-knee-bob-right 0.45s ease-in-out 0.225s infinite !important;
        }
        .sankofa-bird-rig[data-landing="perch"]:not([data-battery-saver="true"]) .sankofa-leg-left,
        .sankofa-bird-rig[data-landing="perch"]:not([data-battery-saver="true"]) .sankofa-leg-right {
          animation: sankofa-knee-land-impact 0.6s ease-out 1 !important;
        }
        .sankofa-bird-rig[data-landing="takeoff"]:not([data-battery-saver="true"]) .sankofa-leg-left,
        .sankofa-bird-rig[data-landing="takeoff"]:not([data-battery-saver="true"]) .sankofa-leg-right {
          animation: sankofa-knee-takeoff 1.2s ease-in-out forwards !important;
        }

        /* P13.11: Knee joint dot visibility */
        .sankofa-knee-joint { opacity: 0; transition: opacity 0.3s ease; }
        .sankofa-bird-rig[data-zoom="mid"]:not([data-battery-saver="true"]) .sankofa-knee-joint { opacity: 0.32; }
        .sankofa-bird-rig[data-zoom="high"]:not([data-battery-saver="true"]) .sankofa-knee-joint,
        .sankofa-bird-rig[data-zoom="street"]:not([data-battery-saver="true"]) .sankofa-knee-joint { opacity: 0.52; }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-knee-joint { opacity: 0 !important; }
        @keyframes sankofa-knee-flex-pulse {
          0%,100% { opacity: 0.52; transform: scale(1); }
          42%      { opacity: 0.78; transform: scale(1.35); }
        }
        .sankofa-bird-rig[data-landing="perch"][data-zoom="high"]:not([data-battery-saver="true"]) .sankofa-knee-joint,
        .sankofa-bird-rig[data-landing="perch"][data-zoom="street"]:not([data-battery-saver="true"]) .sankofa-knee-joint {
          animation: sankofa-knee-flex-pulse 0.6s ease-out 1;
        }

        /* -- P13.7: Murmuration iridescence wave at driving speed ------------ */
        /* Keyframe includes micro-transform oscillation so feather motion is
           preserved even though the !important replaces the previous feather anim */
        @keyframes sankofa-murmur-wave {
          0%    { filter: hue-rotate(0deg)   brightness(1.0);  transform: rotate(0deg)    translateY(0px); }
          28%   { filter: hue-rotate(18deg)  brightness(1.18); transform: rotate(0.5deg)  translateY(0.4px); }
          52%   { filter: hue-rotate(32deg)  brightness(1.0);  transform: rotate(-0.3deg) translateY(0.2px); }
          76%   { filter: hue-rotate(12deg)  brightness(1.10); transform: rotate(0.4deg)  translateY(0.3px); }
          100%  { filter: hue-rotate(0deg)   brightness(1.0);  transform: rotate(0deg)    translateY(0px); }
        }
        .sankofa-bird-rig[data-flying="true"][data-speed="driving"]:not([data-battery-saver="true"]) .sankofa-bird-wing-left-feathers {
          animation: sankofa-murmur-wave 1.9s ease-in-out infinite !important;
        }
        .sankofa-bird-rig[data-flying="true"][data-speed="driving"]:not([data-battery-saver="true"]) .sankofa-bird-wing-right-feathers {
          /* delay embedded in shorthand — animation-delay is overridden when animation has !important */
          animation: sankofa-murmur-wave 1.9s ease-in-out 0.95s infinite !important;
        }

        /* -- P13.8: Full body gaze chain -- shoulder + tail on lateral gaze --
           Uses individual rotate: property — gated by @supports per codebase
           convention (Safari 14.1+ compat). Without support, gaze chain is
           silently omitted; earlier phases still drive head/neck gaze. */
        @supports (rotate: 0deg) {
          .sankofa-bird-rig:not([data-battery-saver="true"])[data-gaze="left"]:not([data-flying="true"]) .sankofa-bird-wing-left {
            rotate: 5deg; transition: rotate 0.5s ease-out;
          }
          .sankofa-bird-rig:not([data-battery-saver="true"])[data-gaze="right"]:not([data-flying="true"]) .sankofa-bird-wing-right {
            rotate: -5deg; transition: rotate 0.5s ease-out;
          }
          .sankofa-bird-rig:not([data-battery-saver="true"])[data-gaze="left"]:not([data-flying="true"]) .sankofa-bird-tail {
            rotate: 3deg; transition: rotate 0.55s ease-out;
          }
          .sankofa-bird-rig:not([data-battery-saver="true"])[data-gaze="right"]:not([data-flying="true"]) .sankofa-bird-tail {
            rotate: -3deg; transition: rotate 0.55s ease-out;
          }
          .sankofa-bird-rig[data-gaze="forward"]:not([data-flying="true"]) .sankofa-bird-wing-left,
          .sankofa-bird-rig[data-gaze="forward"]:not([data-flying="true"]) .sankofa-bird-wing-right {
            rotate: 0deg; transition: rotate 0.6s ease-out;
          }
          .sankofa-bird-rig[data-gaze="forward"]:not([data-flying="true"]) .sankofa-bird-tail {
            rotate: 0deg; transition: rotate 0.65s ease-out;
          }
        }

        /* -- P13.9: Leading-edge feather slot on takeoff/hover --------------- */
        @keyframes sankofa-slot-open {
          0%   { opacity: 0.85; transform: translateX(0) translateY(0); }
          40%  { opacity: 0.52; transform: translateX(0.9px) translateY(-0.6px); }
          72%  { opacity: 0.72; transform: translateX(0.4px) translateY(-0.2px); }
          100% { opacity: 0.85; transform: translateX(0) translateY(0); }
        }
        .sankofa-bird-rig[data-landing="takeoff"]:not([data-battery-saver="true"]) .sankofa-feather-l0,
        .sankofa-bird-rig[data-landing="takeoff"]:not([data-battery-saver="true"]) .sankofa-feather-l1 {
          animation: sankofa-slot-open 1.2s ease-in-out forwards !important;
        }
        .sankofa-bird-rig[data-landing="takeoff"]:not([data-battery-saver="true"]) .sankofa-feather-r0,
        .sankofa-bird-rig[data-landing="takeoff"]:not([data-battery-saver="true"]) .sankofa-feather-r1 {
          /* delay embedded — animation-delay is overridden when animation has !important */
          animation: sankofa-slot-open 1.2s ease-in-out 18ms forwards !important;
        }
        .sankofa-bird-rig[data-landing="hover"]:not([data-battery-saver="true"]) .sankofa-feather-l0,
        .sankofa-bird-rig[data-landing="hover"]:not([data-battery-saver="true"]) .sankofa-feather-l1 {
          animation: sankofa-slot-open 680ms ease-in-out infinite !important;
        }
        .sankofa-bird-rig[data-landing="hover"]:not([data-battery-saver="true"]) .sankofa-feather-r0,
        .sankofa-bird-rig[data-landing="hover"]:not([data-battery-saver="true"]) .sankofa-feather-r1 {
          animation: sankofa-slot-open 680ms ease-in-out 18ms infinite !important;
        }

        /* -- P13.12: Wrist stroke pulse at street zoom ----------------------- */
        @keyframes sankofa-wrist-stroke-pulse {
          0%,100% { opacity: 0.52; transform: scale(1); }
          42%      { opacity: 0.86; transform: scale(1.38); }
        }
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"]:not([data-battery-saver="true"]) .sankofa-knee-joint-left {
          animation: sankofa-wrist-stroke-pulse var(--flap-period, 1400ms) ease-in-out infinite;
        }
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"]:not([data-battery-saver="true"]) .sankofa-knee-joint-right {
          /* delay embedded in shorthand — a bare animation-delay after !important would be silently ignored */
          animation: sankofa-wrist-stroke-pulse var(--flap-period, 1400ms) ease-in-out 18ms infinite;
        }

        /* P13 reduced-motion guards */
        @media (prefers-reduced-motion: reduce) {
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-wair="true"] .sankofa-bird-body,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-soaring="true"] .sankofa-bird-body,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-mating="true"] .sankofa-bird-body {
            animation: none !important;
            transform: none !important;
          }
        }

        /* F18: Safari @property graceful fallback audit.
           All @property declarations in this file follow the pattern:
             @property --foo { syntax: "..."; inherits: false; initial-value: 0deg/0/... }
           Any browser that does not support @property reads the custom property as
           an unregistered (untyped) property. In that case:
           - var(--foo, fallback) resolves to the fallback value in keyframes
           - calc() with a missing var evaluates to INVALID and CSS treats the
             declaration as if it were not set (no broken render, just no animation)
           All animations that use @property custom vars provide var(--prop, safe-fallback)
           so the bird degrades to neutral position on older Safari. Verified:
           --bank-angle, --lean-deg, --head-lead-deg, --speed-factor, --blink-period,
           --heading-deg, --lighting-factor, --left-wing-extra, --right-wing-extra,
           --tail-bend, --crown-sway, --flap-period — all have initial-value in their
           @property block and var(prop, fallback) at point of use.

           EXPLICIT SAFARI @property ENFORCEMENT (F18-b):
           Browsers that don't support @property cannot smoothly transition custom
           property values — they snap rather than ease. We detect this via a
           reliable CSS feature that landed in the same Safari version (15.4) as
           @property: the color-mix() function. In browsers without color-mix
           (Safari <15.4), we:
             a) Disable transitions on all @property-driven inline style attrs so
                banking / speed changes snap cleanly rather than freezing mid-ease.
             b) Override animation-duration on P6.6/P6.8 to static values that
                look intentional at the default (walking/cruising) speed, so users
                on very old iPhones still see smooth wing/head animations.
        */
        @supports not (color: color-mix(in srgb, white, black)) {
          /* Safari <15.4 / very old Chrome: @property interpolation unavailable.
             Remove transitions on @property-backed inline-style elements so they
             snap cleanly rather than hanging mid-tween. */
          .sankofa-bird-rig {
            transition: none !important;
          }
          /* Wing flap: use a safe static speed (450ms ≈ cruising pace) instead of
             var(--flap-period) which won't smooth-transition in this browser. */
          .sankofa-bird-rig[data-flying="true"] .sankofa-bird-wing-left {
            animation-duration: 450ms, 450ms !important;
          }
          .sankofa-bird-rig[data-flying="true"] .sankofa-bird-wing-right {
            animation-duration: 468ms, 450ms !important;
          }
          /* Head bob: fixed 700ms — mid-range between glide (800ms) and fast (300ms). */
          .sankofa-bird-rig[data-flying="true"][data-zoom="street"] .sankofa-bird-head,
          .sankofa-bird-rig[data-flying="true"][data-zoom="high"] .sankofa-bird-head {
            animation-duration: 700ms !important;
          }
          /* Blink: fixed 4.5s — the blink-period @property won't interpolate in
             old Safari, so override with the calm-state default. */
          .sankofa-bird-rig .sankofa-bird-eyelid {
            animation-duration: 4500ms !important;
          }
        }

        /* =====================================================================
           iOS SAFARI / ANDROID CHROME RENDERING HARDENING — July 2026
           GPU compositing, stacking-context containment, and performance hints
           specifically for mobile WebKit and Blink. These properties are
           additive — they do not change animation logic, only rendering path.
           ===================================================================== */

        /* 1. GPU layer promotion for the animation rig.
              backface-visibility:hidden on the rig tricks WebKit into promoting
              the element to its own GPU compositing layer. Without this, iOS
              Safari repaints the entire SVG subtree on every animation frame,
              causing jank on older iPhones (A12 and earlier).
              translateZ(0) is the belt-and-suspenders trick for very old iOS.
              isolation:isolate creates a new stacking context so mix-blend-mode
              on child elements (eye catchlights, night wing rim) is contained
              and does not bleed into the map canvas beneath the bird. */
        .sankofa-bird-rig {
          -webkit-backface-visibility: hidden;
          backface-visibility: hidden;
          -webkit-transform: translateZ(0);
          transform: translateZ(0);
          isolation: isolate;
        }

        /* 2. Stacking context on the root SVG.
              The drop-shadow filter already promotes the SVG to a new layer on
              Chrome. On Safari, isolation:isolate ensures the same containment
              without relying on the filter side-effect. */
        .sankofa-svg-root {
          isolation: isolate;
          overflow: visible;
        }

        /* 3. iOS Safari smooth scrolling + rendering for the parent container.
              The bird sits inside a position:absolute div on the map. Without
              these hints, iOS may rasterise the bird with the map tiles,
              breaking animation compositing.
              Note: container no longer applies a rotation (bird stays upright);
              rotation is delegated to .sankofa-bird-trail-wrapper only. */
        .sankofa-bird-container {
          -webkit-transform: translateZ(0);
          transform: translateZ(0);
          -webkit-backface-visibility: hidden;
          backface-visibility: hidden;
        }
        /* Trail wrapper inherits GPU promotion from the container but also
           manages its own rotation for heading-directional trail particles. */
        .sankofa-bird-trail-wrapper {
          -webkit-transform-style: preserve-3d;
          -webkit-backface-visibility: hidden;
          backface-visibility: hidden;
        }

        /* 4. Reduced-motion: battery-saver and IntersectionObserver pause.
              On iOS with "Reduce Motion" enabled AND data-bird-anim not set,
              collapse all animations to their initial state in a single rule
              rather than relying on individual !important overrides. This
              ensures even future phases are covered without a per-phase rule. */
        @media (prefers-reduced-motion: reduce) {
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig * {
            animation-duration: 0.001ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.001ms !important;
          }
        }

        /* 5. @supports guard for individual CSS transform properties.
              Safari 14.1+ supports rotate:/translate:/scale: individual
              properties. Older Safari (iOS 14.0 and below) silently ignores
              them. We already guard Phase 7 biomechanical effects with
              @supports (rotate: 0deg), but add a blanket guard here so
              any stray individual-transform declaration outside a @supports
              block is suppressed on older Safari rather than partially applied. */
        @supports not (rotate: 0deg) {
          .sankofa-bird-rig [style*="rotate"],
          .sankofa-bird-rig [style*="translate"],
          .sankofa-bird-rig [style*="scale"] {
            rotate: unset !important;
            translate: unset !important;
            scale: unset !important;
          }
        }

        /* 6. mix-blend-mode Safari containment.
              mix-blend-mode: screen on eye catchlights (P10 night mode) requires
              a stacking context on the parent. Without one, Safari blends against
              the page background rather than the bird body, producing a visible
              artifact. The isolation:isolate on .sankofa-bird-rig (above) is the
              fix; this comment documents WHY it is needed. */

        /* 7. animation-fill-mode: both — universal safety net.
              Several phase animations use forwards/both fill mode but only some
              declarations explicitly set it. Ensure all .sankofa-bird-rig
              animations that use @keyframes with a non-neutral end state hold
              their final frame on iOS (which sometimes flickers back to
              initial state on Safari 15.x due to a compositing layer swap). */
        .sankofa-bird-rig [class*="sankofa-"]:not([class*="sankofa-bird-rig"]) {
          -webkit-animation-fill-mode: var(--bird-fill-mode, none);
          animation-fill-mode: var(--bird-fill-mode, none);
        }

        /* ══════════════════════════════════════════════════════════════════════
`;
