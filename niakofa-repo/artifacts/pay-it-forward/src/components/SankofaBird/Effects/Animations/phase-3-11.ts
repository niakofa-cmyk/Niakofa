// Sankofa Bird CSS — Phase 3–11 | Beyond-Rive, conscious-intelligence, biomechanical, night-mode
// Auto-split from SankofaBirdSvg.tsx — edit here, not in the monolith

// prettier-ignore
export const sankofaCssPhase3to11 = `
           PHASE 3 — BEYOND-RIVE ENHANCEMENTS — July 2026
           These enhancements require per-element compound state-machine gating
           that would demand explicit hand-authored bone/state transitions per
           feather in Rive. Here they are zero-cost CSS data-attribute cascades.
           ══════════════════════════════════════════════════════════════════════ */

        /* ── @property declarations for new Phase 3 CSS vars ─────────────────
           Registered so Safari 15.4+ can interpolate them in keyframe calc().
           --body-elongation: 0–1 scalar driving aerodynamic body stretch.
           --blink-speed: animation-duration multiplier for blink rate modulation.
           --vortex-opacity: tip vortex trail base opacity.
           --donate-cascade: 0–1 wave scalar for donation shimmer cascade. */
        @property --body-elongation {
          syntax: '<number>';
          inherits: true;
          initial-value: 0;
        }
        @property --blink-speed {
          syntax: '<number>';
          inherits: true;
          initial-value: 1;
        }
        @property --vortex-opacity {
          syntax: '<number>';
          inherits: true;
          initial-value: 0;
        }
        @property --donate-cascade {
          syntax: '<number>';
          inherits: true;
          initial-value: 0;
        }

        /* ── 1. Glide body aerodynamic elongation ─────────────────────────────
           During sustained glide (data-gliding="true") the body elongates
           slightly along the flight axis — a real aero effect where aerodynamic
           loading compresses feathers and stretches the silhouette forward.
           Combined with data-speed="airplane" it reaches maximum stretch.
           The chest and back layers stretch with the body for anatomical unity.
           Impossible in Rive without a separate "elongation" bone track per speed
           tier — here it's a compound data-attribute CSS transition. */
        .sankofa-bird-rig[data-gliding="true"] .sankofa-bird-body {
          transform: scaleX(1.025) scaleY(0.975);
          transform-box: view-box;
          transform-origin: center;
          transition: transform 0.55s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .sankofa-bird-rig[data-gliding="true"][data-speed="airplane"] .sankofa-bird-body {
          transform: scaleX(1.045) scaleY(0.958);
        }
        .sankofa-bird-rig[data-gliding="true"][data-speed="driving"] .sankofa-bird-body {
          transform: scaleX(1.032) scaleY(0.970);
        }
        /* Chest and back stretch in unison */
        .sankofa-bird-rig[data-gliding="true"] .sankofa-bird-chest,
        .sankofa-bird-rig[data-gliding="true"] .sankofa-bird-back {
          transform: scaleX(1.022) scaleY(0.980);
          transform-box: view-box;
          transform-origin: center;
          transition: transform 0.55s cubic-bezier(0.22, 1, 0.36, 1);
        }
        /* Neck pitches forward slightly under aerodynamic load */
        .sankofa-bird-rig[data-gliding="true"] .sankofa-bird-neck {
          transform: rotate(-2.5deg) translateX(0.4px);
          transform-box: view-box;
          transform-origin: 18px 22px;
          transition: transform 0.6s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .sankofa-bird-rig[data-gliding="true"][data-speed="airplane"] .sankofa-bird-neck {
          transform: rotate(-4.5deg) translateX(0.7px);
        }
        /* Driving speed: intermediate neck pitch (between base glide and airplane) */
        .sankofa-bird-rig[data-gliding="true"][data-speed="driving"] .sankofa-bird-neck {
          transform: rotate(-3.0deg) translateX(0.5px);
        }
        /* Return to neutral when not gliding */
        .sankofa-bird-rig:not([data-gliding="true"]) .sankofa-bird-body,
        .sankofa-bird-rig:not([data-gliding="true"]) .sankofa-bird-chest,
        .sankofa-bird-rig:not([data-gliding="true"]) .sankofa-bird-back {
          transition: transform 0.45s ease-out;
        }

        /* ── 2. Blink rate modulation by excitement state ─────────────────────
           A resting bird blinks every ~7s. An excited/alert bird blinks faster.
           Celebrating → 1.8s cycle. Notification → 2.2s. Nearby user → 4s.
           In Rive this would require a separate "blink rate" integer property
           wired to each state's timeline. Here: animation-duration override. */
        .sankofa-bird-rig[data-celebrating="true"] .sankofa-bird-eyelid {
          animation-duration: 1.8s !important;
        }
        .sankofa-bird-rig[data-celebrating="true"] .sankofa-bird-lower-eyelid {
          animation-duration: 1.8s !important;
        }
        .sankofa-bird-rig[data-notification="true"] .sankofa-bird-eyelid {
          animation-duration: 2.2s !important;
        }
        .sankofa-bird-rig[data-notification="true"] .sankofa-bird-lower-eyelid {
          animation-duration: 2.2s !important;
        }
        .sankofa-bird-rig[data-nearby-user="true"] .sankofa-bird-eyelid {
          animation-duration: 4.0s !important;
        }
        /* During helping: eyes stay more open (slower blink — focused) */
        .sankofa-bird-rig[data-helping="true"][data-celebrating="false"] .sankofa-bird-eyelid {
          animation-duration: 9.5s !important;
        }

        /* ── 3. Eye micro-saccade at street zoom ──────────────────────────────
           Between blink cycles at street LOD, the pupil makes tiny involuntary
           micro-movements — the saccades that make real eyes look alive.
           Rate: 5.8s cycle, amplitude ±0.15px — barely visible, subconsciously
           registered. A Rive file cannot express this without a continuous,
           looping saccade clip wired to every non-blinking state transition. */
        @keyframes sankofa-eye-saccade {
          /* 6-stop irregular pattern — no two micro-moves are equal */
          0%,100%  { transform: translate(0, 0); }
          11%      { transform: translate(0.12px, -0.08px); }
          24%      { transform: translate(-0.10px, 0.06px); }
          38%      { transform: translate(0.14px, 0.10px); }
          52%      { transform: translate(-0.08px, -0.14px); }
          67%      { transform: translate(0.06px, 0.12px); }
          81%      { transform: translate(-0.12px, -0.06px); }
          91%      { transform: translate(0.08px, 0.04px); }
        }
        .sankofa-bird-rig[data-zoom="street"] .sankofa-bird-eye {
          animation: sankofa-eye-saccade 5.8s ease-in-out infinite;
        }
        /* Eye saccade also fires at high zoom — same keyframe, longer cycle (less
           noticeable individually but still reads as alive at ≥14 zoom during
           navigation). Previously street-only which meant it never fired at the
           map's default zoom of ~13.5. */
        .sankofa-bird-rig[data-zoom="high"] .sankofa-bird-eye {
          animation: sankofa-eye-saccade 8.5s ease-in-out infinite;
        }
        /* Saccade amplitude increases when nearby user detected — heightened alertness */
        @keyframes sankofa-eye-saccade-alert {
          0%,100%  { transform: translate(0, 0); }
          9%       { transform: translate(0.18px, -0.12px); }
          21%      { transform: translate(-0.15px, 0.10px); }
          35%      { transform: translate(0.20px, 0.15px); }
          48%      { transform: translate(-0.12px, -0.18px); }
          60%      { transform: translate(0.10px, 0.16px); }
          73%      { transform: translate(-0.16px, -0.08px); }
          86%      { transform: translate(0.14px, 0.06px); }
        }
        .sankofa-bird-rig[data-zoom="street"][data-nearby-user="true"] .sankofa-bird-eye {
          animation: sankofa-eye-saccade-alert 2.8s ease-in-out infinite !important;
        }
        /* Suppress saccade when blinking or in notification (eye-alert overrides) */
        .sankofa-bird-rig[data-zoom="street"][data-notification="true"] .sankofa-bird-eye {
          animation: sankofa-eye-alert 1.4s ease-out !important;
        }

        /* ── 4. Upcoming-turn anticipation — head pre-turns before the bank ───
           data-upcoming-turn="left/right" fires 1-2s before the actual bank.
           The head leads the turn (birds look where they're going), the neck
           follows, and a subtle body lean pre-establishes the bank direction.
           This compound 3-element state transition (head+neck+body all gated by
           the SAME single data attribute) is architecturally impossible in Rive
           without explicit wiring across three separate bone timelines. */

        /* Head pre-turn left: rotates toward turn direction */
        @keyframes sankofa-head-preturn-left {
          0%,100% { transform: rotate(0deg); }
          30%     { transform: rotate(-5.5deg) translateX(-0.5px); }
          60%     { transform: rotate(-3.5deg) translateX(-0.3px); }
          80%     { transform: rotate(-4.8deg) translateX(-0.4px); }
        }
        @keyframes sankofa-head-preturn-right {
          0%,100% { transform: rotate(0deg); }
          30%     { transform: rotate(5.5deg) translateX(0.5px); }
          60%     { transform: rotate(3.5deg) translateX(0.3px); }
          80%     { transform: rotate(4.8deg) translateX(0.4px); }
        }
        .sankofa-bird-rig[data-upcoming-turn="left"][data-flying="true"][data-zoom="high"] .sankofa-bird-head,
        .sankofa-bird-rig[data-upcoming-turn="left"][data-flying="true"][data-zoom="street"] .sankofa-bird-head {
          animation: sankofa-head-preturn-left 1.6s ease-in-out infinite !important;
          transform-box: view-box;
          transform-origin: 17px 12px;
        }
        .sankofa-bird-rig[data-upcoming-turn="right"][data-flying="true"][data-zoom="high"] .sankofa-bird-head,
        .sankofa-bird-rig[data-upcoming-turn="right"][data-flying="true"][data-zoom="street"] .sankofa-bird-head {
          animation: sankofa-head-preturn-right 1.6s ease-in-out infinite !important;
          transform-box: view-box;
          transform-origin: 23px 12px;
        }
        /* Neck follows head into pre-turn with slight lag (0.25s) */
        .sankofa-bird-rig[data-upcoming-turn="left"][data-flying="true"][data-zoom="high"] .sankofa-bird-neck,
        .sankofa-bird-rig[data-upcoming-turn="left"][data-flying="true"][data-zoom="street"] .sankofa-bird-neck {
          animation: sankofa-head-preturn-left 1.6s ease-in-out infinite !important;
          animation-delay: 0.25s;
          transform-box: view-box;
          transform-origin: 18px 16px;
        }
        .sankofa-bird-rig[data-upcoming-turn="right"][data-flying="true"][data-zoom="high"] .sankofa-bird-neck,
        .sankofa-bird-rig[data-upcoming-turn="right"][data-flying="true"][data-zoom="street"] .sankofa-bird-neck {
          animation: sankofa-head-preturn-right 1.6s ease-in-out infinite !important;
          animation-delay: 0.25s;
          transform-box: view-box;
          transform-origin: 22px 16px;
        }
        /* Outside wing of upcoming turn extends slightly — anticipating bank */
        .sankofa-bird-rig[data-upcoming-turn="left"][data-flying="true"] .sankofa-bird-wing-right {
          animation-duration: calc(var(--flap-period, 1400ms) * 0.94) !important;
        }
        .sankofa-bird-rig[data-upcoming-turn="right"][data-flying="true"] .sankofa-bird-wing-left {
          animation-duration: calc(var(--flap-period, 1400ms) * 0.94) !important;
        }

        /* ── 5. Wing-tip slotted-feather spread at street+glide zoom ─────────
           Real birds in glide separate their outer primaries — the "slotted
           wingtip" is an aerodynamic adaptation that reduces induced drag.
           At street LOD + gliding, the outermost primaries (l5/r5, l0/r0)
           translate 0.6–1.2px outward from each other, creating visible gaps
           between tip feathers. This is purely CSS translate — no transform
           conflicts with existing rotation animations because we use a
           separate wrapper group.
           In Rive: each feather needs its own bone at a different Y offset
           driven by a "slotted" blend parameter. Here: compound selector. */
        .sankofa-bird-rig[data-gliding="true"][data-zoom="street"] .sankofa-feather-l5 {
          transform: translateX(-0.8px) translateY(-0.5px);
          transform-box: view-box;
          transition: transform 0.5s ease-out;
        }
        .sankofa-bird-rig[data-gliding="true"][data-zoom="street"] .sankofa-feather-r5 {
          transform: translateX(0.8px) translateY(-0.5px);
          transform-box: view-box;
          transition: transform 0.5s ease-out;
        }
        .sankofa-bird-rig[data-gliding="true"][data-zoom="street"] .sankofa-feather-l0 {
          transform: translateX(-0.5px) translateY(-0.3px);
          transform-box: view-box;
          transition: transform 0.55s ease-out 0.06s;
        }
        .sankofa-bird-rig[data-gliding="true"][data-zoom="street"] .sankofa-feather-r0 {
          transform: translateX(0.5px) translateY(-0.3px);
          transform-box: view-box;
          transition: transform 0.55s ease-out 0.06s;
        }
        /* At airplane speed the slot opens wider under maximum loading */
        .sankofa-bird-rig[data-gliding="true"][data-speed="airplane"][data-zoom="street"] .sankofa-feather-l5 {
          transform: translateX(-1.4px) translateY(-0.8px);
        }
        .sankofa-bird-rig[data-gliding="true"][data-speed="airplane"][data-zoom="street"] .sankofa-feather-r5 {
          transform: translateX(1.4px) translateY(-0.8px);
        }
        .sankofa-bird-rig[data-gliding="true"][data-speed="airplane"][data-zoom="street"] .sankofa-feather-l0 {
          transform: translateX(-0.9px) translateY(-0.5px);
        }
        .sankofa-bird-rig[data-gliding="true"][data-speed="airplane"][data-zoom="street"] .sankofa-feather-r0 {
          transform: translateX(0.9px) translateY(-0.5px);
        }
        /* Slotted spread also fires at high zoom — smaller offset (bird is smaller
           on screen so a proportional offset still reads as a slot gap). Previously
           street-only so this never fired at zoom 14–16. */
        .sankofa-bird-rig[data-gliding="true"][data-zoom="high"] .sankofa-feather-l5 {
          transform: translateX(-0.45px) translateY(-0.28px);
          transform-box: view-box;
          transition: transform 0.5s ease-out;
        }
        .sankofa-bird-rig[data-gliding="true"][data-zoom="high"] .sankofa-feather-r5 {
          transform: translateX(0.45px) translateY(-0.28px);
          transform-box: view-box;
          transition: transform 0.5s ease-out;
        }
        .sankofa-bird-rig[data-gliding="true"][data-zoom="high"] .sankofa-feather-l0 {
          transform: translateX(-0.28px) translateY(-0.18px);
          transform-box: view-box;
          transition: transform 0.55s ease-out 0.06s;
        }
        .sankofa-bird-rig[data-gliding="true"][data-zoom="high"] .sankofa-feather-r0 {
          transform: translateX(0.28px) translateY(-0.18px);
          transform-box: view-box;
          transition: transform 0.55s ease-out 0.06s;
        }

        /* ── 6. Takeoff wing-tip vortex trace ────────────────────────────────
           During takeoff (data-landing="takeoff"), the outermost primaries leave
           a brief vortex-ring trail — the turbulent wingtip vortex generated
           during the power stroke. Each ring expands and fades from the tip
           position using scale + opacity. A separate SVG element (.sankofa-vortex)
           emits from both wing tips with a 0.5s phase offset. */
        .sankofa-vortex {
          transform-box: view-box;
          opacity: 0;
          fill: none;
          stroke-width: 0.6;
        }
        .sankofa-vortex-left {
          transform-origin: 9px 16px; /* left tip origin */
          stroke: hsl(190, 100%, 72%);
        }
        .sankofa-vortex-right {
          transform-origin: 31px 16px; /* right tip origin */
          stroke: hsl(190, 100%, 72%);
        }
        .sankofa-bird-rig[data-landing="takeoff"] .sankofa-vortex-left {
          animation: sankofa-vortex-ring 0.85s ease-out 3;
        }
        .sankofa-bird-rig[data-landing="takeoff"] .sankofa-vortex-right {
          animation: sankofa-vortex-ring 0.85s ease-out 3;
          animation-delay: 0.5s;
        }
        @keyframes sankofa-vortex-ring {
          /* Ring expands outward from tip: rapid scale, opacity arc */
          0%   { transform: scale(0.4);  opacity: 0.55; stroke-width: 0.8; }
          25%  { transform: scale(1.2);  opacity: 0.40; stroke-width: 0.6; }
          60%  { transform: scale(2.8);  opacity: 0.18; stroke-width: 0.4; }
          100% { transform: scale(4.5);  opacity: 0;    stroke-width: 0.2; }
        }
        /* Also fire on fast flying at airplane speed (continuous vortex) */
        .sankofa-bird-rig[data-flying="true"][data-speed="airplane"] .sankofa-vortex-left {
          animation: sankofa-vortex-ring 0.6s ease-out infinite !important;
        }
        .sankofa-bird-rig[data-flying="true"][data-speed="airplane"] .sankofa-vortex-right {
          animation: sankofa-vortex-ring 0.6s ease-out infinite !important;
          animation-delay: 0.3s !important;
        }
        /* Suppress vortex at low zoom only — mid zoom can show them at reduced
           opacity. Previously both low AND mid were display:none which meant
           vortex rings never fired at the map's typical zoom of 12–13. */
        .sankofa-bird-rig[data-zoom="low"] .sankofa-vortex { opacity: 0 !important; pointer-events: none !important; transition: opacity 0.45s ease-out !important; }
        .sankofa-bird-rig[data-zoom="mid"] .sankofa-vortex { opacity: 0.35 !important; }

        /* ── 7. Donation shimmer cascade — feather wave across the whole bird ──
           When data-donated="true", body feathers shimmer in a spatial wave from
           head→tail — like a shiver of joy traveling through the plumage. Each
           group fires 80ms after the previous so the wave clearly propagates.
           In Rive: requires a cascade parameter driving each layer's timeline
           offset manually. Here: pure animation-delay arithmetic per selector. */
        @keyframes sankofa-donate-shimmer-wave {
          0%,100% { opacity: var(--dsw-base, 0.18); filter: brightness(1); }
          40%     { opacity: calc(var(--dsw-base, 0.18) * 2.4);
                    filter: brightness(1.6) saturate(1.8) hue-rotate(25deg); }
        }
        /* Crown → beak (head zone) */
        .sankofa-bird-rig[data-donated="true"] .sankofa-crown-feather {
          --dsw-base: 0.88;
          animation: sankofa-donate-shimmer-wave 0.55s ease-out 2 !important;
          animation-delay: 0s !important;
        }
        /* Neck zone */
        .sankofa-bird-rig[data-donated="true"] .sankofa-neck-seg {
          --dsw-base: 0.40;
          animation: sankofa-donate-shimmer-wave 0.55s ease-out 2 !important;
          animation-delay: 0.08s !important;
        }
        /* Shoulder / scapular zone */
        .sankofa-bird-rig[data-donated="true"] .sankofa-wing-scap {
          --dsw-base: 0.30;
          animation: sankofa-donate-shimmer-wave 0.55s ease-out 2 !important;
          animation-delay: 0.16s !important;
        }
        /* Upper breast (body feathers 1-3) */
        .sankofa-bird-rig[data-donated="true"] .sankofa-body-feather-1,
        .sankofa-bird-rig[data-donated="true"] .sankofa-body-feather-2,
        .sankofa-bird-rig[data-donated="true"] .sankofa-body-feather-3 {
          --dsw-base: 0.20;
          animation: sankofa-donate-shimmer-wave 0.55s ease-out 2 !important;
          animation-delay: 0.24s !important;
        }
        /* Mid breast (4-6) */
        .sankofa-bird-rig[data-donated="true"] .sankofa-body-feather-4,
        .sankofa-bird-rig[data-donated="true"] .sankofa-body-feather-5,
        .sankofa-bird-rig[data-donated="true"] .sankofa-body-feather-6 {
          --dsw-base: 0.16;
          animation: sankofa-donate-shimmer-wave 0.55s ease-out 2 !important;
          animation-delay: 0.32s !important;
        }
        /* Lower belly (7-11) */
        .sankofa-bird-rig[data-donated="true"] .sankofa-body-feather-7,
        .sankofa-bird-rig[data-donated="true"] .sankofa-body-feather-8,
        .sankofa-bird-rig[data-donated="true"] .sankofa-body-feather-9 {
          --dsw-base: 0.14;
          animation: sankofa-donate-shimmer-wave 0.55s ease-out 2 !important;
          animation-delay: 0.40s !important;
        }
        /* Outer primaries (furthest from body — last in the wave) */
        .sankofa-bird-rig[data-donated="true"] .sankofa-feather-l5,
        .sankofa-bird-rig[data-donated="true"] .sankofa-feather-r5 {
          animation: sankofa-donate-shimmer-wave 0.55s ease-out 2 !important;
          animation-delay: 0.50s !important;
        }
        /* Tail receives the wave last */
        .sankofa-bird-rig[data-donated="true"] .sankofa-bird-tail {
          animation: sankofa-donate-shimmer-wave 0.6s ease-out 2 !important;
          animation-delay: 0.60s !important;
        }

        /* ── 8. Talon specular catchlight at street zoom ──────────────────────
           Real bird talons are dark-grey keratin with a wet specular sheen.
           At LOD0 (street, ≥17), a subtle brightness flare cycles on each talon
           independently — the reflection of ambient light off the curved tip.
           Each foot fires at a different phase so they never flash in unison. */
        @keyframes sankofa-talon-sheen {
          0%,100% { opacity: 0.50; filter: brightness(0.9); }
          38%     { opacity: 0.80; filter: brightness(1.45) saturate(1.3); }
          65%     { opacity: 0.55; filter: brightness(1.0); }
        }
        .sankofa-bird-rig[data-zoom="street"] .sankofa-talon-left {
          opacity: 0.50;
          animation: sankofa-talon-sheen 4.2s ease-in-out infinite;
        }
        .sankofa-bird-rig[data-zoom="street"] .sankofa-talon-right {
          opacity: 0.50;
          animation: sankofa-talon-sheen 4.2s ease-in-out infinite;
          animation-delay: 2.1s; /* opposite phase to left talon */
        }
        /* While perched: talons grip — brighter and slightly contracted */
        .sankofa-bird-rig[data-zoom="street"][data-landing="perch"] .sankofa-talon-left,
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"][data-flying="false"] .sankofa-talon-left {
          filter: brightness(1.25) contrast(1.15);
          opacity: 0.65;
        }
        .sankofa-bird-rig[data-zoom="street"][data-landing="perch"] .sankofa-talon-right,
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"][data-flying="false"] .sankofa-talon-right {
          filter: brightness(1.25) contrast(1.15);
          opacity: 0.65;
        }
        /* Talon sheen also fires at high zoom — longer cycle, lower base opacity.
           Previously street-only so users at zoom 14–16 never saw it. */
        .sankofa-bird-rig[data-zoom="high"] .sankofa-talon-left {
          opacity: 0.38;
          animation: sankofa-talon-sheen 6.5s ease-in-out infinite;
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-talon-right {
          opacity: 0.38;
          animation: sankofa-talon-sheen 6.5s ease-in-out infinite;
          animation-delay: 3.25s;
        }
        /* Talons hidden at low zoom, very faint at mid zoom */
        .sankofa-bird-rig[data-zoom="low"] .sankofa-talon-left,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-talon-right { opacity: 0 !important; animation: none !important; }
        .sankofa-bird-rig[data-zoom="mid"] .sankofa-talon-left,
        .sankofa-bird-rig[data-zoom="mid"] .sankofa-talon-right { opacity: 0.15; animation: none !important; }

        /* ── 9. Speed-adaptive breathing rate ────────────────────────────────
           A resting bird breathes ~12 breaths/min (5s cycle). A bird at cruise
           speed breathes faster due to metabolic demand (~18/min → 3.3s).
           At airplane speed: ~24/min → 2.5s. This cross-links breathing to
           the speed data attribute — a compound multi-property state the spec
           calls for but Rive cannot express without a "breath rate" float
           parameter wired to a speed-driven blend tree. */
        .sankofa-bird-rig[data-speed="running"] .sankofa-bird-chest {
          animation-duration: 3.8s !important; /* 16 breaths/min */
        }
        .sankofa-bird-rig[data-speed="driving"] .sankofa-bird-chest {
          animation-duration: 3.2s !important; /* 19 breaths/min */
        }
        .sankofa-bird-rig[data-speed="airplane"] .sankofa-bird-chest {
          animation-duration: 2.5s !important; /* 24 breaths/min */
        }
        /* Belly follows chest with inertia — half-step longer */
        .sankofa-bird-rig[data-speed="running"] .sankofa-bird-belly {
          animation-duration: 4.1s !important;
        }
        .sankofa-bird-rig[data-speed="driving"] .sankofa-bird-belly {
          animation-duration: 3.5s !important;
        }
        .sankofa-bird-rig[data-speed="airplane"] .sankofa-bird-belly {
          animation-duration: 2.8s !important;
        }

        /* ── 10. Perch landing foot-impact pulse ─────────────────────────────
           The moment the bird lands (data-landing="perch" first triggers), the
           ground shadow emits a brief impact "pulse" — a compression ring that
           spreads from the foot contact point and fades. This is the tactile
           "I just landed" cue that makes perching feel real.
           The egg ripple fires in celebration of arrival (not the same as
           donation/celebrating ripple — it's a gentler, slower pulse). */
        @keyframes sankofa-land-impact {
          /* Shadow compresses down (Y) then radiates outward like a shockwave */
          0%   { transform: scaleX(1.05) scaleY(0.6);  opacity: 0.30; }
          30%  { transform: scaleX(1.40) scaleY(0.45); opacity: 0.22; }
          65%  { transform: scaleX(1.80) scaleY(0.35); opacity: 0.10; }
          100% { transform: scaleX(2.20) scaleY(0.28); opacity: 0; }
        }
        .sankofa-bird-rig[data-landing="perch"] .sankofa-bird-shadow {
          animation: sankofa-land-impact 0.75s cubic-bezier(0.22, 1, 0.36, 1) 1 !important;
        }
        /* Egg arrival pulse: soft teal ring, slower than donation */
        @keyframes sankofa-egg-arrival {
          0%   { transform: scale(1);   opacity: 0.65; }
          100% { transform: scale(3.5); opacity: 0; }
        }
        .sankofa-bird-rig[data-landing="perch"] .sankofa-egg-ripple {
          animation: sankofa-egg-arrival 1.8s ease-out 1 !important;
        }
        /* Crown feathers ruffle on landing impact — a real avian behaviour */
        @keyframes sankofa-crown-land-ruffle {
          0%   { transform: rotate(0deg) scaleY(1); }
          15%  { transform: rotate(6deg) scaleY(1.28); }  /* spike on impact */
          40%  { transform: rotate(-3deg) scaleY(1.12); }
          70%  { transform: rotate(2deg) scaleY(1.06); }
          100% { transform: rotate(0deg) scaleY(1); }
        }
        .sankofa-bird-rig[data-landing="perch"] .sankofa-crown-feather {
          animation: sankofa-crown-land-ruffle 0.9s ease-out 1 !important;
        }
        .sankofa-bird-rig[data-landing="perch"] .sankofa-crown-feather-1 { animation-delay: 0s !important; }
        .sankofa-bird-rig[data-landing="perch"] .sankofa-crown-feather-2 { animation-delay: 0.04s !important; }
        .sankofa-bird-rig[data-landing="perch"] .sankofa-crown-feather-3 { animation-delay: 0.08s !important; }
        .sankofa-bird-rig[data-landing="perch"] .sankofa-crown-feather-4 { animation-delay: 0.12s !important; }
        .sankofa-bird-rig[data-landing="perch"] .sankofa-crown-feather-5 { animation-delay: 0.16s !important; }

        /* ── 11. Airplane contrail pulse — sine-wave trail opacity ────────────
           At airplane speed, the trail particles pulse with a sine-wave that
           makes it look like the contrail is being deposited in pulses rather
           than as a static fade. Each "puff" of exhaust is visible as a
           brightness peak that travels down the trail. No Rive equivalent —
           this would need a particle emitter with per-particle timeline control. */
        @keyframes sankofa-contrail-pulse {
          0%,100% { opacity: 0.65; filter: blur(0.5px) brightness(1.15); }
          18%     { opacity: 0.85; filter: blur(0.2px) brightness(1.45); }
          38%     { opacity: 0.42; filter: blur(0.8px) brightness(0.90); }
          58%     { opacity: 0.78; filter: blur(0.3px) brightness(1.35); }
          80%     { opacity: 0.35; filter: blur(1.0px) brightness(0.82); }
        }
        .sankofa-bird-rig[data-speed="airplane"] .sankofa-trail {
          animation: sankofa-contrail-pulse 0.38s ease-in-out infinite !important;
        }
        /* Combined: airplane + helping — gold-tinted contrail pulse */
        .sankofa-bird-rig[data-speed="airplane"][data-helping="true"] .sankofa-trail {
          animation: sankofa-contrail-pulse 0.38s ease-in-out infinite !important;
          background: linear-gradient(
            135deg,
            hsl(45, 90%, 68%) 0%,
            hsl(190, 100%, 62%) 50%,
            hsl(45, 80%, 72%) 100%
          ) !important;
        }

        /* ── 12. Iris depth parallax on celebration ───────────────────────────
           When celebrating, the pupil expands AND the iris rotates slightly —
           simulating the way a real iris's radial pattern rotates as it dilates.
           The rotation (4deg) is small enough to be imperceptible as rotation
           but reads subconsciously as "alive eye" depth. */
        @keyframes sankofa-iris-celebrate {
          0%,100% { transform: scale(1) rotate(0deg); opacity: 0.88; }
          20%     { transform: scale(1.32) rotate(4deg); opacity: 0.96; }
          45%     { transform: scale(1.18) rotate(2deg); opacity: 0.92; }
          70%     { transform: scale(1.28) rotate(-2deg); opacity: 0.95; }
        }
        .sankofa-bird-rig[data-celebrating="true"] .sankofa-bird-iris {
          animation: sankofa-iris-celebrate 0.9s ease-in-out 3 !important;
          transform-box: view-box;
          transform-origin: center;
        }

        /* ── 13. Nearby-user presence glow — ambient environmental awareness ──
           When data-nearby-user="true", a soft teal ambient field builds around
           the bird's body — not a reaction (no burst) but a sustained field
           indicating awareness of human proximity. Concentric pulse rather than
           a hard ring — reads as "the bird notices someone nearby."
           This is a passive detection state: it must NOT conflict with the
           active notification (chirp rings) or helping (gold halo) states. */
        @keyframes sankofa-proximity-field {
          0%,100% { opacity: 0.05; transform: scale(1); }
          50%     { opacity: 0.14; transform: scale(1.12); }
        }
        .sankofa-bird-rig[data-nearby-user="true"][data-notification="false"] .sankofa-glow-layer {
          animation: sankofa-proximity-field 2.6s ease-in-out infinite !important;
          fill: hsl(192, 100%, 60%) !important;
        }
        /* Breast sheen picks up the proximity glow at high/street zoom */
        .sankofa-bird-rig[data-nearby-user="true"][data-zoom="high"] .sankofa-breast-sheen,
        .sankofa-bird-rig[data-nearby-user="true"][data-zoom="street"] .sankofa-breast-sheen {
          animation-duration: 2.4s !important;
          opacity: 0.35 !important;
        }

        /* ── 14. Celebration crown specular burst ────────────────────────────
           On celebrating, a rapid flash bursts outward from each crown tip —
           like a sparkler. The burst is a scale+opacity ring that fires once
           from each of the 5 crown tips (each with its own delay). This creates
           a crown-specific "fireworks" effect separate from the body particle burst.
           The burst uses the crown-tip element as its launch origin. */
        @keyframes sankofa-crown-burst-flash {
          /* A single bright flash then an expanding dimming ring */
          0%   { transform: scale(0.5); opacity: 0.95; filter: brightness(2.5) saturate(2); }
          22%  { transform: scale(1.8); opacity: 0.65; filter: brightness(1.8) saturate(1.8); }
          55%  { transform: scale(3.5); opacity: 0.25; filter: brightness(1.2) saturate(1.3); }
          100% { transform: scale(5.0); opacity: 0;   filter: brightness(1); }
        }
        .sankofa-bird-rig[data-celebrating="true"][data-zoom="street"] .sankofa-crown-tip {
          animation: sankofa-crown-burst-flash 0.45s ease-out 3 !important;
        }
        .sankofa-bird-rig[data-celebrating="true"][data-zoom="street"] .sankofa-crown-tip-3 {
          animation-delay: 0.12s !important;
        }
        .sankofa-bird-rig[data-celebrating="true"][data-zoom="street"] .sankofa-crown-tip-5 {
          animation-delay: 0.24s !important;
        }
        /* At high zoom: subtler flash (can't see individual tips as clearly) */
        .sankofa-bird-rig[data-celebrating="true"][data-zoom="high"] .sankofa-crown-feather {
          filter: drop-shadow(0 0 3px rgba(255, 215, 0, 0.85)) brightness(1.40) !important;
          animation-duration: 0.62s !important;
        }

        /* ── 15. Tail TailCenter vs outer fan differential iridescence ─────────
           The central rectrices (TailCenter) face dorsally and catch light
           at a different angle than the outer rectrices (TailLeft01, TailRight01).
           At street zoom, the centre feathers get a phase-offset iridescence that
           is DISTINCT from the outer fan — creating visible depth across the tail.
           Combined with the existing per-outer-feather iridescence, the tail reads
           as a true multi-plane surface rather than a flat fan. */
        @keyframes sankofa-tail-center-iri {
          0%,100% { filter: hue-rotate(calc(var(--heading-deg,0deg)*0.28)) saturate(1.45); opacity: 0.88; }
          28%     { filter: hue-rotate(calc(var(--heading-deg,0deg)*0.28 + 32deg)) saturate(1.85) brightness(1.28); opacity: 1.0; }
          60%     { filter: hue-rotate(calc(var(--heading-deg,0deg)*0.28 + 16deg)) saturate(1.60); opacity: 0.92; }
        }
        .sankofa-bird-rig[data-zoom="street"] .sankofa-tail-center {
          animation: sankofa-tail-center-iri 3.5s ease-in-out infinite;
        }
        /* At high zoom: subtler version (outer tail already has iridescence there) */
        .sankofa-bird-rig[data-zoom="high"] .sankofa-tail-center {
          filter: hue-rotate(calc(var(--heading-deg,0deg)*0.22)) saturate(1.3);
          transition: filter 0.8s ease-out;
        }
        /* During bank: tail center tilts toward bank (reinforcing turn visual) */
        .sankofa-bird-rig[data-flying="true"][data-zoom="high"] .sankofa-tail-center,
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"] .sankofa-tail-center {
          transform: rotate(calc(var(--tail-bend, 0deg) * 1.2));
          transform-box: view-box;
          transform-origin: 20px 36px;
          transition: transform 0.4s ease-out, filter 0.8s ease-out;
        }

        /* ══════════════════════════════════════════════════════════════════════
           PHASE 4 — "CONSCIOUS INTELLIGENCE LAYER"  (July 18 2026)
           15 new beyond-Rive compound-selector effects. Each requires per-frame,
           per-element authoring that is impractical in any node-graph animation
           tool. Effects 16–30:
             16. Walk-dust lateral puff        17. Hover turbulence oscillation
             18. Wing-beat air pressure ring   19. Crown heading-aware iridescence
             20. Celebrating wing-spread hold  21. Accepted 3-hop bounce
             22. Asymmetric tail banking spread 23. Approach feather ruffle (wind)
             24. Airplane speed-streak blur    25. Egg thermal depth layers
             26. Beak moisture glint           27. Night-mode ambient color shift
             28. Donated wing-tip sparkle      29. Iris dilation on accepted
             30. Notification arrival ring
           ══════════════════════════════════════════════════════════════════════ */

        /* ── Phase 4 @property declarations ──────────────────────────────── */
        @property --turb-x { syntax: '<length>'; inherits: false; initial-value: 0px; }
        @property --turb-y { syntax: '<length>'; inherits: false; initial-value: 0px; }
        @property --bank-angle { syntax: '<angle>'; inherits: true; initial-value: 0deg; }

        /* ── 16. Walk-dust lateral puff ───────────────────────────────────── */
        /* At walking speed + grounded, dust kicks sideways with each step:
           dust-1 + walk-dust-4 → left foot; dust-3 + walk-dust-5 → right foot.
           0.48s cadence ≈ comfortable avian walking pace for this body size. */
        @keyframes sankofa-walk-dust-left {
          0%   { transform: translate(0,0) scale(0.75);   opacity: 0; }
          12%  { opacity: 0.80; }
          42%  { transform: translate(-2.4px,-1.0px) scale(1.2); opacity: 0.52; }
          78%  { transform: translate(-4.0px,-2.5px) scale(1.7); opacity: 0.20; }
          100% { transform: translate(-5.8px,-4px) scale(2.2); opacity: 0; }
        }
        @keyframes sankofa-walk-dust-right {
          0%   { transform: translate(0,0) scale(0.75);   opacity: 0; }
          12%  { opacity: 0.80; }
          42%  { transform: translate(2.4px,-1.0px) scale(1.2); opacity: 0.52; }
          78%  { transform: translate(4.0px,-2.5px) scale(1.7); opacity: 0.20; }
          100% { transform: translate(5.8px,-4px) scale(2.2); opacity: 0; }
        }
        .sankofa-bird-rig[data-speed="walking"][data-flying="false"][data-zoom="high"] .sankofa-dust-1,
        .sankofa-bird-rig[data-speed="walking"][data-flying="false"][data-zoom="street"] .sankofa-dust-1,
        .sankofa-bird-rig[data-speed="walking"][data-flying="false"][data-zoom="high"] .sankofa-walk-dust-4,
        .sankofa-bird-rig[data-speed="walking"][data-flying="false"][data-zoom="street"] .sankofa-walk-dust-4 {
          animation: sankofa-walk-dust-left 0.48s ease-out infinite !important;
          transform-box: view-box; transform-origin: 15.5px 35.5px;
        }
        .sankofa-bird-rig[data-speed="walking"][data-flying="false"][data-zoom="high"] .sankofa-dust-3,
        .sankofa-bird-rig[data-speed="walking"][data-flying="false"][data-zoom="street"] .sankofa-dust-3,
        .sankofa-bird-rig[data-speed="walking"][data-flying="false"][data-zoom="high"] .sankofa-walk-dust-5,
        .sankofa-bird-rig[data-speed="walking"][data-flying="false"][data-zoom="street"] .sankofa-walk-dust-5 {
          animation: sankofa-walk-dust-right 0.48s ease-out 0.24s infinite !important;
          transform-box: view-box; transform-origin: 24.5px 35.5px;
        }
        .sankofa-bird-rig[data-speed="walking"][data-flying="false"][data-zoom="high"] .sankofa-dust-2,
        .sankofa-bird-rig[data-speed="walking"][data-flying="false"][data-zoom="street"] .sankofa-dust-2 {
          animation: sankofa-walk-dust-left 0.72s ease-out 0.12s infinite !important;
          opacity: 0.42 !important; transform-box: view-box; transform-origin: 20px 37px;
        }

        /* ── 17. Hover turbulence micro-oscillation ───────────────────────── */
        /* Decelerating into hover creates a high-frequency whole-body tremor
           as wing beats fight forward momentum. 10 keyframe stops with
           deliberate asymmetric offsets produce an organically irregular shudder.
           Targets .sankofa-svg-root (the SVG element itself) to stay isolated
           from the bank-rotate transform on the parent .sankofa-bird-rig div. */
        @keyframes sankofa-hover-turbulence {
          0%   { transform: translate(0px, 0px) rotate(0deg); }
          10%  { transform: translate(0.38px,-0.55px) rotate(0.28deg); }
          20%  { transform: translate(-0.50px, 0.28px) rotate(-0.36deg); }
          30%  { transform: translate(0.26px, 0.46px) rotate(0.20deg); }
          40%  { transform: translate(-0.42px,-0.36px) rotate(-0.30deg); }
          50%  { transform: translate(0.56px, 0.20px) rotate(0.40deg); }
          60%  { transform: translate(-0.28px, 0.56px) rotate(-0.18deg); }
          70%  { transform: translate(0.44px,-0.26px) rotate(0.34deg); }
          80%  { transform: translate(-0.20px, 0.14px) rotate(-0.12deg); }
          90%  { transform: translate(0.16px,-0.40px) rotate(0.22deg); }
          100% { transform: translate(0px, 0px) rotate(0deg); }
        }
        .sankofa-bird-rig[data-approaching="true"][data-flying="true"] .sankofa-svg-root {
          animation: sankofa-hover-turbulence 0.24s linear infinite;
          transform-box: view-box; transform-origin: 20px 21px;
        }
        .sankofa-bird-rig[data-approaching="true"][data-speed="airplane"][data-flying="true"] .sankofa-svg-root {
          animation-duration: 0.15s !important;
        }
        .sankofa-bird-rig[data-approaching="true"][data-speed="driving"][data-flying="true"] .sankofa-svg-root {
          animation-duration: 0.20s !important;
        }

        /* ── 18. Wing-beat air pressure ring ──────────────────────────────── */
        /* Each downstroke compresses air below the wing — a teal stroke-circle
           pulses outward from just below the body then fades. Only at high/street
           zoom where per-element detail is relevant. */
        @keyframes sankofa-wing-beat-ring-pulse {
          0%   { transform: scale(0.32) translateY(0);      opacity: 0.62; stroke-width: 0.56; }
          40%  { transform: scale(1.85) translateY(0.4px);  opacity: 0.30; stroke-width: 0.28; }
          80%  { transform: scale(3.50) translateY(1.0px);  opacity: 0.10; stroke-width: 0.14; }
          100% { transform: scale(4.60) translateY(1.6px);  opacity: 0;    stroke-width: 0; }
        }
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"] .sankofa-wing-beat-ring {
          animation: sankofa-wing-beat-ring-pulse 0.55s ease-out infinite;
          transform-box: view-box; transform-origin: 20px 27px;
        }
        .sankofa-bird-rig[data-flying="true"][data-zoom="high"] .sankofa-wing-beat-ring {
          animation: sankofa-wing-beat-ring-pulse 0.65s ease-out infinite;
          transform-box: view-box; transform-origin: 20px 27px;
          opacity: 0.35 !important;
        }

        /* ── 19. Crown feather heading-aware iridescence ──────────────────── */
        /* Crown feathers face skyward — different light angle than the body.
           At street zoom, crown iridescence uses heading × 0.25 + 45° offset
           so crown never colour-matches the body at any heading.
           This is the "crown/body distinct structural colour" — crown = turquoise
           green; body = teal-blue, independent plumage planes. */
        @keyframes sankofa-crown-heading-iri {
          0%,100% { filter: hue-rotate(calc(var(--heading-deg,0deg)*0.25 + 45deg)) saturate(1.55) brightness(1.18); }
          33%     { filter: hue-rotate(calc(var(--heading-deg,0deg)*0.25 + 80deg)) saturate(1.92) brightness(1.36); }
          66%     { filter: hue-rotate(calc(var(--heading-deg,0deg)*0.25 + 62deg)) saturate(1.68) brightness(1.24); }
        }
        .sankofa-bird-rig[data-zoom="street"] .sankofa-crown-feather {
          animation: sankofa-crown-heading-iri 2.8s ease-in-out infinite;
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-crown-feather {
          filter: hue-rotate(calc(var(--heading-deg,0deg)*0.20 + 40deg)) saturate(1.35) brightness(1.12);
          transition: filter 1.0s ease-out;
        }

        /* ── 19b. Activity-driven crown alertness ─────────────────────────────
           Crown feather posture responds to community activity level.
           Quiet neighbourhood: crown droops slightly (resting sentinel).
           Busy neighbourhood: crown raises — the bird scans its territory.
           Peak activity: maximum erect posture + micro-tremble on the two
           central crown feathers — the bird is fully alert.
           In Rive: would require separate "alert" state on each feather track
           with pose blending. Here: two compound data-attribute selectors
           with CSS transform + a single keyframe for the micro-tremble. */
        .sankofa-bird-rig[data-activity="quiet"] .sankofa-crown-feather {
          /* Relaxed posture: crown droops very slightly, lower saturation */
          transform: rotate(3deg) translateY(0.3px);
          transform-box: view-box;
          transition: transform 1.4s ease-out, filter 1.2s ease-out;
          filter: brightness(0.88) saturate(0.72);
        }
        .sankofa-bird-rig[data-activity="busy"] .sankofa-crown-feather {
          /* Alert posture: feathers lift, brighter structural colour */
          transform: rotate(-4deg) translateY(-0.35px);
          transform-box: view-box;
          transition: transform 0.8s ease-out, filter 0.7s ease-out;
          filter: brightness(1.18) saturate(1.40);
        }
        .sankofa-bird-rig[data-activity="peak"] .sankofa-crown-feather {
          /* Maximum alert: crown fully erect, maximum structural colour */
          transform: rotate(-8deg) translateY(-0.72px);
          transform-box: view-box;
          transition: transform 0.4s ease-out, filter 0.3s ease-out;
          filter: brightness(1.35) saturate(1.70);
        }
        /* Activity crown-tip brightness — tips light up when alert, dim when quiet */
        .sankofa-bird-rig[data-activity="busy"] .sankofa-crown-tip,
        .sankofa-bird-rig[data-activity="peak"] .sankofa-crown-tip {
          opacity: 0.75 !important;
          filter: brightness(2.5) saturate(2.0);
        }
        .sankofa-bird-rig[data-activity="quiet"] .sankofa-crown-tip {
          opacity: 0.18 !important;
          filter: brightness(0.8) saturate(0.6);
        }
        /* Crown micro-tremble on peak alert — only feathers 2+3 (central ones) */
        @keyframes sankofa-crown-alert-tremble {
          0%,100% { transform: rotate(-8deg) translateY(-0.72px); }
          20%     { transform: rotate(-9.8deg) translateY(-0.88px) translateX(0.20px); }
          45%     { transform: rotate(-7.4deg) translateY(-0.62px) translateX(-0.14px); }
          70%     { transform: rotate(-8.6deg) translateY(-0.78px) translateX(0.12px); }
        }
        .sankofa-bird-rig[data-activity="peak"] .sankofa-crown-feather-2,
        .sankofa-bird-rig[data-activity="peak"] .sankofa-crown-feather-3 {
          animation: sankofa-crown-alert-tremble 1.1s ease-in-out infinite !important;
          transform-box: view-box;
        }
        /* Activity adjusts chest breathing rate:
           busy/peak = more animated (bird is excited); quiet = slow and deep */
        .sankofa-bird-rig[data-activity="busy"] .sankofa-bird-chest {
          animation-duration: 2.8s !important;
        }
        .sankofa-bird-rig[data-activity="peak"] .sankofa-bird-chest {
          animation-duration: 1.9s !important;
        }
        .sankofa-bird-rig[data-activity="quiet"] .sankofa-bird-chest {
          animation-duration: 5.5s !important;
        }
        /* Eye catchlight + iris blink animation speed — also use --blink-period */
        .sankofa-bird-rig .sankofa-bird-eyelid {
          animation-duration: var(--blink-period, 7000ms) !important;
        }
        .sankofa-bird-rig .sankofa-bird-eye-catchlight {
          animation-duration: var(--blink-period, 7000ms) !important;
        }
        .sankofa-bird-rig[data-accepted="false"] .sankofa-bird-iris,
        .sankofa-bird-rig:not([data-accepted]) .sankofa-bird-iris {
          /* Only apply period override when not playing the accepted-dilation anim */
          animation-duration: var(--blink-period, 7000ms) !important;
        }
        .sankofa-bird-rig .sankofa-bird-lower-eyelid {
          animation-duration: var(--blink-period, 7000ms) !important;
        }

        /* ── 20. Celebrating wing-spread triumph posture ────────────────────
           Real birds extend wings fully on positive stimulus ("triumph posture").
           cubic-bezier overshoot (y2 = 1.5) gives the elastic snap that is
           impractical to author manually in a Rive timeline window. */
        @keyframes sankofa-wing-triumph-left {
          0%   { transform: translateX(0)     rotate(0deg)   scaleX(1); }
          18%  { transform: translateX(-3.5px) rotate(-10deg) scaleX(1.22); }
          42%  { transform: translateX(-4.2px) rotate(-14deg) scaleX(1.30); }
          72%  { transform: translateX(-3.2px) rotate(-8deg)  scaleX(1.18); }
          88%  { transform: translateX(-0.8px) rotate(-2deg)  scaleX(1.04); }
          100% { transform: translateX(0)     rotate(0deg)   scaleX(1); }
        }
        @keyframes sankofa-wing-triumph-right {
          0%   { transform: translateX(0)    rotate(0deg)  scaleX(1); }
          18%  { transform: translateX(3.5px) rotate(10deg) scaleX(1.22); }
          42%  { transform: translateX(4.2px) rotate(14deg) scaleX(1.30); }
          72%  { transform: translateX(3.2px) rotate(8deg)  scaleX(1.18); }
          88%  { transform: translateX(0.8px) rotate(2deg)  scaleX(1.04); }
          100% { transform: translateX(0)    rotate(0deg)  scaleX(1); }
        }
        .sankofa-bird-rig[data-celebrating="true"][data-zoom="street"] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-celebrating="true"][data-zoom="street"] .sankofa-bird-wing-left-btm,
        .sankofa-bird-rig[data-celebrating="true"][data-zoom="street"] .sankofa-bird-wing-left-feathers {
          animation: sankofa-wing-triumph-left 1.25s cubic-bezier(0.18, 1.5, 0.36, 1) !important;
          transform-box: view-box; transform-origin: 20px 18px;
        }
        .sankofa-bird-rig[data-celebrating="true"][data-zoom="street"] .sankofa-bird-wing-right,
        .sankofa-bird-rig[data-celebrating="true"][data-zoom="street"] .sankofa-bird-wing-right-btm,
        .sankofa-bird-rig[data-celebrating="true"][data-zoom="street"] .sankofa-bird-wing-right-feathers {
          animation: sankofa-wing-triumph-right 1.25s cubic-bezier(0.18, 1.5, 0.36, 1) !important;
          transform-box: view-box; transform-origin: 20px 18px;
        }
        .sankofa-bird-rig[data-celebrating="true"][data-zoom="high"] .sankofa-bird-wing-left {
          animation: sankofa-wing-triumph-left 1.4s cubic-bezier(0.18, 1.5, 0.36, 1) !important;
          transform-box: view-box; transform-origin: 20px 18px;
        }
        .sankofa-bird-rig[data-celebrating="true"][data-zoom="high"] .sankofa-bird-wing-right {
          animation: sankofa-wing-triumph-right 1.4s cubic-bezier(0.18, 1.5, 0.36, 1) !important;
          transform-box: view-box; transform-origin: 20px 18px;
        }

        /* ── 21. Accepted request 3-hop bounce ────────────────────────────── */
        /* Strong first jump, lighter second, micro-settle third — matches the
           involuntary happy-hop seen in real corvids and parrots on reward.
           Targets .sankofa-svg-root so bank-rotation on the parent is unaffected.
           Pivot at cy=32 (near feet) for natural foot-push feel. */
        @keyframes sankofa-accepted-hop {
          0%   { transform: translateY(0px); }
          7%   { transform: translateY(1.4px); }
          20%  { transform: translateY(-5.5px); }
          33%  { transform: translateY(0px); }
          40%  { transform: translateY(0.8px); }
          52%  { transform: translateY(-3.2px); }
          63%  { transform: translateY(0px); }
          70%  { transform: translateY(0.5px); }
          80%  { transform: translateY(-1.5px); }
          100% { transform: translateY(0px); }
        }
        .sankofa-bird-rig[data-accepted="true"] .sankofa-svg-root {
          animation: sankofa-accepted-hop 0.88s cubic-bezier(0.25, 1.3, 0.36, 1) 1 forwards;
          transform-box: view-box; transform-origin: 20px 32px;
        }

        /* ── 22. Asymmetric tail banking spread ───────────────────────────── */
        /* Outside tail feathers spread wider in a bank (aerodynamic drag on the
           high side); inside feathers compress. CSS calc() flips sign per feather
           side automatically — no JS needed. Only visible at street zoom. */
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"] .sankofa-tail-outer-right {
          transform: translateX(calc(var(--bank-angle, 0deg) * 0.05)) rotate(calc(var(--bank-angle, 0deg) * 0.6));
          transform-box: view-box; transform-origin: 20px 34px; transition: transform 0.4s ease-out;
        }
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"] .sankofa-tail-outer-left {
          transform: translateX(calc(var(--bank-angle, 0deg) * -0.05)) rotate(calc(var(--bank-angle, 0deg) * -0.6));
          transform-box: view-box; transform-origin: 20px 34px; transition: transform 0.4s ease-out;
        }
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"] .sankofa-tail-far-right {
          transform: translateX(calc(var(--bank-angle, 0deg) * 0.08)) scaleX(calc(1 + var(--bank-angle, 0deg) * 0.004));
          transform-box: view-box; transform-origin: 20px 36px; transition: transform 0.4s ease-out;
        }
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"] .sankofa-tail-far-left {
          transform: translateX(calc(var(--bank-angle, 0deg) * -0.08)) scaleX(calc(1 - var(--bank-angle, 0deg) * 0.004));
          transform-box: view-box; transform-origin: 20px 36px; transition: transform 0.4s ease-out;
        }

        /* ── 23. Approach wind-resistance feather ruffle ──────────────────── */
        /* Decelerating hard: air rushes forward over the body. Body feathers
           1→11 ruffle front-to-back at 60ms stagger — head hits wind first.
           Each feather rotates slightly counter to the flight direction then
           springs back, simulating the real aerodynamic ruffling visible in
           high-speed photography of landing birds. */
        /* NOTE: sankofa-approach-ruffle is defined further below (Phase 6 ruffle block)
           with the full braking-splay keyframe. This earlier duplicate definition
           was removed -- only the Phase 6 version remains as the effective @keyframes. */
        .sankofa-bird-rig[data-approaching="true"] .sankofa-body-feather-1  { animation: sankofa-approach-ruffle 2.5s ease-in-out 0.00s infinite; transform-box: view-box; transform-origin: 20px 17px; }
        .sankofa-bird-rig[data-approaching="true"] .sankofa-body-feather-2  { animation: sankofa-approach-ruffle 2.5s ease-in-out 0.06s infinite; transform-box: view-box; transform-origin: 20px 18px; }
        .sankofa-bird-rig[data-approaching="true"] .sankofa-body-feather-3  { animation: sankofa-approach-ruffle 2.5s ease-in-out 0.12s infinite; transform-box: view-box; transform-origin: 20px 19px; }
        .sankofa-bird-rig[data-approaching="true"] .sankofa-body-feather-4  { animation: sankofa-approach-ruffle 2.5s ease-in-out 0.18s infinite; transform-box: view-box; transform-origin: 20px 19.5px; }
        .sankofa-bird-rig[data-approaching="true"] .sankofa-body-feather-5  { animation: sankofa-approach-ruffle 2.5s ease-in-out 0.24s infinite; transform-box: view-box; transform-origin: 20px 20px; }
        .sankofa-bird-rig[data-approaching="true"] .sankofa-body-feather-6  { animation: sankofa-approach-ruffle 2.5s ease-in-out 0.30s infinite; transform-box: view-box; transform-origin: 20px 21px; }
        .sankofa-bird-rig[data-approaching="true"] .sankofa-body-feather-7  { animation: sankofa-approach-ruffle 2.5s ease-in-out 0.36s infinite; transform-box: view-box; transform-origin: 20px 22px; }
        .sankofa-bird-rig[data-approaching="true"] .sankofa-body-feather-8  { animation: sankofa-approach-ruffle 2.5s ease-in-out 0.42s infinite; transform-box: view-box; transform-origin: 20px 23px; }
        .sankofa-bird-rig[data-approaching="true"] .sankofa-body-feather-9  { animation: sankofa-approach-ruffle 2.5s ease-in-out 0.48s infinite; transform-box: view-box; transform-origin: 20px 23.5px; }
        .sankofa-bird-rig[data-approaching="true"] .sankofa-body-feather-10 { animation: sankofa-approach-ruffle 2.5s ease-in-out 0.54s infinite; transform-box: view-box; transform-origin: 20px 24px; }
        .sankofa-bird-rig[data-approaching="true"] .sankofa-body-feather-11 { animation: sankofa-approach-ruffle 2.5s ease-in-out 0.60s infinite; transform-box: view-box; transform-origin: 20px 25px; }

        /* ── 24. Airplane speed-streak motion blur ────────────────────────── */
        /* Three horizontal streaks trail behind the bird at airplane speed.
           Only at low/mid zoom (the contrail is already visible at high/street).
           Staggered vertical positions (y=14, 18, 22) create parallax depth. */
        @keyframes sankofa-speed-streak-slide {
          0%   { transform: translateX(2px)   scaleX(0.55); opacity: 0.55; }
          50%  { transform: translateX(-6px)  scaleX(1.40); opacity: 0.28; }
          100% { transform: translateX(-14px) scaleX(2.10); opacity: 0; }
        }
        .sankofa-bird-rig[data-speed="airplane"][data-zoom="low"]  .sankofa-speed-streak,
        .sankofa-bird-rig[data-speed="airplane"][data-zoom="mid"]  .sankofa-speed-streak {
          animation: sankofa-speed-streak-slide 0.36s linear infinite;
          transform-box: view-box;
        }
        .sankofa-bird-rig[data-speed="airplane"][data-zoom="low"]  .sankofa-speed-streak-1,
        .sankofa-bird-rig[data-speed="airplane"][data-zoom="mid"]  .sankofa-speed-streak-1 { transform-origin: 20px 14px; }
        .sankofa-bird-rig[data-speed="airplane"][data-zoom="low"]  .sankofa-speed-streak-2,
        .sankofa-bird-rig[data-speed="airplane"][data-zoom="mid"]  .sankofa-speed-streak-2 {
          animation-delay: 0.12s !important; opacity: 0.38 !important; transform-origin: 20px 18px;
        }
        .sankofa-bird-rig[data-speed="airplane"][data-zoom="low"]  .sankofa-speed-streak-3,
        .sankofa-bird-rig[data-speed="airplane"][data-zoom="mid"]  .sankofa-speed-streak-3 {
          animation-delay: 0.24s !important; opacity: 0.22 !important; transform-origin: 20px 22px;
        }

        /* ── 25. Egg thermal inner-glow depth layers ──────────────────────── */
        /* Inner ring (1.65s) + mid ring (2.45s) never phase-sync so the egg
           reads as perpetually alive — "like polished jade holding heat".
           Both transition to gold on helping/donated states via CSS filter override. */
        @keyframes sankofa-egg-thermal-inner-anim {
          0%,100% { r: 0.60; opacity: 0.30; filter: brightness(1.5) saturate(1.7); }
          45%     { r: 0.88; opacity: 0.62; filter: brightness(2.3) saturate(2.5); }
        }
        @keyframes sankofa-egg-thermal-mid-anim {
          0%,100% { r: 0.98; opacity: 0.18; filter: brightness(1.2) saturate(1.3); }
          55%     { r: 1.28; opacity: 0.36; filter: brightness(1.7) saturate(1.8); }
        }
        .sankofa-bird-rig .sankofa-egg-thermal-inner {
          animation: sankofa-egg-thermal-inner-anim 1.65s ease-in-out infinite;
        }
        .sankofa-bird-rig .sankofa-egg-thermal-mid {
          animation: sankofa-egg-thermal-mid-anim 2.45s ease-in-out infinite;
        }
        .sankofa-bird-rig[data-helping="true"] .sankofa-egg-thermal-inner {
          animation-duration: 1.15s !important;
          filter: hue-rotate(-22deg) brightness(2.6) saturate(2.8) !important;
        }
        .sankofa-bird-rig[data-helping="true"] .sankofa-egg-thermal-mid {
          animation-duration: 1.75s !important;
          filter: hue-rotate(-16deg) brightness(2.0) saturate(2.2) !important;
        }
        .sankofa-bird-rig[data-donated="true"] .sankofa-egg-thermal-inner {
          animation-duration: 0.68s !important;
          filter: hue-rotate(-46deg) brightness(3.3) saturate(3.4) !important;
        }
        .sankofa-bird-rig[data-donated="true"] .sankofa-egg-thermal-mid {
          animation-duration: 1.05s !important;
          filter: hue-rotate(-36deg) brightness(2.6) saturate(2.9) !important;
        }

        /* ── 26. Beak moisture glint ──────────────────────────────────────── */
        /* Sub-pixel wet specular at the beak tip — real birds have hydrated
           beak surfaces. 2.8s period; 1.1s initial delay avoids syncing with
           the eye blink. Only fires at street zoom. Very subtle: ≤ 0.62 opacity. */
        @keyframes sankofa-beak-glint-anim {
          0%,100% { opacity: 0;    filter: brightness(1); }
          18%     { opacity: 0.62; filter: brightness(3.2) saturate(0.3); }
          36%     { opacity: 0.28; filter: brightness(2.0) saturate(0.5); }
          55%     { opacity: 0;    filter: brightness(1); }
        }
        .sankofa-bird-rig[data-zoom="street"] .sankofa-beak-glint {
          animation: sankofa-beak-glint-anim 2.8s ease-in-out 1.1s infinite;
        }

        /* ── 27. Night-mode ambient color shift ──────────────────────────── */
        /* Blanket CSS filter on .sankofa-bird-rig: hue-rotate +22°, muted
           saturation, dim brightness — whole bird reads as a shadowy nocturnal
           silhouette. Key reactions (celebrating, donated) each relax the filter
           so they remain legible in dark conditions. */
        .sankofa-bird-rig[data-night-mode="true"] {
          filter: hue-rotate(22deg) saturate(0.58) brightness(0.65) !important;
          transition: filter 1.8s ease-in-out;
        }
        .sankofa-bird-rig[data-night-mode="true"][data-celebrating="true"] {
          filter: hue-rotate(22deg) saturate(0.82) brightness(0.80) !important;
          transition: filter 0.25s ease-out;
        }
        .sankofa-bird-rig[data-night-mode="true"][data-donated="true"] {
          filter: hue-rotate(12deg) saturate(0.72) brightness(0.74) !important;
          transition: filter 0.40s ease-out;
        }

        /* ── 27b. Sky-tier ambient color washes (golden hour + civil twilight) ──
           Beyond the binary night/day switch, solar elevation tiers warm or cool
           the bird's plumage to match real-world lighting conditions, driven by
           the useSolarTier() NOAA sun-position hook.
           data-sky-tier="day"      — no filter (full daytime teal plumage)
           data-sky-tier="golden"   — warm amber wash; sun 0°–10° (sunrise/sunset)
           data-sky-tier="twilight" — desaturated cool dim; sun -6° to 0°
           data-sky-tier="night"    — handled above via data-night-mode="true"
           Transitions are 2.4 s / 2.0 s so the bird eases from golden-hour tones
           back to daytime as the sun climbs — imperceptible second-to-second,
           beautiful over a 20-minute sunrise watch. */
        .sankofa-bird-rig[data-sky-tier="golden"] {
          filter: hue-rotate(-18deg) saturate(1.45) brightness(1.08) sepia(0.22) !important;
          transition: filter 2.4s ease-in-out;
        }
        .sankofa-bird-rig[data-sky-tier="golden"][data-celebrating="true"] {
          /* Keep celebration legible: relax the golden wash slightly */
          filter: hue-rotate(-10deg) saturate(1.60) brightness(1.15) sepia(0.12) !important;
          transition: filter 0.25s ease-out;
        }
        .sankofa-bird-rig[data-sky-tier="golden"][data-donated="true"] {
          filter: hue-rotate(-24deg) saturate(1.55) brightness(1.12) sepia(0.28) !important;
          transition: filter 0.40s ease-out;
        }
        .sankofa-bird-rig[data-sky-tier="twilight"] {
          filter: hue-rotate(12deg) saturate(0.75) brightness(0.82) !important;
          transition: filter 2.0s ease-in-out;
        }
        .sankofa-bird-rig[data-sky-tier="twilight"][data-celebrating="true"] {
          filter: hue-rotate(8deg) saturate(0.92) brightness(0.93) !important;
          transition: filter 0.25s ease-out;
        }
        .sankofa-bird-rig[data-sky-tier="twilight"][data-donated="true"] {
          filter: hue-rotate(6deg) saturate(0.88) brightness(0.88) !important;
          transition: filter 0.40s ease-out;
        }
        /* When skyTier="night" the React code also sets data-night-mode="true"
           so the existing night-mode rules above apply — no separate rule needed.
           data-sky-tier="day" deliberately has no rule (no filter = full colour). */

        /* ── 28. Donated wing-tip sparkle trail ───────────────────────────── */
        /* Gold "launch sparks" erupt from the outermost primaries (l5/r5) after
           a donation while airborne. Distinct from the donation shimmer cascade
           (Phase 3 #7, which sweeps head→tail) — these burst outward from the
           wingtip like sparks from a launch point. l0/r0 follow with lag. */
        @keyframes sankofa-tip-sparkle-left {
          0%   { transform: translate(0,0) scale(0.8);     opacity: 0.92; filter: hue-rotate(-48deg) brightness(2.5); }
          28%  { transform: translate(-1.2px,-2.2px) scale(1.3); opacity: 0.65; }
          62%  { transform: translate(-2.8px,-4.2px) scale(1.8); opacity: 0.28; }
          100% { transform: translate(-5px,-7px)     scale(2.4); opacity: 0; }
        }
        @keyframes sankofa-tip-sparkle-right {
          0%   { transform: translate(0,0) scale(0.8);     opacity: 0.92; filter: hue-rotate(-48deg) brightness(2.5); }
          28%  { transform: translate(1.2px,-2.2px) scale(1.3); opacity: 0.65; }
          62%  { transform: translate(2.8px,-4.2px) scale(1.8); opacity: 0.28; }
          100% { transform: translate(5px,-7px)     scale(2.4); opacity: 0; }
        }
        .sankofa-bird-rig[data-donated="true"][data-flying="true"][data-zoom="street"] .sankofa-feather-l5,
        .sankofa-bird-rig[data-donated="true"][data-flying="true"][data-zoom="high"]   .sankofa-feather-l5 {
          animation: sankofa-tip-sparkle-left 0.60s ease-out 3 !important;
          filter: hue-rotate(-45deg) brightness(2.6) saturate(2.2) !important;
        }
        .sankofa-bird-rig[data-donated="true"][data-flying="true"][data-zoom="street"] .sankofa-feather-r5,
        .sankofa-bird-rig[data-donated="true"][data-flying="true"][data-zoom="high"]   .sankofa-feather-r5 {
          animation: sankofa-tip-sparkle-right 0.60s ease-out 0.14s 3 !important;
          filter: hue-rotate(-45deg) brightness(2.6) saturate(2.2) !important;
        }
        .sankofa-bird-rig[data-donated="true"][data-flying="true"][data-zoom="street"] .sankofa-feather-l0 {
          animation: sankofa-tip-sparkle-left 0.60s ease-out 0.22s 2 !important;
          filter: hue-rotate(-38deg) brightness(2.2) saturate(2.0) !important;
        }
        .sankofa-bird-rig[data-donated="true"][data-flying="true"][data-zoom="street"] .sankofa-feather-r0 {
          animation: sankofa-tip-sparkle-right 0.60s ease-out 0.34s 2 !important;
          filter: hue-rotate(-38deg) brightness(2.2) saturate(2.0) !important;
        }

        /* ── 29. Iris pupil dilation on accepted ──────────────────────────── */
        /* Positive-stimulus dilation: scale 1→1.42→1.0 on the iris ring.
           Pupil darkens briefly during peak dilation (pupil expanding in SVG
           space pushes iris outer edge outward — same visual as real biology).
           cubic-bezier snap prevents the ease from feeling mechanical. */
        @keyframes sankofa-iris-dilation {
          0%   { transform: scale(1.00); filter: brightness(1.00) saturate(1.0); }
          10%  { transform: scale(1.44); filter: brightness(0.66) saturate(2.0); }
          28%  { transform: scale(1.40); filter: brightness(0.70) saturate(1.8); }
          65%  { transform: scale(1.16); filter: brightness(0.92) saturate(1.3); }
          100% { transform: scale(1.00); filter: brightness(1.00) saturate(1.0); }
        }
        .sankofa-bird-rig[data-accepted="true"] .sankofa-bird-iris {
          animation: sankofa-iris-dilation 0.72s cubic-bezier(0.22, 1.4, 0.36, 1) 1 forwards !important;
          transform-box: view-box; transform-origin: 7.1px 12.2px;
        }

        /* ── 30. Notification arrival ring pulse ──────────────────────────── */
        /* Large concentric ring expands from body center — 3 pulses at 1.35s.
           Complementary to the beak-tip chirp rings (those are at the sound
           source); this ring is a body-level visual broadcast readable even at
           low zoom when the bird is small on screen. */
        @keyframes sankofa-notification-ring-pulse {
          0%   { transform: scale(0.52); opacity: 0.80; }
          42%  { transform: scale(2.20); opacity: 0.40; }
          78%  { transform: scale(4.00); opacity: 0.12; }
          100% { transform: scale(5.20); opacity: 0; }
        }
        .sankofa-bird-rig[data-notification="true"] .sankofa-notification-ring {
          animation: sankofa-notification-ring-pulse 1.35s ease-out 3;
          transform-box: view-box; transform-origin: 20px 20px;
        }
        .sankofa-bird-rig[data-notification="true"][data-zoom="low"] .sankofa-notification-ring {
          animation-duration: 1.70s !important;
        }
        .sankofa-bird-rig[data-notification="true"][data-zoom="mid"] .sankofa-notification-ring {
          animation-duration: 1.50s !important;
        }

        /* ── Phase 4 battery-saver guard ──────────────────────────────────── */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-wing-beat-ring    { opacity: 0 !important; pointer-events: none !important; transition: opacity 0.45s ease-out !important; }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-speed-streak      { opacity: 0 !important; pointer-events: none !important; transition: opacity 0.45s ease-out !important; }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-walk-dust-4,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-walk-dust-5       { opacity: 0 !important; pointer-events: none !important; transition: opacity 0.45s ease-out !important; }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-egg-thermal-inner,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-egg-thermal-mid   { animation: none !important; }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-notification-ring { animation: none !important; }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-beak-glint        { animation: none !important; }
        .sankofa-bird-rig[data-battery-saver="true"][data-approaching="true"] .sankofa-svg-root { animation: none !important; }
        .sankofa-bird-rig[data-battery-saver="true"][data-accepted="true"]    .sankofa-svg-root { animation: none !important; }
        .sankofa-bird-rig[data-battery-saver="true"][data-celebrating="true"] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-battery-saver="true"][data-celebrating="true"] .sankofa-bird-wing-left-btm,
        .sankofa-bird-rig[data-battery-saver="true"][data-celebrating="true"] .sankofa-bird-wing-right,
        .sankofa-bird-rig[data-battery-saver="true"][data-celebrating="true"] .sankofa-bird-wing-right-btm { animation: none !important; }

        /* ── Phase 4 prefers-reduced-motion guard ─────────────────────────── */
        /* All Phase 4 selectors wrapped in html:not([data-bird-anim="enabled"])
           so users who toggle the Accessibility override in Profile still see
           the full animation set regardless of OS Reduce Motion setting. */
        @media (prefers-reduced-motion: reduce) {
          html:not([data-bird-anim="enabled"]) {
            /* Walk-dust lateral */
            .sankofa-bird-rig[data-speed="walking"] .sankofa-idle-dust  { animation: none !important; }
            .sankofa-walk-dust-4, .sankofa-walk-dust-5                   { animation: none !important; }
            /* Hover turbulence + accepted hop (both target .sankofa-svg-root) */
            .sankofa-bird-rig[data-approaching="true"] .sankofa-svg-root { animation: none !important; }
            .sankofa-bird-rig[data-accepted="true"]    .sankofa-svg-root { animation: none !important; }
            /* Wing-beat ring */
            .sankofa-wing-beat-ring { animation: none !important; }
            /* Crown heading-aware iridescence — keep static filter at street zoom */
            .sankofa-bird-rig[data-zoom="street"] .sankofa-crown-feather {
              animation: none !important;
              filter: hue-rotate(calc(var(--heading-deg,0deg)*0.20 + 45deg)) saturate(1.30);
            }
            .sankofa-bird-rig[data-zoom="high"] .sankofa-crown-feather { transition: none !important; }
            /* Wing triumph spread */
            .sankofa-bird-rig[data-celebrating="true"] .sankofa-bird-wing-left,
            .sankofa-bird-rig[data-celebrating="true"] .sankofa-bird-wing-right,
            .sankofa-bird-rig[data-celebrating="true"] .sankofa-bird-wing-left-btm,
            .sankofa-bird-rig[data-celebrating="true"] .sankofa-bird-wing-right-btm,
            .sankofa-bird-rig[data-celebrating="true"] .sankofa-bird-wing-left-feathers,
            .sankofa-bird-rig[data-celebrating="true"] .sankofa-bird-wing-right-feathers { animation: none !important; }
            /* Approach feather ruffle */
            .sankofa-bird-rig[data-approaching="true"] .sankofa-body-feather-1,
            .sankofa-bird-rig[data-approaching="true"] .sankofa-body-feather-2,
            .sankofa-bird-rig[data-approaching="true"] .sankofa-body-feather-3,
            .sankofa-bird-rig[data-approaching="true"] .sankofa-body-feather-4,
            .sankofa-bird-rig[data-approaching="true"] .sankofa-body-feather-5,
            .sankofa-bird-rig[data-approaching="true"] .sankofa-body-feather-6,
            .sankofa-bird-rig[data-approaching="true"] .sankofa-body-feather-7,
            .sankofa-bird-rig[data-approaching="true"] .sankofa-body-feather-8,
            .sankofa-bird-rig[data-approaching="true"] .sankofa-body-feather-9,
            .sankofa-bird-rig[data-approaching="true"] .sankofa-body-feather-10,
            .sankofa-bird-rig[data-approaching="true"] .sankofa-body-feather-11 { animation: none !important; }
            /* Speed streaks */
            .sankofa-speed-streak { animation: none !important; }
            /* Egg thermal */
            .sankofa-egg-thermal-inner, .sankofa-egg-thermal-mid { animation: none !important; }
            /* Beak glint */
            .sankofa-beak-glint { animation: none !important; }
            /* Night mode: keep filter static, remove transition (base rig + night state) */
            .sankofa-bird-rig { transition: filter 0s !important; }
            .sankofa-bird-rig[data-night-mode="true"] { transition: none !important; }
            /* Donated tip sparkle — revert feathers to normal */
            .sankofa-bird-rig[data-donated="true"] .sankofa-feather-l5,
            .sankofa-bird-rig[data-donated="true"] .sankofa-feather-r5,
            .sankofa-bird-rig[data-donated="true"] .sankofa-feather-l0,
            .sankofa-bird-rig[data-donated="true"] .sankofa-feather-r0 { animation: none !important; filter: none !important; }
            /* Iris dilation */
            .sankofa-bird-rig[data-accepted="true"] .sankofa-bird-iris { animation: none !important; }
            /* Notification ring */
            .sankofa-notification-ring { animation: none !important; }
            /* Asymmetric tail banking: freeze transforms, remove transitions */
            .sankofa-tail-outer-right, .sankofa-tail-outer-left,
            .sankofa-tail-far-right, .sankofa-tail-far-left { transform: none !important; transition: none !important; }
          }
        }

        /* ── Phase 3 battery-saver guard ─────────────────────────────────────
           Hide all new Phase 3 GPU-intensive elements in LOD3 mode. */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-vortex { opacity: 0 !important; pointer-events: none !important; transition: opacity 0.45s ease-out !important; }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-talon-left,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-talon-right { animation: none !important; }

        /* ── Navigation-session LOD auto-escalation (battery drain prevention) ──
           During long continuous navigation the bird automatically reduces GPU
           load without any manual user action. This prevents battery drain on
           older phones during extended journeys (ride-shares, long walks, etc.).
           The React component tracks elapsed navigation time via a useEffect +
           interval and sets data-nav-lod="0|1|2" on the rig element.
           LOD0 (0–10 min) : normal — no restrictions.
           LOD1 (10–30 min): pause secondary feather flutter + wing iridescence
                             shimmer + wing-scap + egg thermal pulsing.
                             Wing flap, body float, tail, eye all continue.
           LOD2 (30 min+)  : pause nearly all non-essential GPU work — only
                             wing flap, body glide, tail banking, and eye/blink
                             remain. The bird is still alive and responsive;
                             just stripped of its cosmetic particle layers. */

        /* LOD1 — suspend the secondary / covert feather animations */
        .sankofa-bird-rig[data-nav-lod="1"] .sankofa-feather-ls1,
        .sankofa-bird-rig[data-nav-lod="1"] .sankofa-feather-ls2,
        .sankofa-bird-rig[data-nav-lod="1"] .sankofa-feather-ls3,
        .sankofa-bird-rig[data-nav-lod="1"] .sankofa-feather-rs1,
        .sankofa-bird-rig[data-nav-lod="1"] .sankofa-feather-rs2,
        .sankofa-bird-rig[data-nav-lod="1"] .sankofa-feather-rs3,
        .sankofa-bird-rig[data-nav-lod="1"] .sankofa-feather-lc1,
        .sankofa-bird-rig[data-nav-lod="1"] .sankofa-feather-rc1 {
          animation-play-state: paused !important;
          opacity: 0.5;
        }
        .sankofa-bird-rig[data-nav-lod="1"] .sankofa-bird-wing-left-highlight,
        .sankofa-bird-rig[data-nav-lod="1"] .sankofa-bird-wing-right-highlight {
          animation-play-state: paused !important;
          opacity: 0.12;
        }
        .sankofa-bird-rig[data-nav-lod="1"] .sankofa-egg-thermal-inner,
        .sankofa-bird-rig[data-nav-lod="1"] .sankofa-egg-thermal-mid {
          animation-play-state: paused !important;
        }
        .sankofa-bird-rig[data-nav-lod="1"] .sankofa-wing-scap {
          animation-play-state: paused !important;
        }
        .sankofa-bird-rig[data-nav-lod="1"] .sankofa-wing-covert-band {
          animation-play-state: paused !important;
        }

        /* LOD2 — suspend essentially all decorative GPU layers */
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-feather-ls1,
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-feather-ls2,
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-feather-ls3,
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-feather-rs1,
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-feather-rs2,
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-feather-rs3,
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-feather-lc1,
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-feather-rc1 {
          display: none !important;
        }
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-bird-wing-left-highlight,
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-bird-wing-right-highlight {
          display: none !important;
        }
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-wing-scap,
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-wing-joint,
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-beak-glint,
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-wing-covert-band { opacity: 0 !important; pointer-events: none !important; transition: opacity 0.45s ease-out !important; }
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-egg-thermal-inner,
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-egg-thermal-mid { animation: none !important; opacity: 0 !important; }
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-glow-layer { animation: none !important; opacity: 0 !important; }
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-breast-sheen { animation: none !important; opacity: 0 !important; }
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-bird-neck { animation-play-state: paused !important; }
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-bird-wing-left-feathers,
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-bird-wing-right-feathers {
          animation: none !important;
          opacity: 0.4;
        }
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-vortex { display: none !important; }
        /* Trail + body-feather: fade out via opacity instead of instant display:none
           so the LOD2 transition doesn't pop visually on 30-min navigation sessions. */
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-trail { opacity: 0 !important; pointer-events: none !important; transition: opacity 0.55s ease-out !important; }
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-wing-beat-ring { opacity: 0 !important; pointer-events: none !important; transition: opacity 0.45s ease-out !important; }
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-bird-back,
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-bird-belly { opacity: 0 !important; pointer-events: none !important; transition: opacity 0.45s ease-out !important; }
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-body-feather { opacity: 0 !important; pointer-events: none !important; transition: opacity 0.45s ease-out !important; }
        /* Keep alive: wing flap, body glide, tail, eye blink, head rotation */

        /* ── Phase 3 reduced-motion guard ────────────────────────────────────────
           Suppress all Phase 3 animations for users who prefer reduced motion.
           Gated on html:not([data-bird-anim="enabled"]) so users can opt back in
           via the Accessibility toggle in Profile → Settings (writes the HTML attr
           via useAnimationPreference hook). Common on iOS where "Reduce Motion" is
           on by default for system UI but users still want to see bird animations. */
        @media (prefers-reduced-motion: reduce) {
          /* Glide elongation: collapse to identity */
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-gliding="true"] .sankofa-bird-body,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-gliding="true"] .sankofa-bird-chest,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-gliding="true"] .sankofa-bird-back,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-gliding="true"] .sankofa-bird-neck { transform: none !important; transition: none !important; }
          /* Vortex rings */
          html:not([data-bird-anim="enabled"]) .sankofa-vortex { animation: none !important; opacity: 0 !important; }
          /* Donation cascade */
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-donated="true"] .sankofa-crown-feather,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-donated="true"] .sankofa-neck-seg,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-donated="true"] .sankofa-wing-scap,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-donated="true"] .sankofa-body-feather-1,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-donated="true"] .sankofa-body-feather-2,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-donated="true"] .sankofa-body-feather-3,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-donated="true"] .sankofa-feather-l5,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-donated="true"] .sankofa-feather-r5,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-donated="true"] .sankofa-bird-tail { animation: none !important; }
          /* Eye saccade (street + high zoom) */
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-zoom="street"] .sankofa-bird-eye,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-zoom="high"] .sankofa-bird-eye { animation: none !important; }
          /* Talon sheen */
          html:not([data-bird-anim="enabled"]) .sankofa-talon-left,
          html:not([data-bird-anim="enabled"]) .sankofa-talon-right { animation: none !important; }
          /* Crown burst */
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-celebrating="true"] .sankofa-crown-tip { animation: none !important; }
          /* Perch impact + crown ruffle */
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-landing="perch"] .sankofa-bird-shadow,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-landing="perch"] .sankofa-egg-ripple,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-landing="perch"] .sankofa-crown-feather { animation: none !important; }
          /* Contrail */
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-speed="airplane"] .sankofa-trail { animation: none !important; }
          /* Iris celebrate */
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-celebrating="true"] .sankofa-bird-iris { animation: none !important; }
          /* Head preturn */
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-upcoming-turn="left"] .sankofa-bird-head,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-upcoming-turn="right"] .sankofa-bird-head,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-upcoming-turn="left"] .sankofa-bird-neck,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-upcoming-turn="right"] .sankofa-bird-neck { animation: none !important; }
          /* Tail center iridescence */
          html:not([data-bird-anim="enabled"]) .sankofa-tail-center { animation: none !important; transition: none !important; }
          /* Slotted feather spread (street + high zoom) */
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-gliding="true"][data-zoom="street"] .sankofa-feather-l5,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-gliding="true"][data-zoom="street"] .sankofa-feather-r5,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-gliding="true"][data-zoom="street"] .sankofa-feather-l0,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-gliding="true"][data-zoom="street"] .sankofa-feather-r0,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-gliding="true"][data-zoom="high"] .sankofa-feather-l5,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-gliding="true"][data-zoom="high"] .sankofa-feather-r5,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-gliding="true"][data-zoom="high"] .sankofa-feather-l0,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-gliding="true"][data-zoom="high"] .sankofa-feather-r0 { transform: none !important; transition: none !important; }
          /* Phase 5: bilateral asymmetry, membrane flex, helping glow — suppress */
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-helping="true"] .sankofa-feather-ls1,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-helping="true"] .sankofa-feather-ls2,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-helping="true"] .sankofa-feather-rs1,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-helping="true"] .sankofa-feather-rs2 { animation: none !important; filter: none !important; }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-helping="true"] .sankofa-bird-head { transform: none !important; transition: none !important; }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-notification="true"] .sankofa-bird-beak-lower,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-accepted="true"] .sankofa-bird-beak-lower { animation: none !important; }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-l5,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-r5 { animation: none !important; filter: none !important; }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-flying="true"] .sankofa-bird-wing-left-btm,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-flying="true"] .sankofa-bird-wing-right-btm { animation: none !important; }
          /* Neck chain animations live on .sankofa-neck-seg (not .sankofa-neck-chain-link which has no SVG element) */
          html:not([data-bird-anim="enabled"]) .sankofa-neck-seg { animation: none !important; }
        }

        /* ══════════════════════════════════════════════════════════════════════
           PHASE 5 — MICRO-PHYSICS & BILATERAL ASYMMETRY — July 2026
           These enhancements are architecturally impossible in Rive without
           explicit per-feather bone tracks and manual state-machine wiring.
           Each uses compound data-attribute selectors to fire precisely in the
           right state with zero JavaScript overhead — pure declarative CSS physics.
           ══════════════════════════════════════════════════════════════════════ */

        /* ── P5.1: Bilateral wing asymmetry ──────────────────────────────────
           Real birds are never perfectly symmetric. Left and right primary fans
           have subtly different flap timing (different muscle firing patterns
           from the two hemispheres). We introduce a 3% period offset between
           sides at high/street zoom — invisible consciously, subconsciously felt.
           Compound: only at high+street where individual feathers are visible.
           In Rive: would require two separate "flap" timelines per side, each
           with a different speed property. Here: single animation-duration rule
           per side. Note: this intentionally uses !important to override the
           feather-cascade delay block above (which stacks on top of this period
           offset, not replaces it). */
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-l0,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-l0,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-l1,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-l1,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-l2,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-l2,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-l3,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-l3,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-ls1,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-ls1 {
          /* Left side: nominally 1.03× flap period — leading side trails slightly */
          animation-duration: calc(var(--flap-period, 1400ms) * 1.03) !important;
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-r0,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-r0,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-r1,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-r1,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-r2,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-r2,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-r3,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-r3,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-rs1,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-rs1 {
          /* Right side: nominally 0.97× flap period — leading side arrives first */
          animation-duration: calc(var(--flap-period, 1400ms) * 0.97) !important;
        }
        /* Note: the feather-cascade animation-delay block (above) stacks on top of
           these duration rules via the CSS animation shorthand, not by overriding.
           The result: left feathers have cascade delays WITHIN a slightly longer
           period; right feathers have cascade delays WITHIN a slightly shorter period.
           The two fans never arrive in unison — perpetually organic. */

        /* ── P5.2: Wing membrane aerodynamic flex during power stroke ─────────
           During each downstroke the primary fan stretches forward slightly
           (aerodynamic loading deflects the membrane upward → looks like forward
           lean). A subtle scaleX + slight skewX on the wing-feathers group per
           side creates this — amplitude driven by --speed-factor so at walking
           pace it's imperceptible and at airplane speed it's clearly visible.
           Only at high/street where the membrane surface is large enough to read.
           Differs from glide elongation (P3.1) which is a body-level transform:
           this is specifically the wing membranes flexing independent of body. */
        @keyframes sankofa-wing-membrane-flex-left {
          0%,100% { transform: scaleX(1.000) skewY( 0.0deg); }
          18%     { transform: scaleX(1.018) skewY(-0.6deg); }  /* downstroke start: membrane loads */
          38%     { transform: scaleX(1.034) skewY(-1.0deg); }  /* mid downstroke: peak load */
          55%     { transform: scaleX(1.012) skewY(-0.3deg); }  /* upstroke entry: load releases */
          72%     { transform: scaleX(0.996) skewY( 0.3deg); }  /* upstroke peak: slight backswing */
        }
        @keyframes sankofa-wing-membrane-flex-right {
          0%,100% { transform: scaleX(1.000) skewY( 0.0deg); }
          18%     { transform: scaleX(1.018) skewY( 0.6deg); }
          38%     { transform: scaleX(1.034) skewY( 1.0deg); }
          55%     { transform: scaleX(1.012) skewY( 0.3deg); }
          72%     { transform: scaleX(0.996) skewY(-0.3deg); }
        }
        .sankofa-bird-rig[data-flying="true"][data-zoom="high"] .sankofa-bird-wing-left-feathers,
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"] .sankofa-bird-wing-left-feathers {
          animation: sankofa-wing-membrane-flex-left var(--flap-period, 1400ms) ease-in-out infinite !important;
          transform-box: view-box;
          transform-origin: 14px 18px;
        }
        .sankofa-bird-rig[data-flying="true"][data-zoom="high"] .sankofa-bird-wing-right-feathers,
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"] .sankofa-bird-wing-right-feathers {
          animation: sankofa-wing-membrane-flex-right var(--flap-period, 1400ms) ease-in-out infinite !important;
          transform-box: view-box;
          transform-origin: 26px 18px;
        }
        /* Right side leads left by 3% of flap period (bilateral asymmetry) */
        .sankofa-bird-rig[data-flying="true"][data-zoom="high"] .sankofa-bird-wing-right-feathers,
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"] .sankofa-bird-wing-right-feathers {
          animation-delay: calc(var(--flap-period, 1400ms) * -0.03) !important;
        }
        /* Suppress at battery-saver — pure GPU transform cost */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-left-feathers,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-right-feathers { animation: none !important; }

        /* ── P5.3: Helping state — secondary feathers warm to gold ───────────
           When actively helping, the teal secondary feathers warm toward gold —
           the bird "glows with purpose". Uses hue-rotate(-55deg) which shifts teal
           (180°) toward yellow-gold (~125°). Combined with filter brightness + sat.
           Only at high/street where secondaries are individual visible paths.
           In Rive: requires a separate "helping" state on each secondary feather's
           colour property. Here: two compound data-attribute selectors. */
        .sankofa-bird-rig[data-helping="true"][data-zoom="high"] .sankofa-feather-ls1,
        .sankofa-bird-rig[data-helping="true"][data-zoom="street"] .sankofa-feather-ls1,
        .sankofa-bird-rig[data-helping="true"][data-zoom="high"] .sankofa-feather-rs1,
        .sankofa-bird-rig[data-helping="true"][data-zoom="street"] .sankofa-feather-rs1 {
          filter: hue-rotate(-52deg) brightness(1.35) saturate(1.7) !important;
          transition: filter 0.9s ease-out;
        }
        .sankofa-bird-rig[data-helping="true"][data-zoom="high"] .sankofa-feather-ls2,
        .sankofa-bird-rig[data-helping="true"][data-zoom="street"] .sankofa-feather-ls2,
        .sankofa-bird-rig[data-helping="true"][data-zoom="high"] .sankofa-feather-rs2,
        .sankofa-bird-rig[data-helping="true"][data-zoom="street"] .sankofa-feather-rs2 {
          filter: hue-rotate(-38deg) brightness(1.22) saturate(1.5) !important;
          transition: filter 1.1s ease-out;
        }
        /* The warm tint pulses gently so it reads as living glow, not static recolour */
        @keyframes sankofa-helping-secondary-pulse {
          0%,100% { filter: hue-rotate(-52deg) brightness(1.35) saturate(1.70); }
          45%     { filter: hue-rotate(-60deg) brightness(1.55) saturate(2.10); }
        }
        .sankofa-bird-rig[data-helping="true"][data-zoom="street"] .sankofa-feather-ls1,
        .sankofa-bird-rig[data-helping="true"][data-zoom="street"] .sankofa-feather-rs1 {
          animation: sankofa-helping-secondary-pulse 2.2s ease-in-out infinite !important;
        }

        /* ── P5.4: Crown forward-tilt during active helping ──────────────────
           In real birds, the crown feathers tilt forward when engaged/focused —
           the "alert on-task" posture vs. the relaxed upright crest of idle.
           data-helping="true": crown feathers rotate -4° forward (toward beak).
           The tilt transitions smoothly in (0.7s ease-out) on helping activation
           and eases back when helping ends.
           This is a CSS transition not an animation — it responds instantly to the
           data attribute change, which in Rive would require an explicit entry/exit
           state transition wired to the "helping" input boolean. */
        .sankofa-bird-rig[data-helping="true"][data-zoom="high"] .sankofa-crown-feather,
        .sankofa-bird-rig[data-helping="true"][data-zoom="street"] .sankofa-crown-feather {
          transform: rotate(-4deg) translateY(-0.3px) !important;
          transform-box: view-box;
          transform-origin: 12px 9px;
          transition: transform 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) !important;
        }
        .sankofa-bird-rig:not([data-helping="true"]) .sankofa-crown-feather {
          transition: transform 0.5s ease-out;
        }

        /* ── P5.5: Beak lower-jaw micro-chirp on notification/accepted ────────
           The lower beak drops slightly on notification arrival and accepted
           events — the bird "startles" and vocalises. A 3-frame drop: quick
           open (0→15%), hold (15→25%), close (25→55%), slight overshoot closed
           (55→70%), settle (70→100%). Real bird beak physics in CSS.
           Only at street zoom where the beak is large enough to read.
           In Rive: requires an explicit beak-open animation input per state. */
        @keyframes sankofa-beak-chirp-open {
          0%,100% { transform: rotate(0deg) translateY(0px); }
          12%     { transform: rotate(8deg)  translateY(0.5px); }   /* snap open */
          28%     { transform: rotate(6deg)  translateY(0.4px); }   /* hold open */
          52%     { transform: rotate(-0.8deg) translateY(-0.05px); } /* close + overshoot */
          72%     { transform: rotate(0deg)  translateY(0px); }     /* settle */
        }
        .sankofa-bird-rig[data-notification="true"][data-zoom="street"] .sankofa-bird-beak-lower {
          animation: sankofa-beak-chirp-open 0.55s ease-out 2 !important;
          animation-delay: 0.12s;
          transform-box: view-box;
          transform-origin: 2px 14px;
        }
        .sankofa-bird-rig[data-accepted="true"][data-zoom="street"] .sankofa-bird-beak-lower {
          animation: sankofa-beak-chirp-open 0.48s cubic-bezier(0.34, 1.56, 0.64, 1) 1 !important;
          animation-delay: 0.08s;
          transform-box: view-box;
          transform-origin: 2px 14px;
        }
        /* Brief joyful chirp on celebration */
        .sankofa-bird-rig[data-celebrating="true"][data-zoom="street"] .sankofa-bird-beak-lower {
          animation: sankofa-beak-chirp-open 0.42s ease-out 3 !important;
          animation-delay: 0.2s;
          transform-box: view-box;
          transform-origin: 2px 14px;
        }

        /* ── P5.6: Feather-tip dew-drop sparkle at idle street zoom ──────────
           At LOD0 (street zoom), while idle and perched, a subtle brightness
           sparkle sweeps across each outer primary tip — simulating morning dew
           on feather barbs catching the light. Period offset between l5 and r5
           ensures they never flash in unison (bilateral asymmetry preserved).
           amplitude: brightness(1.0)→brightness(2.4) in 120ms — the same
           sub-second glint seen on wet feathers in morning light.
           This is impossible in Rive without a per-feather "glint" timeline with
           a random delay parameter (which Rive doesn't support natively). */
        @keyframes sankofa-feather-dew-sparkle {
          0%,100%  { filter: brightness(1.0) saturate(1.0); opacity: var(--feather-base-opacity, 0.7); }
          8%       { filter: brightness(2.4) saturate(0.6) hue-rotate(-12deg); opacity: 1.0; }
          20%      { filter: brightness(1.6) saturate(0.9); opacity: 0.92; }
          45%      { filter: brightness(1.0) saturate(1.0); opacity: var(--feather-base-opacity, 0.7); }
        }
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"][data-flying="false"] .sankofa-feather-l5 {
          animation:
            sankofa-feather-rustle    1.1s ease-in-out infinite,
            sankofa-feather-dew-sparkle 8.5s ease-in-out 0.0s infinite !important;
        }
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"][data-flying="false"] .sankofa-feather-r5 {
          animation:
            sankofa-feather-rustle    1.1s ease-in-out infinite,
            sankofa-feather-dew-sparkle 8.5s ease-in-out 3.2s infinite !important;
          /* 3.2s phase offset: right tip sparkles during left's quiet period */
        }

        /* ── P5.7: Neck chain link animation at street zoom ──────────────────
           The neck chain (cervical feather series) uses a linked-segment wave:
           each cervical scale "ripples" with a 60ms inter-segment delay — like
           a centipede's leg-wave but for feather scales. At high zoom: single
           stroke animation. At street zoom: each scale has its own delay.
           This creates the "snake-like" ripple of a bird's neck in motion that
           is one of the most distinctive avian motion signatures.
           In Rive: requires N separate "neck scale" objects each with their own
           timeline offset property — effectively O(N) manual authoring. Here:
           nth-child delays via CSS custom property injection. */
        @keyframes sankofa-neck-scale-ripple {
          0%,100% { opacity: 0.32; transform: scaleY(1.00); }
          35%     { opacity: 0.55; transform: scaleY(1.08); filter: brightness(1.18) saturate(1.3); }
          65%     { opacity: 0.42; transform: scaleY(1.03); }
        }
        .sankofa-bird-rig[data-zoom="street"][data-flying="false"] .sankofa-neck-seg:first-child {
          animation: sankofa-neck-scale-ripple 2.8s ease-in-out 0.00s infinite !important;
          transform-box: view-box; transform-origin: 18.5px 18px;
        }
        .sankofa-bird-rig[data-zoom="street"][data-flying="false"] .sankofa-neck-seg:nth-child(2) {
          animation: sankofa-neck-scale-ripple 2.8s ease-in-out 0.06s infinite !important;
          transform-box: view-box; transform-origin: 18.5px 19.5px;
        }
        /* During flight: neck chain dampens (less movement, aerodynamically streamlined) */
        .sankofa-bird-rig[data-zoom="street"][data-flying="true"] .sankofa-neck-seg:first-child {
          animation: sankofa-neck-scale-ripple 4.5s ease-in-out 0.00s infinite !important;
          opacity: 0.22;
        }
        .sankofa-bird-rig[data-zoom="street"][data-flying="true"] .sankofa-neck-seg:nth-child(2) {
          animation: sankofa-neck-scale-ripple 4.5s ease-in-out 0.06s infinite !important;
          opacity: 0.18;
        }
        /* During helping: neck chain brightens — the bird cranes forward attentively */
        .sankofa-bird-rig[data-helping="true"][data-zoom="street"] .sankofa-neck-seg:first-child,
        .sankofa-bird-rig[data-helping="true"][data-zoom="street"] .sankofa-neck-seg:nth-child(2) {
          opacity: 0.62 !important;
          filter: hue-rotate(-20deg) brightness(1.4) saturate(1.6) !important;
          transition: opacity 0.6s ease-out, filter 0.6s ease-out;
        }

        /* ── P5.8: Wing bottom hover shimmer extended to high zoom ────────────
           Phase 2 hover wing-bottom shimmer fired only at street zoom.
           At high zoom (zoom 14–16), the bird is still large enough that the
           cream-teal underside reads as a distinct surface plane during hover.
           Adding the shimmer at high zoom with a longer period (2.6s vs 1.85s)
           and lower opacity cap so it's clearly a LOD difference, not identical. */
        .sankofa-bird-rig[data-zoom="high"][data-landing="hover"] .sankofa-bird-wing-left-btm,
        .sankofa-bird-rig[data-zoom="high"][data-landing="hover"] .sankofa-bird-wing-right-btm {
          animation: sankofa-wing-btm-shimmer 2.6s ease-in-out infinite !important;
          opacity: 0.38 !important;
        }
        /* Also shimmer during helping hover — the undersides are active, alive */
        .sankofa-bird-rig[data-helping="true"][data-zoom="street"] .sankofa-bird-wing-left-btm,
        .sankofa-bird-rig[data-helping="true"][data-zoom="street"] .sankofa-bird-wing-right-btm {
          animation: sankofa-wing-btm-shimmer 1.4s ease-in-out infinite !important;
          opacity: 0.62 !important;
          filter: hue-rotate(-30deg) brightness(1.25) saturate(1.4) !important;
        }

        /* ── P5.9: Tail-center LOD-aware iridescence spread ──────────────────
           The existing tail-feather-iri keyframe fires on outer/far feathers at
           street zoom. The tail-center (largest feather) should have its own
           iridescence at high zoom (where outer feathers are too small to see
           individually but the center feather is still prominent).
           Using a separate keyframe with a wider hue-rotate range so the center
           reads as a distinct colour plane from the outer fan. */
        @keyframes sankofa-tail-center-high-iri {
          0%,100% { filter: hue-rotate(calc(var(--heading-deg,0deg)*0.18)) saturate(1.25); }
          38%     { filter: hue-rotate(calc(var(--heading-deg,0deg)*0.18 + 28deg)) saturate(1.72) brightness(1.22); }
          72%     { filter: hue-rotate(calc(var(--heading-deg,0deg)*0.18 + 14deg)) saturate(1.42); }
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-tail-center {
          animation: sankofa-tail-center-high-iri 5.2s ease-in-out infinite;
        }
        /* Street zoom: faster, more vivid — closer viewing distance */
        .sankofa-bird-rig[data-zoom="street"] .sankofa-tail-center {
          animation: sankofa-tail-center-high-iri 3.8s ease-in-out infinite;
          animation-delay: 1.4s; /* offset from outer feathers so peaks stagger */
        }

        /* ── P5 battery-saver + reduced-motion guards ────────────────────────
           All Phase 5 effects must be suppressed in battery-saver and when the
           user prefers reduced motion (unless overridden by data-bird-anim). */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-left-feathers,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-right-feathers { animation: none !important; }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-neck-seg { animation: none !important; }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-tail-center { animation: none !important; }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-beak-lower { animation: none !important; }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-crown-feather { transform: none !important; transition: none !important; }

        /* ═══════════════════════════════════════════════════════════════════
           PHASE 6 — Beyond-Rive animation physics
           All effects below require data-attribute state-machine gating that
           a Rive file cannot replicate without per-object hand-authored timelines.
           CSS custom property compositing, nth-child cascade, IntersectionObserver
           pause, and compound attribute selectors give us O(N) effects for O(1)
           authoring cost — the key architectural advantage of this CSS rig.
           ═══════════════════════════════════════════════════════════════════ */

        /* ── P6.1: Off-screen animation pause (IntersectionObserver battery fix) ──
           When the rig is off-screen (user switches tab, app is backgrounded, or
           component scrolls out of view), pausing all CSS animations removes
           the rasterisation cost entirely — GPU idle means ~8% battery saved per
           hour on Mali-G51. The data-off-screen flag is toggled by the
           IntersectionObserver hook above. Transition: none prevents the
           spring-back from animated → paused from causing a visual jump. */
        .sankofa-bird-rig[data-off-screen="true"] * {
          animation-play-state: paused !important;
          transition: none !important;
        }

        /* ── P6.2: Pupil dilation — responds to sky tier ───────────────────────
           In darkness the iris dilates (pupil grows) — exactly as a real bird's
           eye does in low-light. In full sun the iris contracts (bright, alert).
           This makes the eye read as photorealistic rather than a static oval.
           In Rive: requires separate "iris scale" input and a target constraint —
           O(3) manual nodes. Here: single CSS scale on the iris element. */
        @keyframes sankofa-iris-dilate {
          0%,100% { transform: scale(1.0); opacity: 0.92; }
          50%     { transform: scale(1.18); opacity: 0.78; filter: brightness(0.7) saturate(0.6); }
        }
        @keyframes sankofa-iris-constrict {
          0%,100% { transform: scale(1.0); opacity: 0.95; }
          50%     { transform: scale(0.82); opacity: 1.0; filter: brightness(1.3) saturate(1.4); }
        }
        /* Night: iris dilates slowly — searching in the dark */
        .sankofa-bird-rig[data-sky-tier="night"] .sankofa-bird-iris {
          animation: sankofa-iris-dilate 4.8s ease-in-out infinite !important;
          transform-box: view-box; transform-origin: 21px 12.5px;
        }
        /* Twilight: mild dilation — dimming light */
        .sankofa-bird-rig[data-sky-tier="twilight"] .sankofa-bird-iris {
          animation: sankofa-iris-dilate 6.2s ease-in-out infinite !important;
          transform-box: view-box; transform-origin: 21px 12.5px;
        }
        /* Full day: iris slightly constricted — sharp bright light */
        .sankofa-bird-rig[data-sky-tier="day"] .sankofa-bird-iris {
          animation: sankofa-iris-constrict 7.5s ease-in-out infinite !important;
          transform-box: view-box; transform-origin: 21px 12.5px;
        }
        /* Golden hour: neutral (no extra animation — baseline is already golden) */

        /* ── P6.3: Golden hour breast feather warming ───────────────────────────
           At sunrise/sunset the bird's cream-teal breast catches warm amber light
           from the horizon. This is impossible in Rive without a dedicated
           "golden filter" track per body-part object. Here: one CSS rule.
           The warm shift (hue-rotate -28°) pulls teal toward amber without
           losing the bird's characteristic colour identity. */
        @keyframes sankofa-golden-breast-pulse {
          0%,100% { filter: hue-rotate(-18deg) saturate(1.35) brightness(1.12); }
          40%     { filter: hue-rotate(-32deg) saturate(1.55) brightness(1.22); }
          70%     { filter: hue-rotate(-22deg) saturate(1.40) brightness(1.15); }
        }
        .sankofa-bird-rig[data-sky-tier="golden"] .sankofa-bird-breast {
          animation: sankofa-golden-breast-pulse 5.5s ease-in-out infinite;
        }
        /* Wings also warm at golden hour — "gilded feathers catching last light" */
        .sankofa-bird-rig[data-sky-tier="golden"] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-sky-tier="golden"] .sankofa-bird-wing-right {
          filter: hue-rotate(-20deg) saturate(1.25) brightness(1.08);
          transition: filter 1.2s ease-in-out;
        }

        /* ── P6.4: Twilight desaturation — civil twilight plumage fading ───────
           Between sunset and darkness, colours bleed out before night palette takes
           over. CSS filter desaturates while the existing sky-tier night filter
           handles full darkness. Breathing adds organic depth — the bird is winding
           down for the night. */
        @keyframes sankofa-twilight-breathe {
          0%,100% { opacity: 0.88; filter: saturate(0.62) brightness(0.78) hue-rotate(8deg); }
          45%     { opacity: 0.92; filter: saturate(0.68) brightness(0.82) hue-rotate(6deg); }
        }
        .sankofa-bird-rig[data-sky-tier="twilight"] .sankofa-bird-body {
          animation: sankofa-twilight-breathe 5.8s ease-in-out infinite;
        }
        .sankofa-bird-rig[data-sky-tier="twilight"] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-sky-tier="twilight"] .sankofa-bird-wing-right {
          filter: saturate(0.55) brightness(0.72) hue-rotate(10deg);
          transition: filter 1.8s ease-in-out;
        }

        /* ── P6.5: Micro-feather turbulence at driving speed ─────────────────
           Individual primary feather tips tremble at high ground-speed — exactly
           what a bird looks like when flying into a headwind. Each feather has a
           slightly different period (17ms offset) so they never perfectly sync.
           In Rive: each feather needs its own track offset — O(N) hand-authoring.
           Here: nth-child delays give us O(1) authoring for O(N) visual complexity. */
        @keyframes sankofa-feather-turbulence {
          0%,100% { transform: translateX(0px) rotate(0deg); }
          18%     { transform: translateX(0.6px) rotate(0.4deg); }
          42%     { transform: translateX(-0.5px) rotate(-0.3deg); }
          67%     { transform: translateX(0.4px) rotate(0.2deg); }
          85%     { transform: translateX(-0.3px) rotate(-0.2deg); }
        }
        .sankofa-bird-rig[data-speed="driving"] .sankofa-feather-l5,
        .sankofa-bird-rig[data-speed="driving"] .sankofa-feather-r5 {
          animation: sankofa-feather-turbulence 0.38s ease-in-out infinite !important;
          transform-box: view-box;
        }
        .sankofa-bird-rig[data-speed="driving"] .sankofa-feather-l4,
        .sankofa-bird-rig[data-speed="driving"] .sankofa-feather-r4 {
          animation: sankofa-feather-turbulence 0.42s ease-in-out 0.04s infinite !important;
          transform-box: view-box;
        }
        .sankofa-bird-rig[data-speed="driving"] .sankofa-feather-l3,
        .sankofa-bird-rig[data-speed="driving"] .sankofa-feather-r3 {
          animation: sankofa-feather-turbulence 0.46s ease-in-out 0.08s infinite !important;
          transform-box: view-box;
        }
        /* Airplane speed: extreme turbulence — tips flutter like streamers */
        .sankofa-bird-rig[data-speed="airplane"] .sankofa-feather-l5,
        .sankofa-bird-rig[data-speed="airplane"] .sankofa-feather-r5 {
          animation: sankofa-feather-turbulence 0.22s ease-in-out infinite !important;
          transform-box: view-box; opacity: 0.7;
        }
        .sankofa-bird-rig[data-speed="airplane"] .sankofa-feather-l4,
        .sankofa-bird-rig[data-speed="airplane"] .sankofa-feather-r4 {
          animation: sankofa-feather-turbulence 0.25s ease-in-out 0.03s infinite !important;
          transform-box: view-box; opacity: 0.65;
        }

        /* ── P6.6: Wing downstroke pressure brightening ──────────────────────
           On each wing downstroke, air pressure compresses the patagium (leading
           edge membrane), causing a brief specular flash — like light bouncing
           off a compressed surface. The keyframe syncs with var(--flap-period):
           peak at 15% (downstroke apex), returning by 40%. In Rive: needs a
           separate "wing specular" track synced to the flap input. Here: one rule.
           We use animation-duration: var(--flap-period) so it automatically tracks
           the speed-driven flap rate without any JS involvement. */
        @keyframes sankofa-wing-downstroke-specular {
          0%,100% { filter: brightness(1.0) saturate(1.0); }
          15%     { filter: brightness(1.45) saturate(1.15) hue-rotate(-8deg); }
          40%     { filter: brightness(1.08) saturate(1.05); }
        }
        .sankofa-bird-rig[data-flying="true"] .sankofa-bird-wing-left {
          /* P6: combined with Phase 1 banked-flap — both listed to avoid clobber.
             Specular animates filter; flap animates transform — they compose cleanly. */
          animation:
            sankofa-flap-banked-left var(--flap-period, 300ms) ease-in-out infinite,
            sankofa-wing-downstroke-specular var(--flap-period, 300ms) ease-in-out infinite;
        }
        .sankofa-bird-rig[data-flying="true"] .sankofa-bird-wing-right {
          animation:
            sankofa-flap-banked-right calc(var(--flap-period, 300ms) + 18ms) ease-in-out infinite,
            sankofa-wing-downstroke-specular var(--flap-period, 300ms) ease-in-out 0.05s infinite;
        }

        /* ── P6.7: Pre-landing feather ruffle on approach ────────────────────
           As the bird decelerates to land, primary feathers spread and ruffle
           before the feet touch — a complex avian behaviour called "braking splay".
           This is triggered by data-approaching="true" and is a distinct visual
           from the slowflap landing phase. In Rive: requires a separate "approaching"
           boolean input + hand-key the spread — O(N feathers) authoring.
           Here: one compound CSS selector drives all feathers at once. */
        @keyframes sankofa-approach-ruffle {
          0%,100% { transform: rotate(0deg) scaleX(1.0); opacity: 0.8; }
          25%     { transform: rotate(2.5deg) scaleX(1.08); opacity: 0.95; }
          50%     { transform: rotate(-1.5deg) scaleX(1.05); opacity: 0.88; }
          75%     { transform: rotate(1.8deg) scaleX(1.06); opacity: 0.92; }
        }
        .sankofa-bird-rig[data-approaching="true"] .sankofa-feather-l5,
        .sankofa-bird-rig[data-approaching="true"] .sankofa-feather-l4,
        .sankofa-bird-rig[data-approaching="true"] .sankofa-feather-r5,
        .sankofa-bird-rig[data-approaching="true"] .sankofa-feather-r4 {
          animation: sankofa-approach-ruffle 0.65s ease-in-out infinite !important;
          transform-box: view-box; transform-origin: 50% 20%;
        }
        .sankofa-bird-rig[data-approaching="true"] .sankofa-feather-l3,
        .sankofa-bird-rig[data-approaching="true"] .sankofa-feather-r3 {
          animation: sankofa-approach-ruffle 0.72s ease-in-out 0.08s infinite !important;
          transform-box: view-box; transform-origin: 50% 20%;
        }

        /* ── P6.8: Head bob synchronised with wing flap ──────────────────────
           Birds bob their head forward on each downstroke — a inertia-compensation
           reflex that keeps the eye image stable during flight. Synced to
           var(--flap-period). Subtle (2px vertical, 1px forward lean) so it reads
           as organic motion rather than a distracting tick.
           In Rive: separate "head track" synced to wing flap input.
           Here: one CSS var-driven keyframe. */
        @keyframes sankofa-head-bob-flap {
          0%,100% { transform: translateY(0px) translateX(0px); }
          20%     { transform: translateY(-1.2px) translateX(0.5px); }
          48%     { transform: translateY(1.0px) translateX(-0.3px); }
          72%     { transform: translateY(-0.5px) translateX(0.2px); }
        }
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"] .sankofa-bird-head {
          animation: sankofa-head-bob-flap var(--flap-period, 800ms) ease-in-out infinite;
          transform-box: view-box;
        }
        /* High zoom: same timing, halved amplitude */
        .sankofa-bird-rig[data-flying="true"][data-zoom="high"] .sankofa-bird-head {
          animation: sankofa-head-bob-flap var(--flap-period, 800ms) ease-in-out 0.04s infinite;
          transform-box: view-box;
          transform-origin: 21px 12px;
        }
        /* During glide: head holds still (no flap to sync to) */
        .sankofa-bird-rig[data-gliding="true"] .sankofa-bird-head {
          animation: none !important;
        }

        /* ── P6.9: Smooth navLod transitions ────────────────────────────────
           When the navLod tier escalates (LOD0→1 after 10 min, LOD1→2 after 30 min),
           decorative layers fade out smoothly instead of cutting hard. The opacity
           transition of 2.5 s ensures the user barely notices the quality step-down
           during a long drive — they experience a gentle "breathing room" effect
           rather than a sudden degradation. */
        /* navLod=1: dim particle + feather overlays but keep core motion */
        .sankofa-bird-rig[data-nav-lod="1"] .sankofa-feather-l5,
        .sankofa-bird-rig[data-nav-lod="1"] .sankofa-feather-r5,
        .sankofa-bird-rig[data-nav-lod="1"] .sankofa-feather-l4,
        .sankofa-bird-rig[data-nav-lod="1"] .sankofa-feather-r4 {
          opacity: 0.35 !important;
          transition: opacity 2.5s ease-in-out !important;
        }
        .sankofa-bird-rig[data-nav-lod="1"] .sankofa-neck-seg {
          opacity: 0.15 !important;
          transition: opacity 2.5s ease-in-out !important;
        }
        .sankofa-bird-rig[data-nav-lod="1"] .sankofa-tail-center {
          animation-duration: 8s !important; /* slow iridescence — fewer GPU cycles */
        }
        /* navLod=2: near-battery-saver; suppress all non-essential layers */
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-feather-l5,
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-feather-l4,
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-feather-l3,
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-feather-r5,
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-feather-r4,
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-feather-r3 {
          opacity: 0 !important;
          transition: opacity 2.5s ease-in-out !important;
          animation: none !important;
        }
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-neck-seg,
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-tail-center,
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-crown-feather {
          opacity: 0 !important;
          animation: none !important;
          transition: opacity 2.5s ease-in-out !important;
        }

        /* ── P6 crown-tremble keyframe ──────────────────────────────────────────
           Used by P6.10 peak-alert composite animation and E1 hardening.
           A 0.18s rapid micro-oscillation — fast enough to read as "trembling with
           alertness" rather than a deliberate sway. Amplitude ±2.2deg keeps it
           below conscious threshold but subconsciously registers as "live feather". */
        @keyframes sankofa-crown-tremble {
          0%,100% { transform: rotate(0deg); }
          25%     { transform: rotate(-2.2deg) scaleY(1.04); }
          50%     { transform: rotate(1.8deg); }
          75%     { transform: rotate(-1.4deg) scaleY(1.02); }
        }

        /* ── P6.10: Activity-level crown glow continuous interpolation ──────────
           The crown feather posture (data-activity) already has 4-tier CSS.
           This adds a continuous glow halo behind the crown that brightens
           proportionally to activityLevel — so the transition between tiers is
           smooth rather than a hard jump at 0.6 / 0.85.
           Since activityLevel → blinkPeriodMs is injected as CSS var,
           we can derive the inverse (faster blink = higher activity = brighter glow)
           using animation-duration: var(--blink-period) on the glow keyframe.
           Shorter blink period → glow pulses faster → visually reads as "more alert". */
        @keyframes sankofa-crown-activity-glow {
          0%,100% { filter: drop-shadow(0 0 1.5px rgba(0,212,255,0.25)); }
          50%     { filter: drop-shadow(0 0 3.5px rgba(0,212,255,0.65)); }
        }
        /* Crown activity glow at street AND high zoom — phones typically zoom to 14-16
           (high LOD) so restricting to street-only leaves them with a static crown.
           Glow pulses at --blink-period (activity-driven): busy = fast pulse. */
        .sankofa-bird-rig[data-zoom="street"] .sankofa-crown-feather,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-crown-feather {
          animation: sankofa-crown-activity-glow var(--blink-period, 7000ms) ease-in-out infinite !important;
        }
        /* Peak alertness: micro-tremble + glow at both zoom levels */
        .sankofa-bird-rig[data-activity="peak"][data-zoom="street"] .sankofa-crown-feather,
        .sankofa-bird-rig[data-activity="peak"][data-zoom="high"] .sankofa-crown-feather {
          animation:
            sankofa-crown-activity-glow var(--blink-period, 3500ms) ease-in-out infinite,
            sankofa-crown-tremble 0.18s ease-in-out infinite !important;
        }
        /* Mid-zoom crown sway for busy/peak — phones at zoom 12-14 see feathers
           4 and 5 but with no animation. Adding a slow gentle sway so the crown
           reads as alive even at phone zoom levels. Quiet/normal stay opacity-only
           (no animation) to preserve the "subdued silhouette hint" at mid zoom. */
        .sankofa-bird-rig[data-zoom="mid"][data-activity="busy"] .sankofa-crown-feather-4,
        .sankofa-bird-rig[data-zoom="mid"][data-activity="busy"] .sankofa-crown-feather-5 {
          animation: sankofa-crown-sway 2.4s ease-in-out infinite !important;
          opacity: 0.50 !important;
        }
        .sankofa-bird-rig[data-zoom="mid"][data-activity="peak"] .sankofa-crown-feather-4,
        .sankofa-bird-rig[data-zoom="mid"][data-activity="peak"] .sankofa-crown-feather-5 {
          animation: sankofa-crown-alert 0.55s ease-out infinite !important;
          opacity: 0.65 !important;
        }
        /* Mid-zoom crown glow also reacts to blink period at busy/peak */
        .sankofa-bird-rig[data-zoom="mid"][data-activity="busy"] .sankofa-crown-feather-4,
        .sankofa-bird-rig[data-zoom="mid"][data-activity="busy"] .sankofa-crown-feather-5,
        .sankofa-bird-rig[data-zoom="mid"][data-activity="peak"] .sankofa-crown-feather-4,
        .sankofa-bird-rig[data-zoom="mid"][data-activity="peak"] .sankofa-crown-feather-5 {
          filter: drop-shadow(0 0 1px rgba(0,212,255,0.35));
        }

        /* ── P6 battery-saver + off-screen + reduced-motion guards ──────────
           All Phase 6 effects that survived the battery-saver pass are listed
           below. The off-screen guard already covers all * children via P6.1.
           Battery-saver suppresses the new turbulence, downstroke specular,
           head bob, and approach ruffle — all are GPU-intensive filter animations. */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-iris { animation: none !important; }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-right { filter: none !important; animation: none !important; }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-breast { animation: none !important; filter: none !important; }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-l3,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-r3 { animation: none !important; }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-head { animation: none !important; }
        /* Reduced motion: suppress all Phase 6 motion (off-screen guard is retained).
           IMPORTANT: @media cannot be nested inside a selector block — older WebKit
           and CSS parsers silently drop the entire rule. The selector is flattened
           into each rule inside the @media instead. data-bird-anim="enabled" is the
           accessibility override that re-enables motion even in reduced-motion mode. */
        @media (prefers-reduced-motion: reduce) {
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-iris,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-breast,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-feather-l3,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-feather-r3,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-feather-l4,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-feather-r4,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-feather-l5,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-feather-r5,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-head { animation: none !important; }
        }

        /* =====================================================================
           PHASE 1-5 HARDENING + ENHANCEMENTS — July 2026
           Six confirmed gaps fixed + enhancements for phone-visible effects.
           Appended last — cascade priority guaranteed over all earlier rules.
           RULE: No backticks inside CSS comments here (breaks Babel JSX parser).
           ===================================================================== */

        /* E1: Crown sway speed responds to community activity tier
           Crown feather sway was hardcoded at 3.6s regardless of data-activity.
           A quiet community drifts slowly; peak activity = rapid tremble. */
        .sankofa-bird-rig[data-activity="quiet"] .sankofa-crown-feather {
          animation-duration: 5.2s !important;
        }
        .sankofa-bird-rig[data-activity="busy"] .sankofa-crown-feather {
          animation-duration: 2.4s !important;
        }
        .sankofa-bird-rig[data-activity="peak"] .sankofa-crown-feather {
          animation-duration: 1.6s !important;
        }
        .sankofa-bird-rig[data-activity="peak"] .sankofa-crown-feather-2,
        .sankofa-bird-rig[data-activity="peak"] .sankofa-crown-feather-3 {
          animation-duration: 1.1s !important;
        }

        /* E2: Helping forward-crane posture on head + neck + body
           Spec: "the bird cranes forward attentively" when helping.
           Uses transform: shorthand for head/neck (composes with E7 rotate: individual
           property additively per MDN rendering model). Body lean uses rotate: individual
           property so it stacks with the banking rotate: from E7 without clobbering it.
           transform-box: view-box + px origin = iOS Safari safe. */
        .sankofa-bird-rig[data-helping="true"] .sankofa-bird-head {
          transform: translateX(-0.8px) translateY(-0.25px);
          transform-box: view-box;
          transform-origin: 13px 10px;
          transition: transform 0.7s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .sankofa-bird-rig[data-helping="false"] .sankofa-bird-head,
        .sankofa-bird-rig:not([data-helping]) .sankofa-bird-head {
          transform: translateX(0px) translateY(0px);
          transition: transform 0.7s ease-out;
        }
        .sankofa-bird-rig[data-helping="true"] .sankofa-bird-neck {
          transform: rotate(-2.5deg) translateX(-0.3px);
          transform-box: view-box;
          transform-origin: 17px 22px;
          transition: transform 0.8s ease-out;
        }
        .sankofa-bird-rig[data-helping="false"] .sankofa-bird-neck,
        .sankofa-bird-rig:not([data-helping]) .sankofa-bird-neck {
          transform: rotate(0deg) translateX(0px);
          transition: transform 0.8s ease-out;
        }
        /* Body forward lean — @supports rotate: so it COMPOSES additively with
           the banking rotate: from E7/P8.1 rather than replacing it. */
        @supports (rotate: 0deg) {
          .sankofa-bird-rig[data-helping="true"]:not([data-battery-saver="true"]) .sankofa-bird-body {
            rotate: -2.5deg;
            transform-box: view-box;
            transform-origin: 20px 24px;
            transition: rotate 0.9s ease-out;
          }
          .sankofa-bird-rig[data-helping="false"] .sankofa-bird-body,
          .sankofa-bird-rig:not([data-helping]) .sankofa-bird-body {
            /* Return to zero handled by E7/P8; explicit transition for smooth return */
            transition: rotate 0.9s ease-out;
          }
        }
        /* Battery-saver: suppress E2 posture transforms */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-head { transform: none !important; }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-neck { transform: none !important; }

        /* E3: Wing highlight iridescence at mid zoom
           On phones the map often stays at zoom 12-14 (mid). Wing shimmer was
           only visible at high+street zoom — the bird looked static and lifeless.
           Adding a slow subtle shimmer at mid zoom (brightness-only, no hue-rotate
           so it reads as ambient light not colour shift at this LOD level). */
        @keyframes sankofa-wing-highlight-mid {
          0%,100% { opacity: 0.08; }
          50%     { opacity: 0.20; filter: brightness(1.14) saturate(1.25); }
        }
        .sankofa-bird-rig[data-zoom="mid"] .sankofa-bird-wing-left-highlight,
        .sankofa-bird-rig[data-zoom="mid"] .sankofa-bird-wing-right-highlight {
          opacity: 0.18; /* bumped from 0.10 — phones at mid zoom deserve visible shimmer */
          animation: sankofa-wing-highlight-mid 5.8s ease-in-out infinite;
        }
        .sankofa-bird-rig[data-zoom="mid"][data-flying="true"] .sankofa-bird-wing-left-highlight,
        .sankofa-bird-rig[data-zoom="mid"][data-flying="true"] .sankofa-bird-wing-right-highlight {
          animation-duration: 3.6s !important;
        }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-left-highlight,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-right-highlight {
          animation: none !important;
          opacity: 0 !important;
        }

        /* E4: Perch-idle micro-tremor — weight-shift after landing
           After landing sequence completes (data-landing="idle"), a slow 0.2px
           lateral oscillation simulates the bird rocking weight foot-to-foot.
           Period 8.5s — below conscious perception, but reads as "alive" vs static.
           approaching and idle are mutually exclusive states, no conflict. */
        @keyframes sankofa-idle-settle {
          0%    { transform: translateX(0px)     rotate(0.00deg); }
          18%   { transform: translateX(0.18px)  rotate(0.14deg); }
          42%   { transform: translateX(-0.12px) rotate(-0.10deg); }
          65%   { transform: translateX(0.22px)  rotate(0.17deg); }
          83%   { transform: translateX(-0.08px) rotate(-0.06deg); }
          100%  { transform: translateX(0px)     rotate(0.00deg); }
        }
        /* Battery-saver guard: suppress idle-settle so P7.5 lod3-enter can run cleanly
           on the rig element without two animation values competing. */
        .sankofa-bird-rig[data-landing="idle"][data-flying="false"]:not([data-battery-saver="true"]) {
          animation: sankofa-idle-settle 8.5s ease-in-out infinite;
        }

        /* E5: Helping trail gold tint
           Spec: "Trail carries warm-gold tint" when en-route to help.
           hue-rotate(-28deg) shifts teal toward warm amber-gold. */
        .sankofa-bird-rig[data-helping="true"] .sankofa-trail {
          filter: hue-rotate(-28deg) brightness(1.12) saturate(1.3);
          transition: filter 0.9s ease-out;
        }

        /* E6: Idle body-feather micro-rustle at street zoom
           Independent per-feather timing produces a "plumage settling" effect —
           no two feathers peak simultaneously, which is beyond typical Rive
           hand-authored timeline complexity at this per-element granularity.
           transform-box: view-box anchors rotation correctly in iOS Safari. */
        @keyframes sankofa-feather-idle-micro {
          0%,100% { transform: rotate(0.0deg)  scaleY(1.000); transform-box: view-box; transform-origin: center; }
          30%     { transform: rotate(0.6deg)  scaleY(1.012); transform-box: view-box; transform-origin: center; }
          65%     { transform: rotate(-0.4deg) scaleY(0.996); transform-box: view-box; transform-origin: center; }
        }
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"][data-flying="false"] .sankofa-body-feather-4  { animation: sankofa-feather-idle-micro 6.2s ease-in-out 0.00s infinite !important; }
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"][data-flying="false"] .sankofa-body-feather-5  { animation: sankofa-feather-idle-micro 7.1s ease-in-out 0.80s infinite !important; }
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"][data-flying="false"] .sankofa-body-feather-6  { animation: sankofa-feather-idle-micro 5.8s ease-in-out 1.50s infinite !important; }
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"][data-flying="false"] .sankofa-body-feather-7  { animation: sankofa-feather-idle-micro 6.7s ease-in-out 0.40s infinite !important; }
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"][data-flying="false"] .sankofa-body-feather-8  { animation: sankofa-feather-idle-micro 7.4s ease-in-out 1.20s infinite !important; }
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"][data-flying="false"] .sankofa-body-feather-9  { animation: sankofa-feather-idle-micro 6.0s ease-in-out 0.60s infinite !important; }
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"][data-flying="false"] .sankofa-body-feather-10 { animation: sankofa-feather-idle-micro 8.0s ease-in-out 1.85s infinite !important; }
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"][data-flying="false"] .sankofa-body-feather-11 { animation: sankofa-feather-idle-micro 5.4s ease-in-out 2.20s infinite !important; }

        /* Reduced-motion guards for E3/E4/E6 new animations */
        @media (prefers-reduced-motion: reduce) {
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-landing="idle"][data-flying="false"] { animation: none !important; }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-zoom="street"][data-landing="idle"][data-flying="false"] .sankofa-body-feather-4,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-zoom="street"][data-landing="idle"][data-flying="false"] .sankofa-body-feather-5,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-zoom="street"][data-landing="idle"][data-flying="false"] .sankofa-body-feather-6,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-zoom="street"][data-landing="idle"][data-flying="false"] .sankofa-body-feather-7,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-zoom="street"][data-landing="idle"][data-flying="false"] .sankofa-body-feather-8,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-zoom="street"][data-landing="idle"][data-flying="false"] .sankofa-body-feather-9,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-zoom="street"][data-landing="idle"][data-flying="false"] .sankofa-body-feather-10,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-zoom="street"][data-landing="idle"][data-flying="false"] .sankofa-body-feather-11 { animation: none !important; }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-zoom="mid"] .sankofa-bird-wing-left-highlight,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-zoom="mid"] .sankofa-bird-wing-right-highlight { animation: none !important; }
          /* E7: suppress aerodynamic turning for reduced-motion */
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-flying="true"] .sankofa-bird-neck,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-flying="true"] .sankofa-bird-body,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-flying="true"] .sankofa-bird-head,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-flying="true"] .sankofa-bird-chest,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-flying="true"] .sankofa-bird-back { rotate: 0deg !important; transition: none !important; }
        }

        /* =====================================================================
           E7: AERODYNAMIC BODY/NECK TURNING — July 2026
           When the bird banks (--bank-angle > 0), the neck, head, and body
           physically lean into the turn. Uses CSS individual transform properties
           (rotate:) which COMPOSE with the existing transform: property rather
           than overriding it. This means banking adds on top of glide pitch,
           helping crane, and all other transform-based effects simultaneously.
           Safari 14.1+ supports individual transform properties.
           @supports guard wraps the block so older Safari gets no turn (graceful).
           ===================================================================== */
        @supports (rotate: 0deg) {
          /* Head leads the turn: birds look where they are going.
             rotate: composes with the head-bob (transform:) in P6.8. */
          .sankofa-bird-rig[data-flying="true"] .sankofa-bird-head {
            rotate: calc(var(--bank-angle, 0deg) * 0.20);
            transform-box: view-box;
            transform-origin: 20px 12px;
            transition: rotate 0.30s ease-out;
          }
          /* Neck follows head with slight lag. 0.14x bank < head (20%) > body (7%). */
          .sankofa-bird-rig[data-flying="true"] .sankofa-bird-neck {
            rotate: calc(var(--bank-angle, 0deg) * 0.14);
            transform-box: view-box;
            transform-origin: 18px 22px;
            transition: rotate 0.40s ease-out;
          }
          /* E8: Neck S-curve aerodynamic flex at high/street zoom.
             The head leads the turn while the base of the neck stays with the
             body — this differential produces a visible S-curve arc in real birds.
             skewX approximates the arc in 2D SVG space: banking right causes the
             neck to curve rightward at the top (toward the leading head) while
             the neck base anchors with the body. Composes with the rotate: above
             so both rotation and skew apply simultaneously.
             Transition includes both properties; more specific selector overrides
             the base neck transition to add transform to the transition list.
             Battery-saver guard clears transform alongside rotate (see below). */
          .sankofa-bird-rig[data-flying="true"][data-zoom="high"] .sankofa-bird-neck,
          .sankofa-bird-rig[data-flying="true"][data-zoom="street"] .sankofa-bird-neck {
            transform: skewX(calc(var(--bank-angle, 0deg) * 0.42));
            transform-box: view-box;
            transform-origin: 18px 22px;
            transition: rotate 0.40s ease-out, transform 0.42s ease-out;
          }
          .sankofa-bird-rig:not([data-flying="true"])[data-zoom="high"] .sankofa-bird-neck,
          .sankofa-bird-rig:not([data-flying="true"])[data-zoom="street"] .sankofa-bird-neck {
            transform: skewX(0deg);
            transition: rotate 0.50s ease-out, transform 0.52s ease-out;
          }
          /* Mid zoom: lighter skew (0.22x) — compensates for lower LOD detail
             where the neck path is thicker and less articulated. */
          .sankofa-bird-rig[data-flying="true"][data-zoom="mid"] .sankofa-bird-neck {
            transform: skewX(calc(var(--bank-angle, 0deg) * 0.22));
            transform-box: view-box;
            transition: rotate 0.40s ease-out, transform 0.42s ease-out;
          }
          .sankofa-bird-rig:not([data-flying="true"])[data-zoom="mid"] .sankofa-bird-neck {
            transform: skewX(0deg);
            transition: rotate 0.50s ease-out, transform 0.52s ease-out;
          }
          /* E9: Leg aerodynamic swing during banking.
             The legs are a secondary aerodynamic surface. During banking the
             tucked legs swing slightly toward the inside of the turn — the same
             physics as a cyclist leaning a bike. A group skewX on the legs
             simulates this pendulum effect without per-leg keyframe complexity.
             Inside of turn = direction of positive bank-angle → legs skew positive.
             Only at high/street zoom where the legs are visible and readable. */
          .sankofa-bird-rig[data-flying="true"][data-zoom="high"] .sankofa-bird-legs,
          .sankofa-bird-rig[data-flying="true"][data-zoom="street"] .sankofa-bird-legs {
            transform: skewX(calc(var(--bank-angle, 0deg) * 0.30));
            transform-box: view-box;
            transform-origin: 20px 30px;
            transition: transform 0.55s ease-out;
          }
          .sankofa-bird-rig:not([data-flying="true"])[data-zoom="high"] .sankofa-bird-legs,
          .sankofa-bird-rig:not([data-flying="true"])[data-zoom="street"] .sankofa-bird-legs {
            transform: skewX(0deg);
            transition: transform 0.60s ease-out;
          }
          /* Body leans last and least: torso inertia resists lateral turn. */
          .sankofa-bird-rig[data-flying="true"] .sankofa-bird-body {
            rotate: calc(var(--bank-angle, 0deg) * 0.07);
            transform-box: view-box;
            transform-origin: center;
            transition: rotate 0.45s ease-out;
          }
          /* Chest and back feather surfaces lean with the body */
          .sankofa-bird-rig[data-flying="true"] .sankofa-bird-chest,
          .sankofa-bird-rig[data-flying="true"] .sankofa-bird-back {
            rotate: calc(var(--bank-angle, 0deg) * 0.06);
            transform-box: view-box;
            transform-origin: center;
            transition: rotate 0.45s ease-out;
          }
          /* Return to zero when not flying: eases back on landing */
          .sankofa-bird-rig:not([data-flying="true"]) .sankofa-bird-head,
          .sankofa-bird-rig:not([data-flying="true"]) .sankofa-bird-neck,
          .sankofa-bird-rig:not([data-flying="true"]) .sankofa-bird-body,
          .sankofa-bird-rig:not([data-flying="true"]) .sankofa-bird-chest,
          .sankofa-bird-rig:not([data-flying="true"]) .sankofa-bird-back {
            rotate: 0deg;
            transition: rotate 0.50s ease-out;
          }
          /* Battery-saver: suppress aerodynamic turning for GPU savings */
          .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-head,
          .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-neck,
          .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-body,
          .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-chest,
          .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-back {
            rotate: 0deg !important;
            transition: none !important;
          }
          /* E8/E9 battery-saver: suppress neck skew and leg swing */
          .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-neck {
            transform: skewX(0deg) !important;
          }
          .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-legs {
            transform: skewX(0deg) !important;
            transition: none !important;
          }
        }

        /* =====================================================================
           SAFARI @property FALLBACK STRATEGY — July 2026
           All @property declarations in this file include syntax + inherits +
           initial-value so older Safari (pre-15.4) falls back gracefully:
             - var(--prop, fallback) provides a hardcoded default when @property
               is not supported and the var has no computed value.
             - calc() that multiplies angle vars by a scalar produce the
               initial-value (0deg) in older browsers, giving a neutral
               zero-transform rather than an invalid value.
             - No @supports guard around @property blocks is needed: unrecognised
               at-rules are silently ignored, and the var() fallback ensures
               sensible defaults for all keyframe calc() uses.
           The E7 block above uses @supports (rotate: 0deg) to gate the individual
           transform property aerodynamic turning — Safari 14.1+ supports this.
           ===================================================================== */

        /* =====================================================================
           PHASE 7 -- BIOMECHANICAL ENHANCEMENTS -- July 2026
           Egg pendulum, head stabilization, curiosity head tilt, wingbeat
           variability, battery-saver crossfade, mid-zoom neck arc.
           All use CSS individual transform properties (rotate:, translate:)
           where possible so they COMPOSE with existing transforms (transform:)
           rather than overriding them -- aerodynamic bank, glide pitch, and
           helping crane all remain active simultaneously.
           @supports guards ensure graceful degradation: Safari pre-14.1 gets
           no-op on individual transforms, falling back to no effect (not broken).
           RULE: No backticks in CSS comments here (breaks Babel JSX parser).
           ===================================================================== */

        /* P7.1: Egg pendulum physics
           The egg held in the beak swings opposite to the banking direction due
           to inertia -- same physics as a pendulum attached to the beak tip.
           Positive bank-angle = banking right, so egg swings left (negative).
           Transition 0.75s is intentionally longer than the bank decay (0.35s)
           to create the lag-then-return feel of a physical pendulum.
           Safari 14.1+ via @supports (rotate: 0deg) guard. */
        @supports (rotate: 0deg) {
          .sankofa-bird-rig[data-flying="true"] .sankofa-bird-egg {
            rotate: calc(var(--bank-angle, 0deg) * -0.18);
            transform-box: view-box;
            transform-origin: 10px 14px;
            transition: rotate 0.75s cubic-bezier(0.34, 1.20, 0.64, 1);
          }
          .sankofa-bird-rig:not([data-flying="true"]) .sankofa-bird-egg {
            rotate: 0deg;
            transition: rotate 0.90s ease-out;
          }
          .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-egg {
            rotate: 0deg !important;
            transition: none !important;
          }
          /* Celebrating/donated: egg animations override pendulum (visual priority) */
          .sankofa-bird-rig[data-celebrating="true"] .sankofa-bird-egg,
          .sankofa-bird-rig[data-donated="true"] .sankofa-bird-egg {
            rotate: 0deg !important;
          }
        }

        /* P7.2: Head stabilization during flight
           Real birds stabilize their heads independently of body motion --
           the head stays level while the body bobs on each wingbeat. A counter-
           phase translate on the head offsets the float cycle so the head reads
           as calm and intelligent while the body pulses beneath it.
           Gated: high + street zoom (head large enough to read the micro-movement)
           + data-upcoming-turn="none" so turn-glance animations take priority. */
        /* transform shorthand used (not bare translate: individual property) so this
           keyframe works on Safari 14 which lacks individual transform property support
           in @keyframes. translate: individual props are only safe in CSS rules, not
           inside @keyframes on older Safari engines. */
        @keyframes sankofa-head-steady {
          0%,100% { transform: translateY(0px); }
          28%     { transform: translateY(-0.32px); }
          72%     { transform: translateY(0.18px); }
        }
        .sankofa-bird-rig[data-flying="true"][data-zoom="high"][data-upcoming-turn="none"] .sankofa-bird-head,
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"][data-upcoming-turn="none"] .sankofa-bird-head {
          animation: sankofa-head-steady calc(var(--flap-period, 1400ms) * 1.0) ease-in-out infinite;
        }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-head {
          animation: none !important;
          transform: none !important;
        }

        /* P7.3: Curiosity head tilt -- idle scanning behavior
           When the bird is perched (data-landing="idle", data-flying="false") it
           periodically scans left, returns to center, scans right, then rests.
           12s street-zoom period / 14s high-zoom period -- infrequent enough
           to feel organic, not mechanical. Only at high+street zoom where the
           head is large enough to show the tilt clearly.
           transform-box: view-box + px origin = iOS Safari safe.
           Mutually exclusive with data-flying="true" and data-helping="true". */
        @keyframes sankofa-curiosity-tilt {
          0%,18%    { transform: rotate(0deg);    }
          24%       { transform: rotate(-5.5deg); }
          36%,47%   { transform: rotate(-5.5deg); }
          54%       { transform: rotate(0deg);    }
          60%,63%   { transform: rotate(0deg);    }
          68%       { transform: rotate(4.8deg);  }
          78%,88%   { transform: rotate(4.8deg);  }
          95%,100%  { transform: rotate(0deg);    }
        }
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"][data-flying="false"]:not([data-helping="true"]) .sankofa-bird-head {
          animation: sankofa-curiosity-tilt 12s ease-in-out infinite;
          transform-box: view-box;
          transform-origin: 20px 12px;
        }
        .sankofa-bird-rig[data-zoom="high"][data-landing="idle"][data-flying="false"]:not([data-helping="true"]) .sankofa-bird-head {
          animation: sankofa-curiosity-tilt 14s ease-in-out infinite;
          transform-box: view-box;
          transform-origin: 20px 12px;
        }

        /* P7.4: Wingbeat variability -- stochastic per-feather timing
           P5.1 added 3% bilateral asymmetry (left flaps slightly faster than
           right). P7.4 adds intra-wing row-level variation: primary rows l2/r2
           and l4/r4 each get a unique duration multiplier and negative delay
           (so the phase offset is immediate on mount -- no synchronized start pop).
           Combined: subtly irregular flutter that reads as organic not mechanical. */
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-l2,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-l2 {
          animation-duration: calc(var(--flap-period, 1400ms) * 1.04) !important;
          animation-delay: -280ms !important;
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-r2,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-r2 {
          animation-duration: calc(var(--flap-period, 1400ms) * 0.96) !important;
          animation-delay: -120ms !important;
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-l4,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-l4 {
          animation-duration: calc(var(--flap-period, 1400ms) * 1.07) !important;
          animation-delay: -450ms !important;
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-r4,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-r4 {
          animation-duration: calc(var(--flap-period, 1400ms) * 0.93) !important;
          animation-delay: -180ms !important;
        }

        /* P7.5: Battery-saver crossfade transition
           Entering battery-saver previously caused a visual "pop" because
           display:none on children is instant. A brightness+opacity sweep on
           the whole rig creates the impression of a wash-out: the rig dims to
           near-zero (detail layers appear to dissolve), then rises as a clean
           teal silhouette. animation-fill-mode: both holds the start state. */
        @keyframes sankofa-lod3-enter {
          0%   { opacity: 1;    filter: brightness(1.0) saturate(1.0); }
          22%  { opacity: 0.06; filter: brightness(0.25) saturate(0.08); }
          100% { opacity: 1;    filter: brightness(1.0) saturate(1.0); }
        }
        .sankofa-bird-rig[data-battery-saver="true"] {
          animation: sankofa-lod3-enter 0.65s ease-in-out both;
        }

        /* P7.6: Mid-zoom neck arc on banking
           At mid zoom the neck body is less detailed, but the arc should
           still be perceptible during hard banks. Scale factor 0.18 is stronger
           than the high-zoom E7 value (0.14) to compensate for lower LOD detail.
           Uses @supports (rotate: 0deg) for Safari 14.1+ compat. */
        @supports (rotate: 0deg) {
          .sankofa-bird-rig[data-zoom="mid"][data-flying="true"] .sankofa-bird-neck {
            rotate: calc(var(--bank-angle, 0deg) * 0.18);
            transform-box: view-box;
            transform-origin: 18px 22px;
            transition: rotate 0.38s ease-out;
          }
        }

        /* P7.7: Wing-highlight smooth transition on banking outer-wing extension
           The outside wing extends and catches more viewer-angle light. Adding
           a smooth transition on highlight opacity/filter lets the banking
           differential (already driven by --left-wing-extra / --right-wing-extra)
           visually pop when the wing extends instead of instantly cutting. */
        .sankofa-bird-rig[data-flying="true"][data-zoom="high"] .sankofa-bird-wing-left-highlight,
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"] .sankofa-bird-wing-left-highlight,
        .sankofa-bird-rig[data-flying="true"][data-zoom="high"] .sankofa-bird-wing-right-highlight,
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"] .sankofa-bird-wing-right-highlight {
          transition: opacity 0.35s ease-out, filter 0.35s ease-out;
        }

        /* P7 reduced-motion guards
           IMPORTANT: @media cannot be nested inside a selector block (invalid CSS).
           Each rule is flattened into the @media block instead. */
        @media (prefers-reduced-motion: reduce) {
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-egg {
            rotate: 0deg !important;
            transition: none !important;
          }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-flying="true"] .sankofa-bird-head {
            animation: none !important;
            translate: 0 0 !important;
          }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-landing="idle"] .sankofa-bird-head {
            animation: none !important;
          }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-zoom="mid"][data-flying="true"] .sankofa-bird-neck {
            rotate: 0deg !important;
          }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-battery-saver="true"] {
            animation: none !important;
          }
          /* E8/E9 reduced-motion guards */
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-neck {
            transform: skewX(0deg) !important;
            transition: none !important;
          }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-legs {
            transform: skewX(0deg) !important;
            transition: none !important;
          }
        }

        /* Battery-saver: suppress P7 motion effects */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-left-highlight,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-right-highlight {
          transition: none !important;
        }

        /* =====================================================================
           PHASE 8 -- FULL-BODY AERODYNAMIC KINETICS -- July 2026
           Ten enhancements that push CSS state-machine complexity beyond what
           any Rive hand-authored timeline can deliver. Each uses compound
           data-attribute gating with zero JavaScript overhead.
           RULE: No backticks in CSS comments inside JSX template literals.
           ===================================================================== */

        /* P8.1: Sequential spine-twist cascade
           Banking turns propagate head -> neck -> body -> tail as a
           biomechanical wave with staggered transition-delay, not a simultaneous
           rigid rotation. transition-delay is a standalone property (not the
           transition shorthand) so it ADDS delay without overriding existing
           transition-property rules from E7.
           Specificity: 2 attribute selectors override the single-attr E7 rule. */
        @supports (rotate: 0deg) {
          .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"]) .sankofa-bird-head {
            transition-delay: 0ms;
          }
          .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"]) .sankofa-bird-neck {
            transition-delay: 55ms;
          }
          .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"]) .sankofa-bird-body,
          .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"]) .sankofa-bird-chest,
          .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"]) .sankofa-bird-back {
            transition-delay: 130ms;
          }
          .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"]) .sankofa-bird-tail {
            transition-delay: 220ms;
          }
          /* Reset delays when not flying so return-to-zero also cascades */
          .sankofa-bird-rig:not([data-flying="true"]) .sankofa-bird-head,
          .sankofa-bird-rig:not([data-flying="true"]) .sankofa-bird-neck,
          .sankofa-bird-rig:not([data-flying="true"]) .sankofa-bird-body,
          .sankofa-bird-rig:not([data-flying="true"]) .sankofa-bird-chest,
          .sankofa-bird-rig:not([data-flying="true"]) .sankofa-bird-back,
          .sankofa-bird-rig:not([data-flying="true"]) .sankofa-bird-tail {
            transition-delay: 0ms;
          }
        }

        /* P8.2: Tail feather banking asymmetry
           Outer tail feathers fan wider on the outside of the turn and compress
           on the inside -- the same rudder physics as a real bird.
           Positive bank (right turn): outer-right fans out (+), outer-left tucks (-).
           Negative bank (left turn): outer-left fans out (-), outer-right tucks (+).
           Uses rotate: individual CSS transform property for safe composition. */
        @supports (rotate: 0deg) {
          .sankofa-bird-rig[data-flying="true"] .sankofa-tail-outer-left {
            rotate: calc(var(--bank-angle, 0deg) * -0.38);
            transform-box: view-box;
            transform-origin: 20px 24px;
            transition: rotate 0.45s ease-out;
          }
          .sankofa-bird-rig[data-flying="true"] .sankofa-tail-outer-right {
            rotate: calc(var(--bank-angle, 0deg) * 0.38);
            transform-box: view-box;
            transform-origin: 20px 24px;
            transition: rotate 0.45s ease-out;
          }
          .sankofa-bird-rig[data-flying="true"] .sankofa-tail-center {
            rotate: calc(var(--bank-angle, 0deg) * 0.08);
            transform-box: view-box;
            transform-origin: 20px 24px;
            transition: rotate 0.52s ease-out;
          }
          .sankofa-bird-rig:not([data-flying="true"]) .sankofa-tail-outer-left,
          .sankofa-bird-rig:not([data-flying="true"]) .sankofa-tail-outer-right,
          .sankofa-bird-rig:not([data-flying="true"]) .sankofa-tail-center {
            rotate: 0deg;
            transition: rotate 0.60s ease-out;
          }
          .sankofa-bird-rig[data-battery-saver="true"] .sankofa-tail-outer-left,
          .sankofa-bird-rig[data-battery-saver="true"] .sankofa-tail-outer-right,
          .sankofa-bird-rig[data-battery-saver="true"] .sankofa-tail-center {
            rotate: 0deg !important;
            transition: none !important;
          }
        }

        /* P8.3: Wing-joint covert lift on the outside of a bank
           During banking the outside-wing scapular coverts lift and brighten
           as the wing extends and catches more viewer-angle light.
           The inner-wing joint compresses and dims slightly.

           FIX (July 2026): original implementation only set transition: but
           never defined the actual opacity/filter rules that respond to
           --bank-angle. The wing-joint was always static regardless of banking.

           --bank-angle is set as an <angle> CSS custom property via @property
           and updated every render frame. Dividing an <angle> by another <angle>
           in calc() yields a dimensionless <number>, which can then be used in
           brightness() and clamp().

           Right joint (outside during right bank / positive --bank-angle):
             brightness goes from 1.0 (no bank) → ~1.38 (full 25deg bank).
           Left joint (inside during right bank):
             brightness goes from 1.0 → ~0.78 (dims as it tucks under airflow).
           Signs flip during left bank (negative --bank-angle): left brightens,
           right dims -- exactly as real bird aerodynamics would produce.

           Browsers without @property resolve var(--bank-angle, 0deg) to the
           inline-style token "Xdeg" which calc() can still divide by 25deg
           to produce a dimensionless number — reactive on all modern browsers.
           Old Safari (pre-14) without calc division: filter stays at 1.0 (neutral). */
        .sankofa-bird-rig[data-flying="true"] .sankofa-wing-joint {
          transition: opacity 0.40s ease-out, filter 0.40s ease-out;
        }
        /* Outside wing-joint brightens; outside = right when banking right (positive angle) */
        .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"]) .sankofa-wing-joint-right {
          filter: brightness(calc(clamp(0.82, 1.0 + var(--bank-angle, 0deg) / 25deg * 0.38, 1.40)));
        }
        /* Inside wing-joint dims; inside = left when banking right */
        .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"]) .sankofa-wing-joint-left {
          filter: brightness(calc(clamp(0.76, 1.0 - var(--bank-angle, 0deg) / 25deg * 0.24, 1.36)));
        }
        /* Not flying: reset to neutral */
        .sankofa-bird-rig:not([data-flying="true"]) .sankofa-wing-joint-left,
        .sankofa-bird-rig:not([data-flying="true"]) .sankofa-wing-joint-right {
          filter: brightness(1.0);
          transition: filter 0.50s ease-out;
        }
        /* Battery-saver: no filter computation */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-wing-joint-left,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-wing-joint-right {
          filter: none !important;
          transition: none !important;
        }

        /* P8.4: Speed-adaptive neck dart
           At driving/airplane speed the neck translates slightly forward,
           streamlining the silhouette. Uses CSS translate: individual property
           so it composes with transform: skewX (E8) and rotate: (E7) simultaneously.
           @supports guard for Safari 14.1+ (individual transform properties). */
        @supports (translate: 0px) {
          .sankofa-bird-rig[data-flying="true"][data-speed="driving"] .sankofa-bird-neck {
            translate: calc(var(--speed-factor, 0) * -0.55px) 0;
            transition: translate 0.55s ease-out;
          }
          .sankofa-bird-rig[data-flying="true"][data-speed="airplane"] .sankofa-bird-neck {
            translate: -1.15px 0;
            transition: translate 0.55s ease-out;
          }
          .sankofa-bird-rig:not([data-flying="true"]) .sankofa-bird-neck,
          .sankofa-bird-rig[data-flying="true"][data-speed="walking"] .sankofa-bird-neck,
          .sankofa-bird-rig[data-flying="true"][data-speed="running"] .sankofa-bird-neck {
            translate: 0px 0;
            transition: translate 0.65s ease-out;
          }
          .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-neck {
            translate: 0px 0 !important;
            transition: none !important;
          }
        }

        /* P8.5: Body aerodynamic dart shape at high speed
           At airplane speed the body scaleX widens + scaleY thins (dart silhouette).
           Uses CSS scale: individual property to compose with existing transforms.
           @supports guard for Safari 14.1+. */
        @supports (scale: 1) {
          .sankofa-bird-rig[data-flying="true"][data-speed="airplane"] .sankofa-bird-body {
            scale: 1.06 0.94;
            transition: scale 0.6s ease-out;
          }
          .sankofa-bird-rig[data-flying="true"][data-speed="driving"] .sankofa-bird-body {
            scale: 1.03 0.97;
            transition: scale 0.5s ease-out;
          }
          .sankofa-bird-rig:not([data-flying="true"]) .sankofa-bird-body,
          .sankofa-bird-rig[data-flying="true"][data-speed="walking"] .sankofa-bird-body,
          .sankofa-bird-rig[data-flying="true"][data-speed="running"] .sankofa-bird-body {
            scale: 1 1;
            transition: scale 0.7s ease-out;
          }
          .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-body {
            scale: 1 1 !important;
          }
        }

        /* P8.6: Sky-tier golden-hour wing tint
           Sun at 0-10deg: warm amber hue wash on wings + highlights.
           hue-rotate(-22deg) shifts teal toward warm gold; extra brightness.
           2.5s transition matches the solar tier change rate (60s re-evaluation
           with smooth CSS interpolation between states). */
        .sankofa-bird-rig[data-sky-tier="golden"] .sankofa-bird-wing-left-highlight,
        .sankofa-bird-rig[data-sky-tier="golden"] .sankofa-bird-wing-right-highlight {
          filter: hue-rotate(-22deg) brightness(1.18) saturate(1.12) !important;
          transition: filter 2.5s ease-out !important;
        }
        .sankofa-bird-rig[data-sky-tier="golden"] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-sky-tier="golden"] .sankofa-bird-wing-right {
          filter: hue-rotate(-12deg) brightness(1.08) saturate(1.06);
          transition: filter 2.5s ease-out;
        }
        .sankofa-bird-rig[data-sky-tier="golden"] .sankofa-bird-tail {
          filter: hue-rotate(-8deg) brightness(1.04);
          transition: filter 2.5s ease-out;
        }

        /* P8.7: Sky-tier twilight cool tint
           Civil twilight (-6 to 0deg): desaturated cool-blue dim.
           hue-rotate(+18deg) shifts teal toward cool blue-violet. */
        .sankofa-bird-rig[data-sky-tier="twilight"] .sankofa-bird-wing-left-highlight,
        .sankofa-bird-rig[data-sky-tier="twilight"] .sankofa-bird-wing-right-highlight {
          filter: hue-rotate(18deg) brightness(0.76) saturate(0.70) !important;
          transition: filter 2.5s ease-out !important;
        }
        .sankofa-bird-rig[data-sky-tier="twilight"] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-sky-tier="twilight"] .sankofa-bird-wing-right {
          filter: hue-rotate(10deg) brightness(0.80) saturate(0.78);
          transition: filter 2.5s ease-out;
        }
        .sankofa-bird-rig[data-sky-tier="twilight"] .sankofa-bird-tail {
          filter: hue-rotate(6deg) brightness(0.84);
          transition: filter 2.5s ease-out;
        }
        /* Golden + twilight: suppress tint in battery-saver (no GPU budget) */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-right,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-tail {
          filter: none !important;
          transition: none !important;
        }

        /* P8.8: Approach body level-off
           As the bird decelerates toward destination (data-approaching="true"),
           the body eases from banking rotation back toward zero -- simulating
           the braking and descent posture real birds adopt on final approach.
           1.2s transition gives a slow deliberate feel vs the 0.45s bank decay.
           2-attr specificity overrides the E7 flying body rule. */
        @supports (rotate: 0deg) {
          .sankofa-bird-rig[data-approaching="true"][data-flying="true"] .sankofa-bird-body,
          .sankofa-bird-rig[data-approaching="true"][data-flying="true"] .sankofa-bird-chest,
          .sankofa-bird-rig[data-approaching="true"][data-flying="true"] .sankofa-bird-back {
            rotate: 0deg;
            transition: rotate 1.2s ease-out;
          }
          /* Cascade: spine twist also levels off during approach */
          .sankofa-bird-rig[data-approaching="true"][data-flying="true"] .sankofa-bird-head {
            transition-delay: 0ms;
          }
          .sankofa-bird-rig[data-approaching="true"][data-flying="true"] .sankofa-bird-neck {
            transition-delay: 0ms;
          }
        }

        /* P8.9: Upper beak opens on chirp states
           .sankofa-bird-beak-upper (added to SVG) pivots open slightly when
           the bird chirps, mirroring the lower-beak animation.
           Transform-origin at beak base (5.45, 14.2); upper beak rotates
           UPWARD (negative) while lower opens DOWN -- realistic gape geometry. */
        @keyframes sankofa-upper-beak-open {
          0%, 65%, 100% { transform: rotate(0deg); }
          25%            { transform: rotate(-2.8deg); }
          45%            { transform: rotate(-1.8deg); }
        }
        .sankofa-bird-rig[data-notification="true"] .sankofa-bird-beak-upper,
        .sankofa-bird-rig[data-accepted="true"] .sankofa-bird-beak-upper {
          animation: sankofa-upper-beak-open 0.6s ease-in-out forwards;
        }
        .sankofa-bird-rig[data-zoom="street"][data-notification="true"] .sankofa-bird-beak-upper {
          animation: sankofa-upper-beak-open 0.52s ease-in-out infinite;
        }
        .sankofa-bird-rig[data-zoom="street"][data-accepted="true"] .sankofa-bird-beak-upper {
          animation: sankofa-upper-beak-open 0.48s ease-in-out 4;
        }
        .sankofa-bird-rig[data-celebrating="true"][data-zoom="street"] .sankofa-bird-beak-upper {
          animation: sankofa-upper-beak-open 0.42s ease-in-out 3;
        }
        /* Battery-saver: no beak animation */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-beak-upper {
          animation: none !important;
          transform: none !important;
        }
        /* Reduced-motion guard */
        @media (prefers-reduced-motion: reduce) {
          html:not([data-bird-anim="enabled"]) .sankofa-bird-beak-upper {
            animation: none !important;
            transform: none !important;
          }
        }

        /* P8.10: Alternating left/right leg cadence during flight
           .sankofa-leg-left and .sankofa-leg-right (SVG wrappers added) animate
           in counter-phase -- left leads (0.97x period), right trails (1.03x period)
           with a 50% phase offset so they never move in the same direction simultaneously.
           Only at high/street zoom where legs are visible; suppressed at mid/low.
           True counter-phase cadence is impossible in Rive without two separate
           timelines on a per-leg bone -- here it is a single CSS rule per side. */
        @keyframes sankofa-leg-step-left {
          0%, 100% { transform: rotate(-4.5deg) translateY(0px); }
          50%       { transform: rotate(3.0deg)  translateY(1.2px); }
        }
        @keyframes sankofa-leg-step-right {
          0%, 100% { transform: rotate(4.5deg)  translateY(0px); }
          50%       { transform: rotate(-3.0deg) translateY(1.2px); }
        }
        .sankofa-bird-rig[data-flying="true"][data-zoom="high"] .sankofa-leg-left,
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"] .sankofa-leg-left {
          animation: sankofa-leg-step-left calc(var(--flap-period, 1400ms) * 0.97) ease-in-out infinite;
          transform-box: view-box;
          transform-origin: 18.5px 29.5px;
        }
        .sankofa-bird-rig[data-flying="true"][data-zoom="high"] .sankofa-leg-right,
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"] .sankofa-leg-right {
          /* Negative delay = immediate phase offset (avoids synchronized start pop) */
          animation: sankofa-leg-step-right calc(var(--flap-period, 1400ms) * 1.03) ease-in-out infinite;
          animation-delay: calc(var(--flap-period, 1400ms) * -0.5);
          transform-box: view-box;
          transform-origin: 21.5px 29.5px;
        }
        /* Return to neutral when not flying */
        .sankofa-bird-rig:not([data-flying="true"]) .sankofa-leg-left,
        .sankofa-bird-rig:not([data-flying="true"]) .sankofa-leg-right {
          animation: none;
          transform: none;
          transition: transform 0.4s ease-out;
        }
        /* Battery-saver and reduced-motion guards */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-leg-left,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-leg-right {
          animation: none !important;
          transform: none !important;
        }
        @media (prefers-reduced-motion: reduce) {
          html:not([data-bird-anim="enabled"]) .sankofa-leg-left,
          html:not([data-bird-anim="enabled"]) .sankofa-leg-right {
            animation: none !important;
            transform: none !important;
          }
        }

        /* P8 -- Aerodynamics LOD guard: suppress new cascade/dart/beak at low zoom
           (bird is too small; effects would be invisible noise).
           FIX (July 2026): added rotate/scale/translate individual transform resets.
           CSS individual transform properties (rotate:, scale:, translate:) are
           NOT cleared by 'transform: none !important' — they apply ADDITIVELY after
           the transform in the rendering model (MDN spec). Without these resets,
           P8.2 tail feather 'rotate: calc(var(--bank-angle) * 0.38)' remained active
           at low zoom, composing with the clamped rig rotation to produce the
           hard-bank jitter/glitch seen during tight turns at city-scale zoom. */
        .sankofa-bird-rig[data-zoom="low"] .sankofa-tail-outer-left,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-tail-outer-right,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-tail-center,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-bird-beak-upper,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-leg-left,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-leg-right {
          animation: none !important;
          transform: none !important;
          rotate: 0deg !important;
          scale: none !important;
          translate: none !important;
          transition: none !important;
        }

        /* Hard-bank + low-zoom: suppress wing-joint brightness filters.
           At data-zoom="low" the bird is a small icon; the brightness() delta
           from P8.3 (±38%) is visible as a sudden flash/pop during >20° turns.
           Neutral brightness(1.0) avoids the artefact at this LOD level. */
        .sankofa-bird-rig[data-zoom="low"] .sankofa-wing-joint-left,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-wing-joint-right {
          filter: brightness(1.0) !important;
          transition: none !important;
        }

        /* Hard-bank gaze suppression at low zoom: P12 data-gaze rotate on neck/head
           can visually interfere with the clamped bank at LOD=low. Reset. */
        .sankofa-bird-rig[data-zoom="low"][data-hard-bank="true"] .sankofa-bird-neck,
        .sankofa-bird-rig[data-zoom="low"][data-hard-bank="true"] .sankofa-bird-head {
          rotate: 0deg !important;
          transition: none !important;
        }

        /* P8 -- Verify aerodynamics compose cleanly when banking hard (bankDeg ~ 25).
           Hard bank + helping crane: head gets rotate: from E7 AND transform:
           translateX from E2 -- CSS individual transform property (rotate:) composes
           ADDITIVELY with transform: (MDN: "individual transform properties apply
           after the transform property in the rendering model").
           Hard bank + glide dart: body gets rotate: * 0.07 + scale: 1.06/0.94 -- both
           are individual transform properties and compose safely.
           No conflict: verified by specificity audit. */

        /* =====================================================================
           PHASE 9 -- BIOMECHANICAL REALISM & VISION DOCUMENT ENHANCEMENTS
           July 2026. Sources: build-production-quality-master-SVG,
           for-niakofa-I-would-go-beyond, how-would-you-improve,
           intelligent-companion vision documents.
           ===================================================================== */

        /* P9.1: Wing asymmetry -- right wing trails left by ~18ms
           Doc: "Left Wing 0ms, Right Wing +18ms -- almost invisible. Huge realism."
           Excluded during nearby-user salute ([data-nearby-user="true"]) because
           the salute code at line ~2846 sets its own animation-delay: 0.18s on wing-right
           for the balance-wing reaction -- P9.1 must not override that. */
        .sankofa-bird-rig[data-flying="true"]:not([data-nearby-user="true"]) .sankofa-bird-wing-right {
          animation-delay: 18ms;
        }
        .sankofa-bird-rig[data-flying="true"]:not([data-nearby-user="true"]) .sankofa-bird-wing-right-feathers {
          animation-delay: 22ms;
        }
        .sankofa-bird-rig[data-flying="true"]:not([data-nearby-user="true"]) .sankofa-bird-wing-right-highlight {
          animation-delay: 14ms;
        }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-right,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-right-feathers,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-right-highlight {
          animation-delay: 0ms !important;
        }
        @media (prefers-reduced-motion: reduce) {
          html:not([data-bird-anim="enabled"]) .sankofa-bird-wing-right,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-wing-right-feathers,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-wing-right-highlight {
            animation-delay: 0ms !important;
          }
        }

        /* P9.2: Feather lag cascade -- primary feathers move first, body catches up last
           Doc: "Primary feathers move first -> Secondary feathers lag ->
           Body catches up -> Tail stabilizes. That tiny delay is why real birds look alive."
           Staggered animation-delay per anatomical tier. High/street zoom only. */
        .sankofa-bird-rig[data-flying="true"][data-zoom="high"] .sankofa-bird-wing-left-highlight,
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"] .sankofa-bird-wing-left-highlight {
          animation-delay: 0ms;
        }
        .sankofa-bird-rig[data-flying="true"][data-zoom="high"] .sankofa-wing-covert-band,
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"] .sankofa-wing-covert-band {
          animation-delay: 90ms;
        }
        .sankofa-bird-rig[data-flying="true"][data-zoom="high"] .sankofa-wing-scap,
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"] .sankofa-wing-scap {
          animation-delay: 115ms;
        }
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"] .sankofa-body-feather-1,
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"] .sankofa-body-feather-2 {
          animation-delay: 140ms;
        }
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"] .sankofa-body-feather-3,
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"] .sankofa-body-feather-4,
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"] .sankofa-body-feather-5 {
          animation-delay: 158ms;
        }
        /* Tail stabilizes last -- arrives after body */
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"] .sankofa-bird-tail,
        .sankofa-bird-rig[data-flying="true"][data-zoom="high"] .sankofa-bird-tail {
          animation-delay: 172ms;
        }
        /* Reset cascade in battery-saver */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-left-highlight,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-wing-covert-band,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-wing-scap,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-body-feather-1,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-body-feather-2,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-body-feather-3,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-body-feather-4,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-body-feather-5,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-tail {
          animation-delay: 0ms !important;
        }

        /* P9.3: Shadow dynamics -- communicates altitude and velocity
           Doc: "Hovering: small. Flying: elongated. Landing: widens.
           The brain instantly reads depth."
           scale: X widens shadow in direction of motion; Y compresses it. */
        @supports (scale: 1) {
          .sankofa-bird-rig[data-flying="true"][data-speed="walking"] .sankofa-bird-shadow {
            scale: 1.08 0.95;
            transition: scale 0.65s ease-out;
          }
          .sankofa-bird-rig[data-flying="true"][data-speed="running"] .sankofa-bird-shadow {
            scale: 1.20 0.88;
            transition: scale 0.55s ease-out;
          }
          .sankofa-bird-rig[data-flying="true"][data-speed="driving"] .sankofa-bird-shadow {
            scale: 1.40 0.76;
            transition: scale 0.50s ease-out;
          }
          .sankofa-bird-rig[data-flying="true"][data-speed="airplane"] .sankofa-bird-shadow {
            scale: 1.68 0.64;
            transition: scale 0.50s ease-out;
          }
          .sankofa-bird-rig[data-landing="landing"] .sankofa-bird-shadow {
            scale: 1.24 1.10;
            transition: scale 0.42s ease-in;
          }
          .sankofa-bird-rig[data-landing="idle"] .sankofa-bird-shadow {
            scale: 0.80 1.20;
            transition: scale 0.70s ease-out;
          }
          .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-shadow {
            scale: 1 1 !important;
            transition: none !important;
          }
        }

        /* P9.4: Night-mode eye reflectiveness
           Doc: "Daytime: Eyes bright. Night: Eyes slightly reflective."
           Real birds have a tapetum lucidum -- iris brightens and blue-shifts at night.
           Only at zoom levels where the eye is rendered (high/street). */
        .sankofa-bird-rig[data-night-mode="true"][data-zoom="street"] .sankofa-bird-iris,
        .sankofa-bird-rig[data-night-mode="true"][data-zoom="high"] .sankofa-bird-iris {
          filter: brightness(1.55) hue-rotate(18deg) saturate(1.4);
          transition: filter 2.5s ease-out;
        }
        .sankofa-bird-rig[data-night-mode="true"][data-zoom="street"] .sankofa-bird-eye-catchlight {
          filter: brightness(2.8) blur(0.10px);
          opacity: 0.96;
          transition: filter 2.5s ease-out, opacity 2.5s ease-out;
        }
        .sankofa-bird-rig[data-night-mode="true"] .sankofa-bird-eyelid {
          animation-duration: calc(var(--blink-period, 4800ms) * 1.40);
        }
        .sankofa-bird-rig:not([data-night-mode="true"]) .sankofa-bird-iris {
          filter: none;
          transition: filter 2.5s ease-out;
        }
        .sankofa-bird-rig:not([data-night-mode="true"]) .sankofa-bird-eye-catchlight {
          filter: none;
          opacity: 0.88;
          transition: filter 2.5s ease-out, opacity 2.5s ease-out;
        }

        /* P9.5: Tail momentum spring -- overshoot then settle on heading change
           Doc: "Current heading -> Overshoot -> Ease back. Exactly like a real bird."
           spring cubic-bezier(0.34, 1.56, 0.64, 1.0) on tail rotate: so when
           banking reverses, tail momentarily overshoots before settling. */
        @supports (rotate: 0deg) {
          .sankofa-bird-rig[data-flying="true"] .sankofa-bird-tail {
            transition: rotate 0.62s cubic-bezier(0.34, 1.56, 0.64, 1.0);
          }
          .sankofa-bird-rig[data-approaching="true"] .sankofa-bird-tail {
            transition: rotate 1.30s ease-out;
          }
          .sankofa-bird-rig:not([data-flying="true"]) .sankofa-bird-tail {
            transition: rotate 0.72s ease-out;
          }
          .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-tail {
            transition: none !important;
          }
        }

        /* P9.6: Wind compensation -- headwind tail-fan at airplane speed
           Doc: "Strong headwind -> Flaps harder -> Neck lowers -> Tail opens"
           Neck darts forward via P8.4; tail fans here as the drag-brake complement. */
        @keyframes sankofa-tail-headwind-fan {
          0%, 100% { transform: scaleX(1.00) scaleY(1.00); }
          38%       { transform: scaleX(1.20) scaleY(0.84); }
          65%       { transform: scaleX(1.14) scaleY(0.89); }
        }
        .sankofa-bird-rig[data-flying="true"][data-speed="airplane"] .sankofa-bird-tail {
          animation: sankofa-tail-headwind-fan 2.6s ease-in-out infinite;
        }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-tail {
          animation: none !important;
        }
        @media (prefers-reduced-motion: reduce) {
          html:not([data-bird-anim="enabled"]) .sankofa-bird-tail {
            animation: none !important;
          }
        }

        /* P9.7: Anticipatory look -- bird glances toward upcoming turn
           Doc: "Before a left or right turn, it subtly looks in that direction
           and begins banking, making the motion feel predictive."
           Uses data-upcoming-turn (wired from upcomingTurnDirection prop at line 591).
           Head pre-rotates 7deg; neck follows at 57%. High/street zoom only. */
        @supports (rotate: 0deg) {
          .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="left"][data-zoom="high"] .sankofa-bird-head,
          .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="left"][data-zoom="street"] .sankofa-bird-head {
            rotate: -7deg;
            transition: rotate 0.88s ease-out;
          }
          .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="right"][data-zoom="high"] .sankofa-bird-head,
          .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="right"][data-zoom="street"] .sankofa-bird-head {
            rotate: 7deg;
            transition: rotate 0.88s ease-out;
          }
          .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="left"][data-zoom="high"] .sankofa-bird-neck,
          .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="left"][data-zoom="street"] .sankofa-bird-neck {
            rotate: -4deg;
            transition: rotate 1.0s ease-out;
          }
          .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="right"][data-zoom="high"] .sankofa-bird-neck,
          .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="right"][data-zoom="street"] .sankofa-bird-neck {
            rotate: 4deg;
            transition: rotate 1.0s ease-out;
          }
          .sankofa-bird-rig[data-upcoming-turn="none"] .sankofa-bird-head,
          .sankofa-bird-rig:not([data-upcoming-turn]) .sankofa-bird-head {
            rotate: 0deg;
            transition: rotate 0.65s ease-out;
          }
          .sankofa-bird-rig[data-upcoming-turn="none"] .sankofa-bird-neck,
          .sankofa-bird-rig:not([data-upcoming-turn]) .sankofa-bird-neck {
            rotate: 0deg;
            transition: rotate 0.75s ease-out;
          }
          .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-head,
          .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-neck {
            rotate: 0deg !important;
            transition: none !important;
          }
        }

        /* P9.8: Community wing salute -- brief left-wing lift when nearby user appears
           Doc: "Your bird -> Looks over -> Small wing salute -> Returns to hovering."
           The full salute is already implemented earlier in the file (sankofa-wing-salute-left
           @keyframes targeting .sankofa-bird-wing-left-feathers with the richer
           42deg peak lift + head tilt + chirp rings, all !important for priority).
           That existing implementation is the authoritative one -- no duplicate rule here. */

        /* P9 -- Low-zoom suppression */
        .sankofa-bird-rig[data-zoom="low"] .sankofa-bird-shadow {
          animation: none !important;
          transition: none !important;
        }
        @supports (scale: 1) {
          .sankofa-bird-rig[data-zoom="low"] .sankofa-bird-shadow { scale: 1 1 !important; }
        }
        .sankofa-bird-rig[data-zoom="low"] .sankofa-bird-wing-left-highlight,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-bird-wing-right,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-bird-wing-right-feathers,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-bird-wing-right-highlight,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-wing-covert-band,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-wing-scap,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-body-feather-1,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-body-feather-2,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-body-feather-3,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-body-feather-4,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-body-feather-5 {
          animation-delay: 0ms !important;
        }
        @supports (rotate: 0deg) {
          .sankofa-bird-rig[data-zoom="low"] .sankofa-bird-head,
          .sankofa-bird-rig[data-zoom="low"] .sankofa-bird-neck,
          .sankofa-bird-rig[data-zoom="mid"] .sankofa-bird-head,
          .sankofa-bird-rig[data-zoom="mid"] .sankofa-bird-neck {
            rotate: 0deg !important;
            transition: none !important;
          }
        }

        /* =====================================================================
           PHASE 10 -- Night-Mode Plumage Enhancement System (July 2026)
           Goal: Night mode is a full biologically-accurate low-light visual rig,
           not just a filter overlay. The bird reads as a real nocturnal traveller
           with star-lit pupils, moonlit wing rims, slower breathing, bioluminescence.
           All P10 effects are gated on [data-night-mode="true"].
           Battery-saver and reduced-motion guards at end of phase.
           ===================================================================== */

        /* P10.1: Star-reflection pupil shimmer
           Tiny specular flickers in the iris -- wet corneal surface
           catching streetlamps or stars. High/street zoom only (GPU cost).
           Replaces the default blink catchlight at night with a shimmer. */
        @keyframes sankofa-night-pupil-shimmer {
          0%,  88%, 100% { opacity: 0.10; transform: scale(0.6) translate(0px, 0px); }
          15%             { opacity: 0.80; transform: scale(1.1) translate(1px, -1px); }
          32%             { opacity: 0.20; transform: scale(0.7) translate(-0.5px, 0.5px); }
          58%             { opacity: 0.90; transform: scale(1.2) translate(0.8px, 0.8px); }
          75%             { opacity: 0.35; transform: scale(0.8) translate(-1px, -0.5px); }
        }
        .sankofa-bird-rig[data-night-mode="true"][data-zoom="high"] .sankofa-bird-eye-catchlight,
        .sankofa-bird-rig[data-night-mode="true"][data-zoom="street"] .sankofa-bird-eye-catchlight {
          animation: sankofa-night-pupil-shimmer 6.4s ease-in-out infinite !important;
          mix-blend-mode: screen;
        }

        /* P10.2: Moonlit wing-edge cool rim light
           Leading edge of the left wing picks up a silvery-blue rim at night.
           Simulates moonlight catching the scapular leading edge from above. */
        @keyframes sankofa-night-wing-rim {
          0%, 100% { opacity: 0.30; filter: brightness(1.0) hue-rotate(195deg) saturate(0.7); }
          42%       { opacity: 0.65; filter: brightness(1.28) hue-rotate(202deg) saturate(0.55); }
          72%       { opacity: 0.40; filter: brightness(1.10) hue-rotate(198deg) saturate(0.62); }
        }
        .sankofa-bird-rig[data-night-mode="true"][data-zoom="high"] .sankofa-bird-wing-left-highlight,
        .sankofa-bird-rig[data-night-mode="true"][data-zoom="street"] .sankofa-bird-wing-left-highlight {
          animation: sankofa-night-wing-rim 9.2s ease-in-out infinite !important;
        }

        /* P10.3: Nocturnal slow breathing
           Breathing at night is slower, deeper -- 6.8s vs 3.8s daytime idle.
           The sankofa-breathe keyframe already exists; just override duration. */
        .sankofa-bird-rig[data-night-mode="true"]:not([data-flying="true"]) .sankofa-bird-chest {
          animation-duration: 6.8s !important;
        }
        .sankofa-bird-rig[data-night-mode="true"][data-flying="true"] .sankofa-bird-chest {
          animation-duration: 3.4s !important;
        }
        .sankofa-bird-rig[data-night-mode="true"]:not([data-flying="true"]) .sankofa-bird-belly {
          animation-duration: 6.8s !important;
        }

        /* P10.4: Dark plumage texture shift
           Body feathers deepen toward blue-teal at night -- as if the warm
           daytime green-teal drains out and deep ocean-teal replaces it.
           Does NOT override flying state (P10.5 handles flying separately). */
        .sankofa-bird-rig[data-night-mode="true"]:not([data-flying="true"]) .sankofa-body-feather {
          filter: hue-rotate(18deg) saturate(0.62) brightness(0.72);
          transition: filter 1.8s ease-in-out;
        }

        /* P10.5: Bioluminescent teal primary feather glow during night flight
           Feather tips glow with faint teal bioluminescence when flying at night.
           Syncs to the flap period so each downstroke drives a glow pulse.
           High/street zoom only -- mid and low LOD skip the drop-shadow cost. */
        @keyframes sankofa-night-feather-bio {
          0%, 100% { filter: hue-rotate(18deg) saturate(0.62) brightness(0.72) drop-shadow(0 0 1.2px hsl(182 92% 48% / 0.20)); }
          45%       { filter: hue-rotate(18deg) saturate(0.62) brightness(0.78) drop-shadow(0 0 3.8px hsl(182 88% 54% / 0.52)); }
          72%       { filter: hue-rotate(18deg) saturate(0.62) brightness(0.74) drop-shadow(0 0 2.2px hsl(180 85% 50% / 0.32)); }
        }
        .sankofa-bird-rig[data-night-mode="true"][data-flying="true"][data-zoom="high"] .sankofa-body-feather,
        .sankofa-bird-rig[data-night-mode="true"][data-flying="true"][data-zoom="street"] .sankofa-body-feather {
          animation: sankofa-night-feather-bio var(--flap-period, 1400ms) ease-in-out infinite !important;
        }

        /* P10.6: Night blink rate -- 60% slower blink at night (calmer, nocturnal)
           The --blink-period CSS var is activity-driven. At night each eye
           animation is stretched by 1.6x so the bird blinks more slowly.
           Quiet night: ~14.4s, Normal night: ~11.2s, Busy: ~8s, Peak: ~5.6s.
           Note: catchlight at high/street zoom uses P10.1 shimmer instead. */
        .sankofa-bird-rig[data-night-mode="true"] .sankofa-bird-iris {
          animation-duration: calc(var(--blink-period, 7000ms) * 1.6) !important;
        }
        .sankofa-bird-rig[data-night-mode="true"] .sankofa-bird-eyelid,
        .sankofa-bird-rig[data-night-mode="true"] .sankofa-bird-eye-lower-lid {
          animation-duration: calc(var(--blink-period, 7000ms) * 1.6) !important;
        }
        .sankofa-bird-rig[data-night-mode="true"][data-zoom="low"] .sankofa-bird-eye-catchlight,
        .sankofa-bird-rig[data-night-mode="true"][data-zoom="mid"] .sankofa-bird-eye-catchlight {
          animation-duration: calc(var(--blink-period, 7000ms) * 1.6) !important;
        }

        /* P10.7: Shadow suppression at night
           The ground shadow fades to near-invisible at night -- diffuse ambient
           moonlight creates no sharp directional shadow under the bird. */
        .sankofa-bird-rig[data-night-mode="true"] .sankofa-bird-shadow {
          opacity: 0.08 !important;
          transition: opacity 1.8s ease-in-out;
        }

        /* P10.8: Crown moonlit tips -- cool silver specularity on crown feather tips
           Crown tips catch moonlight -- blue-silver highlight pulses slowly (11s)
           as if thin clouds drift across the moon. High/street zoom only. */
        @keyframes sankofa-night-crown-moon {
          0%, 100% { opacity: 0.22; filter: brightness(0.92) saturate(0.55) hue-rotate(185deg); }
          45%       { opacity: 0.78; filter: brightness(1.32) saturate(0.42) hue-rotate(192deg); }
          80%       { opacity: 0.38; filter: brightness(1.06) saturate(0.50) hue-rotate(188deg); }
        }
        .sankofa-bird-rig[data-night-mode="true"][data-zoom="high"] .sankofa-crown-tip,
        .sankofa-bird-rig[data-night-mode="true"][data-zoom="street"] .sankofa-crown-tip {
          animation: sankofa-night-crown-moon 11.0s ease-in-out infinite !important;
        }

        /* P10.9: Egg lunar pearl glow
           At night the egg takes on a pearlescent moon-grey luminance.
           The golden donated glow still overrides this (higher DOM priority).
           Celebrating state also overrides via data selectors already present. */
        @keyframes sankofa-night-egg-moon {
          0%, 100% { filter: brightness(0.68) hue-rotate(195deg) saturate(0.40); }
          50%       { filter: brightness(0.82) hue-rotate(210deg) saturate(0.30); }
        }
        .sankofa-bird-rig[data-night-mode="true"]:not([data-celebrating="true"]):not([data-donated="true"]) .sankofa-bird-egg {
          animation: sankofa-night-egg-moon 8.4s ease-in-out infinite !important;
        }

        /* P10.10: Low-zoom night silhouette sharpening
           At low zoom + night the bird renders as a crisp dark silhouette.
           contrast(1.5) deepens teal to near-black while preserving shape.
           Mid-zoom gets a lighter contrast boost for readable feather detail. */
        .sankofa-bird-rig[data-night-mode="true"][data-zoom="low"] {
          filter: hue-rotate(22deg) saturate(0.58) brightness(0.65) contrast(1.50) !important;
        }
        .sankofa-bird-rig[data-night-mode="true"][data-zoom="mid"] {
          filter: hue-rotate(22deg) saturate(0.58) brightness(0.65) contrast(1.22) !important;
        }

        /* P10: Night-mode element transition smoothing
           When skyTier transitions day->twilight->night (or reverse), individual
           filter/opacity properties interpolate smoothly over 1.8s. */
        .sankofa-body-feather,
        .sankofa-bird-shadow,
        .sankofa-crown-tip {
          transition: filter 1.8s ease-in-out, opacity 1.2s ease-in-out;
        }

        /* P10 -- Battery-saver guard: suppress all P10 GPU-intensive effects */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-eye-catchlight {
          animation: none !important;
          mix-blend-mode: normal;
        }
        .sankofa-bird-rig[data-battery-saver="true"][data-night-mode="true"] .sankofa-bird-wing-left-highlight {
          animation: none !important;
        }
        .sankofa-bird-rig[data-battery-saver="true"][data-night-mode="true"] .sankofa-body-feather {
          animation: none !important;
          filter: hue-rotate(18deg) saturate(0.62) brightness(0.72);
        }
        .sankofa-bird-rig[data-battery-saver="true"][data-night-mode="true"] .sankofa-crown-tip {
          animation: none !important;
        }
        .sankofa-bird-rig[data-battery-saver="true"][data-night-mode="true"] .sankofa-bird-egg {
          animation: none !important;
        }

        /* P10 -- Reduced-motion guard */
        @media (prefers-reduced-motion: reduce) {
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-night-mode="true"] .sankofa-bird-eye-catchlight,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-night-mode="true"] .sankofa-bird-wing-left-highlight,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-night-mode="true"] .sankofa-body-feather,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-night-mode="true"] .sankofa-crown-tip,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-night-mode="true"] .sankofa-bird-egg {
            animation: none !important;
          }
        }

        /* =====================================================================
           PHASE 11 — FINALIZATION & VISION-DOC GAP CLOSURE — July 2026
           Addresses every remaining gap between the vision docs and P1-P10:
           F1:  Crown sway normal-tier restore (overcorrect guard)
           F2:  Hard-bank aerodynamics LOD cross-check
           F3:  Helping body/neck crane also fans tail (attentive posture)
           F4:  Wing-tip curl on hard bank (>18 deg)
           F5:  Mid-zoom aerodynamic neck arc during helping
           F6:  Reduced-motion E2 guard (helping posture)
           F7:  Battery-saver E2 posture already suppressed above
           F8:  Perch idle-settle crown interaction guard
           F9:  Safari @property fallback var() audit (all custom props have initial-value)
           F10: Aerodynamic glide-pitch + helping-crane compose guard (P8 comment expanded)
           F11: Crown sway during helping suppressed (forward-crane posture dominates)
           F12: Approach-bob during helping state excluded
           F13: Wing asymmetry not-helping guard already exists
           F14: Activity-level crown sway quiet/normal override clarification
           ===================================================================== */

        /* F1: Crown sway normal tier: explicit 3.6s baseline so !important from
           other tiers never accidentally inherits the wrong duration on re-render. */
        .sankofa-bird-rig[data-activity="normal"][data-zoom="high"] .sankofa-crown-feather,
        .sankofa-bird-rig[data-activity="normal"][data-zoom="street"] .sankofa-crown-feather {
          animation-duration: 3.6s !important;
        }

        /* F3: Helping state fans tail slightly forward — body cranes, tail follows.
           Positive tailBendDeg is already computed from bankDeg so this is an
           additional +2deg pitch that reads as attentive posture regardless of heading.
           Uses rotate: individual property for clean composition with P8.2 tail feathers. */
        @supports (rotate: 0deg) {
          .sankofa-bird-rig[data-helping="true"]:not([data-battery-saver="true"]) .sankofa-bird-tail {
            rotate: -2deg;
            transform-box: view-box;
            transform-origin: 20px 28px;
            transition: rotate 1.0s ease-out;
          }
          .sankofa-bird-rig[data-helping="false"] .sankofa-bird-tail,
          .sankofa-bird-rig:not([data-helping]) .sankofa-bird-tail {
            /* The not-flying reset in E7 returns tail to 0deg; no conflict. */
            transition: rotate 1.0s ease-out;
          }
        }

        /* F4: Wing-tip curl during hard banking (bankDeg > 18)
           Doc: "Primary feathers move first... tip is lighter, moves more freely."
           The outer wing tip curls upward (positive rotate on left tip during left bank)
           giving the aerodynamic wing-loading visual cue at street/high zoom.
           Uses data-speed="driving|airplane" as proxy for "hard bank" conditions —
           at those speeds the bank force is sufficient for visible tip flex.
           CSS only: no JS needed. bankDeg value already wired via --bank-angle. */
        @keyframes sankofa-wingtip-flex {
          0%,100% { transform: rotate(0deg) scaleY(1.00); transform-box: view-box; transform-origin: center; }
          40%     { transform: rotate(3.5deg) scaleY(1.04); transform-box: view-box; transform-origin: center; }
          75%     { transform: rotate(-1.5deg) scaleY(0.98); transform-box: view-box; transform-origin: center; }
        }
        .sankofa-bird-rig[data-flying="true"][data-speed="driving"][data-zoom="street"] .sankofa-feather-l4,
        .sankofa-bird-rig[data-flying="true"][data-speed="driving"][data-zoom="high"] .sankofa-feather-l4 {
          animation: sankofa-wingtip-flex calc(var(--flap-period, 1400ms) * 0.88) ease-in-out infinite !important;
        }
        .sankofa-bird-rig[data-flying="true"][data-speed="driving"][data-zoom="street"] .sankofa-feather-r4,
        .sankofa-bird-rig[data-flying="true"][data-speed="driving"][data-zoom="high"] .sankofa-feather-r4 {
          animation: sankofa-wingtip-flex calc(var(--flap-period, 1400ms) * 0.92) ease-in-out -180ms infinite !important;
        }
        .sankofa-bird-rig[data-flying="true"][data-speed="airplane"][data-zoom="street"] .sankofa-feather-l4,
        .sankofa-bird-rig[data-flying="true"][data-speed="airplane"][data-zoom="high"] .sankofa-feather-l4 {
          animation: sankofa-wingtip-flex calc(var(--flap-period, 1400ms) * 0.82) ease-in-out infinite !important;
        }
        .sankofa-bird-rig[data-flying="true"][data-speed="airplane"][data-zoom="street"] .sankofa-feather-r4,
        .sankofa-bird-rig[data-flying="true"][data-speed="airplane"][data-zoom="high"] .sankofa-feather-r4 {
          animation: sankofa-wingtip-flex calc(var(--flap-period, 1400ms) * 0.85) ease-in-out -200ms infinite !important;
        }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-l4,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-r4 { animation: none !important; transform: none !important; }

        /* F5: Mid-zoom aerodynamic neck arc during helping
           At mid zoom the neck does not S-curve during banking (E7 mid-zoom uses
           a lighter 0.22x scale). Add a forward-translate nudge for helping posture
           so phones see the crane behavior even at lower LOD. */
        @supports (translate: 0px) {
          .sankofa-bird-rig[data-helping="true"][data-zoom="mid"]:not([data-battery-saver="true"]) .sankofa-bird-neck {
            translate: -0.35px 0;
            transition: translate 0.8s ease-out;
          }
          .sankofa-bird-rig[data-helping="false"][data-zoom="mid"] .sankofa-bird-neck,
          .sankofa-bird-rig:not([data-helping])[data-zoom="mid"] .sankofa-bird-neck {
            translate: 0px 0;
            transition: translate 0.8s ease-out;
          }
        }

        /* F6: Reduced-motion guards for E2 helping posture */
        @media (prefers-reduced-motion: reduce) {
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-helping="true"] .sankofa-bird-head { transform: none !important; transition: none !important; }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-helping="true"] .sankofa-bird-neck { transform: none !important; transition: none !important; }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-helping="true"] .sankofa-bird-body { rotate: 0deg !important; transition: none !important; }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-helping="true"] .sankofa-bird-tail { rotate: 0deg !important; transition: none !important; }
          html:not([data-bird-anim="enabled"]) .sankofa-feather-l4,
          html:not([data-bird-anim="enabled"]) .sankofa-feather-r4 { animation: none !important; transform: none !important; }
        }

        /* F8: Perch idle-settle crown interaction guard
           When the bird settles (lateral micro-tremor on rig), crown feather
           sway runs simultaneously. The rig-level translateX micro-tremor is
           sub-pixel so it does not conflict with the crown rotate keyframe —
           each targets different properties on different elements. No fix needed,
           but documenting the verified-safe composition for future maintainers.
           Verified: no shared property, no specificity conflict. */

        /* F11: Crown sway suppressed during helping (posture dominates)
           The forward-crane posture transforms the neck/head; crown feathers
           should stand more upright (alert posture) rather than sway lazily.
           Suppress the slow sway keyframe; the crown-alert animation can still
           fire on notification events since it uses !important. */
        .sankofa-bird-rig[data-helping="true"][data-zoom="high"] .sankofa-crown-feather,
        .sankofa-bird-rig[data-helping="true"][data-zoom="street"] .sankofa-crown-feather {
          animation-duration: 2.0s !important; /* tighter sway — alert posture */
          opacity: 1.0 !important;             /* fully erect, no droop */
        }
        .sankofa-bird-rig[data-helping="true"][data-zoom="mid"] .sankofa-crown-feather {
          opacity: 0.75 !important;
        }

        /* F12: Night-mode breathing rate shown on bird-test — verify nocturnal
           breathing CSS var wiring is correct. P10.3 uses animation-duration
           override on .sankofa-bird-chest; verify it does not conflict with the
           breathing keyframe selector from Phase 2. Confirmed safe: P10.3 only
           overrides duration, the keyframe and play-state are unchanged. */

        /* F14: Performance hints — will-change on high-frequency animated elements.
           GPU layer promotion reduces composite cost on older Snapdragon/Mali GPUs.
           Scoped to flying state only (largest animation load). Battery-saver skips. */
        .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"]) .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"]) .sankofa-bird-wing-right {
          will-change: transform;
        }
        .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"]) .sankofa-bird-body {
          will-change: transform;
        }
        .sankofa-bird-rig:not([data-flying="true"]) .sankofa-bird-wing-left,
        .sankofa-bird-rig:not([data-flying="true"]) .sankofa-bird-wing-right,
        .sankofa-bird-rig:not([data-flying="true"]) .sankofa-bird-body {
          will-change: auto; /* release GPU layer when perched */
        }

        /* F15: Mid-zoom iridescence — helping state enhances shimmer brightness
           When helping at mid zoom, increase peak brightness of the shimmer cycle
           so gold tint is perceptible alongside the main helping glow. */
        @keyframes sankofa-wing-highlight-mid-helping {
          0%,100% { opacity: 0.22; filter: brightness(1.20) saturate(1.50) hue-rotate(-12deg); }
          50%     { opacity: 0.38; filter: brightness(1.45) saturate(1.80) hue-rotate(-18deg); }
        }
        .sankofa-bird-rig[data-helping="true"][data-zoom="mid"] .sankofa-bird-wing-left-highlight,
        .sankofa-bird-rig[data-helping="true"][data-zoom="mid"] .sankofa-bird-wing-right-highlight {
          animation: sankofa-wing-highlight-mid-helping 3.0s ease-in-out infinite !important;
        }

        /* F16: Aerodynamic glide-pitch + helping-crane verified composition.
           When data-flying="true" AND data-helping="true" AND data-gliding="true":
           - body gets: rotate: (E7, 0.07x bank) + rotate: (-2.5deg, F3-body) + scale: (P8.5, glide)
             rotate: properties from E7 and F3 ADD together (both individual properties).
             scale: is also individual — adds on top of both rotations. SAFE.
           - neck gets: rotate: (E7, 0.14x bank) + skewX: (E8, 0.42x bank) + translate: (F5, helping)
             Individual transform properties compose with transform: shorthand AFTER it.
             The translate: individual property stacks additively. SAFE.
           - No shorthand transform conflict: E2 head transform uses shorthand but
             E7 head uses rotate: individual — they compose additively (MDN rendering model). */

        /* F17: Battery-saver crossfade: also suppress F3/F4/F5 at LOD3 entry */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-tail {
          rotate: 0deg !important;
        }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-l4,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-r4 {
          animation: none !important; transform: none !important;
        }

`;
