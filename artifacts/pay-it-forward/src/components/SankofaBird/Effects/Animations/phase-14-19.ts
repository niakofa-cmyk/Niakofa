// Sankofa Bird CSS — Phase 14–19 | Living Companion, P15-16 trail/iOS, P17-18 kinematic chain, P19 upright heading
// Auto-split from SankofaBirdSvg.tsx — edit here, not in the monolith

// prettier-ignore
export const sankofaCssPhase14to19 = `
           Phase 14 — Living Companion
           Props: missionComplete, chirp, weather, trustLevel, communityMilestone
           Design doc: "The bird isn't a game character — it is a living creature
           that responds to the kindness unfolding around it."
           ══════════════════════════════════════════════════════════════════════ */

        /* -- P14.1 Chirp — beak + head bob + arc rings ----------------------- */
        @keyframes sankofa-beak-upper-chirp {
          0%, 100% { rotate: 0deg; }
          20% { rotate: -7deg; }
          42% { rotate: 0deg; }
          62% { rotate: -4deg; }
          80% { rotate: 0deg; }
        }
        @keyframes sankofa-beak-lower-chirp {
          0%, 100% { rotate: 0deg; }
          20% { rotate: 5deg; }
          42% { rotate: 0deg; }
          62% { rotate: 3deg; }
          80% { rotate: 0deg; }
        }
        @keyframes sankofa-chirp-arc-ring-kf {
          0%   { transform: scale(0.85); opacity: 0.7; }
          100% { transform: scale(2.2);  opacity: 0; }
        }
        /* Chirp fires as a once-off animation (iteration-count:1) gated by data-chirp.
           The beak animations use the CSS individual rotate property (not transform) so
           they compose with the existing transform-box:view-box beak positioning. */
        .sankofa-bird-rig[data-chirp="true"]:not([data-battery-saver="true"]) .sankofa-bird-beak-upper {
          animation: sankofa-beak-upper-chirp 0.52s ease-in-out 1;
        }
        .sankofa-bird-rig[data-chirp="true"]:not([data-battery-saver="true"]) .sankofa-bird-beak-lower {
          animation: sankofa-beak-lower-chirp 0.52s ease-in-out 1;
        }
        /* Chirp arc rings are DOM divs rendered OUTSIDE .sankofa-bird-rig (they sit
           beside the compass wrapper, not inside it). Because they are conditionally
           rendered ({chirp && ...}) they are only present in the DOM while chirp=true,
           so no data-attribute gate is needed — the element's presence is the gate.
           A data-scoped selector would never match them from the inner rig. */
        .sankofa-chirp-arc-ring {
          animation: sankofa-chirp-arc-ring-kf 0.52s ease-out 1 forwards;
        }

        /* -- P14.2 Mission complete — tail fan + ripple rings + warm glow ----- */
        @keyframes sankofa-mission-tail-fan {
          0%, 100% { transform: scaleX(1)   scaleY(1); }
          35%       { transform: scaleX(1.65) scaleY(0.90); }
          65%       { transform: scaleX(1.42) scaleY(0.95); }
        }
        @keyframes sankofa-mission-ripple-kf {
          0%   { transform: scale(0.9); opacity: 0.72; }
          100% { transform: scale(3.8); opacity: 0; }
        }
        @keyframes sankofa-mission-glow-kf {
          0%, 100% { opacity: 0.14; filter: blur(3px); }
          45%       { opacity: 0.52; filter: blur(5px) hue-rotate(10deg); }
        }
        .sankofa-bird-rig[data-mission-complete="true"]:not([data-battery-saver="true"]) .sankofa-bird-tail {
          animation: sankofa-mission-tail-fan 1.7s ease-in-out infinite !important;
          transform-box: view-box;
          transform-origin: 20px 26px;
        }
        /* Mission ripple rings are DOM divs rendered OUTSIDE .sankofa-bird-rig for the
           same reason as the chirp arc rings — they must stay fixed relative to the
           outer container, not rotate with the compass rig. Conditional rendering
           ({missionComplete && ...}) handles the gate; no data selector needed. */
        .sankofa-mission-ripple {
          animation: sankofa-mission-ripple-kf 1.7s ease-out infinite;
        }
        .sankofa-bird-rig[data-mission-complete="true"]:not([data-battery-saver="true"]) .sankofa-glow-layer {
          animation: sankofa-mission-glow-kf 1.7s ease-in-out infinite !important;
        }

        /* -- P14.3 Community milestone shimmer — hue wave across feathers ------ */
        @keyframes sankofa-milestone-shimmer {
          0%   { filter: hue-rotate(0deg)   brightness(1);    }
          20%  { filter: hue-rotate(55deg)  brightness(1.32); }
          45%  { filter: hue-rotate(115deg) brightness(1.16); }
          70%  { filter: hue-rotate(55deg)  brightness(1.28); }
          100% { filter: hue-rotate(0deg)   brightness(1);    }
        }
        .sankofa-bird-rig[data-community-milestone="true"]:not([data-battery-saver="true"]) .sankofa-bird-body,
        .sankofa-bird-rig[data-community-milestone="true"]:not([data-battery-saver="true"]) .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-community-milestone="true"]:not([data-battery-saver="true"]) .sankofa-bird-wing-right,
        .sankofa-bird-rig[data-community-milestone="true"]:not([data-battery-saver="true"]) .sankofa-bird-tail {
          animation: sankofa-milestone-shimmer 2.0s ease-in-out 1 forwards !important;
        }
        /* Stagger shimmer from tail → body → wings → head for wave feel */
        .sankofa-bird-rig[data-community-milestone="true"]:not([data-battery-saver="true"]) .sankofa-bird-tail {
          animation-delay: 0ms !important;
        }
        .sankofa-bird-rig[data-community-milestone="true"]:not([data-battery-saver="true"]) .sankofa-bird-body {
          animation-delay: 180ms !important;
        }
        .sankofa-bird-rig[data-community-milestone="true"]:not([data-battery-saver="true"]) .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-community-milestone="true"]:not([data-battery-saver="true"]) .sankofa-bird-wing-right {
          animation-delay: 340ms !important;
        }
        .sankofa-bird-rig[data-community-milestone="true"]:not([data-battery-saver="true"]) .sankofa-bird-head {
          animation: sankofa-milestone-shimmer 2.0s ease-in-out 1 forwards !important;
          animation-delay: 500ms !important;
        }

        /* -- P14.4 Trust tiers — Adinkra / Kente motif visibility -------------- */
        /* Base: all motif elements hidden */
        .sankofa-adinkra-covert,
        .sankofa-adinkra-breast,
        .sankofa-adinkra-crown { opacity: 0; }

        .sankofa-bird-rig[data-trust-tier="growing"] .sankofa-adinkra-covert {
          opacity: 0.28;
          transition: opacity 1.2s ease;
        }
        .sankofa-bird-rig[data-trust-tier="trusted"] .sankofa-adinkra-covert {
          opacity: 0.55;
          transition: opacity 1.2s ease;
        }
        .sankofa-bird-rig[data-trust-tier="trusted"] .sankofa-adinkra-breast {
          opacity: 0.48;
          transition: opacity 1.2s ease;
        }
        .sankofa-bird-rig[data-trust-tier="elder"] .sankofa-adinkra-covert {
          opacity: 0.78;
          transition: opacity 1.2s ease;
        }
        .sankofa-bird-rig[data-trust-tier="elder"] .sankofa-adinkra-breast {
          opacity: 0.72;
          transition: opacity 1.2s ease;
        }
        .sankofa-bird-rig[data-trust-tier="elder"] .sankofa-adinkra-crown {
          opacity: 0.90;
          transition: opacity 1.2s ease;
        }
        @keyframes sankofa-adinkra-elder-pulse {
          0%, 100% { opacity: 0.90; filter: drop-shadow(0 0 1.5px rgba(245,217,138,0.55)); }
          50%       { opacity: 1.0;  filter: drop-shadow(0 0 3.5px rgba(245,217,138,0.90)); }
        }
        .sankofa-bird-rig[data-trust-tier="elder"] .sankofa-adinkra-crown {
          animation: sankofa-adinkra-elder-pulse 3.2s ease-in-out infinite;
        }
        /* Mid-zoom: only show covert band (crown/breast too small to read at this LOD) */
        .sankofa-bird-rig[data-zoom="mid"][data-trust-tier="trusted"] .sankofa-adinkra-breast,
        .sankofa-bird-rig[data-zoom="mid"][data-trust-tier="elder"] .sankofa-adinkra-breast,
        .sankofa-bird-rig[data-zoom="mid"][data-trust-tier="elder"] .sankofa-adinkra-crown,
        .sankofa-bird-rig[data-zoom="low"][data-trust-tier="trusted"] .sankofa-adinkra-covert,
        .sankofa-bird-rig[data-zoom="low"][data-trust-tier="trusted"] .sankofa-adinkra-breast,
        .sankofa-bird-rig[data-zoom="low"][data-trust-tier="elder"] .sankofa-adinkra-covert,
        .sankofa-bird-rig[data-zoom="low"][data-trust-tier="elder"] .sankofa-adinkra-breast,
        .sankofa-bird-rig[data-zoom="low"][data-trust-tier="elder"] .sankofa-adinkra-crown { opacity: 0; }

        /* -- P14.5 Weather — rain/snow environmental effects ------------------- */
        .sankofa-bird-rig[data-weather="rain"]:not([data-battery-saver="true"]) .sankofa-bird-body,
        .sankofa-bird-rig[data-weather="rain"]:not([data-battery-saver="true"]) .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-weather="rain"]:not([data-battery-saver="true"]) .sankofa-bird-wing-right {
          filter: saturate(0.68) brightness(0.80) !important;
        }
        .sankofa-bird-rig[data-weather="rain"]:not([data-battery-saver="true"]) .sankofa-bird-tail {
          filter: saturate(0.65) brightness(0.75) !important;
        }
        .sankofa-bird-rig[data-weather="rain"]:not([data-battery-saver="true"]) .sankofa-bird-head {
          /* Slight forward hunch in rain — rotates head forward 4° */
          transform: rotate(4deg) !important;
          transform-box: view-box;
          transform-origin: 12px 16px;
          filter: saturate(0.72) brightness(0.82) !important;
        }
        @keyframes sankofa-snow-fluff {
          0%, 100% { transform: scale(1)    translateY(0px); }
          50%       { transform: scale(1.05) translateY(-0.7px); }
        }
        .sankofa-bird-rig[data-weather="snow"]:not([data-battery-saver="true"]) .sankofa-bird-body {
          animation: sankofa-snow-fluff 4.8s ease-in-out infinite !important;
          filter: brightness(1.20) saturate(0.85) !important;
        }
        .sankofa-bird-rig[data-weather="snow"]:not([data-battery-saver="true"]) .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-weather="snow"]:not([data-battery-saver="true"]) .sankofa-bird-wing-right {
          filter: brightness(1.14) saturate(0.82) !important;
        }
        /* Static snow filter (no fluff animation) in battery-saver mode */
        .sankofa-bird-rig[data-battery-saver="true"][data-weather="snow"] .sankofa-bird-body {
          filter: brightness(1.20) saturate(0.85) !important;
        }

        /* -- P14.6 Nictitating membrane — sideways translucent blink ---------- */
        /*
         * Timing strategy: the rest period is embedded INSIDE the keyframe.
         * The total animation-duration = blink-period × 3.2 (default ~22.4 s).
         * The visible sweep (in + hold + out) is fixed at ~0.44 s and fits in
         * the first 2% of the cycle; the remaining 98% keeps the membrane
         * invisible at scaleX(0). This means the membrane fires once per
         * (blink-period × 3.2) cycle with correct spacing — no animation-delay
         * hack that only applies on the first iteration.
         *
         * Keyframe percentages (target 0.44 s sweep in a 22.4 s period ≈ 2%):
         *   0 %  → invisible  (scaleX=0, opacity=0)
         *   1 %  → swept in   (scaleX=1, opacity=0.45)  ≈ 0.22 s
         *   3 %  → hold       (scaleX=1, opacity=0.40)  ≈ 0.44 s
         *   4 %  → retracted  (scaleX=0, opacity=0)     ≈ 0.90 s
         *   100% → invisible  (scaleX=0, opacity=0)
         *
         * At busy/peak the period is blink-period × 1.9 (~13.3 s at default),
         * so the same 1–4% window still covers ~0.27–0.53 s — close enough.
         * The percentages are deliberately coarse so they look natural across
         * the full blink-period range (3.5 s–9 s).
         */
        @keyframes sankofa-nictitating-sweep {
          0%   { transform: scaleX(0); opacity: 0;    }
          1%   { transform: scaleX(1); opacity: 0.45; }
          3%   { transform: scaleX(1); opacity: 0.40; }
          4%   { transform: scaleX(0); opacity: 0;    }
          100% { transform: scaleX(0); opacity: 0;    }
        }
        /* Default: membrane is invisible (scaleX already 0 from the element's
           transform-origin assignment; this ensures it stays hidden at low zoom). */
        .sankofa-nictitating {
          transform-box: view-box;
          transform-origin: 6.7px 12.65px;
          transform: scaleX(0);
        }
        /* Fires at street + high zoom — total period = blink-period × 3.2.
           Rest is embedded in the keyframe (98 % invisible), so the sweep
           fires once per period with no delay accumulation on subsequent loops. */
        .sankofa-bird-rig[data-zoom="street"] .sankofa-nictitating,
        .sankofa-bird-rig[data-zoom="high"]   .sankofa-nictitating {
          animation: sankofa-nictitating-sweep calc(var(--blink-period, 7000ms) * 3.2) linear infinite;
        }
        /* Busy / peak activity → fires at 1.9 × blink-period (shorter period = more frequent) */
        .sankofa-bird-rig[data-activity="busy"][data-zoom="street"] .sankofa-nictitating,
        .sankofa-bird-rig[data-activity="peak"][data-zoom="street"] .sankofa-nictitating,
        .sankofa-bird-rig[data-activity="busy"][data-zoom="high"]   .sankofa-nictitating,
        .sankofa-bird-rig[data-activity="peak"][data-zoom="high"]   .sankofa-nictitating {
          animation-duration: calc(var(--blink-period, 7000ms) * 1.9);
        }
        /* Battery-saver: suppress nictitation (save GPU for core flight) */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-nictitating {
          animation: none;
          transform: scaleX(0);
        }

        /* -- P14 Reduced-motion guard for overlay rings ----------------------
           The global prefers-reduced-motion block at the end of Phase 11 targets
           .sankofa-bird-rig * — but the chirp arc rings and mission ripple rings
           are DOM divs rendered OUTSIDE .sankofa-bird-rig (they sit in the outer
           container, beside the compass wrapper, so they don't rotate with the
           bird heading). They need their own reduced-motion override.
           Conditional rendering ({chirp && !batterySaver && ...}) already
           removes them from the DOM when inactive; this rule suppresses their
           animation for users who have "Reduce Motion" enabled in their OS.
           We collapse to animation-duration:0.001ms + iteration-count:1 to match
           the same pattern used by the global rule rather than animation:none,
           so the element still reaches its end-state (opacity:0) immediately. */
        @media (prefers-reduced-motion: reduce) {
          html:not([data-bird-anim="enabled"]) .sankofa-chirp-arc-ring,
          html:not([data-bird-anim="enabled"]) .sankofa-mission-ripple {
            animation-duration: 0.001ms !important;
            animation-iteration-count: 1 !important;
          }
        }

        /* -- P14.7 Heading momentum — spring cubic-bezier on trail rotation -- */
        /* The trail-wrapper rotation uses a spring easing (slight overshoot then
           settle) that mimics how a real bird's body mass causes it to briefly
           overshoot its heading before correcting — observable in Sharp-shinned
           Hawks and corvids during direction changes.
           NOTE: This transition now lives on .sankofa-bird-trail-wrapper (NOT the
           container) because the container no longer rotates — the bird body stays
           upright at all times. Only the trail particles spin to point behind the
           bird's travel direction.
           The spring cubic-bezier (0.34, 1.56, 0.64, 1): overshoot factor ≈ 5-8°.
           At airplane speed the spring is replaced with a smooth ease-out to
           reflect the aerodynamic constraint (banked turns, not pivots). */
        .sankofa-bird-trail-wrapper {
          transition: transform 0.40s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        /* :has() override for airplane speed on trail wrapper — Chrome 105+, Safari 15.4+.
           JS inline style on the wrapper div provides cross-browser fallback. */
        .sankofa-bird-container:has(.sankofa-bird-rig[data-speed="airplane"]) .sankofa-bird-trail-wrapper {
          transition: transform 0.58s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }


        /* ═══════════════════════════════════════════════════════════════════
           PHASE 15 — Solar-Reactive Night Enhancement Suite
           10 effects deepening the existing sky-tier system with per-element
           night / golden / twilight behaviors. Builds on Phase 6 (solar LOD)
           and Phase 10 (night-mode plumage). Solar wiring: useSolarTier() in
           map.tsx and request-active.tsx auto-sets skyTier via NOAA math every
           60 s so the bird goes dark at civil twilight without any manual toggle.
           ═══════════════════════════════════════════════════════════════════ */

        /* -- P15.1 Night silver trail particles ---------------------------------
           At night the teal dust trail shifts to icy silver-blue.
           Uses CSS :has() to target trail siblings from the rig data attribute.
           Golden hour: trail warms to amber. Battery-saver: colour only, no glow. */
        .sankofa-bird-container:has(.sankofa-bird-rig[data-sky-tier="night"]) .sankofa-trail {
          background: rgba(200,230,255,0.70) !important;
          filter: brightness(1.6) saturate(0.35);
        }
        .sankofa-bird-container:has(.sankofa-bird-rig[data-sky-tier="night"][data-battery-saver="true"]) .sankofa-trail {
          background: rgba(160,190,230,0.55) !important;
          filter: none;
        }
        .sankofa-bird-container:has(.sankofa-bird-rig[data-sky-tier="golden"]) .sankofa-trail {
          background: rgba(255,220,140,0.65) !important;
          filter: brightness(1.3) saturate(1.2);
        }

        /* -- P15.2 Golden hour feather shimmer cascade --------------------------
           A warm hue sweep rolls continuously across tail-wing-body-crown while
           sun is at 0-10 deg. Each part has a different period (8/11/14/17 s) so
           they never perfectly sync, creating a living ripple effect. */
        @keyframes sankofa-golden-feather-wave {
          0%,100% { filter: hue-rotate(-15deg) saturate(1.30) brightness(1.10); }
          30%     { filter: hue-rotate(-32deg) saturate(1.65) brightness(1.28); }
          60%     { filter: hue-rotate(-20deg) saturate(1.45) brightness(1.18); }
        }
        .sankofa-bird-rig[data-sky-tier="golden"]:not([data-battery-saver="true"]) .sankofa-bird-tail {
          animation: sankofa-golden-feather-wave 8.0s ease-in-out infinite;
        }
        .sankofa-bird-rig[data-sky-tier="golden"]:not([data-battery-saver="true"]) .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-sky-tier="golden"]:not([data-battery-saver="true"]) .sankofa-bird-wing-right {
          animation: sankofa-golden-feather-wave 11.0s ease-in-out 1.8s infinite !important;
        }
        .sankofa-bird-rig[data-sky-tier="golden"]:not([data-battery-saver="true"]) .sankofa-bird-body {
          animation: sankofa-golden-feather-wave 14.0s ease-in-out 3.2s infinite;
        }
        .sankofa-bird-rig[data-sky-tier="golden"]:not([data-battery-saver="true"]) .sankofa-crown-tip {
          animation: sankofa-golden-feather-wave 17.0s ease-in-out 5.5s infinite;
        }

        /* -- P15.3 Twilight chest heartbeat glow --------------------------------
           As the sky dims, the chest emits a slow warm glow-pulse — a heartbeat
           that grows more visible as twilight deepens before the night filter takes
           over. Targets sankofa-bird-chest (distinct from body, which already has
           the P6.4 twilight-breathe animation). */
        @keyframes sankofa-twilight-chest-glow {
          0%,100% { filter: saturate(0.62) brightness(0.80) hue-rotate(8deg) drop-shadow(0 0 2px rgba(80,130,255,0.22)); }
          40%     { filter: saturate(0.70) brightness(0.90) hue-rotate(11deg) drop-shadow(0 0 5px rgba(80,130,255,0.52)); }
        }
        .sankofa-bird-rig[data-sky-tier="twilight"]:not([data-battery-saver="true"]) .sankofa-bird-chest {
          animation: sankofa-twilight-chest-glow 4.2s ease-in-out infinite;
        }

        /* -- P15.4 Circadian breathing rhythm -----------------------------------
           Night: chest breathes slower and deeper (6.8 s period) — resting mode.
           Golden: slightly quickened (3.2 s) — excited by the light. The existing
           breathing keyframe plays at the new duration so no new keyframe needed. */
        .sankofa-bird-rig[data-sky-tier="night"]:not([data-battery-saver="true"]) .sankofa-bird-chest {
          animation-duration: 6.8s !important;
        }
        .sankofa-bird-rig[data-sky-tier="golden"]:not([data-battery-saver="true"]) .sankofa-bird-chest {
          animation-duration: 3.2s !important;
        }

        /* -- P15.5 Night navigation thermal ring --------------------------------
           While flying at night the glow-layer pulses with a warm amber ring,
           representing heightened environmental awareness in low light.
           Distinct from P10 bio-glow (that is teal). Here: amber (hue -40 deg).
           data-celebrating guard prevents fighting with the celebration glow. */
        @keyframes sankofa-night-thermal-ring {
          0%   { transform: scale(0.90); opacity: 0;    filter: hue-rotate(-40deg) brightness(1.2); }
          18%  { transform: scale(1.40); opacity: 0.52; filter: hue-rotate(-55deg) brightness(1.6); }
          55%  { transform: scale(2.20); opacity: 0.22; filter: hue-rotate(-45deg) brightness(1.3); }
          100% { transform: scale(3.60); opacity: 0;    filter: hue-rotate(-40deg) brightness(1.0); }
        }
        .sankofa-bird-rig[data-sky-tier="night"][data-flying="true"][data-celebrating="false"]:not([data-battery-saver="true"]) .sankofa-glow-layer {
          animation: sankofa-night-thermal-ring 2.6s ease-out infinite !important;
          transform-box: view-box;
          transform-origin: 20px 22px;
        }

        /* -- P15.6 Compound night+helping wing-edge bioluminescence -------------
           When helping someone at night the wing highlights emit a warm
           teal-to-gold phosphorescent glow — the warm golden sparkles mixed with
           teal from the vision doc, adapted to low-light. */
        @keyframes sankofa-bio-wing-edge {
          0%,100% { opacity: 0.30; filter: hue-rotate(0deg)  saturate(2.0) brightness(2.0); }
          35%     { opacity: 0.78; filter: hue-rotate(-25deg) saturate(2.4) brightness(2.8); }
          70%     { opacity: 0.55; filter: hue-rotate(-10deg) saturate(2.2) brightness(2.4); }
        }
        .sankofa-bird-rig[data-sky-tier="night"][data-helping="true"]:not([data-battery-saver="true"]) .sankofa-bird-wing-left-highlight,
        .sankofa-bird-rig[data-sky-tier="night"][data-helping="true"]:not([data-battery-saver="true"]) .sankofa-bird-wing-right-highlight {
          animation: sankofa-bio-wing-edge 3.8s ease-in-out infinite;
        }

        /* -- P15.7 Sky-tier shadow tinting --------------------------------------
           Day shadow: dark neutral. Night: cool moonlit blue.
           Golden: warm amber from low-angle sun. Twilight: muted grey-blue. */
        .sankofa-bird-rig[data-sky-tier="night"] .sankofa-bird-shadow {
          fill: rgba(20,40,120,0.32) !important;
        }
        .sankofa-bird-rig[data-sky-tier="golden"] .sankofa-bird-shadow {
          fill: rgba(140,80,10,0.24) !important;
        }
        .sankofa-bird-rig[data-sky-tier="twilight"] .sankofa-bird-shadow {
          fill: rgba(40,50,100,0.26) !important;
        }

        /* -- P15.8 Night crown phosphorescence ----------------------------------
           Crown tips glow with faint bioluminescent blue-white at night.
           Fires like a firefly — not a hard flash. Only at high/street zoom.
           The 3 tips stagger (0 / 1.4 s / 2.8 s) for an organic sparkle feel. */
        @keyframes sankofa-crown-phosphor {
          0%,100% { opacity: 0.60; filter: brightness(2.2) saturate(0.6) hue-rotate(30deg); }
          45%     { opacity: 1.00; filter: brightness(3.8) saturate(0.4) hue-rotate(45deg); }
        }
        .sankofa-bird-rig[data-sky-tier="night"][data-zoom="high"]:not([data-battery-saver="true"]) .sankofa-crown-tip,
        .sankofa-bird-rig[data-sky-tier="night"][data-zoom="street"]:not([data-battery-saver="true"]) .sankofa-crown-tip {
          animation: sankofa-crown-phosphor 5.6s ease-in-out infinite;
        }
        .sankofa-bird-rig[data-sky-tier="night"] .sankofa-crown-tip-2 { animation-delay: 0ms !important; }
        .sankofa-bird-rig[data-sky-tier="night"] .sankofa-crown-tip-3 { animation-delay: 1400ms !important; }
        .sankofa-bird-rig[data-sky-tier="night"] .sankofa-crown-tip-5 { animation-delay: 2800ms !important; }

        /* -- P15.9 Golden hour tail iridescence cascade -------------------------
           Outer tail feathers catch the low-angle sun more dramatically than the
           body at golden hour. Far feathers stagger 1.6 s behind outer. */
        @keyframes sankofa-golden-tail-glimmer {
          0%,100% { filter: hue-rotate(-22deg) saturate(1.8) brightness(1.35); }
          30%     { filter: hue-rotate(-42deg) saturate(2.2) brightness(1.65); }
          65%     { filter: hue-rotate(-28deg) saturate(2.0) brightness(1.48); }
        }
        .sankofa-bird-rig[data-sky-tier="golden"]:not([data-battery-saver="true"]) .sankofa-tail-outer-left,
        .sankofa-bird-rig[data-sky-tier="golden"]:not([data-battery-saver="true"]) .sankofa-tail-outer-right {
          animation: sankofa-golden-tail-glimmer 6.2s ease-in-out infinite;
        }
        .sankofa-bird-rig[data-sky-tier="golden"]:not([data-battery-saver="true"]) .sankofa-tail-far-left,
        .sankofa-bird-rig[data-sky-tier="golden"]:not([data-battery-saver="true"]) .sankofa-tail-far-right {
          animation: sankofa-golden-tail-glimmer 6.2s ease-in-out 1.6s infinite;
        }

        /* -- P15.10 Per-element sky-tier transition stagger ----------------------
           When the solar tier changes (60 s re-evaluation cycle), head responds
           fastest (most exposed to sky), tail slowest (aerodynamic wake). Creates
           a wave-of-light crossing the bird on dawn and dusk transitions.
           Battery-saver: instant transitions — no GPU ramp needed. */
        .sankofa-bird-rig[data-sky-tier] .sankofa-bird-head    { transition: filter 1.6s ease-in-out; }
        .sankofa-bird-rig[data-sky-tier] .sankofa-bird-body    { transition: filter 2.0s ease-in-out; }
        .sankofa-bird-rig[data-sky-tier] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-sky-tier] .sankofa-bird-wing-right { transition: filter 2.4s ease-in-out; }
        .sankofa-bird-rig[data-sky-tier] .sankofa-bird-tail    { transition: filter 2.8s ease-in-out; }
        .sankofa-bird-rig[data-battery-saver="true"][data-sky-tier] .sankofa-bird-head,
        .sankofa-bird-rig[data-battery-saver="true"][data-sky-tier] .sankofa-bird-body,
        .sankofa-bird-rig[data-battery-saver="true"][data-sky-tier] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-battery-saver="true"][data-sky-tier] .sankofa-bird-wing-right,
        .sankofa-bird-rig[data-battery-saver="true"][data-sky-tier] .sankofa-bird-tail { transition: none; }

        /* ═══════════════════════════════════════════════════════════════════
           PHASE 16 — Dynamic Aerial Movement Enhancements
           8 new behavioral effects from the vision documents:
           hover wrist articulation, enhanced murmurations, night light streaks,
           ground-effect hover ripple, aurora celebration, soaring altitude scale,
           approach feather ruffle cascade, dawn wing-stretch.
           ═══════════════════════════════════════════════════════════════════ */

        /* -- P16.1 Hover wrist articulation (high/street zoom) ------------------
           When stationary in hover phase, the wing-joint area pulses with a
           figure-8 micro-flex simulating the rapid wrist rotation that real
           hovering birds use to generate lift on both forward and backward strokes.
           Left and right wings are offset 0.19 s to avoid perfect synchrony. */
        @keyframes sankofa-hover-wrist-flex {
          0%,100% { rotate: 0deg;  scale: 1.00; opacity: 0.85; }
          20%     { rotate: -8deg; scale: 1.05; opacity: 1.00; }
          40%     { rotate:  6deg; scale: 1.02; opacity: 0.92; }
          60%     { rotate: -4deg; scale: 1.04; opacity: 0.98; }
          80%     { rotate:  3deg; scale: 1.01; opacity: 0.90; }
        }
        .sankofa-bird-rig[data-landing="hover"][data-zoom="high"]:not([data-battery-saver="true"]) .sankofa-wing-joint,
        .sankofa-bird-rig[data-landing="hover"][data-zoom="street"]:not([data-battery-saver="true"]) .sankofa-wing-joint {
          animation: sankofa-hover-wrist-flex 0.38s ease-in-out infinite !important;
          transform-box: view-box;
        }
        .sankofa-bird-rig[data-landing="hover"] .sankofa-wing-joint-left  { animation-delay: 0ms !important; }
        .sankofa-bird-rig[data-landing="hover"] .sankofa-wing-joint-right { animation-delay: 190ms !important; }

        /* -- P16.2 Enhanced soaring multi-wave ----------------------------------
           The P13 soaring mode has a single primary aero animation on the body.
           P16.2 adds a second lower-amplitude wave (3.1 s) on the tail and chest
           — elements that do NOT carry a primary wing-flap animation — creating
           the organic inter-limb phase offset visible when a bird rides thermals
           and altitude waves. data-aero-mode="soar" is emitted by computeAeroMode()
           when soaring=true OR speed > 30 m/s, so this is always reachable.
           Tail/chest operate on opposite 1.55 s phase offset for a rocking-boat feel. */
        @keyframes sankofa-murmur-wave-2 {
          0%,100% { transform: translateX(0px)   rotate(0deg); }
          28%     { transform: translateX(0.8px)  rotate(1.2deg); }
          72%     { transform: translateX(-0.6px) rotate(-0.9deg); }
        }
        .sankofa-bird-rig[data-aero-mode="soar"]:not([data-battery-saver="true"]) .sankofa-bird-tail {
          animation: sankofa-murmur-wave-2 3.1s ease-in-out 0.4s infinite;
        }
        .sankofa-bird-rig[data-aero-mode="soar"]:not([data-battery-saver="true"]) .sankofa-bird-chest {
          animation: sankofa-murmur-wave-2 3.1s ease-in-out 1.95s infinite;
        }

        /* -- P16.3 Night speed silver light streaks (airplane + night) ----------
           At airplane speed in darkness the outermost primaries leave faint silver
           photon trails — analogous to light streaks on fast aircraft in long
           exposure photography. Staggered: l5/r5 lead, l4/r4 follow 80 ms later. */
        @keyframes sankofa-night-streak {
          0%   { opacity: 0.55; transform: scaleX(1.0); filter: brightness(3.5) saturate(0.2); }
          55%  { opacity: 0.28; transform: scaleX(1.8); filter: brightness(2.5) saturate(0.1); }
          100% { opacity: 0;    transform: scaleX(2.8); filter: brightness(1.0) saturate(0.0); }
        }
        .sankofa-bird-rig[data-sky-tier="night"][data-speed="airplane"]:not([data-battery-saver="true"]) .sankofa-feather-l5,
        .sankofa-bird-rig[data-sky-tier="night"][data-speed="airplane"]:not([data-battery-saver="true"]) .sankofa-feather-r5 {
          animation: sankofa-night-streak 0.55s ease-out infinite !important;
          filter: brightness(3.2) saturate(0.15) hue-rotate(30deg) !important;
        }
        .sankofa-bird-rig[data-sky-tier="night"][data-speed="airplane"]:not([data-battery-saver="true"]) .sankofa-feather-l4,
        .sankofa-bird-rig[data-sky-tier="night"][data-speed="airplane"]:not([data-battery-saver="true"]) .sankofa-feather-r4 {
          animation: sankofa-night-streak 0.55s ease-out 80ms infinite !important;
          filter: brightness(2.6) saturate(0.18) hue-rotate(25deg) !important;
        }

        /* -- P16.4 Ground effect hover ripple (street zoom) ----------------------
           When hovering at street zoom a faint ground-interaction ripple radiates
           from the shadow — the downwash from hovering wings creating a surface
           disturbance. Disabled at battery-saver (shadow animation is expensive). */
        @keyframes sankofa-ground-ripple {
          0%   { transform: scaleX(1.0) scaleY(1.0); opacity: 0.55; }
          55%  { transform: scaleX(2.4) scaleY(0.6); opacity: 0.22; }
          100% { transform: scaleX(4.0) scaleY(0.3); opacity: 0;    }
        }
        .sankofa-bird-rig[data-landing="hover"][data-zoom="street"]:not([data-battery-saver="true"]) .sankofa-bird-shadow {
          animation: sankofa-ground-ripple 1.8s ease-out infinite !important;
          transform-box: view-box;
          transform-origin: 20px 39.5px;
        }

        /* -- P16.5 Aurora burst (night + celebrating) ---------------------------
           Standard celebration fires teal. At night the blanket hue-rotate(22deg)
           already shifts it cooler. P16.5 intensifies that shift to a distinct
           blue-violet aurora quality — deeper saturation and slower glow fade. */
        .sankofa-bird-rig[data-sky-tier="night"][data-celebrating="true"] .sankofa-glow-layer {
          animation: sankofa-mission-glow-kf 1.0s ease-in-out 3 !important;
          filter: hue-rotate(35deg) brightness(1.6) saturate(2.0) !important;
        }

        /* -- P16.6 Soaring altitude scale visual --------------------------------
           During dynamic soaring the body subtly scales up on the rising limb
           (climbing into the headwind) and back down on the descending limb,
           giving the illusion of altitude change over the 4.2 s soaring cycle. */
        @keyframes sankofa-soar-altitude {
          0%,100% { transform: scale(1.00); }
          25%     { transform: scale(1.06); }
          75%     { transform: scale(0.95); }
        }
        .sankofa-bird-rig[data-soaring="true"]:not([data-battery-saver="true"]) .sankofa-bird-body {
          animation: sankofa-soar-altitude 4.2s ease-in-out infinite;
        }

        /* -- P16.7 Approach feather ruffle cascade ------------------------------
           As the bird approaches its destination (data-approaching=true) primary
           feathers deploy as air brakes — each ruffles forward at a 60 ms offset
           for a realistic cascade from tip inward. 3 iterations then stops. */
        @keyframes sankofa-approach-ruffle {
          0%,100% { rotate: 0deg; }
          30%     { rotate: -6deg; }
          70%     { rotate: -3deg; }
        }
        .sankofa-bird-rig[data-approaching="true"]:not([data-battery-saver="true"]) .sankofa-feather-l0 { animation: sankofa-approach-ruffle 0.9s ease-in-out 3; }
        .sankofa-bird-rig[data-approaching="true"]:not([data-battery-saver="true"]) .sankofa-feather-l1 { animation: sankofa-approach-ruffle 0.9s ease-in-out 0.06s 3; }
        .sankofa-bird-rig[data-approaching="true"]:not([data-battery-saver="true"]) .sankofa-feather-l2 { animation: sankofa-approach-ruffle 0.9s ease-in-out 0.12s 3; }
        .sankofa-bird-rig[data-approaching="true"]:not([data-battery-saver="true"]) .sankofa-feather-l3 { animation: sankofa-approach-ruffle 0.9s ease-in-out 0.18s 3; }
        .sankofa-bird-rig[data-approaching="true"]:not([data-battery-saver="true"]) .sankofa-feather-l4 { animation: sankofa-approach-ruffle 0.9s ease-in-out 0.24s 3; }
        .sankofa-bird-rig[data-approaching="true"]:not([data-battery-saver="true"]) .sankofa-feather-l5 { animation: sankofa-approach-ruffle 0.9s ease-in-out 0.30s 3; }
        .sankofa-bird-rig[data-approaching="true"]:not([data-battery-saver="true"]) .sankofa-feather-r0 { animation: sankofa-approach-ruffle 0.9s ease-in-out 0.03s 3; }
        .sankofa-bird-rig[data-approaching="true"]:not([data-battery-saver="true"]) .sankofa-feather-r1 { animation: sankofa-approach-ruffle 0.9s ease-in-out 0.09s 3; }
        .sankofa-bird-rig[data-approaching="true"]:not([data-battery-saver="true"]) .sankofa-feather-r2 { animation: sankofa-approach-ruffle 0.9s ease-in-out 0.15s 3; }
        .sankofa-bird-rig[data-approaching="true"]:not([data-battery-saver="true"]) .sankofa-feather-r3 { animation: sankofa-approach-ruffle 0.9s ease-in-out 0.21s 3; }
        .sankofa-bird-rig[data-approaching="true"]:not([data-battery-saver="true"]) .sankofa-feather-r4 { animation: sankofa-approach-ruffle 0.9s ease-in-out 0.27s 3; }
        .sankofa-bird-rig[data-approaching="true"]:not([data-battery-saver="true"]) .sankofa-feather-r5 { animation: sankofa-approach-ruffle 0.9s ease-in-out 0.33s 3; }

        /* -- P16.8 Dawn/dusk wing-stretch acknowledgement -----------------------
           At golden-hour dawn/dusk when navigation starts (data-landing=takeoff)
           the wings spread into a warm glow-burst — "greeting the light" behaviour
           seen at sunrise roosts. Fires once (iteration-count 1) at takeoff only. */
        @keyframes sankofa-dawn-stretch {
          0%,100% { filter: hue-rotate(-15deg) brightness(1.10) saturate(1.3); }
          50%     { filter: hue-rotate(-38deg) brightness(1.45) saturate(1.8); }
        }
        .sankofa-bird-rig[data-sky-tier="golden"][data-landing="takeoff"]:not([data-battery-saver="true"]) .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-sky-tier="golden"][data-landing="takeoff"]:not([data-battery-saver="true"]) .sankofa-bird-wing-right {
          animation: sankofa-dawn-stretch 1.2s ease-in-out 1 forwards;
        }

        /* -- P15/P16 Reduced-motion guard ---------------------------------------
           New :has()-based trail rules and ground-effect shadow rules are outside
           the global html:not([data-bird-anim]) .sankofa-bird-rig * scope, so
           they need their own reduced-motion override. */
        @media (prefers-reduced-motion: reduce) {
          html:not([data-bird-anim="enabled"]) .sankofa-bird-container .sankofa-trail {
            animation: none !important;
            filter: none !important;
          }
        }

        /* ═══════════════════════════════════════════════════════════════════
           PHASE 17 — Full 360° Directional Aerodynamics
           Real-time head→neck→body→wing→tail kinematic chain.
           Every direction change (left, right, up, down, diagonal) is now
           reflected through the entire bird body in physically correct order.

           New CSS vars (set from JS via p17Active gate):
             --neck-curve-deg      lateral neck S-curve (±18°)
             --body-twist-deg      body 3D foreshortening twist
             --vertical-gaze-deg   vertical head tilt for up/down gaze (±8°)
             --turn-intensity      0–1 turn magnitude scalar
             --inside-wing-tuck    0–1 inside-wing fold depth

           New data attribute: data-turn-dir="left|right|none"

           Device support:
             iOS Safari  — @supports not (rotate: 1deg) fallback
             Android     — contain:layout + isolation:isolate
             Battery-saver — all Phase 17 kinematic effects suppressed
             Reduced-motion — transitions disabled, positions preserved
           ═══════════════════════════════════════════════════════════════════ */

        /* -- P17.0 Directional heading — handled by .sankofa-bird-heading-wrapper inner <g> --
           The full-360 heading rotation lives on the child <g class="sankofa-bird-heading-wrapper">
           inside SankofaBird.tsx — NOT on the SVG root element.

           Why the inner <g> approach:
             CSS animations have higher cascade priority than inline style for the same property.
             The SVG element (.sankofa-bird-body) carries always-on animations (sankofa-float,
             sankofa-glide, sankofa-hover-body) that continuously set transform:translateY.
             Any inline transform:rotate on the SVG element is wiped every animation frame.
             Moving the rotation to an inner <g> avoids the conflict — the <g> has no CSS
             animations, so the inline style transform:rotate wins cleanly.

           The .sankofa-svg-root rules below set transform:none so the SVG element itself
           is never rotated by CSS, leaving the float/glide animations free to translateY. */
        .sankofa-bird-rig[data-facing="right"] .sankofa-svg-root,
        .sankofa-bird-rig[data-facing="left"] .sankofa-svg-root,
        .sankofa-bird-rig:not([data-facing]) .sankofa-svg-root {
          transform: none;
        }

        /* Heading-wrapper inline style (set by JS) handles the rotation.
           This CSS transition is a fallback — the inline style sets its own transition. */
        .sankofa-bird-rig .sankofa-bird-heading-wrapper {
          transition: transform 0.55s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }

        /* -- P17.1 Neck lateral S-curve during turns ---------------------------
           Avian neck S-bend during banked turns:
             base anchors to body → mid-section bulges toward turn → head leads.
           --neck-curve-deg combines bank angle + lateral gaze direction.
           transform-origin: 18px 16px is the neck-body junction in SVG viewBox
           space (the M point of the neck path 'M18 16 C15 13 12 12 9 13.5').
           Previous "center bottom" resolved to (20px, 40px) — off the bird entirely.
           Spring cubic-bezier gives an organic settle (real bird neck elasticity). */
        .sankofa-bird-rig .sankofa-bird-neck {
          rotate: var(--neck-curve-deg, 0deg);
          transform-origin: 18px 16px;
          transform-box: view-box;
          transition: rotate 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        /* -- P17.2 Head spherical awareness — horizontal + vertical combined ----
           --gaze-rotate-deg pre-combines horizontal head-lead + vertical gaze tilt
           in JS (computeGazeRotateDeg) eliminating the previous 3-way cascade
           conflict where E7, P12, and P17 each set "rotate:" with different calc().
           transform-origin: 18px 16px is the neck-body junction (same pivot as
           P17.1). Previous "center bottom" was (20px, 40px) — outside the bird —
           producing a virtually invisible rotation.
           Amplified ±14°/±12° vertical gaze is now visible at 48px map-marker scale. */
        .sankofa-bird-rig .sankofa-bird-head {
          rotate: var(--gaze-rotate-deg, 0deg);
          transform-origin: 18px 16px;
          transform-box: view-box;
          transition: rotate 0.22s ease-out;
        }

        /* -- P17.3 Body lateral twist — 3D foreshortening illusion during turns --
           Turn-side: compressed. Outer side: elongated.
           Max 6% scale / 4° skew — reads as depth, not cartoon distortion.
           suppressed by p17Active gate in JS (vars set to 0) at low zoom + battery-saver. */
        .sankofa-bird-rig[data-turn-dir="right"][data-flying="true"] .sankofa-bird-body {
          transform: scaleX(calc(1 + var(--turn-intensity, 0) * 0.06))
                     skewX(calc(var(--turn-intensity, 0) * -4deg));
          transform-box: view-box;
          transition: transform 0.32s ease-out;
        }
        .sankofa-bird-rig[data-turn-dir="left"][data-flying="true"] .sankofa-bird-body {
          transform: scaleX(calc(1 - var(--turn-intensity, 0) * 0.06))
                     skewX(calc(var(--turn-intensity, 0) * 4deg));
          transform-box: view-box;
          transition: transform 0.32s ease-out;
        }

        /* -- P17.4 Inside-wing underside reveal during sharp banked turns ------
           The *-btm layers (wing undersides) ramp from opacity:0 above 40% turn
           intensity. Formula: clamp(0, (intensity−0.40)×1.67, 1).
           At 25° bank (intensity=1): underside is fully visible. */
        .sankofa-bird-rig[data-turn-dir="right"][data-flying="true"] .sankofa-bird-wing-left-btm {
          opacity: calc(max(0, (var(--turn-intensity, 0) - 0.40) * 1.67));
          transition: opacity 0.35s ease-out;
        }
        .sankofa-bird-rig[data-turn-dir="left"][data-flying="true"] .sankofa-bird-wing-right-btm {
          opacity: calc(max(0, (var(--turn-intensity, 0) - 0.40) * 1.67));
          transition: opacity 0.35s ease-out;
        }

        /* -- P17.5 Outside wing spread + brightening (primary lift surface) ----
           Outside (upper) wing is primary lift surface during banked turns.
           Primaries spread 4% wider + brighten at mid/high/street zoom.
           Creates the classic uneven silhouette of a banking eagle or albatross. */
        .sankofa-bird-rig[data-turn-dir="right"][data-flying="true"][data-zoom="mid"] .sankofa-bird-wing-left-feathers,
        .sankofa-bird-rig[data-turn-dir="right"][data-flying="true"][data-zoom="high"] .sankofa-bird-wing-left-feathers,
        .sankofa-bird-rig[data-turn-dir="right"][data-flying="true"][data-zoom="street"] .sankofa-bird-wing-left-feathers {
          filter: brightness(calc(1 + var(--turn-intensity, 0) * 0.14))
                  saturate(calc(1 + var(--turn-intensity, 0) * 0.18));
          transform: scale(calc(1 + var(--turn-intensity, 0) * 0.04));
          transform-origin: center right;
          transform-box: view-box;
          transition: filter 0.30s ease-out, transform 0.30s ease-out;
        }
        .sankofa-bird-rig[data-turn-dir="left"][data-flying="true"][data-zoom="mid"] .sankofa-bird-wing-right-feathers,
        .sankofa-bird-rig[data-turn-dir="left"][data-flying="true"][data-zoom="high"] .sankofa-bird-wing-right-feathers,
        .sankofa-bird-rig[data-turn-dir="left"][data-flying="true"][data-zoom="street"] .sankofa-bird-wing-right-feathers {
          filter: brightness(calc(1 + var(--turn-intensity, 0) * 0.14))
                  saturate(calc(1 + var(--turn-intensity, 0) * 0.18));
          transform: scale(calc(1 + var(--turn-intensity, 0) * 0.04));
          transform-origin: center left;
          transform-box: view-box;
          transition: filter 0.30s ease-out, transform 0.30s ease-out;
        }

        /* -- P17.6 Tail asymmetric rudder spread during turns ------------------
           Tail acts as rudder: outer rectrix on TURN side fans further outward.
           Right turn → right outer/far feathers spread right.
           Left  turn → left outer/far feathers spread left.
           Spring bezier gives tail a natural aerodynamic snap. */
        .sankofa-bird-rig[data-turn-dir="right"][data-flying="true"] .sankofa-tail-outer-right,
        .sankofa-bird-rig[data-turn-dir="right"][data-flying="true"] .sankofa-tail-far-right {
          transform: translateX(calc(var(--turn-intensity, 0) * 3.5px))
                     rotate(calc(var(--turn-intensity, 0) * 10deg));
          transform-box: view-box;
          transition: transform 0.38s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .sankofa-bird-rig[data-turn-dir="left"][data-flying="true"] .sankofa-tail-outer-left,
        .sankofa-bird-rig[data-turn-dir="left"][data-flying="true"] .sankofa-tail-far-left {
          transform: translateX(calc(var(--turn-intensity, 0) * -3.5px))
                     rotate(calc(var(--turn-intensity, 0) * -10deg));
          transform-box: view-box;
          transition: transform 0.38s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        /* -- P17.7 Vertical gaze: chest stretch for full up/down body awareness --
           Up gaze: chest expands (neck extends skyward).
           Down gaze: chest compresses (bird tips forward).
           Subtle (max 5%) — reads as depth rather than distortion. */
        .sankofa-bird-rig[data-gaze="up"] .sankofa-bird-chest,
        .sankofa-bird-rig[data-gaze="upleft"] .sankofa-bird-chest,
        .sankofa-bird-rig[data-gaze="upright"] .sankofa-bird-chest {
          transform: scaleY(1.05) translateY(-0.8px);
          transform-box: view-box;
          transition: transform 0.25s ease-out;
        }
        .sankofa-bird-rig[data-gaze="down"] .sankofa-bird-chest,
        .sankofa-bird-rig[data-gaze="downleft"] .sankofa-bird-chest,
        .sankofa-bird-rig[data-gaze="downright"] .sankofa-bird-chest {
          transform: scaleY(0.96) translateY(0.8px);
          transform-box: view-box;
          transition: transform 0.25s ease-out;
        }

        /* -- P17.8 Hard-bank inertial flash -------------------------------------
           At hard bank (>20°) a brief contrast pulse fires on the rig —
           simulates the inertial load as the bird commits to a tight turn.
           Fires once per bank event. Subtle: contrast+4%, brightness+2%. */
        @keyframes sankofa-hard-turn-flash {
          0%,100% { filter: none; }
          40%     { filter: contrast(1.04) brightness(1.02); }
        }
        .sankofa-bird-rig[data-hard-bank="true"]:not([data-battery-saver="true"]) {
          animation: sankofa-hard-turn-flash 0.70s ease-in-out 1;
        }

        /* -- P17.9 Wing-tip stress flutter during sharp direction changes -------
           Outer primaries (l5/r5 lead, l4/r4 follow 80ms) micro-oscillate on
           hard-bank — simulating aerodynamic stress flutter at tip of tight turn. */
        @keyframes sankofa-turn-flutter {
          0%,100% { rotate: 0deg; }
          18%     { rotate: -5deg; }
          36%     { rotate:  3deg; }
          54%     { rotate: -3deg; }
          72%     { rotate:  2deg; }
        }
        .sankofa-bird-rig[data-hard-bank="true"]:not([data-battery-saver="true"]) .sankofa-feather-l5,
        .sankofa-bird-rig[data-hard-bank="true"]:not([data-battery-saver="true"]) .sankofa-feather-r5 {
          animation: sankofa-turn-flutter 0.65s ease-in-out 1 !important;
          transform-box: view-box;
        }
        .sankofa-bird-rig[data-hard-bank="true"]:not([data-battery-saver="true"]) .sankofa-feather-l4,
        .sankofa-bird-rig[data-hard-bank="true"]:not([data-battery-saver="true"]) .sankofa-feather-r4 {
          animation: sankofa-turn-flutter 0.65s ease-in-out 80ms 1 !important;
          transform-box: view-box;
        }

        /* -- P17.10 Zoom-amplified neck S-curve (high/street detail boost) -----
           At high zoom the neck is fully visible — amplify the S-curve so it reads.
           At low/mid zoom it's too small to perceive so no amplification needed. */
        .sankofa-bird-rig[data-zoom="high"] .sankofa-bird-neck {
          rotate: calc(var(--neck-curve-deg, 0deg) * 1.15);
        }
        .sankofa-bird-rig[data-zoom="street"] .sankofa-bird-neck {
          rotate: calc(var(--neck-curve-deg, 0deg) * 1.30);
        }

        /* -- P17.11 iOS Safari GPU compositing fallback (rotate: shorthand bug) --
           iOS Safari < 17.4: rotate: on SVG elements with will-change:transform
           + child clip-path produces rendering artifacts above ±15°.
           @supports not (rotate: 1deg) detects these browsers and falls back to
           the longhand transform: rotate() which is universally supported.
           The shorthand rules above still apply on modern browsers. */
        @supports not (rotate: 1deg) {
          .sankofa-bird-rig .sankofa-bird-neck {
            transform: rotate(var(--neck-curve-deg, 0deg)) !important;
            rotate: unset !important;
          }
          .sankofa-bird-rig .sankofa-bird-head {
            transform: rotate(var(--gaze-rotate-deg, 0deg)) !important;
            rotate: unset !important;
          }
        }

        /* -- P17.12 Android Chrome layout containment for turn elements --------
           Chrome on Snapdragon 636 / Mali-G51 (2017-2019 Android) stutters when
           SVG paths transition rotate+filter without a separate compositing layer.
           contain:layout style isolates reflow. paint excluded intentionally —
           it would clip the overflow:visible tail/wing tips. */
        .sankofa-bird-rig .sankofa-bird-head,
        .sankofa-bird-rig .sankofa-bird-neck,
        .sankofa-bird-rig .sankofa-bird-body {
          contain: layout style;
          isolation: isolate;
        }

        /* -- P17.13 Battery-saver: suppress all Phase 17 kinematic transforms ---
           Belt-and-suspenders guard: even if vars aren't zero on a cached render,
           these rules force all kinematic transforms off in battery-saver mode. */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-neck,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-head {
          rotate: unset !important;
          transform: none !important;
          transition: none !important;
        }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-body,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-chest {
          transform: none !important;
          transition: none !important;
        }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-tail-outer-left,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-tail-outer-right,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-tail-far-left,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-tail-far-right {
          transform: none !important;
          transition: none !important;
        }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-left-btm,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-right-btm {
          opacity: 0 !important;
        }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-left-feathers,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-right-feathers {
          filter: none !important;
          transform: none !important;
        }

        /* -- P17.14 Reduced-motion guard for Phase 17 directionality ------------
           All Phase 17 CSS transitions suppressed. The JS bank rotation (inline
           style on the rig) is a positional/navigation aid and is preserved. */
        @media (prefers-reduced-motion: reduce) {
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-neck,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-head {
            rotate: unset !important;
            transition: none !important;
          }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-body,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-chest {
            transform: none !important;
            transition: none !important;
          }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-tail-outer-left,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-tail-outer-right,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-tail-far-left,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-tail-far-right {
            transform: none !important;
            transition: none !important;
          }
        }

        /* ═══════════════════════════════════════════════════════════════════
           PHASE 18 — Complete Aerodynamic Kinematic Chain
           Closes all remaining gaps from Phase 17 and the design vision doc:

           1.  Inside-wing compression: --inside-wing-tuck was wired in JS
               but had no CSS consumer. Now drives true wing-fold on the
               inside wing during banked turns, giving the classic eagle
               silhouette asymmetry.
           2.  Outside-wing forward sweep: leading-edge primaries brighten
               under aerodynamic pressure on the high-lift outside wing.
           3.  Neck 3D foreshortening: neck opacity dips on the shaded side
               of a turn — lateral S-curve reads as true depth.
           4.  Body torsion origin fix: transform-origin anchored to chest
               centre so twist and skew pivot from the correct anatomical point.
           5.  Diagonal gaze full-body chain: upleft/upright/downleft/downright
               gaze moves the chest in BOTH axes simultaneously — no more
               isolated vertical-only or horizontal-only response.
           6.  Scapular feather deploy on hard banks: shoulder feathers puff
               outward when the bird commits to a tight banked turn (>20°).
           7.  Leg asymmetry on hard turns: inside-turn leg tucks higher
               (reduces drag on the compressed-body side).
           8.  Tail heading-hold counter-rotation: when the bird scans left
               or right without banking, the tail deflects opposite to hold
               course — real avian stabilisation torque.
           9.  Speed-driven head crane: at driving/airplane speed the head
               naturally tips forward into streamlined posture beyond the
               baseline head-lead angle.
           10. Battery-saver + reduced-motion guards for all new effects.
           ═══════════════════════════════════════════════════════════════════ */

        /* @property declarations for Phase 18 animated CSS vars.
           Enables CSS transitions on custom properties in modern browsers.
           inside-wing-tuck is already used via calc() so @property ensures
           it can also be transitioned on Chromium 85+ / Safari 15.4+. */
        @property --inside-wing-tuck {
          syntax: '<number>';
          inherits: true;
          initial-value: 0;
        }

        /* -- P18.1 Inside-wing compression (closes the --inside-wing-tuck gap) ----
           The wing on the INSIDE of a banked turn folds toward the body, reducing
           its lift contribution — the primary difference between a banking bird
           and a flat-rotating silhouette.

           Right turn → right wing is inside → scaleX from right edge inward.
           Left turn  → left  wing is inside → scaleX from left  edge inward.

           At max bank (25° → tuck=1.0): wing chord compresses 14% and dims 20%.
           This combines with P17.4 underside-reveal and P17.5 outside-spread to
           give the complete asymmetric eagle/hawk banking silhouette.

           Battery-saver guard at bottom of Phase 18 resets all transforms. */
        .sankofa-bird-rig[data-turn-dir="right"][data-flying="true"] .sankofa-bird-wing-right {
          transform: scaleX(calc(1 - var(--inside-wing-tuck, 0) * 0.14));
          transform-origin: 20px 17px;
          transform-box: view-box;
          filter: brightness(calc(1 - var(--inside-wing-tuck, 0) * 0.20));
          transition: transform 0.38s ease-out, filter 0.38s ease-out;
        }
        .sankofa-bird-rig[data-turn-dir="left"][data-flying="true"] .sankofa-bird-wing-left {
          transform: scaleX(calc(1 - var(--inside-wing-tuck, 0) * 0.14));
          transform-origin: 20px 17px;
          transform-box: view-box;
          filter: brightness(calc(1 - var(--inside-wing-tuck, 0) * 0.20));
          transition: transform 0.38s ease-out, filter 0.38s ease-out;
        }
        /* Inside wing PRIMARY FEATHERS also compress toward body.
           Outer tips compress the most (l5/r5), inner feathers less (l4/r4). */
        .sankofa-bird-rig[data-turn-dir="right"][data-flying="true"] .sankofa-feather-r5 {
          transform: translateX(calc(var(--inside-wing-tuck, 0) * -2.5px));
          transform-box: view-box;
          transition: transform 0.38s ease-out;
        }
        .sankofa-bird-rig[data-turn-dir="right"][data-flying="true"] .sankofa-feather-r0 {
          transform: translateX(calc(var(--inside-wing-tuck, 0) * -1.8px));
          transform-box: view-box;
          transition: transform 0.38s ease-out;
        }
        .sankofa-bird-rig[data-turn-dir="right"][data-flying="true"] .sankofa-feather-r4 {
          transform: translateX(calc(var(--inside-wing-tuck, 0) * -0.8px));
          transform-box: view-box;
          transition: transform 0.38s ease-out;
        }
        .sankofa-bird-rig[data-turn-dir="left"][data-flying="true"] .sankofa-feather-l5 {
          transform: translateX(calc(var(--inside-wing-tuck, 0) * 2.5px));
          transform-box: view-box;
          transition: transform 0.38s ease-out;
        }
        .sankofa-bird-rig[data-turn-dir="left"][data-flying="true"] .sankofa-feather-l0 {
          transform: translateX(calc(var(--inside-wing-tuck, 0) * 1.8px));
          transform-box: view-box;
          transition: transform 0.38s ease-out;
        }
        .sankofa-bird-rig[data-turn-dir="left"][data-flying="true"] .sankofa-feather-l4 {
          transform: translateX(calc(var(--inside-wing-tuck, 0) * 0.8px));
          transform-box: view-box;
          transition: transform 0.38s ease-out;
        }

        /* -- P18.2 Outside-wing leading-edge aerodynamic pressure brightening ---
           The outside (high-lift) wing's outermost primaries brighten as they
           bear maximum aerodynamic load during a banked turn — analogous to the
           specular flash on a raptor's leading edge in high-speed photography.
           Outermost feathers (l5/r5, l0/r0) receive the most brightening.
           Battery-saver guard below suppresses filter to none. */
        .sankofa-bird-rig[data-turn-dir="right"][data-flying="true"]:not([data-battery-saver="true"]) .sankofa-feather-l5,
        .sankofa-bird-rig[data-turn-dir="right"][data-flying="true"]:not([data-battery-saver="true"]) .sankofa-feather-l0 {
          filter: brightness(calc(1 + var(--turn-intensity, 0) * 0.40))
                  saturate(calc(1 + var(--turn-intensity, 0) * 0.28));
          transition: filter 0.25s ease-out;
        }
        .sankofa-bird-rig[data-turn-dir="right"][data-flying="true"]:not([data-battery-saver="true"]) .sankofa-feather-l1,
        .sankofa-bird-rig[data-turn-dir="right"][data-flying="true"]:not([data-battery-saver="true"]) .sankofa-feather-l2 {
          filter: brightness(calc(1 + var(--turn-intensity, 0) * 0.22))
                  saturate(calc(1 + var(--turn-intensity, 0) * 0.16));
          transition: filter 0.30s ease-out;
        }
        .sankofa-bird-rig[data-turn-dir="left"][data-flying="true"]:not([data-battery-saver="true"]) .sankofa-feather-r5,
        .sankofa-bird-rig[data-turn-dir="left"][data-flying="true"]:not([data-battery-saver="true"]) .sankofa-feather-r0 {
          filter: brightness(calc(1 + var(--turn-intensity, 0) * 0.40))
                  saturate(calc(1 + var(--turn-intensity, 0) * 0.28));
          transition: filter 0.25s ease-out;
        }
        .sankofa-bird-rig[data-turn-dir="left"][data-flying="true"]:not([data-battery-saver="true"]) .sankofa-feather-r1,
        .sankofa-bird-rig[data-turn-dir="left"][data-flying="true"]:not([data-battery-saver="true"]) .sankofa-feather-r2 {
          filter: brightness(calc(1 + var(--turn-intensity, 0) * 0.22))
                  saturate(calc(1 + var(--turn-intensity, 0) * 0.16));
          transition: filter 0.30s ease-out;
        }

        /* -- P18.3 Neck 3D foreshortening during turns --------------------------
           When the neck S-curves into a turn, the shaded side compresses slightly
           in the viewer's perspective — simulating the 3D depth of a curved neck
           in lateral view. Combined with the P17.1 S-curve rotation, this makes
           the neck read as a real cylindrical structure rather than a flat line.
           At max bank (intensity=1): opacity drops to 0.82 (18% dimmer on turn side). */
        .sankofa-bird-rig[data-turn-dir="right"] .sankofa-bird-neck {
          opacity: calc(1 - var(--turn-intensity, 0) * 0.18);
          transition: opacity 0.28s ease-out;
        }
        .sankofa-bird-rig[data-turn-dir="left"] .sankofa-bird-neck {
          opacity: calc(1 - var(--turn-intensity, 0) * 0.18);
          transition: opacity 0.28s ease-out;
        }
        /* Neck sheen brightens on the OUTSIDE of the turn (facing the light) */
        .sankofa-bird-rig[data-turn-dir="right"]:not([data-battery-saver="true"]) .sankofa-neck-top-sheen {
          opacity: calc(0 + var(--turn-intensity, 0) * 0.62);
          transition: opacity 0.28s ease-out;
        }
        .sankofa-bird-rig[data-turn-dir="left"]:not([data-battery-saver="true"]) .sankofa-neck-top-sheen {
          opacity: calc(0 + var(--turn-intensity, 0) * 0.62);
          transition: opacity 0.28s ease-out;
        }

        /* -- P18.4 Body torsion transform-origin anchor (fix P17.3 pivot) --------
           P17.3 applies scaleX + skewX to .sankofa-bird-body (the SVG element).
           transform-box:view-box means transform-origin "20px 22px" (chest centre)
           is the anatomically correct pivot. Adding explicit transform-origin here
           ensures all browsers use the chest as the torsion fulcrum, not the SVG
           element's bounding-box centre which varies by browser. */
        .sankofa-bird-rig[data-flying="true"] .sankofa-bird-body {
          transform-origin: 20px 22px;
          transform-box: view-box;
        }

        /* -- P18.5 Diagonal gaze full-body chain: both axes simultaneously ------
           P17.7 handles PURE vertical gaze (up/down) on the chest.
           Diagonal gazes (upleft/upright/downleft/downright) need BOTH the
           vertical chest stretch AND a lateral displacement — the bird's centre of
           gravity shifts diagonally when it cranes its head in a diagonal direction.
           Replaces P17.7 for diagonal cases; P17.7 handles the pure cardinals.
           Max displacement: ±0.8px lateral + ±4% vertical scale. */
        .sankofa-bird-rig[data-gaze="upleft"]:not([data-battery-saver="true"]) .sankofa-bird-chest {
          transform: scaleY(1.04) translateX(-0.8px) translateY(-0.7px);
          transform-box: view-box;
          transition: transform 0.30s ease-out;
        }
        .sankofa-bird-rig[data-gaze="upright"]:not([data-battery-saver="true"]) .sankofa-bird-chest {
          transform: scaleY(1.04) translateX(0.8px) translateY(-0.7px);
          transform-box: view-box;
          transition: transform 0.30s ease-out;
        }
        .sankofa-bird-rig[data-gaze="downleft"]:not([data-battery-saver="true"]) .sankofa-bird-chest {
          transform: scaleY(0.97) translateX(-0.7px) translateY(0.7px);
          transform-box: view-box;
          transition: transform 0.30s ease-out;
        }
        .sankofa-bird-rig[data-gaze="downright"]:not([data-battery-saver="true"]) .sankofa-bird-chest {
          transform: scaleY(0.97) translateX(0.7px) translateY(0.7px);
          transform-box: view-box;
          transition: transform 0.30s ease-out;
        }
        /* Diagonal gaze also nudges the neck in both axes — strengthens the chain */
        .sankofa-bird-rig[data-gaze="upleft"] .sankofa-bird-neck,
        .sankofa-bird-rig[data-gaze="downleft"] .sankofa-bird-neck {
          /* Additive curve toward look direction — neck-seg-2 lights up */
          opacity: 0.88;
          transition: opacity 0.25s ease-out;
        }
        .sankofa-bird-rig[data-gaze="upright"] .sankofa-bird-neck,
        .sankofa-bird-rig[data-gaze="downright"] .sankofa-bird-neck {
          opacity: 0.88;
          transition: opacity 0.25s ease-out;
        }

        /* -- P18.6 Scapular feather deploy on hard banks (>20°) -----------------
           When the bird commits to a tight banked turn, the scapular shoulder
           feathers (wing-root junction) puff outward — the bird "raises its
           shoulders" into the aerodynamic load, like a raptor in a steep bank.
           Visible at mid+ zoom. Fires once per bank event (1 iteration). */
        @keyframes sankofa-scap-hard-deploy {
          0%,100% { opacity: 0.52; transform: scale(1.00) translateX(0px); }
          30%     { opacity: 0.88; transform: scale(1.14) translateX(0.5px); }
          65%     { opacity: 0.72; transform: scale(1.07) translateX(0.2px); }
        }
        @keyframes sankofa-scap-hard-deploy-l {
          0%,100% { opacity: 0.52; transform: scale(1.00) translateX(0px); }
          30%     { opacity: 0.88; transform: scale(1.14) translateX(-0.5px); }
          65%     { opacity: 0.72; transform: scale(1.07) translateX(-0.2px); }
        }
        .sankofa-bird-rig[data-hard-bank="true"]:not([data-battery-saver="true"])[data-zoom="mid"] .sankofa-wing-scap-r1,
        .sankofa-bird-rig[data-hard-bank="true"]:not([data-battery-saver="true"])[data-zoom="mid"] .sankofa-wing-scap-r2,
        .sankofa-bird-rig[data-hard-bank="true"]:not([data-battery-saver="true"])[data-zoom="high"] .sankofa-wing-scap-r1,
        .sankofa-bird-rig[data-hard-bank="true"]:not([data-battery-saver="true"])[data-zoom="high"] .sankofa-wing-scap-r2,
        .sankofa-bird-rig[data-hard-bank="true"]:not([data-battery-saver="true"])[data-zoom="street"] .sankofa-wing-scap-r1,
        .sankofa-bird-rig[data-hard-bank="true"]:not([data-battery-saver="true"])[data-zoom="street"] .sankofa-wing-scap-r2 {
          animation: sankofa-scap-hard-deploy 0.70s ease-in-out 1;
          transform-box: view-box;
        }
        .sankofa-bird-rig[data-hard-bank="true"]:not([data-battery-saver="true"])[data-zoom="mid"] .sankofa-wing-scap-l1,
        .sankofa-bird-rig[data-hard-bank="true"]:not([data-battery-saver="true"])[data-zoom="mid"] .sankofa-wing-scap-l2,
        .sankofa-bird-rig[data-hard-bank="true"]:not([data-battery-saver="true"])[data-zoom="high"] .sankofa-wing-scap-l1,
        .sankofa-bird-rig[data-hard-bank="true"]:not([data-battery-saver="true"])[data-zoom="high"] .sankofa-wing-scap-l2,
        .sankofa-bird-rig[data-hard-bank="true"]:not([data-battery-saver="true"])[data-zoom="street"] .sankofa-wing-scap-l1,
        .sankofa-bird-rig[data-hard-bank="true"]:not([data-battery-saver="true"])[data-zoom="street"] .sankofa-wing-scap-l2 {
          animation: sankofa-scap-hard-deploy-l 0.70s ease-in-out 1;
          transform-box: view-box;
        }
        /* Scapular base-state: ensure they're visible at mid+ zoom before the
           deploy animation fires (they start at opacity:0 on the SVG element). */
        .sankofa-bird-rig[data-zoom="mid"] .sankofa-wing-scap,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-wing-scap,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-wing-scap {
          opacity: 0.38;
          transition: opacity 0.6s ease;
        }

        /* -- P18.7 Leg asymmetry: inside-turn leg tucks on hard banks -----------
           During a hard banked turn (>20°) the inside-turn leg tucks slightly
           higher — reducing drag on the compressed body side. Combined with the
           existing P8 step-left/step-right animations, this plays as an additive
           transform via the individual rotate/translate on the leg wrappers.
           transformBox and transformOrigin are set inline on the SVG wrappers
           (18.5px 29.5px for left, 21.5px 29.5px for right). */
        .sankofa-bird-rig[data-turn-dir="right"][data-hard-bank="true"][data-flying="true"] .sankofa-leg-right {
          transform: translateY(-2.8px) scaleY(0.80) !important;
          opacity: 0.50;
          transition: transform 0.40s cubic-bezier(0.34, 1.56, 0.64, 1),
                      opacity 0.40s ease-out;
        }
        .sankofa-bird-rig[data-turn-dir="left"][data-hard-bank="true"][data-flying="true"] .sankofa-leg-left {
          transform: translateY(-2.8px) scaleY(0.80) !important;
          opacity: 0.50;
          transition: transform 0.40s cubic-bezier(0.34, 1.56, 0.64, 1),
                      opacity 0.40s ease-out;
        }

        /* -- P18.8 Tail heading-hold counter-rotation during lateral gaze ------
           When the bird scans left or right WITHOUT banking (saccade, notification),
           the tail deflects slightly OPPOSITE to stabilise heading — the counter-
           rotation torque that real birds apply to hold their course while scanning.
           This is distinct from P17.6 (tail RUDDER during a banked turn, which goes
           the SAME direction as the turn). Pure gaze → opposite deflection.
           Maximum: 1.8px lateral shift + 1.4° rotate at zoom ≥ mid.
           NOT active during turns (data-turn-dir="none" guard). */
        .sankofa-bird-rig[data-gaze="left"][data-turn-dir="none"] .sankofa-bird-tail {
          transform: translateX(1.8px) rotate(1.4deg);
          transform-box: view-box;
          transform-origin: 20px 34px;
          transition: transform 0.38s ease-out;
        }
        .sankofa-bird-rig[data-gaze="right"][data-turn-dir="none"] .sankofa-bird-tail {
          transform: translateX(-1.8px) rotate(-1.4deg);
          transform-box: view-box;
          transform-origin: 20px 34px;
          transition: transform 0.38s ease-out;
        }
        .sankofa-bird-rig[data-gaze="upleft"][data-turn-dir="none"] .sankofa-bird-tail {
          transform: translateX(1.2px) rotate(0.8deg);
          transform-box: view-box;
          transform-origin: 20px 34px;
          transition: transform 0.38s ease-out;
        }
        .sankofa-bird-rig[data-gaze="downleft"][data-turn-dir="none"] .sankofa-bird-tail {
          transform: translateX(1.2px) rotate(0.8deg);
          transform-box: view-box;
          transform-origin: 20px 34px;
          transition: transform 0.38s ease-out;
        }
        .sankofa-bird-rig[data-gaze="upright"][data-turn-dir="none"] .sankofa-bird-tail {
          transform: translateX(-1.2px) rotate(-0.8deg);
          transform-box: view-box;
          transform-origin: 20px 34px;
          transition: transform 0.38s ease-out;
        }
        .sankofa-bird-rig[data-gaze="downright"][data-turn-dir="none"] .sankofa-bird-tail {
          transform: translateX(-1.2px) rotate(-0.8deg);
          transform-box: view-box;
          transform-origin: 20px 34px;
          transition: transform 0.38s ease-out;
        }

        /* -- P18.9 Speed-driven head crane into streamlined posture -------------
           At driving/airplane speed the head naturally tips forward into the
           aerodynamic slipstream — a streamlining posture observed in swifts,
           falcons, and geese at speed. Adds 3deg to the existing gaze-rotate angle
           via the CSS rotate calc() already applied by P17.2.
           At airplane speed (50+ m/s): 5° crane for maximum aerodynamic tuck.
           Only active when flying; no effect at idle/perch.
           BUG FIX: was calc(--head-lead-deg + --vertical-gaze-deg + N) which
           double-counted the gaze; P17.2 already uses --gaze-rotate-deg which
           combines both. Using --gaze-rotate-deg here avoids the double-rotation. */
        .sankofa-bird-rig[data-flying="true"][data-speed="driving"] .sankofa-bird-head {
          rotate: calc(var(--gaze-rotate-deg, 0deg) + 3deg) !important;
        }
        .sankofa-bird-rig[data-flying="true"][data-speed="airplane"] .sankofa-bird-head {
          rotate: calc(var(--gaze-rotate-deg, 0deg) + 5deg) !important;
        }
        /* iOS Safari fallback for speed-driven crane (@supports overrides above) */
        @supports not (rotate: 1deg) {
          .sankofa-bird-rig[data-flying="true"][data-speed="driving"] .sankofa-bird-head {
            transform: rotate(calc(var(--gaze-rotate-deg, 0deg) + 3deg)) !important;
            rotate: unset !important;
          }
          .sankofa-bird-rig[data-flying="true"][data-speed="airplane"] .sankofa-bird-head {
            transform: rotate(calc(var(--gaze-rotate-deg, 0deg) + 5deg)) !important;
            rotate: unset !important;
          }
        }

        /* -- P18.10 Aerodynamic body lean forward on banked turns ---------------
           During a banked turn the body's nose-down attitude amplifies the
           lateral twist from P17.3. The chest shifts forward (−Y in SVG) by
           up to 1.2px at max bank — the forward-lean into a turn that distinguishes
           real banked flight from a simple heading rotation.
           Only active during active flight (data-flying="true"). */
        .sankofa-bird-rig[data-turn-dir="right"][data-flying="true"]:not([data-battery-saver="true"]) .sankofa-bird-back,
        .sankofa-bird-rig[data-turn-dir="left"][data-flying="true"]:not([data-battery-saver="true"]) .sankofa-bird-back {
          transform: translateY(calc(var(--turn-intensity, 0) * -1.2px));
          transform-box: view-box;
          transition: transform 0.35s ease-out;
        }
        /* The belly compresses forward (opposite to back) — illusion of body pitch */
        .sankofa-bird-rig[data-turn-dir="right"][data-flying="true"]:not([data-battery-saver="true"]) .sankofa-bird-belly,
        .sankofa-bird-rig[data-turn-dir="left"][data-flying="true"]:not([data-battery-saver="true"]) .sankofa-bird-belly {
          transform: scaleY(calc(1 - var(--turn-intensity, 0) * 0.04))
                     translateY(calc(var(--turn-intensity, 0) * 0.6px));
          transform-box: view-box;
          transition: transform 0.35s ease-out;
        }

        /* -- P18.11 Covert band iridescence during turns (aerodynamic pressure) --
           The covert iridescent band on the OUTSIDE wing catches extra light
           during a banked turn as the wing presents at a steeper angle to the
           viewer. Fires at mid+ zoom only (band is too small to read at low zoom). */
        .sankofa-bird-rig[data-turn-dir="right"][data-flying="true"]:not([data-battery-saver="true"])[data-zoom="mid"] .sankofa-wing-covert-band-l,
        .sankofa-bird-rig[data-turn-dir="right"][data-flying="true"]:not([data-battery-saver="true"])[data-zoom="high"] .sankofa-wing-covert-band-l,
        .sankofa-bird-rig[data-turn-dir="right"][data-flying="true"]:not([data-battery-saver="true"])[data-zoom="street"] .sankofa-wing-covert-band-l {
          opacity: calc(0.48 + var(--turn-intensity, 0) * 0.42);
          filter: brightness(calc(1.2 + var(--turn-intensity, 0) * 0.5)) saturate(1.3);
          transition: opacity 0.30s ease-out, filter 0.30s ease-out;
        }
        .sankofa-bird-rig[data-turn-dir="left"][data-flying="true"]:not([data-battery-saver="true"])[data-zoom="mid"] .sankofa-wing-covert-band-r,
        .sankofa-bird-rig[data-turn-dir="left"][data-flying="true"]:not([data-battery-saver="true"])[data-zoom="high"] .sankofa-wing-covert-band-r,
        .sankofa-bird-rig[data-turn-dir="left"][data-flying="true"]:not([data-battery-saver="true"])[data-zoom="street"] .sankofa-wing-covert-band-r {
          opacity: calc(0.48 + var(--turn-intensity, 0) * 0.42);
          filter: brightness(calc(1.2 + var(--turn-intensity, 0) * 0.5)) saturate(1.3);
          transition: opacity 0.30s ease-out, filter 0.30s ease-out;
        }

        /* -- P18.12 Neck chain wave during banked turns -------------------------
           The neck S-wave (neck-seg-1 / neck-seg-2 alternating sheen) becomes
           more pronounced during turns — the neck is under greater strain and the
           feathers ripple more intensely. Opacity amplitude doubles during turns. */
        .sankofa-bird-rig[data-turn-dir="right"] .sankofa-neck-seg-2,
        .sankofa-bird-rig[data-turn-dir="left"] .sankofa-neck-seg-1 {
          opacity: calc(0 + var(--turn-intensity, 0) * 0.72);
          transition: opacity 0.25s ease-out;
        }

        /* -- P18 Battery-saver: suppress all Phase 18 kinematic effects --------
           Belt-and-suspenders guard alongside the p17Active gate in JS.
           Resets transforms and filters for all new P18 elements. */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-right,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-left {
          filter: none !important;
        }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-r5,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-r0,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-r4,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-l5,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-l0,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-l4 {
          transform: none !important;
          filter: none !important;
        }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-wing-scap {
          animation: none !important;
        }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-leg-right,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-leg-left {
          transform: none !important;
          opacity: inherit !important;
          transition: none !important;
        }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-back,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-belly,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-wing-covert-band-l,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-wing-covert-band-r {
          transform: none !important;
          filter: none !important;
          transition: none !important;
        }

        /* -- P18 Reduced-motion guard for all Phase 18 directionality -----------
           Suppress all new Phase 18 transforms/transitions for users with
           prefers-reduced-motion: reduce (unless bird-anim override is set). */
        @media (prefers-reduced-motion: reduce) {
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-wing-right,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-wing-left {
            transform: none !important;
            filter: none !important;
            transition: none !important;
          }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-feather-r5,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-feather-r0,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-feather-r4,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-feather-l5,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-feather-l0,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-feather-l4 {
            transform: none !important;
            filter: none !important;
          }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-wing-scap {
            animation: none !important;
          }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-leg-right,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-leg-left {
            transform: none !important;
            transition: none !important;
          }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-tail {
            transform: none !important;
            transition: none !important;
          }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-head {
            rotate: unset !important;
            transition: none !important;
          }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-chest {
            transform: none !important;
            transition: none !important;
          }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-back,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-belly {
            transform: none !important;
            transition: none !important;
          }
        }


        /* ═══════════════════════════════════════════════════════════════════
           PHASE 19 — Upright-body heading (compass-quadrant posture cues)

           The bird SVG is a side-profile flying bird drawn with the head on
           the LEFT side in SVG coords. Full-body rotate() causes the bird to
           appear upside-down at east headings (belly faces up after 180 deg of
           rotation) and fully inverted at south headings - visually broken for
           a side-profile bird.

           The correct design keeps the body ALWAYS upright. Direction of
           travel is communicated by:
             1. scaleX flip on .sankofa-bird-heading-wrapper (<g>)
                east-half (NE/E/SE): scaleX(-1) -> bird faces right
                west-half (NW/W/SW/N/S): scaleX(+1) -> bird faces left (native SVG)
             2. head/neck gaze system (--gaze-rotate-deg) - head turns toward heading
             3. body banking (effectiveBankDeg ±25 deg) on the rig div
             4. data-heading-quadrant: 8 subtle posture cues below (local space)

           Posture cues operate in bird LOCAL coordinate space (inside the
           scaleX-flipped <g>) so "neck cranes forward" always means toward
           direction of travel. Cues are gentle - max 1.5 px / 2 deg - and
           suppressed in battery-saver mode.
           ═══════════════════════════════════════════════════════════════════ */

        /* -- P19.1 Northward heading (N / NW / NE): forward-crane + crown lift ---
           When flying directly toward the viewer (north on screen = into the map),
           the bird cranes its neck forward (into the approaching slipstream) and
           the crown feathers lift slightly — the "attention-ahead" posture.
           NE/NW are softer variants (heading has a lateral component). */
        .sankofa-bird-rig[data-heading-quadrant="N"]:not([data-battery-saver="true"])[data-flying="true"] .sankofa-bird-neck {
          rotate: calc(var(--neck-curve-deg, 0deg) - 1.5deg);
          transition: rotate 0.55s ease-out;
        }
        .sankofa-bird-rig[data-heading-quadrant="NE"]:not([data-battery-saver="true"])[data-flying="true"] .sankofa-bird-neck,
        .sankofa-bird-rig[data-heading-quadrant="NW"]:not([data-battery-saver="true"])[data-flying="true"] .sankofa-bird-neck {
          rotate: calc(var(--neck-curve-deg, 0deg) - 0.8deg);
          transition: rotate 0.55s ease-out;
        }

        /* -- P19.2 Southward heading (S / SW / SE): retreating silhouette --------
           When flying away from the viewer (south on screen), the head naturally
           dips slightly and the tail fans to maintain stability — the retreating
           silhouette observed in corvids and hawks as they fly from the observer.
           The tail fan (1.5°) combined with P18.8 heading-hold gives the most
           complete avian-accuracy for departing flight. */
        .sankofa-bird-rig[data-heading-quadrant="S"]:not([data-battery-saver="true"])[data-flying="true"] .sankofa-bird-head {
          rotate: calc(var(--gaze-rotate-deg, 0deg) + 1.2deg);
          transition: rotate 0.45s ease-out;
        }
        .sankofa-bird-rig[data-heading-quadrant="S"]:not([data-battery-saver="true"])[data-flying="true"] .sankofa-bird-tail {
          transform: scaleX(1.06);
          transform-box: view-box;
          transition: transform 0.40s ease-out;
        }
        .sankofa-bird-rig[data-heading-quadrant="SE"]:not([data-battery-saver="true"])[data-flying="true"] .sankofa-bird-tail,
        .sankofa-bird-rig[data-heading-quadrant="SW"]:not([data-battery-saver="true"])[data-flying="true"] .sankofa-bird-tail {
          transform: scaleX(1.03);
          transform-box: view-box;
          transition: transform 0.40s ease-out;
        }

        /* -- P19.3 East/West heading: scaleX flip is the primary cue ──────────
           For E/W headings .sankofa-bird-heading-wrapper scaleX(-1/+1)
           puts the head pointing right or left with the body staying upright
           (belly always down). Head-lead angle + P17 kinematic chain fully
           describe lateral banked flight. No additional body cues needed. */
        /* (no additional rules needed — scaleX flip handles E/W direction) */

        /* -- P19.4 Battery-saver: suppress P19 cues -------------------------------- */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-neck,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-head {
          /* already reset by P17.13 — guard here for specificity */
        }

        /* -- P19.5 Reduced-motion guard for P19 ----------------------------------- */
        @media (prefers-reduced-motion: reduce) {
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-heading-quadrant] .sankofa-bird-neck,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-heading-quadrant] .sankofa-bird-head,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig[data-heading-quadrant] .sankofa-bird-tail {
            rotate: unset !important;
            transform: none !important;
            transition: none !important;
          }
        }

        /* ══════════════════════════════════════════════════════════════════════════
           PHASE 20B — Wing & Tail Deformation States
           From official Sankofa Bird SVG Asset Pipeline spec (Jul 2026).

           data-wing-pose: "up" | "mid" | "down" | "forward" | "back"
             up      — high stretch / hover (slow hover, altitude gain)
             mid     — relaxed cruise (default)
             down    — power stroke (fast flap, diving)
             forward — braking (landing slow-flap, stall)
             back    — glide (wings swept back, soaring)

           data-tail-pose: "flare" | "narrow" | "folded" | "stream"
             flare   — wide steering (banking turns)
             narrow  — speed (high-speed cruise)
             folded  — braking (landing stall / slow-flap)
             stream  — glide (default streamlined)

           Implementation note: these augment (not replace) the existing
           flap / keyframe animations. The CSS vars / transforms layer UNDER
           the keyframe-driven wing flap so both cooperate correctly.
           Battery-saver and reduced-motion guards suppress the shape shifts.
        ══════════════════════════════════════════════════════════════════════════ */

        /* ── Wing Deformation Keyframes ──────────────────────────────────────── */

        /* up — high-stretch hover: wings rise overhead, tips spread wide */
        @keyframes sankofa-wing-pose-up {
          0%, 100% { transform: scaleX(1.18) scaleY(0.78) translateY(-6%); }
          50%       { transform: scaleX(1.22) scaleY(0.72) translateY(-9%); }
        }
        /* down — power stroke: wings compress down, chord narrows */
        @keyframes sankofa-wing-pose-down {
          0%, 100% { transform: scaleX(0.92) scaleY(1.15) translateY(7%); }
          50%       { transform: scaleX(0.88) scaleY(1.22) translateY(10%); }
        }
        /* forward — braking: wings pitched forward, drag surface maximised */
        @keyframes sankofa-wing-pose-forward {
          0%, 100% { transform: scaleX(1.04) skewY(-8deg) translateX(-5%); }
          50%       { transform: scaleX(1.06) skewY(-11deg) translateX(-7%); }
        }
        /* back — glide: wings swept rearward, streamlined */
        @keyframes sankofa-wing-pose-back {
          0%, 100% { transform: scaleX(0.82) skewY(4deg) translateX(6%); }
          50%       { transform: scaleX(0.80) skewY(5deg) translateX(7%); }
        }

        /* ── Wing Pose CSS rules ─────────────────────────────────────────────── */

        /* mid (relaxed cruise) — no extra transform; base flap handles it */
        .sankofa-bird-rig[data-wing-pose="mid"]:not([data-battery-saver="true"]) .sankofa-bird-wing {
          /* intentionally empty — baseline state */
        }

        /* up: hover / slow climb */
        .sankofa-bird-rig[data-wing-pose="up"]:not([data-battery-saver="true"]) .sankofa-bird-wing {
          animation: sankofa-wing-pose-up 1.6s ease-in-out infinite;
          transform-box: view-box;
          transform-origin: center center;
        }

        /* down: power stroke / dive */
        .sankofa-bird-rig[data-wing-pose="down"]:not([data-battery-saver="true"]) .sankofa-bird-wing {
          animation: sankofa-wing-pose-down 0.55s ease-in-out infinite;
          transform-box: view-box;
          transform-origin: center center;
        }

        /* forward: braking */
        .sankofa-bird-rig[data-wing-pose="forward"]:not([data-battery-saver="true"]) .sankofa-bird-wing {
          animation: sankofa-wing-pose-forward 1.1s ease-in-out infinite;
          transform-box: view-box;
          transform-origin: center center;
        }

        /* back: glide */
        .sankofa-bird-rig[data-wing-pose="back"]:not([data-battery-saver="true"]) .sankofa-bird-wing {
          animation: sankofa-wing-pose-back 2.4s ease-in-out infinite;
          transform-box: view-box;
          transform-origin: center center;
        }

        /* ── Tail Deformation Keyframes ──────────────────────────────────────── */

        /* flare — wide fan (steering turn) */
        @keyframes sankofa-tail-flare {
          0%, 100% { transform: scaleX(1.55) scaleY(0.88); }
          50%       { transform: scaleX(1.68) scaleY(0.84); }
        }
        /* narrow — speed tuck */
        @keyframes sankofa-tail-narrow {
          0%, 100% { transform: scaleX(0.72) scaleY(1.12); }
          50%       { transform: scaleX(0.68) scaleY(1.16); }
        }
        /* folded — braking spread (outer feathers drop) */
        @keyframes sankofa-tail-folded {
          0%, 100% { transform: scaleX(1.35) scaleY(0.78) translateY(8%); }
          50%       { transform: scaleX(1.42) scaleY(0.72) translateY(11%); }
        }
        /* stream — glide (default streamlined trailing) */
        @keyframes sankofa-tail-stream {
          0%, 100% { transform: scaleX(0.88) scaleY(1.06); }
          50%       { transform: scaleX(0.86) scaleY(1.09); }
        }

        /* ── Tail Pose CSS rules ─────────────────────────────────────────────── */

        /* stream (default/glide) */
        .sankofa-bird-rig[data-tail-pose="stream"]:not([data-battery-saver="true"]) .sankofa-bird-tail {
          animation: sankofa-tail-stream 2.8s ease-in-out infinite;
          transform-box: view-box;
          transform-origin: 20px 26px;
        }

        /* flare: banking turn */
        .sankofa-bird-rig[data-tail-pose="flare"]:not([data-battery-saver="true"]) .sankofa-bird-tail {
          animation: sankofa-tail-flare 0.9s ease-in-out infinite !important;
          transform-box: view-box;
          transform-origin: 20px 26px;
        }

        /* narrow: high-speed */
        .sankofa-bird-rig[data-tail-pose="narrow"]:not([data-battery-saver="true"]) .sankofa-bird-tail {
          animation: sankofa-tail-narrow 1.8s ease-in-out infinite;
          transform-box: view-box;
          transform-origin: 20px 26px;
        }

        /* folded: braking / stall */
        .sankofa-bird-rig[data-tail-pose="folded"]:not([data-battery-saver="true"]) .sankofa-bird-tail {
          animation: sankofa-tail-folded 1.1s ease-in-out infinite !important;
          transform-box: view-box;
          transform-origin: 20px 26px;
        }

        /* ── Battery-saver: suppress wing/tail deformation entirely ────────── */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-tail {
          animation: none !important;
          transform: none !important;
        }

        /* ── Reduced-motion guard ────────────────────────────────────────────── */
        @media (prefers-reduced-motion: reduce) {
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-wing {
            animation: none !important;
            transform: none !important;
          }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-tail {
            animation: none !important;
            transform: none !important;
          }
        }
`;
