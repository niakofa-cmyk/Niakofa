// Sankofa Bird CSS — Phase 1–2 | @property, keyframes, base animations, PHASE-2 final
// Auto-split from SankofaBirdSvg.tsx — edit here, not in the monolith

// prettier-ignore
export const sankofaCssBase = `
        /* ══ @property declarations ═══════════════════════════════════════════
           Registering these CSS custom properties tells the browser their type
           so it can interpolate them correctly inside @keyframes.
           Without this, Safari < 15.4 cannot animate calc(var(--angle-var))
           and older Chrome/Firefox may produce wrong interpolation.
           Safari 15.4+ supports @property fully; older Safari falls back to
           the initial-value (0deg / 1400ms / 0) so animations still run —
           just without the lean/bank offset. The bird stays visible on all
           iOS versions. */
        @property --lean-deg {
          syntax: '<angle>';
          inherits: true;
          initial-value: 0deg;
        }
        @property --tail-bend {
          syntax: '<angle>';
          inherits: true;
          initial-value: 0deg;
        }
        @property --left-wing-extra {
          syntax: '<angle>';
          inherits: true;
          initial-value: 0deg;
        }
        @property --right-wing-extra {
          syntax: '<angle>';
          inherits: true;
          initial-value: 0deg;
        }
        @property --head-lead-deg {
          syntax: '<angle>';
          inherits: true;
          initial-value: 0deg;
        }
        @property --heading-deg {
          syntax: '<angle>';
          inherits: true;
          initial-value: 0deg;
        }
        @property --flap-period {
          syntax: '<time>';
          inherits: true;
          initial-value: 1400ms;
        }
        @property --speed-factor {
          syntax: '<number>';
          inherits: true;
          initial-value: 0;
        }
        /* --deg is used in sankofa-burst and sankofa-golden-burst keyframes.
           Without @property the browser cannot interpolate it inside @keyframes
           on Safari < 15.4 — the particles all fire from the center instead
           of their pre-rotated positions. Registering it as an angle fixes the
           Safari regression and costs nothing on modern browsers. */
        @property --deg {
          syntax: '<angle>';
          inherits: false;
          initial-value: 0deg;
        }
        /* --bank-deg: the current banking angle used in approach-descent keyframe.
           Registering it ensures browsers can interpolate it in @keyframes.
           Value is always 0 during approach (bird is slowing to land), so the
           initial-value effectively IS the runtime value — but it must be declared
           so Safari 15.4 doesn't silently discard the var() inside keyframes. */
        @property --bank-deg {
          syntax: '<angle>';
          inherits: true;
          initial-value: 0deg;
        }
        /* --approach-sway: tiny lateral sway amplitude during deceleration. */
        @property --approach-sway {
          syntax: '<length>';
          inherits: true;
          initial-value: 0px;
        }
        /* --lighting-factor: directional lighting driven by heading.
           Range [0.18, 0.82]; initial-value 0.5 → opacity 0.22 on older browsers
           (identical to the old static breast-sheen value — safe fallback). */
        @property --lighting-factor {
          syntax: '<number>';
          inherits: true;
          initial-value: 0.5;
        }
        /* --angle-var: generic angle variable used in calc() expressions inside
           @keyframes. Without this @property declaration Safari 15.4 falls back
           to discrete animation (no interpolation) for any keyframe that calls
           calc(var(--angle-var, 0deg)). Declaring it as <angle> with inherits:true
           makes it available to child elements (e.g. egg counter-rotation) without
           re-declaring on each descendant. */
        @property --angle-var {
          syntax: '<angle>';
          inherits: true;
          initial-value: 0deg;
        }
        /* --blink-period: the eye blink + iris cycle duration, driven by community
           activity level. Registered so Safari 15.4 can interpolate it if ever
           used inside a @keyframes calc(). Inherits true so child elements (eyelid,
           iris ring, catchlight) all pick up the same period without extra JS.
           Default 7000ms matches the original hardcoded eye-blink cycle. */
        @property --blink-period {
          syntax: '<time>';
          inherits: true;
          initial-value: 7000ms;
        }

        /* ── Base rig ─────────────────────────────────────────────────────── */
        .sankofa-bird-rig {
          position: relative;
          overflow: visible;
          transform-origin: 50% 62%;
          /* Bidirectional night-mode filter transition — ensures day→night AND
             night→day both animate smoothly (1.8 s ease-in-out). Without this
             base declaration some browsers snap the filter instantly when leaving
             the night state because the transition was only defined on the night
             rule. prefers-reduced-motion override is below in its own block. */
          transition: filter 1.8s ease-in-out;
        }

        /* ── Outer tail rectrices — base transform context ─────────────────
           Ensures state-specific selectors (airplane/hover spread) never
           jump to a different origin. Base transition provides settle physics
           when leaving a spread state back to neutral. */
        .sankofa-tail-outer-left,
        .sankofa-tail-outer-right {
          transform-box: view-box;
          transition: transform 0.5s ease-out;
        }

        /* ── Breast sheen — heading-reactive directional lighting ────────── */
        /* Doc item 3: "As the bird rotates, the highlights rotate too."
           --lighting-factor [0.18→0.82] → opacity [0.10→0.30].
           CSS @property + calc() works in Safari 15.4+, Chrome 111+.
           Old browsers get initial-value 0.5 → opacity 0.22 (old static). */
        .sankofa-breast-sheen {
          opacity: calc(0.10 + var(--lighting-factor, 0.5) * 0.24);
          transition: opacity 0.6s ease-out;
        }

        /* ── Glow layer — ambient navigate / celebrate / donate ────────────
           Targets .sankofa-glow-layer (not .sankofa-bird-chest) to avoid
           conflicting with the chest's heading-reactive hue-rotate filter.
           The already-blurred ellipse only needs opacity animated. */
        .sankofa-bird-rig[data-flying="true"][data-celebrating="false"][data-donated="false"][data-zoom="mid"] .sankofa-glow-layer,
        .sankofa-bird-rig[data-flying="true"][data-celebrating="false"][data-donated="false"][data-zoom="high"] .sankofa-glow-layer,
        .sankofa-bird-rig[data-flying="true"][data-celebrating="false"][data-donated="false"][data-zoom="street"] .sankofa-glow-layer {
          animation: sankofa-helper-ambient 2.6s ease-in-out infinite;
        }
        @keyframes sankofa-helper-ambient {
          0%,100% { opacity: 0.06; }
          50%     { opacity: 0.18; }
        }
        /* Celebration: glow layer flares brighter teal */
        .sankofa-bird-rig[data-celebrating="true"] .sankofa-glow-layer {
          animation: sankofa-glow-flare 0.5s ease-in-out 4 !important;
        }
        @keyframes sankofa-glow-flare {
          0%,100% { opacity: 0.12; }
          50%     { opacity: 0.38; }
        }
        /* Donated: warm-gold glow layer */
        .sankofa-bird-rig[data-donated="true"] .sankofa-glow-layer {
          fill: hsl(45, 100%, 60%);
          animation: sankofa-glow-flare 0.7s ease-in-out 3 !important;
        }

        /* ── Body float / glide ────────────────────────────────────────────── */
        .sankofa-bird-rig .sankofa-bird-body {
          transform-origin: 50% 62%;
          animation: sankofa-float var(--flap-period, 1400ms) ease-in-out infinite;
        }
        .sankofa-bird-rig[data-flying="true"] .sankofa-bird-body {
          /* Static transform omitted — sankofa-glide keyframes already include
             rotate(--lean-deg) at 0%/100%, so the animation owns the value.
             A redundant transform property caused a single-frame flash on
             animation start in some browsers. */
          animation: sankofa-glide var(--flap-period, 300ms) ease-in-out infinite;
        }
        /* Landing phases */
        .sankofa-bird-rig[data-landing="slowflap"] .sankofa-bird-body {
          animation: sankofa-glide 1000ms ease-in-out infinite;
        }
        .sankofa-bird-rig[data-landing="hover"] .sankofa-bird-body {
          /* Dedicated hover-body animation: rapid small-amplitude oscillation
             mimics the fast wingbeat of a hovering bird (unlike the gentle idle
             float). Period is ~700ms — roughly 2× faster than idle — with a
             ±0.8px vertical range and subtle roll (±1.5°) for organic feel. */
          animation: sankofa-hover-body 680ms ease-in-out infinite;
        }
        @keyframes sankofa-hover-body {
          0%   { transform: translateY(0px)    rotate(0deg); }
          25%  { transform: translateY(-0.7px) rotate(-1.2deg); }
          50%  { transform: translateY(-0.9px) rotate(0deg); }
          75%  { transform: translateY(-0.5px) rotate(1.2deg); }
          100% { transform: translateY(0px)    rotate(0deg); }
        }
        .sankofa-bird-rig[data-landing="perch"] .sankofa-bird-body {
          animation: sankofa-perch 2s ease-out forwards;
        }

        /* ── Differential wings ─────────────────────────────────────────────── */
        /* Base flap — symmetric at rest */
        .sankofa-bird-wing-left {
          transform-origin: 20px 18px;
          transform-box: view-box; /* ensures px coords are in SVG viewBox space */
          animation: sankofa-flap var(--flap-period, 1400ms) ease-in-out infinite;
        }
        .sankofa-bird-wing-right {
          transform-origin: 20px 18px;
          transform-box: view-box;
          /* Doc: right wing lags left by ~18ms — "almost invisible, huge realism."
             Adding 18ms to the period creates a persistent natural beat between
             wings on every loop (a one-off delay only fires at the first start). */
          animation: sankofa-flap-right calc(var(--flap-period, 1400ms) + 18ms) ease-in-out infinite;
        }
        /* While flying with a bank: outside wing extends (higher amplitude),
           inside wing folds (lower amplitude). We shift the baseline rotation
           using the --*-wing-extra CSS vars computed from bankDeg. */
        .sankofa-bird-rig[data-flying="true"] .sankofa-bird-wing-left {
          animation: sankofa-flap-banked-left var(--flap-period, 300ms) ease-in-out infinite;
        }
        .sankofa-bird-rig[data-flying="true"] .sankofa-bird-wing-right {
          /* Keep the +18ms asymmetry even during banked flight */
          animation: sankofa-flap-banked-right calc(var(--flap-period, 300ms) + 18ms) ease-in-out infinite;
        }

        /* ── Tail ─────────────────────────────────────────────────────────── */
        .sankofa-bird-tail {
          transform-origin: 20px 24px;
          transform-box: view-box;
          animation: sankofa-tail-sway calc(var(--flap-period, 1400ms) * 2.4) ease-in-out infinite;
        }
        .sankofa-bird-rig[data-flying="true"] .sankofa-bird-tail {
          animation: sankofa-tail-bank var(--flap-period, 300ms) ease-in-out infinite;
        }

        /* ── Eye: blink + look-left + look-right cycle ───────────────────── */
        /* Full living-eye sequence. translateX is relative to fill-box center
           (set inline on the element) so the pupil moves in local SVG space.
           Period is var(--blink-period, 7000ms) — set inline on .sankofa-bird-rig
           from activityLevel: quiet=9s, normal=7s, busy=5s, peak=3.5s.
           The bird blinks more frequently when the community is busy — an alert
           sentinel scanning its territory. */
        .sankofa-bird-eye {
          animation: sankofa-eye-live var(--blink-period, 7000ms) ease-in-out infinite;
        }

        /* Eye catchlight: secondary specular tracks the pupil's look direction.
           Offset from the primary glint — as the eye moves, this secondary
           highlight lags slightly creating a "depth" parallax on the cornea.
           Same 7s period, same blink timing, slightly different translateX range. */
        .sankofa-bird-eye-catchlight {
          /* BUG FIX: was hardcoded 7s — now tracks --blink-period so catchlight
             stays in sync with the pupil and eyelid at every activity tier.
             quiet=9s, normal=7s, busy=5s, peak=3.5s. */
          animation: sankofa-eye-catchlight var(--blink-period, 7000ms) ease-in-out infinite;
        }
        @keyframes sankofa-eye-catchlight {
          0%,  35%  { transform: translateX(0.1px);   opacity: 0.7; }
          37%, 39%  { transform: translateX(0.1px);   opacity: 0; }   /* blink sync */
          41%        { transform: translateX(0.1px);   opacity: 0.7; }
          48%, 62%  { transform: translateX(-0.3px);  opacity: 0.7; } /* look left */
          66%        { transform: translateX(0.1px);   opacity: 0.7; }
          68%, 70%  { transform: translateX(0.1px);   opacity: 0; }   /* blink sync */
          72%        { transform: translateX(0.1px);   opacity: 0.7; }
          78%, 90%  { transform: translateX(0.5px);   opacity: 0.7; } /* look right */
          95%, 100% { transform: translateX(0.1px);   opacity: 0.7; }
        }

        /* Eyelid: thin crescent arc slides to opacity 1 during blink frames,
           creating a convincing eyelid-close effect. Timed to match the
           opacity:0 frames in sankofa-eye-live exactly. */
        .sankofa-bird-eyelid {
          /* BUG FIX: was hardcoded 7s — synced to --blink-period so the
             eyelid close/open cycle matches the pupil saccade at every tier. */
          animation: sankofa-eyelid var(--blink-period, 7000ms) ease-in-out infinite;
        }
        @keyframes sankofa-eyelid {
          0%,  34%  { opacity: 0; }
          36%, 40%  { opacity: 0.85; }  /* close during blink */
          42%        { opacity: 0; }
          67%, 71%  { opacity: 0.85; }  /* close during blink */
          73%        { opacity: 0; }
          100%       { opacity: 0; }
        }

        /* LOD: hide catchlight & eyelid at low zoom — too small to matter */
        .sankofa-bird-rig[data-zoom="low"] .sankofa-bird-eye-catchlight,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-bird-eyelid {
          display: none !important;
        }

        /* ── Neck flex — idle life breath ────────────────────────────────── */
        /* The neck path curves from body to head; a subtle opacity + slight
           scale pulse makes the bird look like it's breathing. */
        .sankofa-bird-neck {
          transform-origin: 13px 15px;
          transform-box: view-box;
          animation: sankofa-neck-flex calc(var(--flap-period, 1400ms) * 1.2) ease-in-out infinite;
        }

        /* ── Airplane gliding mode ───────────────────────────────────────── */
        /* When speed > 50 m/s (airplane), the bird soars with wings spread wide
           and barely oscillating — matching the doc's "Airplane: Gliding animation"
           tier. The body leans 12° and the wings hold a shallow spread angle. */
        .sankofa-bird-rig[data-gliding="true"] .sankofa-bird-wing-left {
          animation: sankofa-glide-wing-left 4s ease-in-out infinite !important;
        }
        .sankofa-bird-rig[data-gliding="true"] .sankofa-bird-wing-right {
          animation: sankofa-glide-wing-right 4s ease-in-out infinite !important;
        }
        .sankofa-bird-rig[data-gliding="true"] .sankofa-bird-wing-left-feathers,
        .sankofa-bird-rig[data-gliding="true"] .sankofa-bird-wing-right-feathers {
          animation: none !important;
          /* Feather tips spread wide and lock during glide */
          opacity: 0.85;
        }

        /* ── Wing primary feather lag ─────────────────────────────────────── */
        /* Secondary feather-tip paths animate with the same keyframes as the
           main wing but with a slight delay, creating the "upper feathers bend
           slightly, lower feathers lag behind" effect from the doc. */
        .sankofa-bird-wing-left-feathers {
          transform-origin: 20px 18px;
          transform-box: view-box;
          animation: sankofa-flap calc(var(--flap-period, 1400ms)) ease-in-out infinite;
          /* Base group delay removed — per-feather numbered classes own the delay */
        }
        .sankofa-bird-wing-right-feathers {
          transform-origin: 20px 18px;
          transform-box: view-box;
          animation: sankofa-flap-right calc(var(--flap-period, 1400ms)) ease-in-out infinite;
          /* Base group delay removed — per-feather numbered classes own the delay */
        }
        .sankofa-bird-rig[data-flying="true"] .sankofa-bird-wing-left-feathers {
          animation: sankofa-flap-banked-left var(--flap-period, 300ms) ease-in-out infinite;
        }
        .sankofa-bird-rig[data-flying="true"] .sankofa-bird-wing-right-feathers {
          animation: sankofa-flap-banked-right var(--flap-period, 300ms) ease-in-out infinite;
        }

        /* ── Per-feather cascade delays — realistic feather physics ──────────
           Doc: "Primary feathers move first → Secondary feathers lag slightly
           → Body catches up → Tail stabilises. That tiny delay is why real
           birds look alive."
           Layer 1 (primaries — l1/r1, l2/r2, l3/r3): lead the body.
           Layer 2 (secondaries — ls1/rs1, ls2/rs2): trail by ~35%.
           Layer 3 (coverts — lc1/rc1): trail most (~50%), closest to body.
           Each class overrides animation-delay so all three layers animate
           at different phases even though they share the same keyframes. */
        /* l5/r5 — the single outermost primary beyond l0/r0. Leads all others. */
        .sankofa-feather-l5, .sankofa-feather-r5 {
          animation-delay: calc(var(--flap-period, 1400ms) * -0.08) !important;
        }
        /* l0/r0 — extreme outer primary: moves FIRST (outermost, least structural
           mass). Negative delay so it leads l1 by ~4% of the flap period. */
        .sankofa-feather-l0, .sankofa-feather-r0 {
          animation-delay: calc(var(--flap-period, 1400ms) * -0.04) !important;
        }
        .sankofa-feather-l1, .sankofa-feather-r1 {
          animation-delay: calc(var(--flap-period, 1400ms) * 0.06) !important;
        }
        .sankofa-feather-l2, .sankofa-feather-r2 {
          animation-delay: calc(var(--flap-period, 1400ms) * 0.14) !important;
        }
        .sankofa-feather-l3, .sankofa-feather-r3 {
          animation-delay: calc(var(--flap-period, 1400ms) * 0.24) !important;
        }
        /* l4/r4 — inner primary bridging to secondaries: lags just behind l3/r3.
           Duration stretched to 1.04× to soften flutter at higher speeds. */
        .sankofa-feather-l4, .sankofa-feather-r4 {
          animation-delay: calc(var(--flap-period, 1400ms) * 0.30) !important;
          animation-duration: calc(var(--flap-period, 1400ms) * 1.04) !important;
        }
        /* Secondary feather rows — lag behind primaries */
        .sankofa-feather-ls1, .sankofa-feather-rs1 {
          animation-delay: calc(var(--flap-period, 1400ms) * 0.35) !important;
          animation-duration: calc(var(--flap-period, 1400ms) * 1.08) !important;
        }
        .sankofa-feather-ls2, .sankofa-feather-rs2 {
          animation-delay: calc(var(--flap-period, 1400ms) * 0.42) !important;
          animation-duration: calc(var(--flap-period, 1400ms) * 1.12) !important;
        }
        /* ls3/rs3 — 3rd secondary: slower than ls2/rs2, faster than coverts */
        .sankofa-feather-ls3, .sankofa-feather-rs3 {
          animation-delay: calc(var(--flap-period, 1400ms) * 0.47) !important;
          animation-duration: calc(var(--flap-period, 1400ms) * 1.16) !important;
        }
        /* Covert feathers — slowest, most body-coupled */
        .sankofa-feather-lc1, .sankofa-feather-rc1 {
          animation-delay: calc(var(--flap-period, 1400ms) * 0.52) !important;
          animation-duration: calc(var(--flap-period, 1400ms) * 1.18) !important;
        }

        /* ══ Wing bottom surfaces (design doc: LEFT/RIGHT WING BOTTOM layers) ═══════════
           Underside of each wing. Visible when flying at mid+ zoom; more visible
           during hover. Hidden at low zoom and battery-saver mode. */
        .sankofa-bird-wing-left-btm,
        .sankofa-bird-wing-right-btm {
          opacity: 0;
          transition: opacity 0.4s ease;
        }
        .sankofa-bird-rig[data-flying="true"][data-zoom="mid"] .sankofa-bird-wing-left-btm,
        .sankofa-bird-rig[data-flying="true"][data-zoom="mid"] .sankofa-bird-wing-right-btm {
          opacity: 0.22;
        }
        .sankofa-bird-rig[data-flying="true"][data-zoom="high"] .sankofa-bird-wing-left-btm,
        .sankofa-bird-rig[data-flying="true"][data-zoom="high"] .sankofa-bird-wing-right-btm {
          opacity: 0.35;
        }
        .sankofa-bird-rig[data-landing="hover"] .sankofa-bird-wing-left-btm,
        .sankofa-bird-rig[data-landing="hover"] .sankofa-bird-wing-right-btm {
          opacity: 0.42;
        }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-left-btm,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-right-btm { opacity: 0 !important; pointer-events: none !important; transition: opacity 0.45s ease-out !important; }
        .sankofa-bird-rig[data-zoom="low"] .sankofa-bird-wing-left-btm,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-bird-wing-right-btm { display: none; }

        /* ══ Scapular shoulder feathers (design doc: Wing→Shoulder sublayer) ════════════
           Wing-root shoulder puff. Mid+ zoom only. Gentle breathing animation at high zoom. */
        .sankofa-wing-scap { opacity: 0; transition: opacity 0.3s ease; }
        .sankofa-bird-rig[data-zoom="mid"] .sankofa-wing-scap { opacity: 0.32; }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-wing-scap ,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-wing-scap {
          opacity: 0.58;
          animation: sankofa-breathe 2.6s ease-in-out infinite;
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-wing-scap-l2,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-wing-scap-l2,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-wing-scap-r2 ,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-wing-scap-r2 { animation-delay: 0.3s; }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-wing-scap,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-wing-scap { opacity: 0 !important; pointer-events: none !important; transition: opacity 0.45s ease-out !important; }

        /* ══ Tail far-outer feather tips ════════════════════════════════════════════════
           Extreme outer tail tips animate with the main tail sway.
           Hidden at low zoom; suppressed in battery-saver mode. */
        .sankofa-tail-far-left, .sankofa-tail-far-right {
          animation: sankofa-tail-sway 3.4s ease-in-out infinite;
          animation-delay: 0.15s; /* slight lag vs centre feathers */
        }
        .sankofa-bird-rig[data-flying="true"] .sankofa-tail-far-left,
        .sankofa-bird-rig[data-flying="true"] .sankofa-tail-far-right {
          animation: sankofa-tail-bank calc(var(--flap-period, 1400ms) * 0.9) ease-in-out infinite;
        }
        .sankofa-bird-rig[data-zoom="low"] .sankofa-tail-far-left,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-tail-far-right { opacity: 0.28; }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-tail-far-left,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-tail-far-right { opacity: 0 !important; pointer-events: none !important; transition: opacity 0.45s ease-out !important; }

                /* ── Iridescent wing highlight shimmer ───────────────────────────── */
        /* The highlight overlay paths animate through a full spectral cycle —
           blue → turquoise → emerald → silver — matching the doc's hummingbird
           description. The --heading-deg CSS var encodes compass direction so
           the color at any moment depends on which way the bird faces, exactly
           like real structural iridescence. Animation period is deliberately
           different from --flap-period so the color and the flap never lock
           into a boring synchronised beat. */
        .sankofa-bird-wing-right-highlight,
        .sankofa-bird-wing-left-highlight {
          animation: sankofa-iridescent 3.2s ease-in-out infinite;
        }
        .sankofa-bird-wing-left-highlight {
          animation-delay: 0.9s;
        }

        /* ── Iris animation — tracks the same look-left/right cycle as the pupil ──
           The iris ring moves in sync with the pupil so the whole eye feels
           unified. Uses a slightly smaller translateX so the iris lags behind
           the pupil's center — creates parallax depth between the two layers. */
        .sankofa-bird-iris {
          /* animation-duration driven by --blink-period (activity level).
             quiet=9s, normal=7s, busy=5s, peak=3.5s.
             At night P10.6 multiplies by 1.6x so nocturnal blink is calmer. */
          animation: sankofa-iris-track var(--blink-period, 7000ms) ease-in-out infinite;
        }
        @keyframes sankofa-iris-track {
          0%,  35%  { transform: translateX(0);       opacity: 0.88; }
          37%, 39%  { transform: translateX(0);       opacity: 0.5; }   /* blink sync */
          41%        { transform: translateX(0);       opacity: 0.88; }
          48%, 62%  { transform: translateX(-0.28px); opacity: 0.88; }  /* look left */
          66%        { transform: translateX(0);       opacity: 0.88; }
          68%, 70%  { transform: translateX(0);       opacity: 0.5; }   /* blink sync */
          72%        { transform: translateX(0);       opacity: 0.88; }
          78%, 90%  { transform: translateX(0.28px);  opacity: 0.88; }  /* look right */
          95%, 100% { transform: translateX(0);       opacity: 0.88; }
        }

        /* LOD: hide iris ring at low zoom (too small, costs GPU for no gain) */
        .sankofa-bird-rig[data-zoom="low"] .sankofa-bird-iris {
          display: none !important;
        }

        /* ── Breathing — subtle chest/body scale pulse ────────────────────── */
        /* Real birds breathe even while perched or hovering. The chest expands
           maybe 1-2% — you almost don't notice it, but your brain does.
           transform-box: view-box + explicit cx/cy is used instead of fill-box
           because fill-box breaks on Safari < 16.4 (uses wrong transform origin
           — the SVG origin instead of the ellipse center). The cx/cy of the
           chest ellipse are 20 22 (see JSX), so 20px 22px is the correct pivot.

           Breathing rate is state-conditional:
           - Idle/perched (not flying): slow, calm 3.8s cycle — resting rate
           - Flying/navigating:         faster 2.2s — elevated from exertion
           The period is independent of --flap-period so it doesn't speed up with
           wing flaps (real birds regulate breathing separately from wing beat). */
        .sankofa-bird-chest {
          transform-box: view-box;
          transform-origin: 20px 22px;
          /* Default (idle/perched): calm resting breath */
          animation: sankofa-breathe 3.8s ease-in-out infinite;
        }
        /* Flying: elevated breathing rate from exertion */
        .sankofa-bird-rig[data-flying="true"] .sankofa-bird-chest {
          animation: sankofa-breathe 2.2s ease-in-out infinite !important;
        }
        .sankofa-bird-rig[data-zoom="low"] .sankofa-bird-chest {
          animation: none !important;
        }

        /* ── Idle head-bob + head wander (combined) ────────────────────────── */
        /* Doc: "When idle, the bird does subtle head bobs and weight shifts —
           the micro-behaviours that make it feel alive rather than frozen."
           Doc sequence: "Idle: Blink → Look Left → Look Forward → Tiny Head Tilt"
           Both animations run simultaneously via comma-separated animation shorthand.
           sankofa-idle-head-bob (4.2s): three natural micro-dips per cycle — the
             rhythmic feeding/scanning bob seen in real birds perched or foraging.
           sankofa-head-idle-wander (7s): synced to the eye-live 7s cycle so the
             head tilt lands precisely when the eye finishes its "look-right" phase.
           Two different periods (4.2s / 7s ≈ golden ratio) guarantee they almost
           never peak in unison — the combined motion is perpetually non-repeating.
           Bug fix: previously two separate CSS rules targeted the same element with
           equal specificity; CSS last-write-wins meant only the wander ran. Now both
           compose via the CSS animation shorthand comma list. */
        .sankofa-bird-rig[data-landing="idle"][data-flying="false"] .sankofa-bird-head {
          animation:
            sankofa-idle-head-bob   4.2s ease-in-out infinite,
            sankofa-head-idle-wander 7s  ease-in-out infinite;
          transform-origin: 12px 16px;
          transform-box: view-box;
        }
        .sankofa-bird-rig[data-landing="idle"][data-flying="false"] .sankofa-bird-body {
          animation: sankofa-idle-weight-shift 8.4s ease-in-out infinite;
        }
        @keyframes sankofa-idle-head-bob {
          /* Natural head bob: three micro-dips and one alert scan per cycle.
             0→20%: first small bob down; 20→40%: back up with a leftward glance;
             40→60%: second bob + right glance; 60→80%: look forward neutral;
             80→100%: settle back to Sankofa backward pose. */
          0%   { transform: rotate(0deg)    translateY(0px); }
          12%  { transform: rotate(4deg)    translateY(0.6px); }   /* bob down */
          22%  { transform: rotate(-2deg)   translateY(-0.4px); }  /* lift + glance L */
          35%  { transform: rotate(3deg)    translateY(0.4px); }   /* second dip */
          48%  { transform: rotate(-1deg)   translateY(-0.2px); }  /* glance R */
          62%  { transform: rotate(1deg)    translateY(0.2px); }   /* neutral settle */
          78%  { transform: rotate(-0.5deg) translateY(-0.1px); }  /* final micro-adjust */
          100% { transform: rotate(0deg)    translateY(0px); }     /* back to start */
        }
        @keyframes sankofa-idle-weight-shift {
          /* Body sways gently on the perch — the bird redistributes weight from
             foot to foot every ~4s. Half the frequency of the head-bob so the two
             motions feel coordinated but not in sync (avoids mechanical look). */
          0%, 100% { transform: translateX(0px)    rotate(0deg); }
          25%      { transform: translateX(0.5px)  rotate(0.4deg); }  /* lean right */
          50%      { transform: translateX(0px)    rotate(0deg); }    /* centre */
          75%      { transform: translateX(-0.5px) rotate(-0.4deg); } /* lean left */
        }
        @keyframes sankofa-head-idle-wander {
          /* Forward gaze at rest */
          0%,  32%  { transform: rotate(0deg)    translateY(0px);   }
          /* Head tilts slightly as bird glances left (syncs with eye look-left) */
          50%, 64%  { transform: rotate(-1.5deg) translateY(-0.5px); }
          /* Returns forward after second blink */
          74%       { transform: rotate(0deg)    translateY(0px);   }
          /* Tiny curious tilt right — doc "Tiny Head Tilt" moment, after look-right */
          88%       { transform: rotate(2deg)    translateY(0.3px); }
          100%      { transform: rotate(0deg)    translateY(0px);   }
        }

        /* ── Anticipatory turn — bird glances toward upcoming turn ────────── */
        /* When navigation has an upcoming turn, the head tilts toward it a
           moment before the instruction fires — anticipatory, not reactive.
           Only active while navigating (data-flying="true"). The 2s period
           means the glance repeats slowly so it draws attention without
           being distracting. */
        .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="left"] .sankofa-bird-head {
          animation: sankofa-anticipate-left 2.2s ease-in-out infinite;
          transform-origin: 12px 16px;
          transform-box: view-box;
        }
        .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="right"] .sankofa-bird-head {
          animation: sankofa-anticipate-right 2.2s ease-in-out infinite;
          transform-origin: 12px 16px;
          transform-box: view-box;
        }

        /* ── Level-of-Detail: low-zoom simplified silhouette ──────────────── */
        /* At zoom < 10 the bird is tiny — feather tips are invisible noise
           and hurt performance for no visual gain. Hide them so only the
           main wing shapes, body, and head are visible. The bird still
           animates; it's just simplified. */
        .sankofa-bird-rig[data-zoom="low"] .sankofa-bird-wing-left-feathers,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-bird-wing-right-feathers,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-bird-wing-left-highlight,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-bird-wing-right-highlight,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-bird-legs,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-bird-shadow {
          display: none !important;
        }

        /* ── Notification: head tilts + wing flick ───────────────────────── */
        .sankofa-bird-rig[data-notification="true"] .sankofa-bird-head {
          /* !important: overrides the idle head-wander (data-landing+data-flying
             combo has 3 attribute selectors vs this selector's 2, so without
             !important the idle wander wins when both conditions are true). */
          animation: sankofa-head-tilt 0.6s ease-in-out 3 !important;
          transform-origin: 12px 16px;
          transform-box: view-box;
        }
        .sankofa-bird-rig[data-notification="true"] .sankofa-bird-wing-right {
          animation: sankofa-wing-flick 0.4s ease-in-out 2;
        }

        /* ── Accepted: hop + wing stretch ─────────────────────────────────── */
        .sankofa-bird-rig[data-accepted="true"] .sankofa-bird-body {
          animation: sankofa-hop 0.5s ease-in-out 2;
        }
        /* Wing stretch: both wings extend outward on acceptance — the "wing
           stretch" step in the doc's chirp → hop → wing-stretch sequence. */
        .sankofa-bird-rig[data-accepted="true"] .sankofa-bird-wing-left {
          animation: sankofa-wing-stretch-left 0.6s ease-in-out 2;
          animation-delay: 0.25s;
        }
        .sankofa-bird-rig[data-accepted="true"] .sankofa-bird-wing-right {
          animation: sankofa-wing-stretch-right 0.6s ease-in-out 2;
          animation-delay: 0.25s;
        }

        /* ── Celebration: heart pulse + shimmer glow ──────────────────────── */
        /* Heart pulse ring expands from 0 → full size and fades: this is the
           "heart pulse" step before the feather shimmer in the doc sequence. */
        .sankofa-heart-pulse {
          animation: sankofa-heart-pulse-ring 0.9s ease-out 2;
        }
        /* BUG FIX: unified celebrating body rule — a duplicate rule existed further
           down (at the photorealistic section) that set a static filter which would
           cascade-conflict with this animation's dynamic filter. CSS animation values
           sit above the author layer in the cascade, so the !important on animation is
           belt-and-suspenders; the real guard is removing the duplicate below. */
        .sankofa-bird-rig[data-celebrating="true"] .sankofa-bird-body {
          animation: sankofa-shimmer 0.8s ease-in-out infinite !important;
          transition: filter 0.3s ease-in;
        }
        .sankofa-bird-egg {
          transition: fill 0.3s, stroke 0.3s;
        }
        .sankofa-bird-rig[data-celebrating="true"] .sankofa-bird-egg {
          animation: sankofa-egg-glow 0.6s ease-in-out infinite alternate;
        }

        /* ── Donation: egg gold glow + distinct body shimmer ──────────────── */
        /* Distinct from celebrating (teal) — this is the pledge-paid / contribution
           completed reaction. Egg glows gold; body emits a warm golden shimmer
           separate from the teal celebrating shimmer so users can distinguish
           celebration (request complete) from donation (money pledged). */
        .sankofa-bird-rig[data-donated="true"] .sankofa-bird-egg {
          animation: sankofa-egg-glow-gold 0.5s ease-in-out 4 alternate;
        }
        .sankofa-bird-rig[data-donated="true"] .sankofa-bird-body {
          filter: drop-shadow(0 0 5px rgba(250, 190, 20, 0.45))
                  drop-shadow(0 0 12px rgba(250, 190, 20, 0.18));
          animation: sankofa-donated-body-shimmer 0.7s ease-in-out 4;
        }
        @keyframes sankofa-donated-body-shimmer {
          0%, 100% { filter: drop-shadow(0 0 4px rgba(250, 190, 20, 0.4)); }
          50%       { filter: drop-shadow(0 0 12px rgba(250, 190, 20, 0.85)) brightness(1.12); }
        }
        /* Donation chirp rings — warm gold tint instead of teal */
        .sankofa-bird-rig[data-donated="true"] .sankofa-chirp-ring-1 {
          animation: sankofa-chirp-ring 0.9s ease-out 4 !important;
          animation-delay: 0.15s;
          stroke: hsl(45, 95%, 70%); /* gold */
        }
        .sankofa-bird-rig[data-donated="true"] .sankofa-chirp-ring-2 {
          animation: sankofa-chirp-ring 0.9s ease-out 4 !important;
          animation-delay: 0.40s;
          stroke: hsl(45, 95%, 80%);
        }
        /* Accepted: chirp rings fire alongside the hop + wing stretch */
        .sankofa-bird-rig[data-accepted="true"] .sankofa-chirp-ring-1 {
          animation: sankofa-chirp-ring 0.85s ease-out 2 !important;
          animation-delay: 0.25s;
        }
        .sankofa-bird-rig[data-accepted="true"] .sankofa-chirp-ring-2 {
          animation: sankofa-chirp-ring 0.85s ease-out 2 !important;
          animation-delay: 0.50s;
        }

        /* ── "On duty" egg ambient glow — navigating but not celebrating ─── */
        /* When the bird is actively flying (helper mode on / navigating),
           the egg carries a faint teal inner glow: "you're carrying the future
           forward." Distinct from the bright celebrating or golden donated states.
           Excluded when celebrating/donated override it via specificity. */
        .sankofa-bird-rig[data-flying="true"][data-celebrating="false"][data-donated="false"] .sankofa-bird-egg {
          filter: drop-shadow(0 0 1.8px rgba(0, 212, 255, 0.55));
          transition: filter 1.0s ease;
          animation: sankofa-egg-duty-pulse 3.2s ease-in-out infinite;
        }
        @keyframes sankofa-egg-duty-pulse {
          /* Subtle breath-sync pulse — egg dims and brightens like a
             living light source. Doc: "Soft pulse → Internal light swirl
             → Glow fades. Not flashy. Elegant." */
          0%, 100% { filter: drop-shadow(0 0 1.2px rgba(0, 212, 255, 0.4)); }
          50%       { filter: drop-shadow(0 0 3.5px rgba(0, 212, 255, 0.7)); }
        }
        /* On-duty orbit particle — very faint slow spin at all times while
           flying (not just celebrating). Gives the egg a living "inner light"
           quality matching the doc: "glow comes from inside, like polished jade." */
        .sankofa-bird-rig[data-flying="true"][data-celebrating="false"][data-donated="false"] .sankofa-egg-orbit {
          opacity: 0.18 !important;
          animation: sankofa-egg-orbit 5.6s linear infinite !important;
        }

        /* ── Trailing particles during movement ───────────────────────────── */
        /* Positioned below the bird (backward in SVG-local space) — they drift
           further down and fade out, giving a "flying through air" feel. */
        .sankofa-trail {
          animation: sankofa-trail-fade 0.66s ease-out infinite;
          /* Smooth opacity fade when approaching state engages/clears.
             Without this the trail snaps from full opacity to 0.3 instantly
             when the bird crosses the 50 m threshold — jarring on mobile. */
          transition: opacity 0.6s ease-out;
        }

        /* ── Particle burst ───────────────────────────────────────────────── */
        .sankofa-particle {
          animation: sankofa-burst 0.8s ease-out forwards;
        }

        /* ── Golden sparkle particles ─────────────────────────────────────── */
        .sankofa-golden-sparkle {
          animation: sankofa-golden-burst 1.0s ease-out forwards;
        }

        /* ══ Keyframes ═══════════════════════════════════════════════════════ */
        @keyframes sankofa-float {
          /* Doc: "body moves about 2 pixels up and down" */
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-2px); }
        }
        @keyframes sankofa-glide {
          /* Cruise flight: body holds lean angle with a gentle thermal ride —
             a realistic up-down oscillation, not a constant-altitude hold.
             The slight rotation variance (+/- 1°) mimics the micro-corrections
             a real bird makes during cruise, per the vision doc. */
          0%   { transform: rotate(var(--lean-deg, 0deg)) translateY(0px); }
          20%  { transform: rotate(calc(var(--lean-deg, 0deg) - 1deg)) translateY(-1.4px); }
          50%  { transform: rotate(var(--lean-deg, 0deg)) translateY(-0.5px); }
          80%  { transform: rotate(calc(var(--lean-deg, 0deg) + 0.8deg)) translateY(0.4px); }
          100% { transform: rotate(var(--lean-deg, 0deg)) translateY(0px); }
        }
        @keyframes sankofa-perch {
          0% { transform: rotate(var(--lean-deg, 6deg)) translateY(-0.8px); }
          40% { transform: rotate(2deg) translateY(0px); }
          70% { transform: rotate(-1deg) translateY(1px); }
          100% { transform: rotate(0deg) translateY(0px); }
        }

        /* Symmetric wing flap (idle) — doc: "15° upward / 15° downward" */
        @keyframes sankofa-flap {
          0%, 100% { transform: rotate(15deg); }
          50% { transform: rotate(-15deg); }
        }
        @keyframes sankofa-flap-right {
          0%, 100% { transform: rotate(-15deg); }
          50% { transform: rotate(15deg); }
        }

        /* Banked wing flap — amplitude shifted by turn direction.
           Base angle matches idle ±15° so micro-reactions start from the same position. */
        @keyframes sankofa-flap-banked-left {
          0%, 100% { transform: rotate(calc(15deg + var(--left-wing-extra, 0deg))); }
          50% { transform: rotate(calc(-15deg + var(--left-wing-extra, 0deg))); }
        }
        @keyframes sankofa-flap-banked-right {
          0%, 100% { transform: rotate(calc(-15deg + var(--right-wing-extra, 0deg))); }
          50% { transform: rotate(calc(15deg + var(--right-wing-extra, 0deg))); }
        }

        /* Tail: idle sway, turns toward turn direction during flight */
        @keyframes sankofa-tail-sway {
          0%, 100% { transform: rotate(calc(var(--tail-bend, 0deg) + -4deg)); }
          50% { transform: rotate(calc(var(--tail-bend, 0deg) + 4deg)); }
        }
        @keyframes sankofa-tail-bank {
          0%, 100% { transform: rotate(calc(var(--tail-bend, 0deg) + -6deg)); }
          50% { transform: rotate(calc(var(--tail-bend, 0deg) + 6deg)); }
        }

        @keyframes sankofa-glide-wing-left {
          /* Soaring: wings spread wide with a gentle up-down drift, very slow */
          0%, 100% { transform: rotate(-8deg); }
          50%       { transform: rotate(-14deg); }
        }
        @keyframes sankofa-glide-wing-right {
          0%, 100% { transform: rotate(8deg); }
          50%       { transform: rotate(14deg); }
        }
        @keyframes sankofa-iridescent {
          /* Opacity-only shimmer — compositor-safe, no per-frame filter recompute.
             Heading-reactive hue shift is handled by the static
             data-heading-quadrant rules below (transition-only, not animated). */
          0%,100% { opacity: 0.22; }
          18%     { opacity: 0.55; }
          36%     { opacity: 0.38; }
          52%     { opacity: 0.62; }
          68%     { opacity: 0.30; }
          82%     { opacity: 0.50; }
        }

        @keyframes sankofa-eye-live {
          /* Full living-eye cycle: forward → blink → look left → blink → look right.
             Pupil translateX is relative to fill-box center set inline on the element.
             Scale added per doc: "tiny pupil adjustment" — pupil constricts on blink
             (scale 0.6 at opacity 0) and dilates slightly during "look right focus"
             (scale 0.85 = slight constriction when focusing on something specific,
             exactly like a real eye does when it catches an object of interest). */
          0%,  35%  { transform: translateX(0) scale(1);          opacity: 1; }  /* forward */
          37%, 39%  { transform: translateX(0) scale(0.6);        opacity: 0; }  /* blink — pupil constricts */
          41%        { transform: translateX(0) scale(1);          opacity: 1; }  /* open */
          48%, 62%  { transform: translateX(-0.45px) scale(1);    opacity: 1; }  /* look left */
          66%        { transform: translateX(0) scale(1);          opacity: 1; }  /* return center */
          68%, 70%  { transform: translateX(0) scale(0.6);        opacity: 0; }  /* blink — pupil constricts */
          72%        { transform: translateX(0) scale(1);          opacity: 1; }  /* open */
          78%, 86%  { transform: translateX(0.45px) scale(0.82);  opacity: 1; }  /* look right — focus constrict */
          91%        { transform: translateX(0.45px) scale(1);     opacity: 1; }  /* dilate back */
          95%, 100% { transform: translateX(0) scale(1);          opacity: 1; }  /* return */
        }

        @keyframes sankofa-neck-flex {
          0%, 100% { opacity: 1;   stroke-width: 3.4px; }
          50%       { opacity: 0.8; stroke-width: 3.1px; }
        }

        @keyframes sankofa-head-tilt {
          /* Doc sequence: "looks upward → head tilts → wing flick → notification appears"
             The translateY(-2.5px) at 15% simulates the bird snapping its gaze upward
             before the side-to-side tilt — matching the doc's "Bird looks upward" step. */
          0%        { transform: translateY(0px)    rotate(0deg); }
          15%       { transform: translateY(-2.5px) rotate(-5deg); }
          40%       { transform: translateY(-1px)   rotate(-12deg); }
          75%       { transform: translateY(0px)    rotate(8deg); }
          100%      { transform: translateY(0px)    rotate(0deg); }
        }
        @keyframes sankofa-wing-flick {
          /* Start at ±15° resting angle so there's no jump from idle */
          0%, 100% { transform: rotate(-15deg); }
          50% { transform: rotate(-32deg); }
        }
        @keyframes sankofa-wing-stretch-left {
          /* Wing stretches fully outward (beyond normal flap arc) then returns.
             Start/end at 15° to match idle resting angle — no visual jump. */
          0%   { transform: rotate(15deg); }
          35%  { transform: rotate(-28deg); }
          100% { transform: rotate(15deg); }
        }
        @keyframes sankofa-wing-stretch-right {
          0%   { transform: rotate(-15deg); }
          35%  { transform: rotate(28deg); }
          100% { transform: rotate(-15deg); }
        }
        @keyframes sankofa-hop {
          0%, 100% { transform: translateY(0px); }
          25% { transform: translateY(-4px); }
          50% { transform: translateY(0px); }
          75% { transform: translateY(-2px); }
        }
        @keyframes sankofa-breathe {
          /* Chest expands 2% on inhale — imperceptible individually but
             convinces the peripheral vision the bird is breathing. */
          0%, 100% { transform: scale(1); }
          45%      { transform: scale(1.02, 1.015); }
          55%      { transform: scale(1.02, 1.015); }
        }

        @keyframes sankofa-anticipate-left {
          /* Head glances left before an upcoming left turn — intelligence
             cue from the doc. 0-15%: settle; 20-55%: glance left;
             60-100%: return and pause. Repeat. */
          0%,  15%, 65%, 100% { transform: rotate(0deg) translateY(0px); }
          25%, 50%            { transform: rotate(-10deg) translateY(-1.5px); }
        }
        @keyframes sankofa-anticipate-right {
          0%,  15%, 65%, 100% { transform: rotate(0deg) translateY(0px); }
          25%, 50%            { transform: rotate(10deg) translateY(-1.5px); }
        }

        @keyframes sankofa-heart-pulse-ring {
          0%   { transform: scale(0.4); opacity: 0.9; }
          60%  { transform: scale(1.1); opacity: 0.4; }
          100% { transform: scale(1.4); opacity: 0; }
        }
        @keyframes sankofa-shimmer {
          0%, 100% { filter: drop-shadow(0 0 8px rgba(0,212,255,0.9)); }
          50% { filter: drop-shadow(0 0 16px rgba(0,212,255,1)) brightness(1.2); }
        }
        @keyframes sankofa-egg-glow {
          from { filter: drop-shadow(0 0 2px rgba(255,220,80,0.8)); }
          to   { filter: drop-shadow(0 0 8px rgba(255,200,0,1)); }
        }
        @keyframes sankofa-egg-glow-gold {
          from { filter: drop-shadow(0 0 1px rgba(255,210,60,0.7)); }
          to   { filter: drop-shadow(0 0 10px rgba(255,185,0,1)) brightness(1.3); }
        }
        @keyframes sankofa-trail-fade {
          0%   { opacity: 0.55; transform: translateY(0px) scale(1); }
          100% { opacity: 0;    transform: translateY(6px)  scale(0.5); }
        }
        @keyframes sankofa-burst {
          0%   { opacity: 1; transform: rotate(var(--deg, 0deg)) translateY(0) scale(1); }
          100% { opacity: 0; transform: rotate(var(--deg, 0deg)) translateY(-20px) scale(0.5); }
        }
        @keyframes sankofa-golden-burst {
          0%   { opacity: 1;   transform: rotate(var(--deg, 0deg)) translateY(0)     rotate(45deg) scale(1.2); }
          40%  { opacity: 0.9; transform: rotate(var(--deg, 0deg)) translateY(-14px)  rotate(45deg) scale(1); }
          100% { opacity: 0;   transform: rotate(var(--deg, 0deg)) translateY(-24px)  rotate(45deg) scale(0.4); }
        }

        /* ── Legs — separate animated layer ──────────────────────────────── */
        /* At rest: gentle perch sway (weight shift side-to-side).
           Flying:  alternating left/right step cadence matching flap rate.
           Hover:   dangle (legs drop slightly below body).
           Perch:   settle to rest position. */
        .sankofa-bird-legs {
          transform-origin: 20px 29px;
          transform-box: view-box;
          animation: sankofa-legs-perch calc(var(--flap-period, 1400ms) * 1.6) ease-in-out infinite;
        }
        .sankofa-bird-rig[data-flying="true"] .sankofa-bird-legs {
          animation: sankofa-legs-step var(--flap-period, 300ms) ease-in-out infinite;
        }
        .sankofa-bird-rig[data-landing="hover"] .sankofa-bird-legs,
        .sankofa-bird-rig[data-landing="slowflap"] .sankofa-bird-legs {
          animation: sankofa-legs-dangle 0.9s ease-in-out infinite;
        }
        .sankofa-bird-rig[data-landing="perch"] .sankofa-bird-legs {
          animation: sankofa-legs-land 0.6s ease-out forwards;
        }

        @keyframes sankofa-legs-perch {
          0%, 100% { transform: rotate(-2deg); }
          50%       { transform: rotate(2deg); }
        }
        @keyframes sankofa-legs-step {
          /* Alternate the leg group left/right at the flap cadence — gives the
             impression of running/pedalling in flight. */
          0%, 100% { transform: skewX(-4deg); }
          50%       { transform: skewX(4deg); }
        }
        /* NOTE: sankofa-legs-dangle is defined below in the Phase 3 landing block
           with the full pendulum swing keyframe. The duplicate simple version was
           removed — only the Phase 3 pendulum version remains (lines ~3469). */
        @keyframes sankofa-legs-land {
          /* Legs snap down to touch-down position */
          0%   { transform: translateY(2px); }
          60%  { transform: translateY(-1px); }
          100% { transform: translateY(0px); }
        }

        /* ── Takeoff sequence (navigating false → true) ──────────────────── */
        /* Doc: "Tap Navigate → looks forward → crouches → spreads wings →
           pushes upward → two strong flaps → glides → cruises."
           Duration = 1 200ms, matching the JS setTimeout before "flying". */
        .sankofa-bird-rig[data-landing="takeoff"] .sankofa-bird-body {
          animation: sankofa-takeoff-body 1.2s ease-in-out forwards !important;
        }
        /* Doc step 1: "Looks forward" — the head snaps from the backward-facing
           Sankofa pose to scan ahead, then tilts up as the wings spread.
           This is the "glances toward destination before turning" intelligence
           cue from the doc's closing paragraph: birds make decisions first. */
        .sankofa-bird-rig[data-landing="takeoff"] .sankofa-bird-head {
          animation: sankofa-takeoff-head 1.2s ease-in-out forwards !important;
          transform-origin: 12px 16px;
          transform-box: view-box;
        }
        .sankofa-bird-rig[data-landing="takeoff"] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-landing="takeoff"] .sankofa-bird-wing-left-feathers {
          animation: sankofa-takeoff-wing-left 1.2s ease-in-out forwards !important;
        }
        .sankofa-bird-rig[data-landing="takeoff"] .sankofa-bird-wing-right,
        .sankofa-bird-rig[data-landing="takeoff"] .sankofa-bird-wing-right-feathers {
          /* Feather tips lag by 12% as in normal flight; +18ms period asymmetry */
          animation: sankofa-takeoff-wing-right calc(1.2s + 18ms) ease-in-out forwards !important;
        }
        .sankofa-bird-rig[data-landing="takeoff"] .sankofa-bird-legs {
          animation: sankofa-takeoff-legs 1.2s ease-in-out forwards !important;
        }

        @keyframes sankofa-takeoff-body {
          /* 0%: standing still  18%: crouch/squat  40%: launch up  60%: apex
             78%: second power flap  100%: settle to cruise lean */
          0%   { transform: translateY(0px)   rotate(0deg); }
          18%  { transform: translateY(2px)   rotate(3deg);  }
          40%  { transform: translateY(-5px)  rotate(-6deg); }
          60%  { transform: translateY(-8px)  rotate(-9deg); }
          78%  { transform: translateY(-4px)  rotate(-3deg); }
          100% { transform: rotate(var(--lean-deg, 6deg)) translateY(-0.8px); }
        }
        @keyframes sankofa-takeoff-head {
          /* Doc: "A bird doesn't just flap its wings — it makes decisions.
             It glances toward a destination before turning."
             0-18%: the Sankofa head snaps slightly forward (out of its usual
             backward pose) to scan the destination.
             18-45%: tilts upward as wings spread and body crouches-then-launches.
             45-75%: holds the alert forward-scan during the two power flaps.
             75-100%: settles back to the cruising backward pose. */
          0%   { transform: rotate(0deg)    translateY(0px); }
          12%  { transform: rotate(8deg)    translateY(-0.5px); } /* glance forward */
          30%  { transform: rotate(-5deg)   translateY(-2px); }   /* look up/launch */
          55%  { transform: rotate(-4deg)   translateY(-1.5px); } /* alert scan */
          80%  { transform: rotate(2deg)    translateY(-0.5px); } /* returning */
          100% { transform: rotate(0deg)    translateY(0px); }    /* cruise pose */
        }
        @keyframes sankofa-takeoff-wing-left {
          0%   { transform: rotate(15deg);  }  /* resting fold */
          18%  { transform: rotate(22deg);  }  /* crouch tuck */
          40%  { transform: rotate(-52deg); }  /* big spread — power up */
          55%  { transform: rotate(-38deg); }  /* first downstroke */
          68%  { transform: rotate(-54deg); }  /* second strong flap */
          85%  { transform: rotate(-22deg); }  /* settling */
          100% { transform: rotate(-15deg); }  /* cruise */
        }
        @keyframes sankofa-takeoff-wing-right {
          0%   { transform: rotate(-15deg); }  /* resting fold */
          18%  { transform: rotate(-22deg); }  /* crouch tuck */
          40%  { transform: rotate(52deg);  }  /* big spread — power up */
          55%  { transform: rotate(38deg);  }  /* first downstroke */
          68%  { transform: rotate(54deg);  }  /* second strong flap */
          85%  { transform: rotate(22deg);  }  /* settling */
          100% { transform: rotate(15deg);  }  /* cruise */
        }
        @keyframes sankofa-takeoff-legs {
          0%   { transform: translateY(0px); }
          20%  { transform: translateY(0px); }   /* crouch — legs down */
          50%  { transform: translateY(-2px) rotate(-6deg); }  /* tuck in flight */
          100% { transform: translateY(-1px) skewX(-2deg); }   /* flight carry */
        }

        /* ── Nearby user: wing salute ─────────────────────────────────────── */
        /* Doc: "When another Niakofa user is nearby… your bird looks over →
           small wing salute → returns to hovering."
           Triggered when nearbyUser=true (another helper within ~200 m). */
        /* ── Nearby user: bilateral wing salute ─────────────────────────────
           Doc: "When another Niakofa user is nearby… your bird looks over →
           small wing salute → returns to hovering."
           Left wing is the primary salute (lifts high, strong acknowledgement).
           Right wing gives a complementary counter-lift (stays lower, asymmetric)
           so the bird doesn't look mechanical — a real bird waves one wing at
           a time while the other provides balance. */
        .sankofa-bird-rig[data-nearby-user="true"] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-nearby-user="true"] .sankofa-bird-wing-left-feathers {
          animation: sankofa-wing-salute-left 1.4s ease-in-out 2 !important;
        }
        .sankofa-bird-rig[data-nearby-user="true"] .sankofa-bird-wing-right,
        .sankofa-bird-rig[data-nearby-user="true"] .sankofa-bird-wing-right-feathers {
          animation: sankofa-wing-salute-right 1.4s ease-in-out 2 !important;
          animation-delay: 0.18s; /* right lags slightly — balance wing reacts */
        }
        .sankofa-bird-rig[data-nearby-user="true"] .sankofa-bird-head {
          animation: sankofa-head-tilt 0.9s ease-in-out 1 !important;
          transform-origin: 12px 16px;
          transform-box: view-box;
        }
        /* Chirp ring appears on nearbyUser — the "small chirp" recognition cue */
        .sankofa-bird-rig[data-nearby-user="true"] .sankofa-chirp-ring-1 {
          animation: sankofa-chirp-ring 0.9s ease-out 2 !important;
          animation-delay: 0.3s;
        }
        .sankofa-bird-rig[data-nearby-user="true"] .sankofa-chirp-ring-2 {
          animation: sankofa-chirp-ring 0.9s ease-out 2 !important;
          animation-delay: 0.55s;
        }
        @keyframes sankofa-wing-salute-left {
          /* Left wing lifts in a brief acknowledgement salute — primary gesture */
          0%   { transform: rotate(15deg);  }  /* idle rest */
          22%  { transform: rotate(-42deg); }  /* salute — wing lifts */
          52%  { transform: rotate(-40deg); }  /* hold */
          74%  { transform: rotate(-12deg); }  /* return down */
          100% { transform: rotate(15deg);  }  /* back to rest */
        }
        @keyframes sankofa-wing-salute-right {
          /* Right wing counter-balances — lifts less, opposite phase */
          0%   { transform: rotate(-15deg); }  /* idle rest */
          22%  { transform: rotate(8deg);   }  /* partial counter-lift */
          52%  { transform: rotate(6deg);   }  /* hold */
          74%  { transform: rotate(-6deg);  }  /* return */
          100% { transform: rotate(-15deg); }  /* back to rest */
        }
        /* Chirp ring: concentric sound-wave circle emanating from beak tip.
           Grows from beak coords (~3.5px 15px SVG space), fades out.
           Used on nearbyUser + notification events. */
        .sankofa-chirp-ring-1,
        .sankofa-chirp-ring-2 {
          transform-box: view-box;
          transform-origin: 2.2px 14.25px; /* beak tip SVG coords */
          opacity: 0;
        }
        @keyframes sankofa-chirp-ring {
          0%   { transform: scale(0.5); opacity: 0.7; }
          60%  { transform: scale(2.8); opacity: 0.3; }
          100% { transform: scale(5.0); opacity: 0; }
        }
        /* Notification also triggers the chirp rings */
        .sankofa-bird-rig[data-notification="true"] .sankofa-chirp-ring-1 {
          animation: sankofa-chirp-ring 0.85s ease-out 3 !important;
          animation-delay: 0.1s;
        }
        .sankofa-bird-rig[data-notification="true"] .sankofa-chirp-ring-2 {
          animation: sankofa-chirp-ring 0.85s ease-out 3 !important;
          animation-delay: 0.35s;
        }

        /* ══ Dive phase (navigating → landing) ══════════════════════════════ */
        /* Doc: "As the user approaches destination, the bird gradually slows,
           flaps less, and begins descending into a hover."
           Duration = 600ms, matching the JS setTimeout before "slowflap". */
        .sankofa-bird-rig[data-landing="dive"] .sankofa-bird-body {
          animation: sankofa-dive-body 0.6s ease-in-out forwards !important;
        }
        .sankofa-bird-rig[data-landing="dive"] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-landing="dive"] .sankofa-bird-wing-left-feathers {
          animation: sankofa-dive-wing-left 0.6s ease-in-out forwards !important;
        }
        .sankofa-bird-rig[data-landing="dive"] .sankofa-bird-wing-right,
        .sankofa-bird-rig[data-landing="dive"] .sankofa-bird-wing-right-feathers {
          animation: sankofa-dive-wing-right 0.6s ease-in-out forwards !important;
        }
        .sankofa-bird-rig[data-landing="dive"] .sankofa-bird-tail {
          animation: sankofa-tail-sway 0.5s ease-in-out 1 !important;
        }
        @keyframes sankofa-dive-body {
          /* Sharp forward pitch as bird targets destination, then pulls up into
             deceleration posture — matches "Glide → Wing flare → Tail opens"
             from the doc landing sequence. */
          0%   { transform: rotate(var(--lean-deg, 6deg)) translateY(-0.8px); }
          30%  { transform: rotate(20deg) translateY(4px); }   /* nose-down dive */
          65%  { transform: rotate(10deg) translateY(1.5px); } /* pull-up */
          100% { transform: rotate(6deg)  translateY(0px);   } /* slow-flap posture */
        }
        @keyframes sankofa-dive-wing-left {
          0%   { transform: rotate(-15deg); }   /* cruise */
          30%  { transform: rotate(-6deg);  }   /* wings tuck during dive */
          65%  { transform: rotate(-28deg); }   /* flare for deceleration */
          100% { transform: rotate(-18deg); }   /* slow-flap extension */
        }
        @keyframes sankofa-dive-wing-right {
          0%   { transform: rotate(15deg);  }
          30%  { transform: rotate(6deg);   }
          65%  { transform: rotate(28deg);  }
          100% { transform: rotate(18deg);  }
        }

        /* ══ Head anticipatory lead ════════════════════════════════════════ */
        /* When no explicit upcoming-turn animation is active, the head leans
           slightly into the current bank direction (--head-lead-deg from
           computeHeadLeadDeg). This implements the "Head looks first" step
           from the doc's banking sequence. The anticipate-left/right keyframes
           (data-upcoming-turn≠none) take over for explicit navigation turns. */
        .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="none"] .sankofa-bird-head {
          transform: rotate(var(--head-lead-deg, 0deg));
          transform-box: view-box;
          transform-origin: 12px 16px;
          transition: transform 0.4s ease-out;
          animation: none !important;
        }

        /* ══ Egg orbit particle ════════════════════════════════════════════ */
        /* Tiny white dot that orbits the egg center while celebrating/donated.
           transform-origin is the egg center in SVG viewBox coords (3.4, 15.6).
           The circle is positioned 1.4px above that center (cy=14.2), so
           a 360° rotation traces the correct circular orbit path. */
        .sankofa-egg-orbit {
          transform-box: view-box;
          transform-origin: 3.4px 15.6px;
        }
        .sankofa-bird-rig[data-celebrating="true"] .sankofa-egg-orbit,
        .sankofa-bird-rig[data-donated="true"] .sankofa-egg-orbit {
          opacity: 0.85 !important;
          animation: sankofa-egg-orbit 1.1s linear infinite;
        }
        @keyframes sankofa-egg-orbit {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }

        /* ══ Speed-tier particle trail tuning ═════════════════════════════ */
        /* data-speed from getSpeedTier() drives trail density/style via CSS.
           These rules augment the JS-computed inline styles — the JS still
           computes shape/position, CSS handles timing and opacity. */
        .sankofa-bird-rig[data-speed="walking"] .sankofa-trail {
          animation-duration: 0.9s;
          opacity: 0.45;
        }
        .sankofa-bird-rig[data-speed="running"] .sankofa-trail {
          animation-duration: 0.55s;
        }
        .sankofa-bird-rig[data-speed="driving"] .sankofa-trail {
          animation-duration: 0.35s;
        }
        .sankofa-bird-rig[data-speed="airplane"] .sankofa-trail {
          animation-duration: 0.22s;
          filter: blur(0.5px);
        }

        /* ══ High-zoom cinematic detail ════════════════════════════════════ */
        /* At zoom ≥ 15 (data-zoom="high") — the "individual feathers +
           iridescent at street level" tier from the doc's camera-awareness
           section. Faster shimmer cycle and extra saturation boost. */
        .sankofa-bird-rig[data-zoom="high"] .sankofa-bird-wing-right-highlight,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-bird-wing-right-highlight,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-bird-wing-left-highlight ,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-bird-wing-left-highlight {
          animation-duration: 2.1s !important;
          /* Extra saturation + brightness at street zoom makes the spectral
             flash really pop — individual feathers glinting in sunlight. */
          filter: saturate(1.8) brightness(1.25);
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-bird-chest ,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-bird-chest {
          animation-duration: calc(var(--flap-period, 1400ms) * 2.2) !important;
        }

        /* At high zoom, apply iridescent hue-shift to MAIN wing bodies with
           a significantly larger scale (0.25 vs old 0.06) so the whole wing
           changes colour as the bird banks — the hummingbird effect. */
        .sankofa-bird-rig[data-zoom="high"] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-bird-wing-right ,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-bird-wing-right {
          filter: hue-rotate(calc(var(--heading-deg, 0deg) * 0.25)) saturate(1.3);
          transition: filter 0.5s ease-out;
        }
        /* High zoom: head and neck also iridescence slightly — the neck is a
           continuous surface with the wings so it should share the colour shift.
           Scale is half the wing (0.12) to keep it subtle on the small head area. */
        .sankofa-bird-rig[data-zoom="high"] .sankofa-bird-neck ,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-bird-neck {
          filter: hue-rotate(calc(var(--heading-deg, 0deg) * 0.12)) saturate(1.2);
          transition: filter 0.6s ease-out;
        }
        /* High zoom: tail iridescence — slightly out of phase with wings.
           Tail feathers on real kingfishers/turacos have equally vivid iridescence.
           Scale (0.18) is between wings (0.25) and neck (0.12) since tail is a
           medium-sized visible surface. Period is offset via the rotation multiplier
           so chest, wing, tail, and neck peaks never coincide — organic shimmer. */
        .sankofa-bird-rig[data-zoom="high"] .sankofa-bird-tail ,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-bird-tail {
          filter: hue-rotate(calc(var(--heading-deg, 0deg) * 0.18)) saturate(1.25);
          transition: filter 0.7s ease-out;
        }
        /* Celebration glow halo — entire bird body/egg/wings radiate teal on
           request completion. The drop-shadow applies to the SVG container itself
           so it glows outward as a single shape rather than per-element.
           Doc: "Completing a community action — burst of teal/golden particles,
           the egg pulses with light." This body glow is the ambient halo that
           complements the particle burst (which lives in the SVG as circles).
           NOTE: the [data-celebrating="true"] .sankofa-bird-body rule is defined
           ONCE at the Celebration section above (filter + animation unified there).
           This comment is kept to document the merge location for future authors. */
        .sankofa-bird-rig[data-celebrating="false"] .sankofa-bird-body,
        .sankofa-bird-rig:not([data-celebrating]) .sankofa-bird-body {
          filter: none;
          transition: filter 0.6s ease-out;
        }
        /* Donation golden halo — same concept but warm-gold for pledge completion */
        .sankofa-bird-rig[data-donated="true"] .sankofa-bird-body {
          filter: drop-shadow(0 0 6px rgba(250, 190, 20, 0.55))
                  drop-shadow(0 0 14px rgba(250, 190, 20, 0.20));
          transition: filter 0.3s ease-out;
        }
        /* Notification: neck/head feather ruffle — a rapid scale+rotate on the
           neck group gives the "feathers stand on end" micro-cue visible at mid+
           zoom. Short 3-cycle burst timed alongside the beak chirp.
           Doc: "Eyes widen → Looks upward → Small chirp → Notification appears." */
        .sankofa-bird-rig[data-notification="true"] .sankofa-bird-neck {
          animation: sankofa-neck-ruffle 0.28s ease-in-out 3;
          transform-box: view-box;
          transform-origin: 16px 18px;
        }
        @keyframes sankofa-neck-ruffle {
          0%   { transform: scaleX(1)    scaleY(1);    }
          30%  { transform: scaleX(1.07) scaleY(0.96); } /* puff out */
          60%  { transform: scaleX(0.97) scaleY(1.02); } /* settle back */
          100% { transform: scaleX(1)    scaleY(1);    }
        }
        /* Perch touchdown flutter — on landing="perch" the entire rig gets a
           short vibration keyframe (10 frames, ~300ms) that reads as the physical
           jolt of feet gripping a branch. Distinct from the settling perch body
           animation which runs over 2 s. The rig-level rotation is tiny (±0.8°)
           so it doesn't interfere with the SVG layout.
           Doc: "Gentle touchdown → folds wings → occasional head bob." */
        .sankofa-bird-rig[data-landing="perch"] {
          animation: sankofa-touchdown-flutter 0.32s ease-out;
        }
        @keyframes sankofa-touchdown-flutter {
          0%,100% { transform: rotate(0deg); }
          15%     { transform: rotate(0.8deg); }
          30%     { transform: rotate(-0.6deg); }
          50%     { transform: rotate(0.5deg); }
          70%     { transform: rotate(-0.3deg); }
          85%     { transform: rotate(0.2deg); }
        }
        /* Mid zoom: gentler version of wing iridescence */
        .sankofa-bird-rig[data-zoom="mid"] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-zoom="mid"] .sankofa-bird-wing-right {
          filter: hue-rotate(calc(var(--heading-deg, 0deg) * 0.12)) saturate(1.15);
          transition: filter 0.8s ease-out;
        }

        /* ── LOD: hide secondary and covert feather layers at low/mid zoom ──
           At zoom < 10 (low), all secondary/covert paths are invisible noise.
           At zoom 10-14 (mid), show secondaries but hide coverts.
           At zoom ≥ 15 (high), all 3 layers visible — maximum cinematic detail. */
        /* l5/r5, l0/r0, l4/r4, ls3/rs3 hidden at low zoom */
        .sankofa-bird-rig[data-zoom="low"] .sankofa-feather-l5,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-feather-r5,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-feather-ls3,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-feather-rs3 { display: none; }
        /* l0/r0 and l4/r4 hidden at low zoom — too small to contribute detail;
           suppress them to reduce rendering cost and visual noise. */
        .sankofa-bird-rig[data-zoom="low"] .sankofa-feather-l0,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-feather-r0,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-feather-l4,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-feather-r4 {
          display: none;
        }
        .sankofa-bird-rig[data-zoom="low"] .sankofa-feather-ls1,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-feather-ls2,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-feather-rs1,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-feather-rs2,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-feather-lc1,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-feather-rc1 {
          display: none !important;
        }
        .sankofa-bird-rig[data-zoom="mid"] .sankofa-feather-lc1,
        .sankofa-bird-rig[data-zoom="mid"] .sankofa-feather-rc1 {
          display: none !important;
        }

        /* ══ Airplane speed — motion blur illusion ══════════════════════════ */
        /* At airplane-tier speeds (>50 m/s) the bird is moving so fast it
           creates a slight motion-blur effect — the "highway: tail feathers
           stream behind" behavior from the doc's wind interaction section.
           We simulate this with a subtle horizontal blur on the body + a longer
           drop shadow that trails behind the flight direction. */
        .sankofa-bird-rig[data-speed="airplane"] .sankofa-bird-body {
          filter: drop-shadow(0 0 12px rgba(0,212,255,0.95)) blur(0.35px);
        }
        .sankofa-bird-rig[data-speed="airplane"] .sankofa-bird-wing-left-feathers,
        .sankofa-bird-rig[data-speed="airplane"] .sankofa-bird-wing-right-feathers {
          /* Feather tips stream back slightly at airplane speeds — the
             "wing tips vibrate gently" driving → "tail feathers stream" highway
             progression from the doc's wind interaction section. */
          filter: blur(0.4px);
          opacity: 0.7;
        }

        /* ── Combined: high-zoom iridescence + airplane motion blur ──────────
           When BOTH data-zoom="high" AND data-speed="airplane" are active,
           CSS specificity means the last rule wins on the same element. We
           add a combined selector that explicitly merges both filter stacks
           so neither effect cancels the other. Wings get hue-rotate AND
           feathers get blur+opacity — no clobbering. */
        .sankofa-bird-rig[data-zoom="high"][data-speed="airplane"] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-zoom="street"][data-speed="airplane"] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-zoom="high"][data-speed="airplane"] .sankofa-bird-wing-right ,
        .sankofa-bird-rig[data-zoom="street"][data-speed="airplane"] .sankofa-bird-wing-right {
          /* Iridescence + motion-speed shimmer: heading hue-rotation remains
             so the bird still colour-shifts as it banks at high speed. */
          filter: hue-rotate(calc(var(--heading-deg, 0deg) * 0.25)) saturate(1.4) brightness(1.08);
          transition: filter 0.3s ease-out;
        }
        .sankofa-bird-rig[data-zoom="high"][data-speed="airplane"] .sankofa-bird-wing-left-feathers,
        .sankofa-bird-rig[data-zoom="street"][data-speed="airplane"] .sankofa-bird-wing-left-feathers,
        .sankofa-bird-rig[data-zoom="high"][data-speed="airplane"] .sankofa-bird-wing-right-feathers ,
        .sankofa-bird-rig[data-zoom="street"][data-speed="airplane"] .sankofa-bird-wing-right-feathers {
          /* Feathers stream AND shimmer at street-zoom airplane speed */
          filter: hue-rotate(calc(var(--heading-deg, 0deg) * 0.15)) blur(0.4px);
          opacity: 0.75;
        }

        /* ══ Running speed — feather flutter (between walking and driving) ════ */
        /* Doc: "Running: Feathers lift slightly." Primary feathers beat faster
           and the secondary/covert layers begin to feel wind pressure — a step
           between the barely-moving walking state and full driving vibration.
           No blur yet: feathers are visibly moving but not blurred by airflow. */
        .sankofa-bird-rig[data-speed="running"] .sankofa-bird-wing-left-feathers,
        .sankofa-bird-rig[data-speed="running"] .sankofa-bird-wing-right-feathers {
          animation-duration: calc(var(--flap-period, 600ms) * 0.85) !important;
        }
        .sankofa-bird-rig[data-speed="running"] .sankofa-feather-ls1,
        .sankofa-bird-rig[data-speed="running"] .sankofa-feather-rs1,
        .sankofa-bird-rig[data-speed="running"] .sankofa-feather-ls2,
        .sankofa-bird-rig[data-speed="running"] .sankofa-feather-rs2 {
          animation-duration: calc(var(--flap-period, 600ms) * 0.72) !important;
        }
        /* Covert feathers (layer 3) begin to flutter at running speed */
        .sankofa-bird-rig[data-speed="running"] .sankofa-feather-lc1,
        .sankofa-bird-rig[data-speed="running"] .sankofa-feather-rc1 {
          animation-duration: calc(var(--flap-period, 600ms) * 0.65) !important;
        }

        /* ══ Driving speed — feather vibration ══════════════════════════════ */
        /* At driving speeds, ALL feather layers (primary, secondary, covert)
           vibrate at a higher frequency than the base flap to simulate wind
           resistance. Secondary/covert layers vibrate at slightly different
           rates for a cascaded turbulence effect.
           --speed-factor (0–1) is used here to modulate the filter intensity:
           calc(0.4px + var(--speed-factor, 0) * 0.3px) → blur scales with speed. */
        .sankofa-bird-rig[data-speed="driving"] .sankofa-bird-wing-left-feathers,
        .sankofa-bird-rig[data-speed="driving"] .sankofa-bird-wing-right-feathers {
          animation-duration: calc(var(--flap-period, 300ms) * 0.7) !important;
        }
        /* Secondary and covert layers vibrate faster (less mass, more turbulence) */
        .sankofa-bird-rig[data-speed="driving"] .sankofa-feather-ls1,
        .sankofa-bird-rig[data-speed="driving"] .sankofa-feather-ls2,
        .sankofa-bird-rig[data-speed="driving"] .sankofa-feather-rs1,
        .sankofa-bird-rig[data-speed="driving"] .sankofa-feather-rs2 {
          animation-duration: calc(var(--flap-period, 300ms) * 0.55) !important;
          filter: blur(calc(0.15px * var(--speed-factor, 0.5)));
        }
        .sankofa-bird-rig[data-speed="driving"] .sankofa-feather-lc1,
        .sankofa-bird-rig[data-speed="driving"] .sankofa-feather-rc1 {
          animation-duration: calc(var(--flap-period, 300ms) * 0.45) !important;
          filter: blur(calc(0.2px * var(--speed-factor, 0.5)));
        }

        /* ══ Airplane speed — motion blur on ALL feather layers ══════════════ */
        /* Secondary and covert feathers stream behind and blur more aggressively
           than primaries — they have less structural rigidity against airflow.
           --speed-factor at airplane speeds is always 1.0 so the calc simplifies
           to a fixed blur, but keeping the var makes the formula self-documenting. */
        .sankofa-bird-rig[data-speed="airplane"] .sankofa-feather-ls1,
        .sankofa-bird-rig[data-speed="airplane"] .sankofa-feather-ls2,
        .sankofa-bird-rig[data-speed="airplane"] .sankofa-feather-rs1,
        .sankofa-bird-rig[data-speed="airplane"] .sankofa-feather-rs2 {
          filter: blur(calc(0.35px + var(--speed-factor, 1) * 0.25px));
          opacity: 0.6;
        }
        .sankofa-bird-rig[data-speed="airplane"] .sankofa-feather-lc1,
        .sankofa-bird-rig[data-speed="airplane"] .sankofa-feather-rc1 {
          filter: blur(calc(0.45px + var(--speed-factor, 1) * 0.3px));
          opacity: 0.45;
        }

        /* ══ Egg ripple — outward community-action pulse ══════════════════ */
        /* Doc: "Completing a community action: The egg emits a soft pulse that
           travels outward like a ripple." A transform:scale ring grows from the
           egg center in SVG viewBox space (3.4px 15.6px) and fades to opacity 0.
           Distinct from the heart-pulse-ring which expands from the bird body center. */
        .sankofa-egg-ripple {
          transform-box: view-box;
          transform-origin: 3.4px 15.6px;
        }
        .sankofa-bird-rig[data-celebrating="true"] .sankofa-egg-ripple {
          animation: sankofa-egg-ripple-out 1.3s ease-out infinite;
        }
        @keyframes sankofa-egg-ripple-out {
          0%   { transform: scale(1);   opacity: 0.85; }
          100% { transform: scale(4.2); opacity: 0; }
        }

        /* ══ Tail fan during landing approach ══════════════════════════════ */
        /* Doc: "Wing flare → Tail opens → Legs extend → Gentle touchdown."
           The tail spreads/fans open as the bird decelerates — the "tail opens"
           step in the doc's full landing sequence. Separate from the idle sway
           and banked-flight tail so it is only triggered during the landing phases.
           The dive phase fans abruptly; the hover phase holds the fan with a
           gentle sway to simulate the tail acting as an air brake. */
        .sankofa-bird-rig[data-landing="dive"] .sankofa-bird-tail {
          animation: sankofa-tail-dive-spread 0.6s ease-out forwards !important;
        }
        .sankofa-bird-rig[data-landing="hover"] .sankofa-bird-tail {
          animation: sankofa-tail-hover-fan 1.4s ease-in-out infinite !important;
        }
        @keyframes sankofa-tail-dive-spread {
          /* Tail fans open sharply on approach — "tail opens" from the doc */
          0%   { transform: rotate(0deg) scale(1, 1); }
          35%  { transform: rotate(8deg) scale(1.28, 1.35); }
          65%  { transform: rotate(5deg) scale(1.22, 1.28); }
          100% { transform: rotate(4deg) scale(1.18, 1.22); }
        }
        @keyframes sankofa-tail-hover-fan {
          /* Tail holds spread + gentle sway while bird hovers above destination */
          0%, 100% { transform: rotate(2deg)  scale(1.14, 1.18); }
          50%       { transform: rotate(-1deg) scale(1.12, 1.16); }
        }

        /* ══ newNotification eye-widening — intelligence micro-reaction ══════
           Doc: "Notification: Eyes widen → Looks upward → Small chirp →
           Notification appears. Users notice the bird before the notification."
           The pupil scales up 40% and shifts upward to simulate an alert —
           the bird "sees" the incoming notification before the head-tilt fires.
           The iris tracks with a slightly smaller scale for parallax depth.
           Eyelid is suppressed during the alert so it doesn't conflict. */
        .sankofa-bird-rig[data-notification="true"] .sankofa-bird-eye {
          animation: sankofa-eye-alert 1.4s ease-out !important;
        }
        .sankofa-bird-rig[data-notification="true"] .sankofa-bird-iris {
          /* 1.8s × 2 iterations: alert widens twice so the eye-widening reads
             clearly before the iris returns to normal. The duplicate rule at
             the "Notification eyes widen" block below has been removed —
             only this consolidated declaration applies. */
          animation: sankofa-iris-alert 1.8s ease-out 2 !important;
        }
        .sankofa-bird-rig[data-notification="true"] .sankofa-bird-eyelid {
          animation: none !important;
          opacity: 0 !important; /* suppress blink during alert — eyes stay wide open */
        }
        @keyframes sankofa-eye-alert {
          /* 0-12%: eyes widen and shift up (alert); 30%: scan; 55-100%: settle */
          0%   { transform: scale(1)    translateX(0)       translateY(0);       opacity: 1; }
          12%  { transform: scale(1.4)  translateX(0)       translateY(-0.35px); opacity: 1; }
          30%  { transform: scale(1.25) translateX(-0.2px)  translateY(-0.2px);  opacity: 1; }
          55%  { transform: scale(1.15) translateX(0)       translateY(-0.1px);  opacity: 1; }
          100% { transform: scale(1)    translateX(0)       translateY(0);       opacity: 1; }
        }
        @keyframes sankofa-iris-alert {
          0%   { transform: scale(1)    translateX(0)        translateY(0);       opacity: 0.88; }
          12%  { transform: scale(1.25) translateX(0)        translateY(-0.28px); opacity: 0.95; }
          30%  { transform: scale(1.15) translateX(-0.15px)  translateY(-0.15px); opacity: 0.9; }
          55%  { transform: scale(1.08) translateX(0)        translateY(-0.08px); opacity: 0.88; }
          100% { transform: scale(1)    translateX(0)        translateY(0);       opacity: 0.88; }
        }

        /* ══ Approaching destination — cinematic deceleration ════════════════
           Doc: "As the user approaches their destination, the bird gradually
           slows, flaps less, and begins descending into a hover."
           data-approaching="true" slows the flap period by 40%, reduces
           forward lean via a body-pitch transition, and adds a gentle
           downward-bob to the whole rig — the bird "feels" it is losing
           altitude as it nears the landing zone. The egg stays perfectly
           level throughout (Sankofa symbolism: protected cargo). */
        .sankofa-bird-rig[data-approaching="true"] {
          animation: sankofa-approach-descent 2.4s ease-in-out infinite;
        }
        @keyframes sankofa-approach-descent {
          /* During approach the bird is decelerating and banking is minimal, so
             we use translateY only. The --bank-deg CSS var is registered above
             for future use and Safari compatibility, but approach is intentionally
             level so the egg stays symbolically stable as the bird prepares to land.
             Amplitude bumped to 2.5px (was 1.8px) — at 1.8px the deceleration
             bob was nearly invisible at arm's length on a phone-sized marker. */
          0%   { transform: translateY(0px); }
          30%  { transform: translateY(1.5px); }
          60%  { transform: translateY(2.5px); }
          80%  { transform: translateY(2.0px); }
          100% { transform: translateY(0px); }
        }
        /* Slow the flap rate noticeably — bird "glides in" rather than
           powering through. The 1.4× multiplier extends whatever the
           current flap period is, making the deceleration feel organic. */
        .sankofa-bird-rig[data-approaching="true"] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-approaching="true"] .sankofa-bird-wing-right {
          animation-duration: calc(var(--flap-period, 1400ms) * 1.45) !important;
        }
        /* Feather coverts settle slightly — wind pressure easing */
        .sankofa-bird-rig[data-approaching="true"] .sankofa-feather-lc1,
        .sankofa-bird-rig[data-approaching="true"] .sankofa-feather-rc1 {
          animation-duration: calc(var(--flap-period, 1400ms) * 1.8) !important;
          opacity: 0.85;
        }
        /* Reduce trail particle opacity while approaching — visual winding-down */
        .sankofa-bird-rig[data-approaching="true"] .sankofa-trail {
          opacity: 0.3 !important;
          animation-duration: 1.1s !important;
        }
        /* Egg glow softens and pulses expectantly — "approaching landing" signal */
        .sankofa-bird-rig[data-approaching="true"] .sankofa-bird-egg {
          filter: drop-shadow(0 0 3px rgba(0, 212, 255, 0.55));
          animation: sankofa-egg-approach-pulse 2.4s ease-in-out infinite;
        }
        @keyframes sankofa-egg-approach-pulse {
          0%   { filter: drop-shadow(0 0 2px rgba(0, 212, 255, 0.4)); }
          50%  { filter: drop-shadow(0 0 5px rgba(0, 212, 255, 0.75)); }
          100% { filter: drop-shadow(0 0 2px rgba(0, 212, 255, 0.4)); }
        }

        /* ══ Helping trail — warm golden tint while actively on a mission ════
           Doc: "Helping someone: Warm golden sparkles mixed with teal."
           When the bird is actively flying on a community mission (navigating,
           data-flying=true) but NOT in a burst reaction state, the trail
           particles carry a subtle warm-golden tint mixed into the teal — a
           living visual cue that the bird is "carrying the future forward."
           The gradient is CSS-level only so it costs nothing on mobile. */
        .sankofa-bird-rig[data-flying="true"][data-celebrating="false"][data-donated="false"] .sankofa-trail {
          background: linear-gradient(
            135deg,
            hsl(190, 100%, 60%) 40%,
            hsl(45, 90%, 65%) 100%
          );
        }

        /* ══ Idle dust motes — tiny teal particles when perched ════════════════
           Doc: "Idle: Tiny teal dust." Three micro-circles staggered at 0s,
           1.1s, and 2.1s produce organic floating quality. CSS gate requires
           BOTH data-landing="idle" AND data-flying="false" so they never
           appear during takeoff or the landing sequence. Suppressed at
           data-zoom="low" to save GPU at city scale where the bird is 6px. */
        .sankofa-bird-rig[data-landing="idle"][data-flying="false"] .sankofa-dust-1 {
          animation: sankofa-dust-rise 3.2s ease-out infinite;
          animation-delay: 0s;
        }
        .sankofa-bird-rig[data-landing="idle"][data-flying="false"] .sankofa-dust-2 {
          animation: sankofa-dust-rise 3.2s ease-out infinite;
          animation-delay: 1.1s;
        }
        .sankofa-bird-rig[data-landing="idle"][data-flying="false"] .sankofa-dust-3 {
          animation: sankofa-dust-rise 3.2s ease-out infinite;
          animation-delay: 2.1s;
        }
        @keyframes sankofa-dust-rise {
          /* Motes rise from the ground near the bird's feet, drift slightly
             sideways (mimicking a gentle breeze), and fade at 6× their starting
             height — tiny, organic, almost unnoticeable but subconsciously alive. */
          0%   { transform: translateY(0)     translateX(0px);    opacity: 0; }
          12%  { transform: translateY(-0.8px) translateX(0.3px); opacity: 0.55; }
          45%  { transform: translateY(-2.8px) translateX(-0.4px);opacity: 0.32; }
          75%  { transform: translateY(-4.5px) translateX(0.2px); opacity: 0.14; }
          100% { transform: translateY(-6px)   translateX(-0.1px);opacity: 0; }
        }
        /* Suppress idle dust at low zoom (city scale) — too small to see,
           costs GPU for nothing at zoom < 10. */
        .sankofa-bird-rig[data-zoom="low"] .sankofa-idle-dust {
          animation: none !important;
          opacity: 0 !important;
        }

        /* ══ High-zoom feather-tip glow — cinematic light-catch at street level
           Doc (Realistic): "At street level: individual feathers gleaming in
           sunlight." The outermost primary tips get a subtle drop-shadow glow
           when zoom ≥ 15 (data-zoom="high"), simulating sunlight catching the
           leading edge of each outermost feather. Only the first two primaries
           (l1/r1, l2/r2) receive the effect — the inner primaries are shadowed
           by the wing body in this lighting model. */
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-l1,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-l1,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-r1 ,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-r1 {
          filter: drop-shadow(0 0 1.5px rgba(0, 212, 255, 0.7));
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-l2,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-l2,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-r2 ,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-r2 {
          filter: drop-shadow(0 0 1px rgba(0, 212, 255, 0.5));
        }
        /* Combined: high-zoom AND airplane speed — feather-tip glow + blur
           (neither clobbers the other thanks to the explicit combined selector). */
        .sankofa-bird-rig[data-zoom="high"][data-speed="airplane"] .sankofa-feather-l1,
        .sankofa-bird-rig[data-zoom="street"][data-speed="airplane"] .sankofa-feather-l1,
        .sankofa-bird-rig[data-zoom="high"][data-speed="airplane"] .sankofa-feather-r1 ,
        .sankofa-bird-rig[data-zoom="street"][data-speed="airplane"] .sankofa-feather-r1 {
          filter: drop-shadow(0 0 1.5px rgba(0, 212, 255, 0.7)) blur(0.4px);
        }
        .sankofa-bird-rig[data-zoom="high"][data-speed="airplane"] .sankofa-feather-l2,
        .sankofa-bird-rig[data-zoom="street"][data-speed="airplane"] .sankofa-feather-l2,
        .sankofa-bird-rig[data-zoom="high"][data-speed="airplane"] .sankofa-feather-r2 ,
        .sankofa-bird-rig[data-zoom="street"][data-speed="airplane"] .sankofa-feather-r2 {
          filter: drop-shadow(0 0 1px rgba(0, 212, 255, 0.5)) blur(0.4px);
        }

        /* ══ Lower beak chirp ═══════════════════════════════════════════════
           Doc: "bird chirps → Looks toward destination → Spreads wings → Takeoff"
           and "Notification: Eyes widen → Looks upward → Small chirp → Notification appears"
           The lower jaw rotates 2–3° downward then snaps back — the subtle
           beak-open cue that makes users notice the bird is communicating.
           Only fires on notification and accepted states; not on donation/celebrating
           (those already have egg reactions).
           Transform-origin is set inline on the SVG element (SVG view-box coords). */
        .sankofa-bird-rig[data-notification="true"] .sankofa-bird-beak-lower {
          animation: sankofa-beak-chirp 0.35s ease-in-out 3;
        }
        .sankofa-bird-rig[data-accepted="true"] .sankofa-bird-beak-lower {
          animation: sankofa-beak-chirp 0.4s ease-in-out 2;
        }
        @keyframes sankofa-beak-chirp {
          0%   { transform: rotate(0deg); }
          30%  { transform: rotate(3deg); }   /* lower jaw drops */
          60%  { transform: rotate(1deg); }   /* partial close */
          100% { transform: rotate(0deg); }   /* shut */
        }

        /* ══ Leg dangle during landing ══════════════════════════════════════
           Doc: "Glide → Wing flare → Tail opens → Legs extend → Gentle touchdown"
           During hover/perch phases the legs dangle and sway as if the bird is
           preparing to grip a branch. The whole leg group (transform-origin at
           junction with body) swings gently forward then settles.
           Suppressed during flight (data-flying="true") so the in-flight leg
           position is controlled by the body/lean animations. */
        .sankofa-bird-rig[data-landing="hover"] .sankofa-bird-legs {
          animation: sankofa-legs-dangle 1.1s ease-in-out infinite;
          transform-box: view-box;
          transform-origin: 20px 29.5px;
        }
        .sankofa-bird-rig[data-landing="perch"] .sankofa-bird-legs {
          animation: sankofa-legs-settle 1.8s ease-out forwards;
          transform-box: view-box;
          transform-origin: 20px 29.5px;
        }
        @keyframes sankofa-legs-dangle {
          /* Legs hang freely and swing: first forward (wind resistance of descent),
             then back, then settle under the body — a pendulum effect. */
          0%   { transform: rotate(-8deg) translateY(1px); }
          35%  { transform: rotate(5deg)  translateY(2px); }
          70%  { transform: rotate(-3deg) translateY(1.5px); }
          100% { transform: rotate(-8deg) translateY(1px); }
        }
        @keyframes sankofa-legs-settle {
          /* Final touchdown: legs swing to rest position (neutral) */
          0%   { transform: rotate(-6deg) translateY(1px); }
          50%  { transform: rotate(4deg)  translateY(1.5px); }
          80%  { transform: rotate(-1deg) translateY(0.5px); }
          100% { transform: rotate(0deg)  translateY(0px); }
        }
        /* Hide legs while flying fast — at driving/airplane speeds legs are
           tucked against the body and not visible. */
        .sankofa-bird-rig[data-flying="true"][data-speed="driving"] .sankofa-bird-legs,
        .sankofa-bird-rig[data-flying="true"][data-speed="airplane"] .sankofa-bird-legs {
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        /* ══ Tail fan during hover/landing ══════════════════════════════════
           Doc: "Glide → Wing flare → Tail opens → Legs extend → Gentle touchdown"
           The tail spreads wider (scaleX > 1) during hover and perch phases —
           the bird uses it as an air-brake. Retracts back to normal on idle.
           NOTE: The hover rule below is for slowflap only — the hover state is
           already handled by sankofa-tail-hover-fan with !important earlier in
           the sheet (which wins due to !important specificity). */
        .sankofa-bird-rig[data-landing="slowflap"] .sankofa-bird-tail {
          animation: sankofa-tail-fan 1.0s ease-in-out infinite;
        }
        @keyframes sankofa-tail-fan {
          /* Tail opens wide (air-brake) then partially closes on each cycle */
          0%,100% { transform: scaleX(1.35) rotate(var(--tail-bend, 0deg)); }
          50%     { transform: scaleX(1.15) rotate(var(--tail-bend, 0deg)); }
        }

        /* ══ Chest / body iridescence at high zoom ═══════════════════════════
           Doc: "At street level: individual feathers gleaming in sunlight."
           At zoom ≥ 15 (data-zoom="high") the chest and neck get a subtle
           hue-shift animation — not as dramatic as the wings but enough to give
           the body a living shimmer quality.
           Cycle is deliberately out of phase with wing iridescence (4.1s vs 3.2s)
           so chest and wings never peak at the same moment — organic variation. */
        .sankofa-bird-rig[data-zoom="high"] .sankofa-bird-chest ,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-bird-chest {
          animation-duration: calc(var(--flap-period, 1400ms) * 2.2) !important;
          filter: hue-rotate(calc(var(--heading-deg, 0deg) * 0.08)) saturate(1.25);
          transition: filter 0.7s ease-out;
        }

        /* ══ Second egg orbit particle ═══════════════════════════════════════
           Rotates counter-clockwise at 7.8s (vs orbit-a clockwise at 5.6s).
           The two speeds create an interference pattern — they align and diverge
           periodically, giving the internal swirl an organic, non-mechanical feel.
           "Like polished jade: glow comes from inside." — vision doc. */
        .sankofa-bird-rig[data-celebrating="true"] .sankofa-egg-orbit-b,
        .sankofa-bird-rig[data-donated="true"] .sankofa-egg-orbit-b {
          opacity: 0.75 !important;
          animation: sankofa-egg-orbit-reverse 1.35s linear infinite !important;
        }
        .sankofa-bird-rig[data-flying="true"][data-celebrating="false"][data-donated="false"] .sankofa-egg-orbit-b {
          opacity: 0.12 !important;
          animation: sankofa-egg-orbit-reverse 7.8s linear infinite !important;
        }
        @keyframes sankofa-egg-orbit-reverse {
          from { transform: rotate(360deg); }
          to   { transform: rotate(0deg); }
        }

        /* ══ Wing-tip feather glow enhancement while helping ═════════════════
           When actively flying (navigating), primary feather tips get an
           elevated glow at mid+ zoom — reinforcing the "warm golden sparkles
           mixed with teal" helping visual from the doc.
           Only on outer primaries (l1/r1) to avoid GPU overload. */
        .sankofa-bird-rig[data-flying="true"][data-celebrating="false"][data-donated="false"][data-zoom="mid"] .sankofa-feather-l1,
        .sankofa-bird-rig[data-flying="true"][data-celebrating="false"][data-donated="false"][data-zoom="mid"] .sankofa-feather-r1 {
          filter: drop-shadow(0 0 1.2px rgba(0, 212, 255, 0.5));
        }

        /* Duplicate iris-alert rule removed: the consolidated 1.8s x2
           declaration in the primary notification block above is authoritative.
           Two identical selectors at equal specificity: last wins (silent clobber). */

        /* ══ Wing-joint shoulder highlights ══════════════════════════════════
           Appear at mid zoom; brighten at high zoom with a subtle pulse
           that syncs to the breathing cycle. Hidden at low zoom — too small. */
        .sankofa-bird-rig[data-zoom="mid"] .sankofa-wing-joint {
          opacity: 0.38;
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-wing-joint ,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-wing-joint {
          opacity: 0.55;
          animation: sankofa-joint-shimmer 3.8s ease-in-out infinite;
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-wing-joint-right ,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-wing-joint-right {
          animation-delay: 0.8s; /* out of phase with left for organic feel */
        }
        @keyframes sankofa-joint-shimmer {
          0%,100% { opacity: 0.50; }
          45%     { opacity: 0.75; }
        }

        /* ══ Beak gloss ══════════════════════════════════════════════════════
           Tiny specular dot on upper beak culmen — matches eye-glint treatment.
           Mid zoom: subtle; high zoom: clearly visible as a wet-beak cue. */
        .sankofa-bird-rig[data-zoom="mid"] .sankofa-beak-gloss {
          opacity: 0.40;
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-beak-gloss ,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-beak-gloss {
          opacity: 0.65;
        }

        /* ══ Body micro-feather texture ══════════════════════════════════════
           Three thin feather-shaped paths on the breast; high zoom only.
           Staggered shimmer (1.6s delay per feather) so they gleam asynchronously
           — organic variation, not a mechanical strobe.
           Doc: "At street level: individual feathers gleaming in sunlight." */
        .sankofa-bird-rig[data-zoom="high"] .sankofa-body-feather-1 ,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-body-feather-1 {
          opacity: 0.18;
          animation: sankofa-body-feather-shimmer-base 4.6s ease-in-out infinite;
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-body-feather-2 ,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-body-feather-2 {
          opacity: 0.22;
          animation: sankofa-body-feather-shimmer-base 4.6s ease-in-out infinite;
          animation-delay: 1.6s;
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-body-feather-3 ,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-body-feather-3 {
          opacity: 0.18;
          animation: sankofa-body-feather-shimmer-base 4.6s ease-in-out infinite;
          animation-delay: 3.2s;
        }
        /* Base feather shimmer -- subtle idle iridescence (renamed to avoid
           conflict with the richer helping-state shimmer at the bottom of Phase 2).
           Using a distinct name so both keyframes coexist without the last-defined-wins
           CSS rule silently overriding this one. */
        @keyframes sankofa-body-feather-shimmer-base {
          0%,100% { opacity: 0.12; filter: none; }
          40%     { opacity: 0.28; filter: brightness(1.35); }
        }

        /* ══ Lower eyelid ════════════════════════════════════════════════════
           Thin nictitating-membrane approximation below the pupil.
           Rises (opacity increases) in sync with the upper eyelid close.
           Timed to the same 7s eye cycle but opens to lower max opacity
           so it reads as a subtle anatomical cue, not a second blink. */
        .sankofa-bird-lower-eyelid {
          animation: sankofa-lower-eyelid 7s ease-in-out infinite;
        }
        @keyframes sankofa-lower-eyelid {
          0%,30%   { opacity: 0; }
          /* Rises slightly as the upper lid closes at ~60% of the cycle */
          58%      { opacity: 0; }
          64%      { opacity: 0.45; } /* partial nictitating sweep */
          70%      { opacity: 0; }
          100%     { opacity: 0; }
        }
        /* Also blinks on notification (in sync with upper eyelid) */
        .sankofa-bird-rig[data-notification="true"] .sankofa-bird-lower-eyelid {
          animation: sankofa-lower-eyelid-alert 1.4s ease-out 3;
        }
        @keyframes sankofa-lower-eyelid-alert {
          0%,100% { opacity: 0; }
          25%     { opacity: 0.5; }
          50%     { opacity: 0; }
        }
        /* LOD: hide at low zoom — too small to register */
        .sankofa-bird-rig[data-zoom="low"] .sankofa-bird-lower-eyelid {
          display: none;
        }

        /* ══ Ambient helping glow — active while navigating ═════════════════
           Doc: "Helping someone: warm golden sparkles mixed with teal."
           Superseded by the new .sankofa-glow-layer rules at the top of the
           CSS (which target the dedicated glow-layer element instead of the chest
           to avoid conflicting with the chest's hue-rotate iridescence filter).
           This section is intentionally left as a comment to track the change. */

        /* ══ Outer tail feathers LOD — outer rectrices visible mid+ zoom ═════
           The far outer tail feathers add fan-breadth at close zoom levels.
           At low zoom they'd be invisible noise; hide them. */
        .sankofa-bird-rig[data-zoom="low"] .sankofa-tail-outer-left,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-tail-outer-right {
          display: none;
        }
        /* During glide/airplane: outer tail feathers spread wider (stream behind) */
        .sankofa-bird-rig[data-speed="airplane"] .sankofa-tail-outer-left {
          transform: rotate(-8deg) translateX(-1.5px);
          transform-box: view-box;
          transform-origin: 14px 34px;
          transition: transform 0.6s ease-out;
        }
        .sankofa-bird-rig[data-speed="airplane"] .sankofa-tail-outer-right {
          transform: rotate(8deg) translateX(1.5px);
          transform-box: view-box;
          transform-origin: 26px 34px;
          transition: transform 0.6s ease-out;
        }
        /* During hover/landing: tail fans open wider (air-brake) */
        .sankofa-bird-rig[data-landing="hover"] .sankofa-tail-outer-left,
        .sankofa-bird-rig[data-landing="slowflap"] .sankofa-tail-outer-left {
          transform: rotate(-5deg) translateX(-0.8px);
          transform-box: view-box;
          transform-origin: 14px 34px;
          transition: transform 0.4s ease-out;
        }
        .sankofa-bird-rig[data-landing="hover"] .sankofa-tail-outer-right,
        .sankofa-bird-rig[data-landing="slowflap"] .sankofa-tail-outer-right {
          transform: rotate(5deg) translateX(0.8px);
          transform-box: view-box;
          transform-origin: 26px 34px;
          transition: transform 0.4s ease-out;
        }

        /* ══════════════════════════════════════════════════════════════════
           PHOTOREALISTIC ENHANCEMENTS — Back, Belly, improved iridescence,
           neck S-curve, enhanced feather cascade physics — July 2026
           ══════════════════════════════════════════════════════════════════ */

        /* ── Back (dorsal body surface) ─────────────────────────────────── */
        /* Design doc: Body → Back. Darker teal overlay on upper body half.
           Hidden at low zoom (too small), visible at mid+, with subtle
           iridescence animation at high zoom that is OPPOSITE PHASE to the
           belly shimmer — back and belly brighten alternately, simulating
           the 3D rotation of the bird in light. */
        .sankofa-bird-rig[data-zoom="mid"] .sankofa-bird-back {
          opacity: 0.20;
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-bird-back ,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-bird-back {
          opacity: 0.28;
          animation: sankofa-back-shimmer 4.8s ease-in-out infinite;
        }
        @keyframes sankofa-back-shimmer {
          /* Opposite phase to breast-sheen: back brightens when chest dims.
             Creates a breathing-light alternation that reads as 3D rotation. */
          0%,100% { opacity: 0.22; filter: brightness(0.85); }
          45%     { opacity: 0.35; filter: brightness(1.15) saturate(1.3); }
        }
        /* Back hidden in battery saver and low zoom */
        .sankofa-bird-rig[data-zoom="low"] .sankofa-bird-back,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-back { opacity: 0 !important; pointer-events: none !important; transition: opacity 0.45s ease-out !important; }
        /* Back turns gold tint while helping */
        .sankofa-bird-rig[data-helping="true"] .sankofa-bird-back {
          fill: hsl(38, 80%, 30%);
          filter: brightness(1.2) hue-rotate(30deg);
        }

        /* ── Belly (ventral body surface) ──────────────────────────────── */
        /* Design doc: Body → Belly. Lighter cream-teal lower body half.
           Anatomically accurate — teal birds have paler undersides.
           Breathing animation: belly expands on inhale (scale Y slightly),
           synced to the chest breathing but with a 0.4s phase offset — the
           chest leads and the belly follows with inertia, like a real torso. */
        .sankofa-bird-rig[data-zoom="mid"] .sankofa-bird-belly {
          opacity: 0.15;
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-bird-belly ,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-bird-belly {
          opacity: 0.22;
          animation: sankofa-belly-breathe 3.8s ease-in-out infinite;
          animation-delay: 0.4s; /* follows chest with inertia */
        }
        @keyframes sankofa-belly-breathe {
          /* transform-box + transform-origin set here so the scaleY anchors at
             the ellipse centre, not the SVG origin — fixes iOS Safari belly
             breathing that otherwise migrates the belly off-axis. */
          0%,100% { opacity: 0.18; transform: scaleY(0.98); transform-box: view-box; transform-origin: center; }
          50%     { opacity: 0.26; transform: scaleY(1.04); transform-box: view-box; transform-origin: center; }
        }
        /* Belly hidden in battery saver and low zoom */
        .sankofa-bird-rig[data-zoom="low"] .sankofa-bird-belly,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-belly { opacity: 0 !important; pointer-events: none !important; transition: opacity 0.45s ease-out !important; }
        /* Belly lightens to warm cream while helping */
        .sankofa-bird-rig[data-helping="true"] .sankofa-bird-belly {
          fill: hsl(45, 65%, 80%);
          filter: brightness(1.1);
        }
        /* Body feather scales 4–11 staggered animation delays for organic shimmer. */
        .sankofa-body-feather-4  { animation-delay: 0.4s !important; }
        .sankofa-body-feather-5  { animation-delay: 0.8s !important; }
        .sankofa-body-feather-6  { animation-delay: 1.2s !important; }
        .sankofa-body-feather-7  { animation-delay: 0.2s !important; }
        .sankofa-body-feather-8  { animation-delay: 0.6s !important; }
        .sankofa-body-feather-9  { animation-delay: 1.0s !important; }
        .sankofa-body-feather-10 { animation-delay: 0.7s !important; }
        .sankofa-body-feather-11 { animation-delay: 1.3s !important; }
        /* Reduced-motion: suppress belly breathing */

        /* ── Enhanced Neck S-curve idle animation ──────────────────────── */
        /* At high zoom, improve the neck idle animation from a simple
           oscillation to a genuine S-curve — head tilts one direction while
           the neck base tilts the other, matching how a real bird's neck
           works as a flexible chain. Only fires at high zoom when idle
           (not flying) to avoid conflicting with the turn-glance animation. */
        .sankofa-bird-rig[data-zoom="high"][data-flying="false"][data-landing="idle"] .sankofa-bird-neck ,
        .sankofa-bird-rig[data-zoom="street"][data-flying="false"][data-landing="idle"] .sankofa-bird-neck {
          animation: sankofa-neck-scurve 5.2s ease-in-out infinite !important;
          transform-box: view-box;
          transform-origin: 18px 16px;
        }
        @keyframes sankofa-neck-scurve {
          /* A 4-phase idle S-curve: center → tilt left → center → tilt right.
             The amplitude is small (±2.5px) so it reads as "looking around"
             rather than a conspicuous mechanical sweep. Each phase has a
             different timing to break the symmetry — organic variation. */
          0%    { transform: rotate(0deg) translateX(0px); }
          18%   { transform: rotate(-3.5deg) translateX(-1.2px); } /* left tilt */
          35%   { transform: rotate(-0.5deg) translateX(-0.3px); } /* settle */
          52%   { transform: rotate(3deg)   translateX(1.0px); }   /* right tilt */
          70%   { transform: rotate(0.5deg) translateX(0.2px); }   /* settle back */
          100%  { transform: rotate(0deg)   translateX(0px); }
        }

        /* ── Improved Iridescence — precise spec colour stops ──────────── */
        /* The design doc specifies: Emerald hsl(160,80%,45%), Turquoise
           hsl(180,100%,50%), Aqua hsl(190,100%,65%), Silver hsl(200,30%,80%),
           Deep Teal hsl(195,90%,38%). The current hue-rotate approach cycles
           through these implicitly. At high zoom, add an explicit multi-stop
           brightness and saturation pulse so the colour transitions are more
           vivid and match the "hummingbird iridescence" spec precisely.
           Left and right wing highlights are phase-offset by 1.2s so the
           two wings never peak simultaneously — organic, not mirrored. */
        .sankofa-bird-rig[data-zoom="high"] .sankofa-bird-wing-left-highlight ,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-bird-wing-left-highlight {
          animation: sankofa-iridescence-enhanced 3.2s ease-in-out infinite !important;
          animation-delay: 0s;
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-bird-wing-right-highlight ,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-bird-wing-right-highlight {
          animation: sankofa-iridescence-enhanced 3.2s ease-in-out infinite !important;
          animation-delay: 1.2s; /* phase-offset: wings shimmer out of sync */
        }
        @keyframes sankofa-iridescence-enhanced {
          /* Colour-stop sequence matching the spec:
             Emerald(160°) → Turquoise(180°) → Aqua(190°) → Silver(200°) → Deep Teal(195°)
             We drive hue-rotate relative to heading-deg so the iridescence
             shifts as the bird turns — a real structural-colour effect. */
          0%   { opacity: 0.22; filter: hue-rotate(calc(var(--heading-deg,0deg)*0.25 - 30deg)) saturate(1.5) brightness(0.90); }
          15%  { opacity: 0.58; filter: hue-rotate(calc(var(--heading-deg,0deg)*0.25 + 0deg))  saturate(2.0) brightness(1.40); } /* Emerald peak */
          30%  { opacity: 0.44; filter: hue-rotate(calc(var(--heading-deg,0deg)*0.25 + 10deg)) saturate(1.8) brightness(1.20); } /* Turquoise */
          48%  { opacity: 0.62; filter: hue-rotate(calc(var(--heading-deg,0deg)*0.25 + 20deg)) saturate(1.9) brightness(1.50); } /* Aqua peak */
          65%  { opacity: 0.30; filter: hue-rotate(calc(var(--heading-deg,0deg)*0.25 + 30deg)) saturate(1.2) brightness(1.05); } /* Silver (muted) */
          80%  { opacity: 0.48; filter: hue-rotate(calc(var(--heading-deg,0deg)*0.25 + 15deg)) saturate(1.7) brightness(1.25); } /* Deep Teal */
          100% { opacity: 0.22; filter: hue-rotate(calc(var(--heading-deg,0deg)*0.25 - 30deg)) saturate(1.5) brightness(0.90); }
        }
        /* At mid zoom: keep the existing simpler iridescence — enhanced version
           only fires at high zoom where the detail is visible. */

        /* ══════════════════════════════════════════════════════════════════
           NEW DESIGN DOC GAPS — added July 2026
           ══════════════════════════════════════════════════════════════════ */

        /* ── @property declarations for new CSS vars ────────────────────── */
        /* --crown-sway: used in crown-feather animation inside @keyframes.
           Registering as <angle> so Safari 15.4+ can interpolate it. */
        @property --crown-sway {
          syntax: '<angle>';
          inherits: true;
          initial-value: 0deg;
        }
        /* --help-shimmer: 0–1 number driving gold shimmer intensity on the
           helping body glow. Distinct from --lighting-factor (directional). */
        @property --help-shimmer {
          syntax: '<number>';
          inherits: true;
          initial-value: 0;
        }

        /* ══ LOD0 / "street" zoom tier (mapZoom ≥ 17) ════════════════════════
           Design doc specifies 4 LOD tiers: LOD0 (full), LOD1, LOD2, LOD3 (minimal).
           "high" (zoom 14-16) maps to LOD1. "street" (zoom ≥ 17) = LOD0: adds the
           wing-bottom surfaces, all body feather scales 4-11, and the wing-joint highlights
           at full opacity. The JS side passes data-zoom="street" when mapZoom >= 17. */
        /* ── Wing-bottom surfaces: idle posture at high & street zoom ─────
           At high zoom (14-16), wing undersides are faintly visible even when
           perched — feather anatomy reads at this scale. Street adds more.
           Flying versions are separate rules further up (0.35 high, 0.48 street). */
        .sankofa-bird-rig[data-zoom="high"] .sankofa-bird-wing-left-btm,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-bird-wing-right-btm {
          opacity: 0.28;
          transition: opacity 0.4s ease;
        }
        .sankofa-bird-rig[data-zoom="street"] .sankofa-bird-wing-left-btm,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-bird-wing-right-btm {
          opacity: 0.4;
          transition: opacity 0.4s ease;
        }
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"] .sankofa-bird-wing-left-btm,
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"] .sankofa-bird-wing-right-btm {
          opacity: 0.48;
        }
        /* ── Body-feather rows 4–11: high zoom (LOD1) ──────────────────────
           Previously these were only active at street zoom (LOD0). At high zoom
           (14–16) the bird is close enough that the extra texture rows should
           appear at slightly lower opacity than the street tier. */
        .sankofa-bird-rig[data-zoom="high"] .sankofa-body-feather-4,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-body-feather-5,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-body-feather-6,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-body-feather-7,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-body-feather-8,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-body-feather-9,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-body-feather-10,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-body-feather-11 {
          opacity: 0.12;
          animation: sankofa-body-feather-shimmer-base 3.8s ease-in-out infinite;
        }
        /* Street (LOD0): fuller opacity + faster shimmer cycle */
        .sankofa-bird-rig[data-zoom="street"] .sankofa-body-feather-4,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-body-feather-5,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-body-feather-6,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-body-feather-7,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-body-feather-8,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-body-feather-9,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-body-feather-10,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-body-feather-11 {
          opacity: 0.18;
          animation: sankofa-body-feather-shimmer-base 2.8s ease-in-out infinite;
        }
        .sankofa-bird-rig[data-zoom="street"] .sankofa-wing-scap { opacity: 0.72; }
        .sankofa-bird-rig[data-zoom="street"] .sankofa-wing-joint { opacity: 0.75 !important; }

        /* ══ CrownFeathers ═════════════════════════════════════════════════════
           Design doc hierarchy: Head → CrownFeathers.
           The teal tuft is the Sankofa bird's most recognisable feature.
           Rendered invisible at low zoom (too small), subtle at mid, animated
           at high zoom — a sway synchronized to the breathing period. */

        /* Mid zoom: feathers appear at subdued opacity — silhouette reads */
        .sankofa-bird-rig[data-zoom="mid"] .sankofa-crown-feather {
          opacity: 0.55;
        }
        /* High zoom: feathers fully visible + gentle sway animation */
        .sankofa-bird-rig[data-zoom="high"] .sankofa-crown-feather ,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-crown-feather {
          opacity: 0.88;
          animation: sankofa-crown-sway 3.6s ease-in-out infinite;
        }
        /* Per-feather delays so the 5-feather fan has a wave / ripple effect
           instead of all feathers moving in perfect unison:
           crown-4 (far-left) leads, crown-5 (far-right) trails most. */
        .sankofa-bird-rig[data-zoom="high"] .sankofa-crown-feather-4 ,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-crown-feather-4 {
          animation-delay: 0s; animation-duration: 3.2s; opacity: 0.68;
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-crown-feather-1 ,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-crown-feather-1 {
          animation-delay: 0.2s;
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-crown-feather-2 ,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-crown-feather-2 {
          animation-delay: 0.5s; /* centre peak — most prominent */
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-crown-feather-3 ,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-crown-feather-3 {
          animation-delay: 0.8s;
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-crown-feather-5 ,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-crown-feather-5 {
          animation-delay: 1.1s; animation-duration: 4.0s; opacity: 0.78;
        }
        /* Mid zoom: crown-4/5 also visible at reduced opacity (silhouette hint) */
        .sankofa-bird-rig[data-zoom="mid"] .sankofa-crown-feather-4 {
          opacity: 0.35;
        }
        .sankofa-bird-rig[data-zoom="mid"] .sankofa-crown-feather-5 {
          opacity: 0.45;
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-crown-feather-1 ,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-crown-feather-1 {
          animation-delay: 0s;
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-crown-feather-2 ,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-crown-feather-2 {
          animation-delay: 0.22s;   /* central feather leads */
          opacity: 0.95;            /* brightest — catches most light */
          animation: sankofa-crown-sway 3.6s ease-in-out infinite;
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-crown-feather-3 ,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-crown-feather-3 {
          animation-delay: 0.44s;
          animation: sankofa-crown-sway 3.6s ease-in-out infinite;
        }
        @keyframes sankofa-crown-sway {
          /* Gentle rocking — wind through the crest. The leading feather
             peaks first and the outer ones trail, mimicking real feather physics:
             tip is lighter, moves more freely, returns later. */
          0%,100% { transform: rotate(0deg); }
          20%     { transform: rotate(-2.5deg); }
          55%     { transform: rotate(2deg); }
          80%     { transform: rotate(-1deg); }
        }
        /* Idle: crown feathers droop very slightly (relaxed posture) */
        .sankofa-bird-rig[data-landing="idle"][data-zoom="high"] .sankofa-crown-feather,
        .sankofa-bird-rig[data-landing="idle"][data-zoom="street"] .sankofa-crown-feather {
          animation: sankofa-crown-droop 5.0s ease-in-out infinite;
        }
        @keyframes sankofa-crown-droop {
          0%,100% { transform: rotate(0deg); }
          35%     { transform: rotate(-3.5deg); } /* droop on exhale */
          70%     { transform: rotate(0.5deg); }  /* micro-lift */
        }
        /* Notification: crown feathers spike upward — "feathers stand on end" */
        .sankofa-bird-rig[data-notification="true"][data-zoom="high"] .sankofa-crown-feather,
        .sankofa-bird-rig[data-notification="true"][data-zoom="street"] .sankofa-crown-feather {
          animation: sankofa-crown-alert 0.45s ease-out 3 !important;
        }
        @keyframes sankofa-crown-alert {
          0%   { transform: rotate(0deg) scaleY(1); }
          25%  { transform: rotate(-5deg) scaleY(1.18); } /* spike up, flare left */
          60%  { transform: rotate(3deg) scaleY(1.1); }  /* recoil */
          100% { transform: rotate(0deg) scaleY(1); }
        }
        /* Celebration: crown feathers fan out triumphantly */
        .sankofa-bird-rig[data-celebrating="true"][data-zoom="high"] .sankofa-crown-feather,
        .sankofa-bird-rig[data-celebrating="true"][data-zoom="street"] .sankofa-crown-feather {
          animation: sankofa-crown-fan 0.55s ease-in-out infinite !important;
        }
        @keyframes sankofa-crown-fan {
          0%,100% { transform: rotate(0deg) scaleY(1); }
          50%     { transform: rotate(-6deg) scaleY(1.22); }
        }
        /* LOD: hidden at low zoom */
        .sankofa-bird-rig[data-zoom="low"] .sankofa-crown-feather {
          display: none !important;
        }
        /* Reduced motion: suppress crown animations */

        /* ══ isHelping — dedicated gold shimmer body state ═══════════════════
           Design doc: "Helping someone: Warm golden sparkles mixed with teal.
           The bird radiates warmth — it's on a mission of community care."
           
           Distinct from:
             celebrating → teal burst (request COMPLETED)
             donated     → egg glow (pledge PAID)
           This state is: actively en-route / accepted request / actively helping.
           
           Implementation: a warm-gold drop-shadow halo pulses on the body, the
           wing highlights hue-shift toward gold (not the usual teal iridescence),
           and the trail gets a stronger warm tint. The egg carries a steady gold
           inner light reinforcing the "carrying the future" symbolism. */

        /* Body: warm golden ambient halo while helping */
        .sankofa-bird-rig[data-helping="true"][data-celebrating="false"][data-donated="false"] .sankofa-bird-body {
          filter: drop-shadow(0 0 4px rgba(255, 190, 40, 0.45))
                  drop-shadow(0 0 10px rgba(255, 165, 0, 0.18));
          animation: sankofa-helping-shimmer 2.0s ease-in-out infinite;
          transition: filter 0.8s ease-out;
        }
        @keyframes sankofa-helping-shimmer {
          /* Breathes like the normal idle shimmer but with warm gold accent */
          0%,100% { filter: drop-shadow(0 0 3px rgba(255, 190, 40, 0.35))
                            drop-shadow(0 0 8px rgba(255, 165, 0, 0.12)); }
          50%     { filter: drop-shadow(0 0 7px rgba(255, 200, 50, 0.60))
                            drop-shadow(0 0 18px rgba(255, 170, 20, 0.28)); }
        }
        /* Wings: iridescence tilts warm-gold while helping — hue-shift toward amber */
        .sankofa-bird-rig[data-helping="true"][data-celebrating="false"][data-zoom="mid"] .sankofa-bird-wing-left-highlight,
        .sankofa-bird-rig[data-helping="true"][data-celebrating="false"][data-zoom="mid"] .sankofa-bird-wing-right-highlight,
        .sankofa-bird-rig[data-helping="true"][data-celebrating="false"][data-zoom="high"] .sankofa-bird-wing-left-highlight,
        .sankofa-bird-rig[data-helping="true"][data-celebrating="false"][data-zoom="high"] .sankofa-bird-wing-right-highlight,
        .sankofa-bird-rig[data-helping="true"][data-celebrating="false"][data-zoom="street"] .sankofa-bird-wing-left-highlight,
        .sankofa-bird-rig[data-helping="true"][data-celebrating="false"][data-zoom="street"] .sankofa-bird-wing-right-highlight {
          animation: sankofa-helping-wing-shimmer 2.4s ease-in-out infinite !important;
        }
        @keyframes sankofa-helping-wing-shimmer {
          /* Gold → teal → amber iridescence cycle — warmer than standard teal shimmer */
          0%   { opacity: 0.28; filter: hue-rotate(calc(var(--heading-deg, 0deg) * 0.25 + 30deg)) saturate(1.4) brightness(1.1); }
          22%  { opacity: 0.55; filter: hue-rotate(calc(var(--heading-deg, 0deg) * 0.25 + 60deg)) saturate(1.7) brightness(1.3); }
          48%  { opacity: 0.38; filter: hue-rotate(calc(var(--heading-deg, 0deg) * 0.25 - 10deg)) saturate(1.2) brightness(1.05); }
          70%  { opacity: 0.62; filter: hue-rotate(calc(var(--heading-deg, 0deg) * 0.25 + 45deg)) saturate(1.6) brightness(1.25); }
          100% { opacity: 0.28; filter: hue-rotate(calc(var(--heading-deg, 0deg) * 0.25 + 30deg)) saturate(1.4) brightness(1.1); }
        }
        /* Trail: stronger warm-gold tint while helping (replaces the default flying tint) */
        .sankofa-bird-rig[data-helping="true"][data-celebrating="false"][data-donated="false"] .sankofa-trail {
          background: linear-gradient(
            135deg,
            hsl(45, 90%, 65%) 0%,
            hsl(190, 100%, 60%) 55%,
            hsl(45, 80%, 70%) 100%
          ) !important;
          opacity: 0.72;
        }
        /* Glow layer: gold tint while helping (replaces the usual teal helper ambient) */
        .sankofa-bird-rig[data-helping="true"][data-celebrating="false"][data-donated="false"] .sankofa-glow-layer {
          fill: hsl(45, 95%, 58%);
          animation: sankofa-helping-glow 2.2s ease-in-out infinite !important;
        }
        @keyframes sankofa-helping-glow {
          0%,100% { opacity: 0.08; }
          50%     { opacity: 0.22; }
        }
        /* Egg: steady warm-gold glow while helping — "carrying the future" symbolism */
        .sankofa-bird-rig[data-helping="true"][data-celebrating="false"][data-donated="false"] .sankofa-bird-egg {
          filter: drop-shadow(0 0 2px rgba(255, 190, 40, 0.55))
                  drop-shadow(0 0 5px rgba(255, 160, 0, 0.30));
          animation: sankofa-helping-egg-glow 3.0s ease-in-out infinite;
        }
        @keyframes sankofa-helping-egg-glow {
          0%,100% { filter: drop-shadow(0 0 1.5px rgba(255, 185, 35, 0.45)); }
          50%     { filter: drop-shadow(0 0 4px rgba(255, 195, 50, 0.70)); }
        }
        /* Crown feathers tinge gold while helping at high/street zoom */
        .sankofa-bird-rig[data-helping="true"][data-zoom="high"] .sankofa-crown-feather,
        .sankofa-bird-rig[data-helping="true"][data-zoom="street"] .sankofa-crown-feather {
          filter: hue-rotate(30deg) saturate(1.4);
        }

        /* ══ Stretch animation — periodic idle wing stretch ══════════════════
           Design doc animation state: "Stretch — the bird periodically extends
           both wings to their full span then folds them back."
           Fires during idle: data-landing="idle" AND data-flying="false".
           Period is 14s with a 2s stretch window and a 0.8s settle, so it
           happens infrequently enough to feel organic (not mechanical).
           Stagger left vs right by 80ms — real birds have micro-asymmetry. */
        .sankofa-bird-rig[data-landing="idle"][data-flying="false"] .sankofa-bird-wing-left {
          animation: sankofa-idle-stretch-left 14s ease-in-out infinite;
          transform-box: view-box;
          transform-origin: 20px 18px;
        }
        .sankofa-bird-rig[data-landing="idle"][data-flying="false"] .sankofa-bird-wing-right {
          animation: sankofa-idle-stretch-right 14s ease-in-out infinite;
          animation-delay: -0.08s; /* slight right-wing lag — realism asymmetry */
          transform-box: view-box;
          transform-origin: 20px 18px;
        }
        @keyframes sankofa-idle-stretch-left {
          /* 0–71%: normal idle flap. 71–85%: wings sweep out to full span.
             85–92%: hold. 92–100%: settle back. */
          0%,14%  { transform: rotate(15deg); }     /* resting fold */
          7%       { transform: rotate(-15deg); }   /* idle flap bottom */
          71%,72%  { transform: rotate(15deg); }    /* last normal flap top */
          82%      { transform: rotate(-48deg); }   /* FULL STRETCH — maximum span */
          88%,91%  { transform: rotate(-44deg); }   /* hold briefly */
          100%     { transform: rotate(15deg); }    /* fold back to rest */
        }
        @keyframes sankofa-idle-stretch-right {
          0%,14%  { transform: rotate(-15deg); }
          7%       { transform: rotate(15deg); }
          71%,72%  { transform: rotate(-15deg); }
          82%      { transform: rotate(48deg); }
          88%,91%  { transform: rotate(44deg); }
          100%     { transform: rotate(-15deg); }
        }
        /* Feather tips also stretch outward during the idle stretch */
        .sankofa-bird-rig[data-landing="idle"][data-flying="false"] .sankofa-bird-wing-left-feathers {
          animation: sankofa-idle-stretch-left 14s ease-in-out infinite;
          animation-delay: calc(var(--flap-period, 1400ms) * 0.08);
          transform-box: view-box;
          transform-origin: 20px 18px;
        }
        .sankofa-bird-rig[data-landing="idle"][data-flying="false"] .sankofa-bird-wing-right-feathers {
          animation: sankofa-idle-stretch-right 14s ease-in-out infinite;
          animation-delay: calc(var(--flap-period, 1400ms) * 0.08 + 80ms);
          transform-box: view-box;
          transform-origin: 20px 18px;
        }

        /* ══ batterySaver — LOD3 minimal silhouette mode ═════════════════════
           Design doc: "LOD3 — Minimal silhouette."
           When batterySaver=true, nearly all GPU-intensive effects are disabled.
           The bird is still recognisable as a teal Sankofa silhouette that
           breathes (gentle float) but has no iridescence, feather shimmer,
           orbit particles, glow layers, or micro-reaction animations.
           This respects the "accessibility settings" and "low battery"
           use-cases called out in the design doc. */

        /* LOD3: hide all non-essential detail elements with a graceful fade.
           Using opacity:0 + pointer-events:none instead of display:none so both
           ENTRY and EXIT transitions are smooth (display:none cannot be transitioned).
           Animations are suppressed separately below so GPU cost is still minimal.
           P7.5 sankofa-lod3-enter dims the whole rig to mask child opacity changes. */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-left-feathers,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-right-feathers,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-left-highlight,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-right-highlight,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-legs,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-shadow,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-crown-feather,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-wing-joint,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-beak-gloss,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-body-feather-1,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-body-feather-2,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-body-feather-3,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-body-feather-4,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-body-feather-5,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-body-feather-6,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-body-feather-7,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-body-feather-8,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-body-feather-9,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-body-feather-10,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-body-feather-11,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-chirp-ring-1,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-chirp-ring-2,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-idle-dust,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-egg-orbit,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-egg-ripple,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-glow-layer,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-breast-sheen,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-iris,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-eye-catchlight,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-eyelid,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-lower-eyelid {
          opacity: 0 !important;
          pointer-events: none !important;
          transition: opacity 0.45s ease-out !important;
        }

        /* LOD3: suppress all animations on visible parts — just float.
           Bug fix: filter fades in 0.5s (not instant) so entering battery-saver
           is a gentle wash-out rather than an abrupt pop. Transform transitions
           are instant (0s) since the float animation handles the motion. */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-tail,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-neck,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-head,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-eye,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-beak-lower {
          animation: none !important;
          filter: none !important;
          transition: filter 0.5s ease-out, transform 0s !important;
        }
        /* LOD3: wings still flap (at idle rate) so the bird looks alive, but
           no differential banking or feather physics */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-left {
          animation: sankofa-flap 1400ms ease-in-out infinite !important;
          filter: none !important;
          transition: filter 0.5s ease-out !important;
        }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-right {
          animation: sankofa-flap-right 1418ms ease-in-out infinite !important;
          filter: none !important;
          transition: filter 0.5s ease-out !important;
        }
        /* LOD3: body just floats, no lean/glide effects */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-body,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-chest {
          animation: sankofa-float 1400ms ease-in-out infinite !important;
          filter: none !important;
          transform: none !important;
          transition: filter 0.5s ease-out, transform 0s !important;
        }
        /* LOD3: egg still shows but without glow/orbit */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-egg {
          animation: none !important;
          filter: none !important;
          transition: filter 0.5s ease-out !important;
        }
        /* LOD3: suppress trail and all particles */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-trail,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-particle,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-golden-sparkle {
          display: none !important;
        }
        /* LOD3: no iridescence on wing bodies — fade filter out smoothly */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-right {
          filter: none !important;
          transition: filter 0.5s ease-out !important;
        }

        /* ══ Reduced motion — gated on html:not([data-bird-anim="enabled"]) ══
           Users can override via Profile → Settings → Accessibility.
           CSS nesting (supported Chrome 112+, Safari 16.5+, Firefox 117+)
           implicitly prepends html:not([data-bird-anim="enabled"]) to every
           descendant selector so the entire block is skipped when the attr
           is present on <html>. */
        @media (prefers-reduced-motion: reduce) {
          html:not([data-bird-anim="enabled"]) {
            .sankofa-feather-l5, .sankofa-feather-r5,
            .sankofa-feather-l0, .sankofa-feather-r0,
            .sankofa-feather-l4, .sankofa-feather-r4,
            .sankofa-feather-ls3, .sankofa-feather-rs3,
            .sankofa-wing-scap, .sankofa-bird-wing-left-btm, .sankofa-bird-wing-right-btm,
            .sankofa-tail-far-left, .sankofa-tail-far-right,
            .sankofa-crown-feather-4, .sankofa-crown-feather-5,
            .sankofa-bird-rig .sankofa-bird-body,
            .sankofa-bird-wing-left, .sankofa-bird-wing-right,
            .sankofa-bird-wing-left-feathers, .sankofa-bird-wing-right-feathers,
            .sankofa-bird-wing-left-highlight, .sankofa-bird-wing-right-highlight,
            .sankofa-bird-tail, .sankofa-bird-eye, .sankofa-bird-neck,
            .sankofa-bird-head, .sankofa-bird-egg, .sankofa-particle,
            .sankofa-bird-legs, .sankofa-trail, .sankofa-heart-pulse,
            .sankofa-golden-sparkle, .sankofa-bird-chest, .sankofa-egg-orbit,
            .sankofa-bird-eye-catchlight, .sankofa-bird-eyelid, .sankofa-bird-iris,
            .sankofa-bird-lower-eyelid,
            /* Secondary and covert feather layers — must be listed explicitly or
               their animation-duration overrides above will still fire. */
            .sankofa-feather-ls1, .sankofa-feather-ls2, .sankofa-feather-lc1,
            .sankofa-feather-rs1, .sankofa-feather-rs2, .sankofa-feather-rc1,
            /* Dust motes — listed both by shared class and per-tier class to
               guarantee suppression regardless of which CSS rule activates them */
            .sankofa-idle-dust, .sankofa-dust-1, .sankofa-dust-2, .sankofa-dust-3,
            .sankofa-egg-ripple,
            /* Reaction + landing elements */
            .sankofa-bird-beak-lower, .sankofa-egg-orbit-a, .sankofa-egg-orbit-b,
            .sankofa-bird-rig[data-landing="perch"],
            /* New photorealistic detail elements */
            .sankofa-wing-joint, .sankofa-beak-gloss,
            .sankofa-body-feather-1, .sankofa-body-feather-2, .sankofa-body-feather-3,
            .sankofa-body-feather-4, .sankofa-body-feather-5, .sankofa-body-feather-6,
            .sankofa-body-feather-7, .sankofa-body-feather-8, .sankofa-body-feather-9,
            .sankofa-body-feather-10, .sankofa-body-feather-11,
            .sankofa-chirp-ring-1, .sankofa-chirp-ring-2,
            /* Idle head wander, outer tail feathers */
            .sankofa-tail-outer-left, .sankofa-tail-outer-right,
            /* Glow layer and breast sheen — suppress animation + opacity change */
            .sankofa-glow-layer, .sankofa-breast-sheen {
              animation: none !important;
              filter: none !important;
              transition: none !important;
              opacity: 0 !important;
            }
            /* Breast sheen: restore static opacity for reduced-motion users */
            .sankofa-breast-sheen {
              opacity: 0.22 !important;
            }
            /* Crown feathers: suppress sway animations, keep static opacity */
            .sankofa-crown-feather {
              animation: none !important;
            }
            /* Back/Belly: suppress shimmer and breathing under reduced-motion */
            .sankofa-bird-back,
            .sankofa-bird-belly {
              animation: none !important;
              filter: none !important;
            }
            /* Enhanced neck S-curve: fall back to no animation */
            .sankofa-bird-rig[data-zoom="high"][data-flying="false"][data-landing="idle"] .sankofa-bird-neck,
            .sankofa-bird-rig[data-zoom="street"][data-flying="false"][data-landing="idle"] .sankofa-bird-neck {
              animation: none !important;
            }
            /* Enhanced iridescence: fall back to zero opacity */
            .sankofa-bird-rig[data-zoom="high"] .sankofa-bird-wing-left-highlight,
            .sankofa-bird-rig[data-zoom="high"] .sankofa-bird-wing-right-highlight,
            .sankofa-bird-rig[data-zoom="street"] .sankofa-bird-wing-left-highlight,
            .sankofa-bird-rig[data-zoom="street"] .sankofa-bird-wing-right-highlight {
              animation: none !important;
              opacity: 0 !important;
            }
            /* Suppress body/tail/neck glow filters under reduced-motion */
            .sankofa-bird-rig[data-celebrating="true"] .sankofa-bird-body,
            .sankofa-bird-rig[data-donated="true"] .sankofa-bird-body,
            .sankofa-bird-rig[data-helping="true"] .sankofa-bird-body,
            .sankofa-bird-rig[data-zoom="high"] .sankofa-bird-tail,
            .sankofa-bird-rig[data-zoom="street"] .sankofa-bird-tail,
            .sankofa-bird-rig[data-notification="true"] .sankofa-bird-neck {
              animation: none !important;
              filter: none !important;
            }
            /* Suppress idle stretch animation: fall back to basic flap */
            .sankofa-bird-rig[data-landing="idle"][data-flying="false"] .sankofa-bird-wing-left,
            .sankofa-bird-rig[data-landing="idle"][data-flying="false"] .sankofa-bird-wing-right,
            .sankofa-bird-rig[data-landing="idle"][data-flying="false"] .sankofa-bird-wing-left-feathers,
            .sankofa-bird-rig[data-landing="idle"][data-flying="false"] .sankofa-bird-wing-right-feathers {
              animation: sankofa-flap 1400ms ease-in-out infinite !important;
            }
            /* Suppress approach-descent rig animation — the rig itself carries
               animation: sankofa-approach-descent when data-approaching="true".
               This is NOT covered by the generic per-part suppressions above
               (those target child elements, not the rig element itself). */
            .sankofa-bird-rig[data-approaching="true"] {
              animation: none !important;
            }
            /* Disable shadow morph and ground-ring pulse for motion-sensitive users */
            .sankofa-bird-shadow {
              transition: none !important;
            }
            .animate-ping {
              animation: none !important;
            }
            /* Suppress new cinematic enhancements under reduced-motion */
            .sankofa-chirp-ring-1, .sankofa-chirp-ring-2 {
              animation: none !important;
              opacity: 0 !important;
            }
            .sankofa-bird-rig[data-donated="true"] .sankofa-bird-body {
              animation: none !important;
            }
          }
        }

        /* ══════════════════════════════════════════════════════════════════
           CINEMATIC ENHANCEMENTS — July 2026
           Per-primary feather cascade physics, airplane micro-turbulence,
           wing-root banking flex, LOD0 individual feather iridescence.
           ══════════════════════════════════════════════════════════════════ */

        /* ── Per-primary feather cascade at high/street zoom ─────────────────
           Design doc: "Primary → Secondary lag → Body catches up."
           At LOD1 (high, zoom 14-16) and LOD0 (street, ≥17), each primary
           feather fires its animation at a staggered delay fraction of
           --flap-period, creating a visible tip-to-root ripple through the fan.
           Cascade order: l5/r5 (extreme tips, lead) → l0/r0 → l1/r1 → l2/r2
           → l3/r3 → l4/r4 → ls1/rs1 → ls2/rs2 → ls3/rs3 → lc1/rc1 (root, trails).
           At low/mid zoom this detail is invisible noise — suppress it there by
           keeping the simpler global class rules that fire without data-zoom. */
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-l5,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-l5,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-r5,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-r5 {
          /* Extreme tip: no delay — leads the cascade */
          animation-delay: calc(var(--flap-period, 1400ms) * 0.00) !important;
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-l0,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-l0,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-r0,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-r0 {
          animation-delay: calc(var(--flap-period, 1400ms) * 0.04) !important;
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-l1,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-l1,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-r1,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-r1 {
          animation-delay: calc(var(--flap-period, 1400ms) * 0.09) !important;
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-l2,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-l2,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-r2,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-r2 {
          animation-delay: calc(var(--flap-period, 1400ms) * 0.14) !important;
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-l3,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-l3,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-r3,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-r3 {
          animation-delay: calc(var(--flap-period, 1400ms) * 0.18) !important;
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-l4,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-l4,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-r4,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-r4 {
          /* Inner primary: most inertia, trails l3 by one step */
          animation-delay: calc(var(--flap-period, 1400ms) * 0.22) !important;
        }
        /* Secondary feathers: 27-36% lag behind outermost primary */
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-ls1,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-ls1,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-rs1,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-rs1 {
          animation-delay: calc(var(--flap-period, 1400ms) * 0.27) !important;
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-ls2,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-ls2,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-rs2,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-rs2 {
          animation-delay: calc(var(--flap-period, 1400ms) * 0.32) !important;
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-ls3,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-ls3,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-rs3,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-rs3 {
          animation-delay: calc(var(--flap-period, 1400ms) * 0.36) !important;
        }
        /* Covert layer: deepest in stack, trails most — 40% of flap period */
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-lc1,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-lc1,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-feather-rc1,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-rc1 {
          animation-delay: calc(var(--flap-period, 1400ms) * 0.40) !important;
        }

        /* ── Airplane micro-turbulence — tip flutter at extreme speed ─────────
           At airplane speed (> 50 m/s), aerodynamic pressure causes rapid flutter
           on the extreme outer primaries (l5/r5, l0/r0). This is an opacity-based
           flutter (not transform, which would conflict with existing flap/bank
           animations) — the tips appear to shiver in the slipstream.
           Only on the 4 outermost primaries (lowest mass, most susceptible). */
        .sankofa-bird-rig[data-speed="airplane"] .sankofa-feather-l5,
        .sankofa-bird-rig[data-speed="airplane"] .sankofa-feather-r5 {
          animation: sankofa-tip-flutter 0.15s ease-in-out infinite !important;
        }
        .sankofa-bird-rig[data-speed="airplane"] .sankofa-feather-l0,
        .sankofa-bird-rig[data-speed="airplane"] .sankofa-feather-r0 {
          animation: sankofa-tip-flutter 0.18s ease-in-out infinite !important;
          animation-delay: 0.04s;
        }
        @keyframes sankofa-tip-flutter {
          /* Rapid opacity jitter simulating aero-elastic tip flutter at speed */
          0%,100% { opacity: 0.85; }
          33%     { opacity: 0.55; }
          66%     { opacity: 0.72; }
        }

        /* ── Wing-root banking flex ─────────────────────────────────────────
           When banking, the scapular shoulder feathers (wing-root junction)
           flex under aerodynamic load: the inner wing compresses slightly while
           the outer wing extends. This "differential flex" is what makes a real
           bird's bank look alive vs mechanical. We drive it with a CSS
           transition on the scap elements tied to the --lean-deg var.
           Using transition (not animation) so it responds instantly to bank
           direction changes from the JS bankDeg → CSS variable pipeline. */
        .sankofa-wing-scap {
          transition: transform 0.35s ease-out, opacity 0.4s ease;
        }
        /* Banking left: left scapulars compress (translate slightly inward),
           right scapulars extend (translate slightly outward). */
        .sankofa-bird-rig[data-zoom="high"] .sankofa-wing-scap-l1,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-wing-scap-l1,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-wing-scap-l2,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-wing-scap-l2 {
          /* The flex is driven by the bird's bank — since bankDeg is applied
             as an inline style transform on the rig, the scap sub-transform
             provides a consistent visual of compressed vs extended root.
             The subtle rotate(±1.5deg) is enough at the SVG's 40×40 scale. */
          transform-box: view-box;
          transform-origin: 19px 16.5px;
          transition: transform 0.35s ease-out;
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-wing-scap-r1,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-wing-scap-r1,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-wing-scap-r2,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-wing-scap-r2 {
          transform-box: view-box;
          transform-origin: 21px 16.5px;
          transition: transform 0.35s ease-out;
        }

        /* ── LOD0 (street) individual feather micro-iridescence ──────────────
           At zoom ≥ 17 (street/LOD0), each primary feather tip gets its own
           micro-hue-rotate driven by --heading-deg. The outer primaries shift
           more (they catch more light at oblique angles); inner primaries shift
           less. This creates a spectral "rainbow fan" that shifts as the bird
           turns — the hummingbird structural-colour effect at full resolution.
           Combined selector syntax avoids clobbering the existing drop-shadow
           glow rules at [data-zoom="high|street"] .sankofa-feather-l1 etc. */
        .sankofa-bird-rig[data-zoom="street"][data-flying="true"] .sankofa-feather-l5,
        .sankofa-bird-rig[data-zoom="street"][data-flying="true"] .sankofa-feather-r5 {
          filter: hue-rotate(calc(var(--heading-deg, 0deg) * 0.55)) saturate(1.4) brightness(1.1);
        }
        .sankofa-bird-rig[data-zoom="street"][data-flying="true"] .sankofa-feather-l0,
        .sankofa-bird-rig[data-zoom="street"][data-flying="true"] .sankofa-feather-r0 {
          filter: hue-rotate(calc(var(--heading-deg, 0deg) * 0.45)) saturate(1.35) brightness(1.08);
        }
        .sankofa-bird-rig[data-zoom="street"][data-flying="true"] .sankofa-feather-l1,
        .sankofa-bird-rig[data-zoom="street"][data-flying="true"] .sankofa-feather-r1 {
          filter: drop-shadow(0 0 1.5px rgba(0, 212, 255, 0.7))
                  hue-rotate(calc(var(--heading-deg, 0deg) * 0.35)) saturate(1.3);
        }
        .sankofa-bird-rig[data-zoom="street"][data-flying="true"] .sankofa-feather-l2,
        .sankofa-bird-rig[data-zoom="street"][data-flying="true"] .sankofa-feather-r2 {
          filter: drop-shadow(0 0 1px rgba(0, 212, 255, 0.5))
                  hue-rotate(calc(var(--heading-deg, 0deg) * 0.25)) saturate(1.2);
        }
        .sankofa-bird-rig[data-zoom="street"][data-flying="true"] .sankofa-feather-l3,
        .sankofa-bird-rig[data-zoom="street"][data-flying="true"] .sankofa-feather-r3 {
          filter: hue-rotate(calc(var(--heading-deg, 0deg) * 0.18)) saturate(1.15);
        }
        /* Coverts at street level: subtle iridescence, no glow (too deep in wing) */
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-ls1,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-feather-rs1 {
          filter: hue-rotate(calc(var(--heading-deg, 0deg) * 0.12)) saturate(1.1);
          opacity: 0.68;
        }

        /* ── Egg ripple on donation (gold ring vs teal for celebrating) ───────
           The standard egg-ripple-out keyframe is teal. For donated, we want
           a gold ring instead. Override the stroke colour via a wrapper rule. */
        .sankofa-bird-rig[data-donated="true"] .sankofa-egg-ripple {
          stroke: hsl(45, 95%, 72%) !important;
          animation: sankofa-egg-ripple-out 1.1s ease-out 4;
        }

        /* ── Shadow celebration pulse ─────────────────────────────────────────
           Ground shadow expands when celebrating — amplifies the "burst" energy
           of the particle explosion above. Subtle (1.0 → 1.18 scaleX) so it
           reads as a shadow flare, not a shape change. */
        .sankofa-bird-rig[data-celebrating="true"] .sankofa-bird-shadow {
          animation: sankofa-shadow-celebrate 0.9s ease-out 2;
        }
        @keyframes sankofa-shadow-celebrate {
          0%,100% { transform: scaleX(1.0);  opacity: 0.12; }
          40%     { transform: scaleX(1.22); opacity: 0.22; }
        }

        /* ── Idle neck wander: head bobs asymmetrically ──────────────────────
           The existing neck-scurve runs at high+street zoom (data-landing="idle",
           data-flying="false"). At mid zoom we add a simpler, less detailed
           head wander — just a gentle translate so the bird doesn't look frozen
           at zoom 10–13 where the neck scurve is suppressed. */
        .sankofa-bird-rig[data-zoom="mid"][data-flying="false"][data-landing="idle"] .sankofa-bird-neck {
          animation: sankofa-neck-mid-wander 6.8s ease-in-out infinite;
          transform-box: view-box;
          transform-origin: 18px 16px;
        }
        @keyframes sankofa-neck-mid-wander {
          0%,100%  { transform: rotate(0deg); }
          22%      { transform: rotate(-2deg); }
          58%      { transform: rotate(1.5deg); }
          82%      { transform: rotate(-0.8deg); }
        }

        /* ══════════════════════════════════════════════════════════════════════
           ULTRA-CINEMATIC ENHANCEMENT BLOCK — July 17 2026
           State-machine-grade data-attribute gating; exceeds Rive complexity
           through compound selector specificity, staggered cascade physics,
           and heading-aware structural iridescence at every LOD tier.
           ══════════════════════════════════════════════════════════════════════ */

        /* ── Third chirp ring ─────────────────────────────────────────────────
           ring-1 and ring-2 are the close/mid wavefronts. ring-3 is the
           outermost, slowest, and most transparent — the edge of the sound.
           Three staggered rings produce a true ripple-interference pattern.
           On donation events the stroke overrides to warm gold. */
        .sankofa-chirp-ring-3 {
          transform-box: view-box;
          transform-origin: 2.2px 14.25px;
          opacity: 0;
        }
        .sankofa-bird-rig[data-notification="true"] .sankofa-chirp-ring-3 {
          animation: sankofa-chirp-ring-outer 1.1s ease-out 3 !important;
          animation-delay: 0.6s;
        }
        .sankofa-bird-rig[data-accepted="true"] .sankofa-chirp-ring-3 {
          animation: sankofa-chirp-ring-outer 1.05s ease-out 2 !important;
          animation-delay: 0.72s;
        }
        .sankofa-bird-rig[data-nearby-user="true"] .sankofa-chirp-ring-3 {
          animation: sankofa-chirp-ring-outer 1.15s ease-out 2 !important;
          animation-delay: 0.8s;
        }
        .sankofa-bird-rig[data-donated="true"] .sankofa-chirp-ring-3 {
          stroke: hsl(45, 92%, 78%);
          animation: sankofa-chirp-ring-outer 1.1s ease-out 4 !important;
          animation-delay: 0.65s;
        }
        @keyframes sankofa-chirp-ring-outer {
          /* Outermost ring: expands to 7× original and nearly vanishes — the
             furthest wavefront. Starts at r=0.4 (contracted) so the three rings
             appear truly staggered in space, not just time. */
          0%   { transform: scale(0.35); opacity: 0.48; }
          40%  { transform: scale(2.8);  opacity: 0.22; }
          100% { transform: scale(7.2);  opacity: 0; }
        }

        /* ── Helping orbit particles ──────────────────────────────────────────
           Three tiny gold dots orbit the bird body at 120° spacing.
           At 2.8 s/revolution they trace a living "aura halo" around the bird.
           Only active at high + street zoom to keep GPU cost bounded. */
        .sankofa-helping-orbit-dot {
          transform-box: view-box;
          transform-origin: 20px 21px;
        }
        .sankofa-bird-rig[data-helping="true"][data-zoom="street"] .sankofa-helping-orbit-dot {
          opacity: 0.72 !important;
          animation: sankofa-helping-orbit 2.8s linear infinite !important;
        }
        .sankofa-bird-rig[data-helping="true"][data-zoom="high"] .sankofa-helping-orbit-dot {
          opacity: 0.44 !important;
          animation: sankofa-helping-orbit 2.8s linear infinite !important;
        }
        @keyframes sankofa-helping-orbit {
          from { transform: rotate(0deg)   translateY(-7.5px) scale(1); }
          25%  { transform: rotate(90deg)  translateY(-7.5px) scale(0.82); }
          50%  { transform: rotate(180deg) translateY(-7.5px) scale(0.68); }
          75%  { transform: rotate(270deg) translateY(-7.5px) scale(0.82); }
          to   { transform: rotate(360deg) translateY(-7.5px) scale(1); }
        }
        /* Suppress orbit during reduced-motion — gated so users can opt back in */
        @media (prefers-reduced-motion: reduce) {
          html:not([data-bird-anim="enabled"]) .sankofa-helping-orbit-dot { animation: none !important; opacity: 0 !important; }
        }

        /* ── Perch wing-fold animation ────────────────────────────────────────
           When landing="perch" the wings fold neatly against the body with a
           dynamic rebound — outer → over-fold → settle.
           A Rive file handles this as a state transition; here we use
           data-landing="perch" to gate a dedicated forwards-fill keyframe.
           The right wing folds 40ms after the left (anatomical realism). */
        .sankofa-bird-rig[data-landing="perch"] .sankofa-bird-wing-left {
          animation: sankofa-wing-fold-left 2.0s cubic-bezier(0.34,1.56,0.64,1) forwards !important;
          transform-box: view-box;
          transform-origin: 20px 18px;
        }
        .sankofa-bird-rig[data-landing="perch"] .sankofa-bird-wing-right {
          animation: sankofa-wing-fold-right 2.0s cubic-bezier(0.34,1.56,0.64,1) forwards !important;
          animation-delay: 0.04s;
          transform-box: view-box;
          transform-origin: 20px 18px;
        }
        .sankofa-bird-rig[data-landing="perch"] .sankofa-bird-wing-left-feathers {
          animation: sankofa-wing-fold-left 2.0s cubic-bezier(0.34,1.56,0.64,1) forwards !important;
          animation-delay: 0.06s;
        }
        .sankofa-bird-rig[data-landing="perch"] .sankofa-bird-wing-right-feathers {
          animation: sankofa-wing-fold-right 2.0s cubic-bezier(0.34,1.56,0.64,1) forwards !important;
          animation-delay: 0.1s;
        }
        @keyframes sankofa-wing-fold-left {
          0%   { transform: rotate(-18deg); }  /* extended hover spread */
          20%  { transform: rotate(-6deg);  }  /* beginning to close */
          45%  { transform: rotate(9deg);   }  /* over-fold (spring rebound) */
          65%  { transform: rotate(13deg);  }  /* settling */
          82%  { transform: rotate(14.5deg);}  /* near-final */
          100% { transform: rotate(15deg);  }  /* fully folded = idle rest angle */
        }
        @keyframes sankofa-wing-fold-right {
          0%   { transform: rotate(18deg);  }
          20%  { transform: rotate(6deg);   }
          45%  { transform: rotate(-9deg);  }
          65%  { transform: rotate(-13deg); }
          82%  { transform: rotate(-14.5deg);}
          100% { transform: rotate(-15deg); }
        }

        /* ── LOD0 idle feather-tip micro-rustle ──────────────────────────────
           At street zoom (≥17), when perched (idle + not flying), each primary
           tip has a barely-visible opacity tremble — wind moving individual
           feathers. Each feather gets its own period so no two move in lockstep;
           the combined effect is organic and alive. Opacity-only so it never
           fights with transform-based flap animations. */
        @keyframes sankofa-feather-rustle {
          0%,100% { opacity: var(--feather-base-opacity, 0.7); }
          33%     { opacity: calc(var(--feather-base-opacity, 0.7) * 0.68); }
          66%     { opacity: calc(var(--feather-base-opacity, 0.7) * 0.84); }
        }
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"][data-flying="false"] .sankofa-feather-l5,
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"][data-flying="false"] .sankofa-feather-r5 {
          animation: sankofa-feather-rustle 1.1s ease-in-out infinite !important;
          animation-delay: 0s;
        }
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"][data-flying="false"] .sankofa-feather-l0,
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"][data-flying="false"] .sankofa-feather-r0 {
          animation: sankofa-feather-rustle 1.35s ease-in-out infinite !important;
          animation-delay: 0.2s;
        }
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"][data-flying="false"] .sankofa-feather-l1,
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"][data-flying="false"] .sankofa-feather-r1 {
          animation: sankofa-feather-rustle 1.62s ease-in-out infinite !important;
          animation-delay: 0.38s;
        }
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"][data-flying="false"] .sankofa-feather-l2,
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"][data-flying="false"] .sankofa-feather-r2 {
          animation: sankofa-feather-rustle 1.9s ease-in-out infinite !important;
          animation-delay: 0.52s;
        }
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"][data-flying="false"] .sankofa-feather-l3,
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"][data-flying="false"] .sankofa-feather-r3 {
          animation: sankofa-feather-rustle 2.2s ease-in-out infinite !important;
          animation-delay: 0.65s;
        }
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"][data-flying="false"] .sankofa-feather-ls1,
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"][data-flying="false"] .sankofa-feather-rs1 {
          animation: sankofa-feather-rustle 2.45s ease-in-out infinite !important;
          animation-delay: 0.8s;
        }

        /* ── Secondary feather individual iridescence at street zoom ──────────
           Design doc: "LOD0 — Full feather detail, hundreds of paths."
           At street level, each secondary-feather group gets its own micro
           hue-rotate, staggered by position and driven by --heading-deg.
           When the bird turns, a spectral wave travels tip→root through the
           secondary fan — multi-layer structural colour impossible in Rive
           without explicit hand-authored state transitions per feather. */
        @keyframes sankofa-secondary-iri-1 {
          0%   { filter: hue-rotate(calc(var(--heading-deg,0deg)*0.14)) saturate(1.2); }
          32%  { filter: hue-rotate(calc(var(--heading-deg,0deg)*0.14 + 18deg)) saturate(1.65) brightness(1.22); }
          62%  { filter: hue-rotate(calc(var(--heading-deg,0deg)*0.14 + 9deg)) saturate(1.3); }
          100% { filter: hue-rotate(calc(var(--heading-deg,0deg)*0.14)) saturate(1.2); }
        }
        @keyframes sankofa-secondary-iri-2 {
          0%   { filter: hue-rotate(calc(var(--heading-deg,0deg)*0.10)) saturate(1.15); }
          36%  { filter: hue-rotate(calc(var(--heading-deg,0deg)*0.10 + 22deg)) saturate(1.55) brightness(1.16); }
          70%  { filter: hue-rotate(calc(var(--heading-deg,0deg)*0.10 + 11deg)) saturate(1.25); }
          100% { filter: hue-rotate(calc(var(--heading-deg,0deg)*0.10)) saturate(1.15); }
        }
        @keyframes sankofa-secondary-iri-3 {
          0%   { filter: hue-rotate(calc(var(--heading-deg,0deg)*0.07)) saturate(1.1); }
          40%  { filter: hue-rotate(calc(var(--heading-deg,0deg)*0.07 + 26deg)) saturate(1.48) brightness(1.12); }
          75%  { filter: hue-rotate(calc(var(--heading-deg,0deg)*0.07 + 13deg)) saturate(1.2); }
          100% { filter: hue-rotate(calc(var(--heading-deg,0deg)*0.07)) saturate(1.1); }
        }
        .sankofa-bird-rig[data-zoom="street"][data-flying="true"] .sankofa-feather-ls1,
        .sankofa-bird-rig[data-zoom="street"][data-flying="true"] .sankofa-feather-rs1 {
          animation: sankofa-secondary-iri-1 3.8s ease-in-out infinite !important;
          opacity: 0.72;
        }
        .sankofa-bird-rig[data-zoom="street"][data-flying="true"] .sankofa-feather-ls2,
        .sankofa-bird-rig[data-zoom="street"][data-flying="true"] .sankofa-feather-rs2 {
          animation: sankofa-secondary-iri-2 4.15s ease-in-out infinite !important;
          animation-delay: 0.55s;
          opacity: 0.68;
        }
        .sankofa-bird-rig[data-zoom="street"][data-flying="true"] .sankofa-feather-ls3,
        .sankofa-bird-rig[data-zoom="street"][data-flying="true"] .sankofa-feather-rs3 {
          animation: sankofa-secondary-iri-3 4.5s ease-in-out infinite !important;
          animation-delay: 1.1s;
          opacity: 0.62;
        }

        /* ── Approach: covert / secondary deceleration ruffle ─────────────────
           As the bird decelerates on approach, air pressure decreases → secondaries
           and coverts flutter — a "deceleration ruffle" that shows the bird is
           physically slowing. The richer rotate+scaleX keyframe is defined further
           below (Phase 4 #23) and applies to body feathers 1–11 in order. These
           rules use the same keyframe name for the covert/secondary wing feathers
           so the CSS last-write rule means both groups use the superior definition.
           Note: the @keyframes block itself is defined only once (Phase 4 #23) to
           avoid the duplicate-keyframe bug. */
        .sankofa-bird-rig[data-approaching="true"][data-zoom="high"] .sankofa-feather-ls1,
        .sankofa-bird-rig[data-approaching="true"][data-zoom="street"] .sankofa-feather-ls1,
        .sankofa-bird-rig[data-approaching="true"][data-zoom="high"] .sankofa-feather-rs1,
        .sankofa-bird-rig[data-approaching="true"][data-zoom="street"] .sankofa-feather-rs1 {
          animation: sankofa-approach-ruffle 0.62s ease-in-out infinite !important;
        }
        .sankofa-bird-rig[data-approaching="true"][data-zoom="high"] .sankofa-feather-ls2,
        .sankofa-bird-rig[data-approaching="true"][data-zoom="street"] .sankofa-feather-ls2,
        .sankofa-bird-rig[data-approaching="true"][data-zoom="high"] .sankofa-feather-rs2,
        .sankofa-bird-rig[data-approaching="true"][data-zoom="street"] .sankofa-feather-rs2 {
          animation: sankofa-approach-ruffle 0.72s ease-in-out infinite !important;
          animation-delay: 0.15s;
        }

        /* ── Wing-bottom surface shimmer during hover ─────────────────────────
           At street zoom while hovering, the underside wing surfaces (cream-teal
           anatomy) become clearly visible. A gentle shimmer makes them read as a
           distinct surface from the dorsal side — anatomical depth impossible in
           a flat Rive sprite without a separate layer hierarchy. */
        @keyframes sankofa-wing-btm-shimmer {
          0%,100% { opacity: 0.46; filter: brightness(1); }
          50%     { opacity: 0.65; filter: brightness(1.2) saturate(1.22); }
        }
        .sankofa-bird-rig[data-zoom="street"][data-landing="hover"] .sankofa-bird-wing-left-btm,
        .sankofa-bird-rig[data-zoom="street"][data-landing="hover"] .sankofa-bird-wing-right-btm {
          animation: sankofa-wing-btm-shimmer 1.85s ease-in-out infinite !important;
        }

        /* ── Notification: crown feather electromagnetic spike glow ───────────
           Crown feathers spike (existing sankofa-crown-alert keyframe) AND flash
           teal — the "crest flash" seen in real corvids/tropicals when alarmed.
           filter combines with the existing animation; brightness flashes first,
           then settles back to a subtle glow. */
        .sankofa-bird-rig[data-notification="true"][data-zoom="high"] .sankofa-crown-feather,
        .sankofa-bird-rig[data-notification="true"][data-zoom="street"] .sankofa-crown-feather {
          filter: drop-shadow(0 0 1.8px rgba(0, 212, 255, 0.85)) brightness(1.32) !important;
        }

        /* ── Celebrating: crown feathers fan out + gold glow ─────────────────
           The existing sankofa-crown-fan animation handles the spread.
           This layer adds a warm gold luminance on each feather tip — the crown
           goes from teal-iridescent (normal) to gold (celebrating).
           Complementary warmth against the teal particle burst below. */
        .sankofa-bird-rig[data-celebrating="true"][data-zoom="high"] .sankofa-crown-feather,
        .sankofa-bird-rig[data-celebrating="true"][data-zoom="street"] .sankofa-crown-feather {
          filter: drop-shadow(0 0 2.2px rgba(255, 210, 60, 0.72)) brightness(1.28) saturate(1.45) !important;
        }

        /* ── Donated: wing-bottom surfaces go warm gold ───────────────────────
           When a pledge completes (egg glows gold), the wing undersides join the
           warm palette — the whole bird reads "gold" in a unified system. */
        .sankofa-bird-rig[data-donated="true"] .sankofa-bird-wing-left-btm,
        .sankofa-bird-rig[data-donated="true"] .sankofa-bird-wing-right-btm {
          opacity: 0.58 !important;
          filter: hue-rotate(22deg) saturate(1.55) brightness(1.18) !important;
        }

        /* ── Helping: wing-joint shoulder highlight goes gold ─────────────────
           Wing-joint highlights are normally neutral white-teal. Gold tint while
           helping reinforces the "on a community mission" visual language.
           Pulsing makes the joints feel alive — like the bird is actively working. */
        @keyframes sankofa-helping-joint-pulse {
          0%,100% { opacity: 0.42; filter: brightness(1); }
          50%     { opacity: 0.82; filter: brightness(1.4) saturate(1.65); }
        }
        .sankofa-bird-rig[data-helping="true"][data-zoom="high"] .sankofa-wing-joint,
        .sankofa-bird-rig[data-helping="true"][data-zoom="street"] .sankofa-wing-joint {
          fill: hsl(45, 95%, 82%) !important;
          animation: sankofa-helping-joint-pulse 2.2s ease-in-out infinite !important;
        }

        /* ── Helping: body micro-feathers warm gold at street zoom ────────────
           At LOD0, the chest micro-feather scales warm to gold while helping.
           Combined with the main body drop-shadow and the glow layer, this creates
           a true 3-layer gold effect: glow-layer → body shadow → chest scales. */
        @keyframes sankofa-body-feather-shimmer {
          0%,100% { opacity: var(--bfs-opacity, 0.24); filter: brightness(1); }
          50%     { opacity: calc(var(--bfs-opacity, 0.24) * 1.6); filter: brightness(1.35) saturate(1.4); }
        }
        .sankofa-bird-rig[data-helping="true"][data-zoom="street"] .sankofa-body-feather-1,
        .sankofa-bird-rig[data-helping="true"][data-zoom="street"] .sankofa-body-feather-2,
        .sankofa-bird-rig[data-helping="true"][data-zoom="street"] .sankofa-body-feather-3 {
          --bfs-opacity: 0.28;
          filter: hue-rotate(35deg) saturate(1.65) brightness(1.22);
          animation: sankofa-body-feather-shimmer 2.0s ease-in-out infinite !important;
        }
        .sankofa-bird-rig[data-helping="true"][data-zoom="street"] .sankofa-body-feather-4,
        .sankofa-bird-rig[data-helping="true"][data-zoom="street"] .sankofa-body-feather-5,
        .sankofa-bird-rig[data-helping="true"][data-zoom="street"] .sankofa-body-feather-6 {
          --bfs-opacity: 0.22;
          filter: hue-rotate(30deg) saturate(1.42) brightness(1.16);
          animation: sankofa-body-feather-shimmer 2.45s ease-in-out infinite !important;
          animation-delay: 0.4s;
        }

        /* ── Glide: extreme outer primary tip flutter ─────────────────────────
           At glide speed the extreme outer primaries (l5/r5) experience maximum
           aerodynamic loading — their tips flutter subtly from air pressure.
           Opacity-only (transform is owned by the glide-wing keyframe). */
        @keyframes sankofa-glide-tip-flutter-l {
          0%,100% { opacity: 0.84; }
          28%     { opacity: 0.58; }
          58%     { opacity: 0.72; }
        }
        @keyframes sankofa-glide-tip-flutter-r {
          0%,100% { opacity: 0.84; }
          38%     { opacity: 0.58; }
          68%     { opacity: 0.72; }
        }
        .sankofa-bird-rig[data-gliding="true"][data-zoom="high"] .sankofa-feather-l5,
        .sankofa-bird-rig[data-gliding="true"][data-zoom="street"] .sankofa-feather-l5 {
          animation: sankofa-glide-tip-flutter-l 6s ease-in-out infinite !important;
        }
        .sankofa-bird-rig[data-gliding="true"][data-zoom="high"] .sankofa-feather-r5,
        .sankofa-bird-rig[data-gliding="true"][data-zoom="street"] .sankofa-feather-r5 {
          animation: sankofa-glide-tip-flutter-r 6s ease-in-out infinite !important;
        }

        /* ── Egg: heading-aware iridescence at high + street zoom ────────────
           The egg is "luminous teal — like polished jade" (design doc).
           At high+street LOD, the egg gets heading-driven hue-rotate so it
           "catches the light" differently as the bird banks — structural colour
           from the jade's crystalline surface. Override to celebration/donation
           states with explicit filter values that supersede the base rule. */
        .sankofa-bird-rig[data-zoom="high"] .sankofa-bird-egg,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-bird-egg {
          filter: drop-shadow(0 0 1.8px rgba(0,212,255,0.48))
                  hue-rotate(calc(var(--heading-deg,0deg) * 0.08));
          transition: filter 0.55s ease-out;
        }
        .sankofa-bird-rig[data-celebrating="true"] .sankofa-bird-egg {
          filter: drop-shadow(0 0 4px rgba(255,220,80,0.92))
                  drop-shadow(0 0 10px rgba(255,200,0,0.62)) !important;
        }
        .sankofa-bird-rig[data-donated="true"] .sankofa-bird-egg {
          filter: drop-shadow(0 0 3.5px rgba(255,185,0,0.96))
                  drop-shadow(0 0 9px rgba(255,155,0,0.62)) !important;
        }

        /* ── Takeoff: per-primary feather cascade timing ──────────────────────
           During takeoff, outer primaries lead the power stroke, secondaries/
           coverts follow ("primary first, secondary lag, body last" from spec).
           Implemented by resetting animation-delay on each feather group so the
           flap cascade starts from the wingtip inward — zero-cost, data-gated. */
        .sankofa-bird-rig[data-landing="takeoff"] .sankofa-feather-l5,
        .sankofa-bird-rig[data-landing="takeoff"] .sankofa-feather-r5 {
          animation-delay: 0s !important;
        }
        .sankofa-bird-rig[data-landing="takeoff"] .sankofa-feather-l0,
        .sankofa-bird-rig[data-landing="takeoff"] .sankofa-feather-r0 {
          animation-delay: 0.04s !important;
        }
        .sankofa-bird-rig[data-landing="takeoff"] .sankofa-feather-l1,
        .sankofa-bird-rig[data-landing="takeoff"] .sankofa-feather-r1 {
          animation-delay: 0.08s !important;
        }
        .sankofa-bird-rig[data-landing="takeoff"] .sankofa-feather-l2,
        .sankofa-bird-rig[data-landing="takeoff"] .sankofa-feather-r2 {
          animation-delay: 0.12s !important;
        }
        .sankofa-bird-rig[data-landing="takeoff"] .sankofa-feather-l3,
        .sankofa-bird-rig[data-landing="takeoff"] .sankofa-feather-r3 {
          animation-delay: 0.16s !important;
        }
        .sankofa-bird-rig[data-landing="takeoff"] .sankofa-feather-ls1,
        .sankofa-bird-rig[data-landing="takeoff"] .sankofa-feather-rs1 {
          animation-delay: 0.24s !important;
        }
        .sankofa-bird-rig[data-landing="takeoff"] .sankofa-feather-lc1,
        .sankofa-bird-rig[data-landing="takeoff"] .sankofa-feather-rc1 {
          animation-delay: 0.34s !important;
        }

        /* ── @property for new CSS custom properties ──────────────────────────
           Register new vars used in keyframe calc() expressions so Safari 15.4+
           can interpolate them. --feather-base-opacity is used in the rustle
           keyframe. --bfs-opacity is used in the body-feather-shimmer keyframe.
           inherits:true so child elements pick up the value without redeclaring. */
        @property --feather-base-opacity {
          syntax: '<number>';
          inherits: true;
          initial-value: 0.7;
        }
        @property --bfs-opacity {
          syntax: '<number>';
          inherits: true;
          initial-value: 0.24;
        }

        /* ── Reduced-motion: suppress all new animations — gated on no override ──
           Extend the existing prefers-reduced-motion block to cover the new
           keyframes added in this enhancement block.
           html:not([data-bird-anim="enabled"]) guard lets users opt back in
           via Profile → Settings → Accessibility. */
        @media (prefers-reduced-motion: reduce) {
          html:not([data-bird-anim="enabled"]) {
            .sankofa-chirp-ring-3,
            .sankofa-feather-l5, .sankofa-feather-r5,
            .sankofa-feather-l0, .sankofa-feather-r0,
            .sankofa-feather-l1, .sankofa-feather-r1,
            .sankofa-feather-l2, .sankofa-feather-r2,
            .sankofa-feather-l3, .sankofa-feather-r3,
            .sankofa-feather-ls1, .sankofa-feather-rs1,
            .sankofa-feather-ls2, .sankofa-feather-rs2,
            .sankofa-feather-ls3, .sankofa-feather-rs3,
            .sankofa-bird-wing-left-btm, .sankofa-bird-wing-right-btm,
            .sankofa-wing-joint,
            .sankofa-body-feather-1, .sankofa-body-feather-2, .sankofa-body-feather-3,
            .sankofa-body-feather-4, .sankofa-body-feather-5, .sankofa-body-feather-6 {
              animation: none !important;
            }
            .sankofa-bird-rig[data-landing="perch"] .sankofa-bird-wing-left,
            .sankofa-bird-rig[data-landing="perch"] .sankofa-bird-wing-right,
            .sankofa-bird-rig[data-landing="perch"] .sankofa-bird-wing-left-feathers,
            .sankofa-bird-rig[data-landing="perch"] .sankofa-bird-wing-right-feathers {
              animation: none !important;
            }
          }
        }

        /* ══════════════════════════════════════════════════════════════════════
           PHASE-2 FINAL DETAIL PASS — beyond-Rive completeness
           Every visual gap identified in the design spec is addressed here.
           ══════════════════════════════════════════════════════════════════════ */

        /* ── Body micro-feather rows 4–11 visibility fix ─────────────────────
           Rows 4–6 (lower chest), 7–9 (mid breast), 10–11 (upper belly) exist
           as SVG elements and have animation-delay overrides but were MISSING
           the base opacity and animation declarations to make them visible.
           This is the critical gap fix: unlocks 8 feather paths at high+street. */
        .sankofa-bird-rig[data-zoom="high"] .sankofa-body-feather-4,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-body-feather-4,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-body-feather-5,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-body-feather-5,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-body-feather-6,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-body-feather-6 {
          opacity: 0.13;
          animation: sankofa-body-feather-shimmer-base 4.6s ease-in-out infinite;
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-body-feather-7,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-body-feather-7,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-body-feather-8,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-body-feather-8,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-body-feather-9,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-body-feather-9 {
          opacity: 0.15;
          animation: sankofa-body-feather-shimmer-base 4.6s ease-in-out infinite;
        }
        .sankofa-bird-rig[data-zoom="street"] .sankofa-body-feather-10,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-body-feather-11 {
          opacity: 0.12;
          animation: sankofa-body-feather-shimmer-base 5.2s ease-in-out infinite;
        }

        /* ── Wire --help-shimmer to helping state ────────────────────────────
           --help-shimmer (declared as @property above) was a 0-1 scalar var
           that was registered but never set. Wire it here so it's available
           for any future calc() expression needing a smooth helping intensity.
           Current use: scales helping orbit dot opacity continuously rather
           than making them flash on/off with a hard boolean switch. */
        .sankofa-bird-rig[data-helping="true"]  { --help-shimmer: 1; }
        .sankofa-bird-rig[data-helping="false"],
        .sankofa-bird-rig:not([data-helping])   { --help-shimmer: 0; }
        /* Orbit dots fade in smoothly using the scalar */
        .sankofa-bird-rig[data-helping="true"][data-zoom="street"] .sankofa-helping-orbit-dot {
          opacity: calc(0.40 + var(--help-shimmer, 0) * 0.32) !important;
        }
        .sankofa-bird-rig[data-helping="true"][data-zoom="high"] .sankofa-helping-orbit-dot {
          opacity: calc(0.22 + var(--help-shimmer, 0) * 0.22) !important;
        }

        /* ── Neck chain segments — multi-segment S-wave physics ──────────────
           Two thinner paths overlaid on the main neck stroke. Their opacity
           animations are phase-shifted so the bright peak appears to travel up
           the neck like a travelling wave — anatomically accurate to how feather
           sheen moves on a flexible neck. The dorsal sheen path marks the edge
           of the S-curve. */
        .sankofa-bird-rig[data-zoom="high"] .sankofa-neck-seg,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-neck-seg {
          opacity: 0.40;
        }
        .sankofa-bird-rig[data-zoom="street"] .sankofa-neck-seg {
          opacity: 0.54;
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-neck-top-sheen,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-neck-top-sheen {
          opacity: 0.44;
        }
        .sankofa-bird-rig[data-zoom="street"] .sankofa-neck-top-sheen {
          opacity: 0.60;
        }
        /* Idle S-wave: segments brighten in alternation, peak travels neck→head */
        .sankofa-bird-rig[data-flying="false"][data-landing="idle"] .sankofa-neck-seg-1 {
          animation: sankofa-neck-seg1-wave 5.2s ease-in-out infinite !important;
          transform-box: view-box;
          transform-origin: 18px 16px;
        }
        .sankofa-bird-rig[data-flying="false"][data-landing="idle"] .sankofa-neck-seg-2 {
          animation: sankofa-neck-seg2-wave 5.2s ease-in-out infinite !important;
          animation-delay: 0.65s;
          transform-box: view-box;
          transform-origin: 13px 13.2px;
        }
        .sankofa-bird-rig[data-zoom="street"][data-flying="false"][data-landing="idle"] .sankofa-neck-top-sheen {
          animation: sankofa-neck-sheen-wave 5.2s ease-in-out infinite !important;
          animation-delay: 0.32s;
        }
        @keyframes sankofa-neck-seg1-wave {
          0%,100% { opacity: 0.42; filter: brightness(1); }
          22%     { opacity: 0.62; filter: brightness(1.3) saturate(1.35); }
          55%     { opacity: 0.30; filter: brightness(0.82); }
        }
        @keyframes sankofa-neck-seg2-wave {
          0%,100% { opacity: 0.42; filter: brightness(1); }
          28%     { opacity: 0.28; filter: brightness(0.82); }
          62%     { opacity: 0.60; filter: brightness(1.3) saturate(1.35); }
        }
        @keyframes sankofa-neck-sheen-wave {
          0%,100% { opacity: 0.54; }
          38%     { opacity: 0.75; }
          68%     { opacity: 0.38; }
        }
        /* Neck segments hidden at low/mid zoom and battery-saver */
        .sankofa-bird-rig[data-zoom="low"] .sankofa-neck-seg,
        .sankofa-bird-rig[data-zoom="mid"] .sankofa-neck-seg,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-neck-top-sheen,
        .sankofa-bird-rig[data-zoom="mid"] .sankofa-neck-top-sheen,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-neck-seg,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-neck-top-sheen { opacity: 0 !important; pointer-events: none !important; transition: opacity 0.45s ease-out !important; }

        /* ── Wing covert iridescent band ─────────────────────────────────────
           Dedicated highlight at the layer-3 covert feathers (lc1/rc1 zone).
           At high+street zoom these catch light at a different angle from the
           primary highlights (which face dorsally) — the covert band is more
           forward-facing, so its heading-aware hue-rotate factor is higher (0.20).
           Flash animation during flight creates a band-scintillation effect. */
        .sankofa-bird-rig[data-zoom="high"] .sankofa-wing-covert-band,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-wing-covert-band {
          opacity: 0.24;
          filter: hue-rotate(calc(var(--heading-deg, 0deg) * 0.20)) saturate(1.4);
          transition: filter 0.6s ease-out, opacity 0.4s ease-out;
        }
        .sankofa-bird-rig[data-zoom="street"] .sankofa-wing-covert-band { opacity: 0.34; }
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"] .sankofa-wing-covert-band {
          opacity: 0.40;
          animation: sankofa-covert-band-flash 3.2s ease-in-out infinite !important;
        }
        @keyframes sankofa-covert-band-flash {
          0%,100% { opacity: 0.34; filter: hue-rotate(calc(var(--heading-deg,0deg)*0.20)) saturate(1.4); }
          35%     { opacity: 0.52; filter: hue-rotate(calc(var(--heading-deg,0deg)*0.20 + 25deg)) saturate(1.9) brightness(1.32); }
          70%     { opacity: 0.38; filter: hue-rotate(calc(var(--heading-deg,0deg)*0.20 + 12deg)) saturate(1.52); }
        }
        /* Helping: covert bands warm to gold */
        .sankofa-bird-rig[data-helping="true"] .sankofa-wing-covert-band {
          filter: hue-rotate(38deg) saturate(1.65) brightness(1.18) !important;
        }
        /* LOD: hide below high zoom and in battery-saver */
        .sankofa-bird-rig[data-zoom="low"] .sankofa-wing-covert-band,
        .sankofa-bird-rig[data-zoom="mid"] .sankofa-wing-covert-band,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-wing-covert-band { opacity: 0 !important; pointer-events: none !important; transition: opacity 0.45s ease-out !important; }

        /* ── Crown tip specular catchlights ──────────────────────────────────
           Tiny bright circles at the tips of crowns 2, 3, 5 — the forwardmost
           feathers with the densest barbule specular. Visible only at street
           zoom (LOD0). Staggered pulse so no two tips brighten simultaneously. */
        .sankofa-bird-rig[data-zoom="street"] .sankofa-crown-tip {
          opacity: 0.64;
          animation: sankofa-crown-tip-pulse 3.8s ease-in-out infinite;
        }
        .sankofa-bird-rig[data-zoom="street"] .sankofa-crown-tip-3 { animation-delay: 0.95s; }
        .sankofa-bird-rig[data-zoom="street"] .sankofa-crown-tip-5 { animation-delay: 1.9s; }
        @keyframes sankofa-crown-tip-pulse {
          0%,100% { opacity: 0.58; filter: brightness(1); }
          36%     { opacity: 0.85; filter: brightness(1.45) saturate(1.65); }
          68%     { opacity: 0.48; filter: brightness(0.88); }
        }
        /* Notification: tips flash bright teal */
        .sankofa-bird-rig[data-notification="true"][data-zoom="street"] .sankofa-crown-tip {
          opacity: 0.90 !important;
          filter: drop-shadow(0 0 0.6px rgba(0,212,255,0.92)) brightness(1.55) !important;
          animation: sankofa-crown-tip-alert 0.35s ease-out 4 !important;
        }
        @keyframes sankofa-crown-tip-alert {
          0%,100% { opacity: 0.90; }
          50%     { opacity: 0.40; }
        }
        /* Celebrating: tips warm to gold */
        .sankofa-bird-rig[data-celebrating="true"][data-zoom="street"] .sankofa-crown-tip {
          opacity: 0.88 !important;
          filter: hue-rotate(155deg) saturate(2.1) brightness(1.55) !important;
        }
        /* Low/mid/high: hide (too small to render meaningfully) */
        .sankofa-bird-rig[data-zoom="low"] .sankofa-crown-tip,
        .sankofa-bird-rig[data-zoom="mid"] .sankofa-crown-tip,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-crown-tip,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-crown-tip { opacity: 0 !important; pointer-events: none !important; transition: opacity 0.45s ease-out !important; }

        /* ── Tail outer/far feather individual iridescence at street zoom ────
           The tail fan's outer and far-outer feathers (separate SVG elements)
           get their own staggered hue-rotate animation at street zoom. Combined
           with the tail body rule (heading*0.18), the full tail reads as a
           multi-plane iridescent surface — each feather peaks at a different
           time, creating an organic sweep across the entire fan. */
        @keyframes sankofa-tail-feather-iri {
          0%,100% { filter: hue-rotate(calc(var(--heading-deg,0deg)*0.22)) saturate(1.3); }
          42%     { filter: hue-rotate(calc(var(--heading-deg,0deg)*0.22 + 21deg)) saturate(1.68) brightness(1.2); }
          76%     { filter: hue-rotate(calc(var(--heading-deg,0deg)*0.22 + 10deg)) saturate(1.42); }
        }
        .sankofa-bird-rig[data-zoom="street"] .sankofa-tail-outer-left  { animation: sankofa-tail-feather-iri 4.8s ease-in-out infinite; animation-delay: 0.5s; }
        .sankofa-bird-rig[data-zoom="street"] .sankofa-tail-outer-right { animation: sankofa-tail-feather-iri 4.8s ease-in-out infinite; animation-delay: 1.2s; }
        .sankofa-bird-rig[data-zoom="street"] .sankofa-tail-far-left    { animation: sankofa-tail-feather-iri 5.5s ease-in-out infinite; animation-delay: 0.85s; }
        .sankofa-bird-rig[data-zoom="street"] .sankofa-tail-far-right   { animation: sankofa-tail-feather-iri 5.5s ease-in-out infinite; animation-delay: 1.65s; }

        /* ── Wing scapular shoulder breathing at street zoom ─────────────────
           At LOD0, the 4 scapular shoulder patches reach full opacity and get
           a subtle breathing cycle matching the chest — anatomically these
           feathers are attached to the same musculature as the chest. */
        @keyframes sankofa-scap-breathe {
          0%,100% { opacity: 0.28; }
          50%     { opacity: 0.40; filter: brightness(1.14) saturate(1.22); }
        }
        .sankofa-bird-rig[data-zoom="street"] .sankofa-wing-scap { animation: sankofa-scap-breathe 3.8s ease-in-out infinite !important; }
        .sankofa-bird-rig[data-zoom="street"] .sankofa-wing-scap-l2,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-wing-scap-r2 { animation-delay: 1.9s !important; }
        /* Battery-saver: suppress scap animations */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-wing-scap { opacity: 0 !important; pointer-events: none !important; transition: opacity 0.45s ease-out !important; }

        /* ── Battery-saver: suppress all Phase-2 new elements ────────────────
           Every new SVG element added in this phase must be hidden in LOD3 mode
           to maintain the minimal silhouette guarantee. */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-neck-seg,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-neck-top-sheen,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-crown-tip,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-wing-covert-band,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-body-feather-7,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-body-feather-8,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-body-feather-9,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-body-feather-10,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-body-feather-11 { opacity: 0 !important; pointer-events: none !important; transition: opacity 0.45s ease-out !important; }

        /* ── Heading-wrapper: snap instantly on slow-device modes ──────────────
           The 0.55s cubic-bezier heading transition is set as an inline style
           by Renderer.tsx and already switches to "none" in JS when batterySaver
           or navLod ≥ 2 is active. This CSS rule is a belt-and-suspenders
           fallback: if any future code path bypasses the JS guard, CSS still
           eliminates the jank by overriding the transition to instant. */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-heading-wrapper,
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-bird-heading-wrapper {
          transition: none !important;
        }

        /* ── prefers-reduced-motion: suppress all Phase-2 animations ─────────
           All new keyframes in this block must be covered.
           Gated on html:not([data-bird-anim="enabled"]) so the Accessibility
           toggle in Profile → Settings can restore full animations. */
        @media (prefers-reduced-motion: reduce) {
          html:not([data-bird-anim="enabled"]) {
            .sankofa-neck-seg, .sankofa-neck-top-sheen,
            .sankofa-crown-tip, .sankofa-wing-covert-band,
            .sankofa-wing-scap,
            .sankofa-tail-outer-left, .sankofa-tail-outer-right,
            .sankofa-tail-far-left, .sankofa-tail-far-right { animation: none !important; }
            .sankofa-body-feather-4, .sankofa-body-feather-5, .sankofa-body-feather-6,
            .sankofa-body-feather-7, .sankofa-body-feather-8, .sankofa-body-feather-9,
            .sankofa-body-feather-10, .sankofa-body-feather-11 { animation: none !important; }
          }
        }

        /* ══════════════════════════════════════════════════════════════════════
           PHASE 20 — 360° MULTI-VIEW SPRITE SYSTEM
           Three bird sprites (front · side · back) cross-fade based on
           compass heading. Wing flap and walking-leg animations extend the
           system to all three views.
        ═══════════════════════════════════════════════════════════════════ */

        /* ── Sprite cross-fade wrappers ────────────────────────────────────────
           Opacity is driven inline by JS (computeViewOpacities). The
           transition here provides smooth interpolation; the JS belt-and-
           suspenders guard applies "none" in battery-saver mode already.   */
        .sankofa-view-sprite {
          transition: opacity 0.28s ease;
          will-change: opacity;
        }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-view-sprite {
          transition: none;
        }

        /* ══ FRONT VIEW wing animations (sankofa-fv-wing-{left|right}) ═══════
           transform-origin at wing root (20px 18px) — natural wrist pivot.
           Slight phase offset on right wing (×0.07) for realistic asymmetry. */
        @keyframes sankofa-fv-wing-flap-left {
          0%, 100% { transform: rotate(0deg)    translateY(0px);    }
          28%       { transform: rotate(-7deg)   translateY(-2px);   }
          70%       { transform: rotate( 4.5deg) translateY( 1.5px); }
        }
        @keyframes sankofa-fv-wing-flap-right {
          0%, 100% { transform: rotate(0deg)    translateY(0px);    }
          28%       { transform: rotate( 7deg)   translateY(-2px);   }
          70%       { transform: rotate(-4.5deg) translateY( 1.5px); }
        }
        @keyframes sankofa-fv-wing-glide {
          0%, 100% { transform: translateY(0px)   rotate(-2.5deg); }
          50%       { transform: translateY(-1.5px) rotate(-4.5deg); }
        }

        /* Flying — full flap */
        .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"]) .sankofa-fv-wing-left {
          animation: sankofa-fv-wing-flap-left var(--flap-period, 1400ms) ease-in-out infinite;
        }
        .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"]) .sankofa-fv-wing-right {
          animation: sankofa-fv-wing-flap-right var(--flap-period, 1400ms) ease-in-out infinite;
          animation-delay: calc(var(--flap-period, 1400ms) * 0.07);
        }
        /* Gliding — slow sustained soaring arc */
        .sankofa-bird-rig[data-gliding="true"]:not([data-battery-saver="true"]) .sankofa-fv-wing-left,
        .sankofa-bird-rig[data-gliding="true"]:not([data-battery-saver="true"]) .sankofa-fv-wing-right {
          animation: sankofa-fv-wing-glide 4.2s ease-in-out infinite !important;
        }

        /* ══ BACK VIEW wing animations (sankofa-bv-wing-{left|right}) ════════
           Slightly shallower angle than front — dorsal stroke dynamics differ. */
        @keyframes sankofa-bv-wing-flap-left {
          0%, 100% { transform: rotate(0deg)   translateY(0px);    }
          28%       { transform: rotate(-6deg)  translateY(-2px);   }
          70%       { transform: rotate( 4deg)  translateY( 1.4px); }
        }
        @keyframes sankofa-bv-wing-flap-right {
          0%, 100% { transform: rotate(0deg)   translateY(0px);    }
          28%       { transform: rotate( 6deg)  translateY(-2px);   }
          70%       { transform: rotate(-4deg)  translateY( 1.4px); }
        }
        @keyframes sankofa-bv-wing-glide {
          0%, 100% { transform: translateY(0px)   rotate(-2deg);   }
          50%       { transform: translateY(-1.5px) rotate(-3.8deg); }
        }

        .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"]) .sankofa-bv-wing-left {
          animation: sankofa-bv-wing-flap-left var(--flap-period, 1400ms) ease-in-out infinite;
        }
        .sankofa-bird-rig[data-flying="true"]:not([data-battery-saver="true"]) .sankofa-bv-wing-right {
          animation: sankofa-bv-wing-flap-right var(--flap-period, 1400ms) ease-in-out infinite;
          animation-delay: calc(var(--flap-period, 1400ms) * 0.07);
        }
        .sankofa-bird-rig[data-gliding="true"]:not([data-battery-saver="true"]) .sankofa-bv-wing-left,
        .sankofa-bird-rig[data-gliding="true"]:not([data-battery-saver="true"]) .sankofa-bv-wing-right {
          animation: sankofa-bv-wing-glide 4.2s ease-in-out infinite !important;
        }

        /* ══ WALKING LEG ANIMATIONS ══════════════════════════════════════════
           Applies to .sankofa-leg-{left|right} which appear in:
             • Side-profile Legs.tsx (existing, inside heading-wrapper)
             • FrontView.tsx legs (sankofa-fv-legs group)
             • BackView.tsx legs  (sankofa-bv-legs group)
           All share the same class so one CSS rule covers all three views.

           Stride period: 0.55 s (~1.8 Hz walking cadence).
           Right leg is half-period offset (0.275 s) for alternating gait. */
        @keyframes sankofa-leg-walk-left {
          0%, 100% { transform: rotate(-15deg); }
          50%       { transform: rotate( 12deg); }
        }
        @keyframes sankofa-leg-walk-right {
          0%, 100% { transform: rotate( 12deg); }
          50%       { transform: rotate(-15deg); }
        }
        @keyframes sankofa-leg-idle-sway {
          0%, 100% { transform: rotate(  0deg); }
          35%       { transform: rotate(-2.5deg); }
          70%       { transform: rotate( 2.5deg); }
        }

        /* Walking — alternating stride */
        .sankofa-bird-rig[data-speed="walking"]:not([data-battery-saver="true"]) .sankofa-leg-left {
          animation: sankofa-leg-walk-left 0.55s ease-in-out infinite;
        }
        .sankofa-bird-rig[data-speed="walking"]:not([data-battery-saver="true"]) .sankofa-leg-right {
          animation: sankofa-leg-walk-right 0.55s ease-in-out infinite;
          animation-delay: 0.275s;
        }

        /* Idle — gentle weight-shift sway */
        .sankofa-bird-rig[data-speed="idle"]:not([data-battery-saver="true"]) .sankofa-leg-left {
          animation: sankofa-leg-idle-sway 2.6s ease-in-out infinite;
        }
        .sankofa-bird-rig[data-speed="idle"]:not([data-battery-saver="true"]) .sankofa-leg-right {
          animation: sankofa-leg-idle-sway 2.6s ease-in-out infinite;
          animation-delay: 1.3s;
        }

        /* ── Front-view neck idle flex (mirrors side-view sankofa-neck-flex) ── */
        .sankofa-bird-rig:not([data-flying="true"]):not([data-battery-saver="true"]) .sankofa-fv-neck {
          animation: sankofa-neck-flex 3.2s ease-in-out infinite;
        }

        /* ── Reduced-motion guards for Phase 20 ──────────────────────────────
           Covers both the new view animations and the existing leg selectors. */
        @media (prefers-reduced-motion: reduce) {
          html:not([data-bird-anim="enabled"]) {
            .sankofa-fv-wing-left, .sankofa-fv-wing-right,
            .sankofa-bv-wing-left, .sankofa-bv-wing-right,
            .sankofa-fv-neck { animation: none !important; }
            .sankofa-leg-left, .sankofa-leg-right { animation: none !important; }
          }
        }

        /* ══════════════════════════════════════════════════════════════════════
           PUPIL MICRO-SCAN
           Birds constantly scan — small-amplitude eye movements between saccades.
           This 16-second keyframe moves the whole sankofa-eye-scan-group ≈ ±1.2
           SVG px (≈ 2px rendered at typical sizes) through 12 irregular waypoints.
           It composes with:
             • --sme-eye-x/y (gaze tracking, written by useAnimationMixer rAF loop)
             • sankofa-eye-live (pupil blink / saccade, on .sankofa-bird-eye)
             • sankofa-iris-track (iris sync, on .sankofa-bird-iris)
           None of those are on the group element, so there is no conflict.
           Battery-saver and reduced-motion suppress the animation completely.
        ══════════════════════════════════════════════════════════════════════ */
        @keyframes sankofa-pupil-scan {
          0%   { transform: translate(0px,    0px);    }
          7%   { transform: translate(0.7px, -0.5px);  }
          14%  { transform: translate(1.1px,  0.2px);  }
          22%  { transform: translate(0.8px,  0.9px);  }
          30%  { transform: translate(0px,    1.2px);  }
          38%  { transform: translate(-0.9px, 0.6px);  }
          46%  { transform: translate(-1.1px, -0.2px); }
          54%  { transform: translate(-0.6px, -1.0px); }
          62%  { transform: translate(0.3px, -1.1px);  }
          70%  { transform: translate(1.0px, -0.4px);  }
          80%  { transform: translate(0.5px,  0.5px);  }
          90%  { transform: translate(-0.4px, 0.3px);  }
          100% { transform: translate(0px,    0px);    }
        }
        .sankofa-eye-scan-group:not(
          .sankofa-bird-rig[data-battery-saver="true"] *
        ) {
          animation: sankofa-pupil-scan 16s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          html:not([data-bird-anim="enabled"]) .sankofa-eye-scan-group {
            animation: none !important;
          }
        }
        /* LOD: suppress scan at low zoom — eye is a single pixel at that scale */
        .sankofa-bird-rig[data-zoom="low"] .sankofa-eye-scan-group {
          animation: none !important;
        }

        /* ══════════════════════════════════════════════════════════════════════
           CONTROLLED IRIDESCENCE — heading-quadrant hue shift
           Instead of animating filter: hue-rotate() on every frame (GPU paint),
           we apply a STATIC hue-rotate that transitions only when the bird
           changes direction. The browser compositor handles one smooth 0.8s
           filter crossfade per heading change — far cheaper than per-frame.
           Palette: N=pure teal, E=warm turquoise, S=emerald, W=blue-green.
           Only applies at high/street zoom where feather detail is visible.
        ══════════════════════════════════════════════════════════════════════ */
        .sankofa-bird-rig[data-zoom="high"] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-bird-wing-right,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-bird-wing-right,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-bird-neck,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-bird-neck,
        .sankofa-bird-rig[data-zoom="high"] .sankofa-bird-tail,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-bird-tail {
          transition: filter 0.8s ease-out;
          will-change: filter;
        }
        /* North — pure teal, no shift */
        .sankofa-bird-rig[data-heading-quadrant="N"] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-heading-quadrant="N"] .sankofa-bird-wing-right {
          filter: saturate(1.3);
        }
        .sankofa-bird-rig[data-heading-quadrant="N"] .sankofa-bird-neck { filter: saturate(1.2); }
        .sankofa-bird-rig[data-heading-quadrant="N"] .sankofa-bird-tail  { filter: saturate(1.25); }
        /* NE — gentle warm shift */
        .sankofa-bird-rig[data-heading-quadrant="NE"] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-heading-quadrant="NE"] .sankofa-bird-wing-right {
          filter: hue-rotate(10deg) saturate(1.35);
        }
        .sankofa-bird-rig[data-heading-quadrant="NE"] .sankofa-bird-neck { filter: hue-rotate(5deg) saturate(1.22); }
        .sankofa-bird-rig[data-heading-quadrant="NE"] .sankofa-bird-tail  { filter: hue-rotate(7deg) saturate(1.28); }
        /* East — warm turquoise / aqua */
        .sankofa-bird-rig[data-heading-quadrant="E"] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-heading-quadrant="E"] .sankofa-bird-wing-right {
          filter: hue-rotate(22deg) saturate(1.4);
        }
        .sankofa-bird-rig[data-heading-quadrant="E"] .sankofa-bird-neck { filter: hue-rotate(11deg) saturate(1.25); }
        .sankofa-bird-rig[data-heading-quadrant="E"] .sankofa-bird-tail  { filter: hue-rotate(16deg) saturate(1.30); }
        /* SE — turquoise-to-emerald */
        .sankofa-bird-rig[data-heading-quadrant="SE"] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-heading-quadrant="SE"] .sankofa-bird-wing-right {
          filter: hue-rotate(35deg) saturate(1.38);
        }
        .sankofa-bird-rig[data-heading-quadrant="SE"] .sankofa-bird-neck { filter: hue-rotate(17deg) saturate(1.23); }
        .sankofa-bird-rig[data-heading-quadrant="SE"] .sankofa-bird-tail  { filter: hue-rotate(25deg) saturate(1.28); }
        /* South — emerald green */
        .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-bird-wing-right {
          filter: hue-rotate(45deg) saturate(1.35);
        }
        .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-bird-neck { filter: hue-rotate(22deg) saturate(1.22); }
        .sankofa-bird-rig[data-heading-quadrant="S"] .sankofa-bird-tail  { filter: hue-rotate(32deg) saturate(1.27); }
        /* SW — emerald-to-blue-green */
        .sankofa-bird-rig[data-heading-quadrant="SW"] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-heading-quadrant="SW"] .sankofa-bird-wing-right {
          filter: hue-rotate(55deg) saturate(1.3);
        }
        .sankofa-bird-rig[data-heading-quadrant="SW"] .sankofa-bird-neck { filter: hue-rotate(27deg) saturate(1.20); }
        .sankofa-bird-rig[data-heading-quadrant="SW"] .sankofa-bird-tail  { filter: hue-rotate(40deg) saturate(1.25); }
        /* West — blue-green / silver-teal */
        .sankofa-bird-rig[data-heading-quadrant="W"] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-heading-quadrant="W"] .sankofa-bird-wing-right {
          filter: hue-rotate(67deg) saturate(1.25);
        }
        .sankofa-bird-rig[data-heading-quadrant="W"] .sankofa-bird-neck { filter: hue-rotate(33deg) saturate(1.18); }
        .sankofa-bird-rig[data-heading-quadrant="W"] .sankofa-bird-tail  { filter: hue-rotate(48deg) saturate(1.22); }
        /* NW — returning toward teal */
        .sankofa-bird-rig[data-heading-quadrant="NW"] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-heading-quadrant="NW"] .sankofa-bird-wing-right {
          filter: hue-rotate(12deg) saturate(1.28);
        }
        .sankofa-bird-rig[data-heading-quadrant="NW"] .sankofa-bird-neck { filter: hue-rotate(6deg)  saturate(1.20); }
        .sankofa-bird-rig[data-heading-quadrant="NW"] .sankofa-bird-tail  { filter: hue-rotate(9deg)  saturate(1.24); }
        /* Battery saver: no iridescence filter at all */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-right,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-neck,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-tail {
          filter: none !important;
          transition: none !important;
        }

        /* ══════════════════════════════════════════════════════════════════════
           INDEPENDENT TAIL FEATHER FAN
           Each rectrix family fans outward by a different amount depending on
           flight state. Center stays with the base --sme-tail-deg (outer group).
           Inner tips add a small extra spread, outer and far feathers fan further.
           This is additive with the parent <g> rotation — the outer group handles
           the base directional bend, each feather's own rotate adds fan spread.
           Transitions make the fan feel physical rather than snapping.
        ══════════════════════════════════════════════════════════════════════ */
        .sankofa-tail-inner-left,
        .sankofa-tail-inner-right,
        .sankofa-tail-outer-left,
        .sankofa-tail-outer-right,
        .sankofa-tail-far-left,
        .sankofa-tail-far-right {
          transition: rotate 0.35s ease-out;
        }
        /* Idle / perched — slight resting fan (rectrices never fold completely flat) */
        .sankofa-bird-rig[data-flying="false"] .sankofa-tail-inner-left  { rotate: -3deg; }
        .sankofa-bird-rig[data-flying="false"] .sankofa-tail-inner-right { rotate:  3deg; }
        .sankofa-bird-rig[data-flying="false"] .sankofa-tail-outer-left  { rotate: -6deg; }
        .sankofa-bird-rig[data-flying="false"] .sankofa-tail-outer-right { rotate:  6deg; }
        .sankofa-bird-rig[data-flying="false"] .sankofa-tail-far-left    { rotate: -10deg; }
        .sankofa-bird-rig[data-flying="false"] .sankofa-tail-far-right   { rotate:  10deg; }
        /* Flying — feathers pulled back into streamlined shape */
        .sankofa-bird-rig[data-flying="true"][data-speed="driving"] .sankofa-tail-inner-left,
        .sankofa-bird-rig[data-flying="true"][data-speed="driving"] .sankofa-tail-inner-right { rotate: 0deg; }
        .sankofa-bird-rig[data-flying="true"][data-speed="driving"] .sankofa-tail-outer-left  { rotate: -2deg; }
        .sankofa-bird-rig[data-flying="true"][data-speed="driving"] .sankofa-tail-outer-right { rotate:  2deg; }
        .sankofa-bird-rig[data-flying="true"][data-speed="driving"] .sankofa-tail-far-left    { rotate: -4deg; }
        .sankofa-bird-rig[data-flying="true"][data-speed="driving"] .sankofa-tail-far-right   { rotate:  4deg; }
        /* Braking / slow approach — maximum fan spread for aerodynamic drag */
        .sankofa-bird-rig[data-flying="true"][data-speed="walking"] .sankofa-tail-inner-left,
        .sankofa-bird-rig[data-flying="true"][data-speed="running"] .sankofa-tail-inner-left  { rotate: -5deg; }
        .sankofa-bird-rig[data-flying="true"][data-speed="walking"] .sankofa-tail-inner-right,
        .sankofa-bird-rig[data-flying="true"][data-speed="running"] .sankofa-tail-inner-right { rotate:  5deg; }
        .sankofa-bird-rig[data-flying="true"][data-speed="walking"] .sankofa-tail-outer-left,
        .sankofa-bird-rig[data-flying="true"][data-speed="running"] .sankofa-tail-outer-left  { rotate: -10deg; }
        .sankofa-bird-rig[data-flying="true"][data-speed="walking"] .sankofa-tail-outer-right,
        .sankofa-bird-rig[data-flying="true"][data-speed="running"] .sankofa-tail-outer-right { rotate:  10deg; }
        .sankofa-bird-rig[data-flying="true"][data-speed="walking"] .sankofa-tail-far-left,
        .sankofa-bird-rig[data-flying="true"][data-speed="running"] .sankofa-tail-far-left    { rotate: -16deg; }
        .sankofa-bird-rig[data-flying="true"][data-speed="walking"] .sankofa-tail-far-right,
        .sankofa-bird-rig[data-flying="true"][data-speed="running"] .sankofa-tail-far-right   { rotate:  16deg; }
        /* Celebrating — full fan display like a peacock moment */
        .sankofa-bird-rig[data-celebrating="true"] .sankofa-tail-inner-left  { rotate: -8deg; }
        .sankofa-bird-rig[data-celebrating="true"] .sankofa-tail-inner-right { rotate:  8deg; }
        .sankofa-bird-rig[data-celebrating="true"] .sankofa-tail-outer-left  { rotate: -14deg; }
        .sankofa-bird-rig[data-celebrating="true"] .sankofa-tail-outer-right { rotate:  14deg; }
        .sankofa-bird-rig[data-celebrating="true"] .sankofa-tail-far-left    { rotate: -22deg; }
        .sankofa-bird-rig[data-celebrating="true"] .sankofa-tail-far-right   { rotate:  22deg; }
        /* Battery saver: no independent fanning */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-tail-inner-left,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-tail-inner-right,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-tail-outer-left,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-tail-outer-right,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-tail-far-left,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-tail-far-right {
          rotate: 0deg !important;
          transition: none !important;
        }

        /* ══════════════════════════════════════════════════════════════════════
`;
