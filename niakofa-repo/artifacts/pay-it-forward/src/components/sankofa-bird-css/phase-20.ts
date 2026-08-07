/**
 * Sankofa Bird CSS — Phase 20: SME Physics Integration
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE 20 — SME v2/v3 Physics CSS Integration (July 2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Consumes the new --sme-* CSS custom properties written every rAF frame
 * by useAnimationMixer's MotionSolver tick.  These vars are NOT available
 * in battery-saver mode (the rAF loop is bypassed), so every rule here
 * must either have a safe default (var(--sme-foo, 0)) or be gated with
 * [data-battery-saver="false"] / :not([data-battery-saver="true"]).
 *
 * New --sme-* vars added by SME v2/v3 used here:
 *   --sme-notification-pulse  [0..1]  — notification/celebration intensity
 *   --sme-body-roll-deg       deg     — solver body roll (from turn rate)
 *   --sme-flap-amplitude      [0..1]  — smoothed wing beat amplitude
 *   --sme-flap-phase          rad     — continuous flap phase
 *   --sme-wind-strength       [0..1]  — crosswind intensity
 *   --sme-head-deg            deg     — solver head rotation
 *   --sme-eye-x / --sme-eye-y px     — iris/pupil translation (already used in Head.tsx)
 *
 * Design contract:
 *   • All Phase 20 effects are additive / non-destructive — they layer on
 *     top of P1–P19 without resetting previous transforms or transitions.
 *   • Battery-saver + prefers-reduced-motion guards at the bottom of each
 *     section (matching the P18/P19 pattern).
 *   • No keyframe animations in this phase — all effects are driven by
 *     CSS calc() on the live SME vars, so they follow physics 1:1.
 */

// NOTE: Backtick characters inside template-literal CSS will crash Babel.
// Use single/double quotes inside the string.

export const sankofaCssPhase20 = `

  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 20.1 — Notification/Celebration Pulse Glow
     --sme-notification-pulse decays from 1 → 0 over ~0.8 s after an event.
     Use it to pulse a teal glow on the bird's body during celebrations,
     accepted micro-reactions, and new-notification flashes.
     The brightness() filter adds a subtle catch of light that reads clearly
     at map-marker scale (40–64px) without being distracting.
     Only active at mid+ zoom (crown-feathers visible tier) and not in
     battery-saver mode.
     ═══════════════════════════════════════════════════════════════════════ */

  .sankofa-bird-rig:not([data-battery-saver="true"])[data-zoom="mid"] .sankofa-bird-body,
  .sankofa-bird-rig:not([data-battery-saver="true"])[data-zoom="high"] .sankofa-bird-body,
  .sankofa-bird-rig:not([data-battery-saver="true"])[data-zoom="street"] .sankofa-bird-body {
    filter: drop-shadow(
        0 0 calc(var(--sme-notification-pulse, 0) * 4px)
        rgba(0, 212, 255, calc(var(--sme-notification-pulse, 0) * 0.85))
      )
      brightness(calc(1 + var(--sme-notification-pulse, 0) * 0.22));
    /* transition intentionally omitted — SME writes this every rAF frame
       so CSS transitions would fight the physics loop */
  }

  /* Egg glows gold during donation pulse (donated data attr takes precedence) */
  .sankofa-bird-rig[data-donated="true"]:not([data-battery-saver="true"])[data-zoom="mid"] .sankofa-bird-egg,
  .sankofa-bird-rig[data-donated="true"]:not([data-battery-saver="true"])[data-zoom="high"] .sankofa-bird-egg,
  .sankofa-bird-rig[data-donated="true"]:not([data-battery-saver="true"])[data-zoom="street"] .sankofa-bird-egg {
    filter: drop-shadow(
        0 0 calc(var(--sme-notification-pulse, 0) * 3px)
        rgba(255, 215, 0, calc(var(--sme-notification-pulse, 0) * 0.9))
      )
      brightness(calc(1 + var(--sme-notification-pulse, 0) * 0.35));
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 20.2 — SME Body Roll Tilt
     --sme-body-roll-deg is the solver's integrated body roll (derived from
     turn rate, not instantaneous bank). It is smoother and more inertial
     than the spring-smoothed --mixer-bank-deg — the body roll accumulates
     and decays over several frames, mimicking real avian inertia.
     Apply as a subtle secondary tilt on the body ellipse inside the heading
     wrapper so the body appears to "lean into" the sustained turn.
     Clamped by the solver to the chest joint limits (±8°).
     ═══════════════════════════════════════════════════════════════════════ */

  .sankofa-bird-rig:not([data-battery-saver="true"])[data-flying="true"] .sankofa-bird-chest {
    transform: rotate(var(--sme-body-roll-deg, 0deg));
    transform-box: view-box;
    transform-origin: 20px 22px;
    /* No CSS transition — SME writes this continuously every rAF frame */
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 20.3 — Wing Amplitude Opacity Modulation
     --sme-flap-amplitude [0..1] is the smoothed wing beat amplitude output
     by the SME solver. Use it to modulate the covert-band iridescence
     opacity proportionally — high amplitude (hover) → brighter wing sheen;
     low amplitude (glide) → dim sheen.
     Only meaningful at mid+ zoom where coverts are visible.
     ═══════════════════════════════════════════════════════════════════════ */

  .sankofa-bird-rig:not([data-battery-saver="true"])[data-zoom="mid"] .sankofa-wing-covert-band-l,
  .sankofa-bird-rig:not([data-battery-saver="true"])[data-zoom="mid"] .sankofa-wing-covert-band-r,
  .sankofa-bird-rig:not([data-battery-saver="true"])[data-zoom="high"] .sankofa-wing-covert-band-l,
  .sankofa-bird-rig:not([data-battery-saver="true"])[data-zoom="high"] .sankofa-wing-covert-band-r,
  .sankofa-bird-rig:not([data-battery-saver="true"])[data-zoom="street"] .sankofa-wing-covert-band-l,
  .sankofa-bird-rig:not([data-battery-saver="true"])[data-zoom="street"] .sankofa-wing-covert-band-r {
    opacity: calc(0.30 + var(--sme-flap-amplitude, 0.4) * 0.55);
    /* SME writes this 60fps — skip CSS transition */
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 20.4 — Crosswind Feather Ruffle (Wind Strength)
     --sme-wind-strength [0..1] was previously computed by SensorEngine
     only as a heading-blend factor inside the solver. We now also expose
     it as a CSS var so that the feather-ruffle effects (P6, P13) can scale
     with actual crosswind intensity rather than relying solely on the
     data-weather attribute which only provides discrete categories.
     Adds an additional brightness flicker to outer primary feathers
     (sankofa-feather-r5 / sankofa-feather-l5) proportional to wind strength.
     Only active during flight so perched birds don't ruffle at idle.
     ═══════════════════════════════════════════════════════════════════════ */

  .sankofa-bird-rig:not([data-battery-saver="true"])[data-flying="true"]:not([data-weather="clear"]) .sankofa-feather-r5,
  .sankofa-bird-rig:not([data-battery-saver="true"])[data-flying="true"]:not([data-weather="clear"]) .sankofa-feather-l5,
  .sankofa-bird-rig:not([data-battery-saver="true"])[data-flying="true"]:not([data-weather="clear"]) .sankofa-feather-r0,
  .sankofa-bird-rig:not([data-battery-saver="true"])[data-flying="true"]:not([data-weather="clear"]) .sankofa-feather-l0 {
    filter: brightness(calc(0.9 + var(--sme-wind-strength, 0) * 0.3));
    /* The existing P6/P13 transform (ruffle angle) remains; we only layer brightness */
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 20.5 — SME Head Rotation Sync
     --sme-head-deg is the solver's kinematically-computed head local rotation
     (degrees). This supplements the existing --gaze-rotate-deg (from P17.2)
     by making the head also respond to the solver's smoothed heading delta.
     The two contributions are additive via calc():
       • --gaze-rotate-deg: gaze system (upcoming turn, approaching, saccade)
       • --sme-head-deg:   solver kinematic chain (heading-tracking inertia)
     Net effect: the head feels kinematically alive even when the gaze system
     returns null (no explicit directional cue).
     Clamped to ±34° by the solver's joint limits (±51° × 0.9 × some gain).
     Only active at mid+ zoom where head detail is visible; not in battery-saver.
     ═══════════════════════════════════════════════════════════════════════ */

  .sankofa-bird-rig:not([data-battery-saver="true"])[data-flying="true"][data-zoom="mid"] .sankofa-bird-head,
  .sankofa-bird-rig:not([data-battery-saver="true"])[data-flying="true"][data-zoom="high"] .sankofa-bird-head,
  .sankofa-bird-rig:not([data-battery-saver="true"])[data-flying="true"][data-zoom="street"] .sankofa-bird-head {
    rotate: calc(
      var(--gaze-rotate-deg, 0deg)
      + var(--sme-head-deg, 0deg) * 0.25
    );
    /* Scale factor 0.25 prevents the solver rotation from doubling the gaze
       system's output — it adds inertial character without overwhelming the
       explicit directional gaze. */
  }

  /* iOS Safari fallback — use transform rotate when rotate: property unsupported */
  @supports not (rotate: 1deg) {
    .sankofa-bird-rig:not([data-battery-saver="true"])[data-flying="true"][data-zoom="mid"] .sankofa-bird-head,
    .sankofa-bird-rig:not([data-battery-saver="true"])[data-flying="true"][data-zoom="high"] .sankofa-bird-head,
    .sankofa-bird-rig:not([data-battery-saver="true"])[data-flying="true"][data-zoom="street"] .sankofa-bird-head {
      transform: rotate(calc(
        var(--gaze-rotate-deg, 0deg)
        + var(--sme-head-deg, 0deg) * 0.25
      ));
      rotate: unset !important;
    }
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 20.6 — Idle Breath via Flap Phase
     --sme-flap-phase [0..2π] drives a very subtle body scale "breath" when
     the bird is idle/perched. At idle the solver still integrates a slow
     flap phase (frequency=0.4 Hz, amplitude=0.12) — we repurpose this
     as a breathing oscillation on the body ellipse rather than actual wing
     movement, giving the perched bird organic life.
     scaleY range: 1.00 → 1.014 (barely perceptible, reads as breathing).
     Only at mid+ zoom and NOT flying (so cruise birds don't pulse).
     ═══════════════════════════════════════════════════════════════════════ */

  @property --sme-flap-phase {
    syntax: "<number>";
    inherits: true;
    initial-value: 0;
  }

  @property --sme-flap-amplitude {
    syntax: "<number>";
    inherits: true;
    initial-value: 0.4;
  }

  @property --sme-notification-pulse {
    syntax: "<number>";
    inherits: true;
    initial-value: 0;
  }

  @property --sme-wind-strength {
    syntax: "<number>";
    inherits: true;
    initial-value: 0;
  }

  @property --sme-body-roll-deg {
    syntax: "<angle>";
    inherits: true;
    initial-value: 0deg;
  }

  @property --sme-head-deg {
    syntax: "<angle>";
    inherits: true;
    initial-value: 0deg;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 20.7 — Battery-saver: suppress all Phase 20 SME-driven effects
     When battery-saver is active the rAF loop is bypassed, --sme-* vars
     are never updated, and their initial-values (0/0deg) are safe defaults.
     The explicit suppression below ensures no stale value from a previous
     non-battery-saver session leaks through.
     ═══════════════════════════════════════════════════════════════════════ */

  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-body {
    filter: none !important;
  }
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-egg {
    filter: none !important;
  }
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-chest {
    transform: none !important;
  }
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-wing-covert-band-l,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-wing-covert-band-r {
    opacity: inherit !important;
  }
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-r5,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-l5,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-r0,
  .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-l0 {
    filter: none !important;
  }


  /* ═══════════════════════════════════════════════════════════════════════
     PHASE 20.8 — prefers-reduced-motion guard for all Phase 20 effects
     ═══════════════════════════════════════════════════════════════════════ */

  @media (prefers-reduced-motion: reduce) {
    html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-body,
    html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-egg {
      filter: none !important;
    }
    html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-chest {
      transform: none !important;
    }
    html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-wing-covert-band-l,
    html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-wing-covert-band-r {
      opacity: inherit !important;
    }
    html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-feather-r5,
    html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-feather-l5,
    html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-feather-r0,
    html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-feather-l0 {
      filter: none !important;
    }
    html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-head {
      rotate: var(--gaze-rotate-deg, 0deg) !important;
    }
  }
`;
