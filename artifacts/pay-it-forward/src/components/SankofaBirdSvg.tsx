import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  computeScreenRotation,
  shortestHeadingDelta,
  computeBankAngle,
  computeFlightMode,
  computeFlapPeriodMs,
  computeLeanDeg,
  computeWingExtras,
  computeTailBend,
  computeHeadLeadDeg,
  computeGazeVector,
  getSpeedTier,
  type LandingPhase as LandingPhaseMath,
  type GazeDir8,
} from "@/lib/sankofa-bird-math";

export interface SankofaBirdProps {
  /** World-frame heading in degrees (0 = true north), or null if unknown. */
  heading: number | null;
  /** Current map camera bearing in degrees — 0 in north-up mode, live in heading-up mode. */
  mapBearing?: number;
  /** Ground speed in meters/second, if known. Drives flap rate + forward lean. */
  speed?: number | null;
  /** True while turn-by-turn navigation is active (request-active screen). */
  navigating?: boolean;
  size?: number;
  /** Trigger the "celebrate" micro-reaction (request helped / donation completed). */
  celebrating?: boolean;
  /** Trigger the "notification" micro-reaction (new help request nearby). */
  newNotification?: boolean;
  /** Trigger the "accepted" micro-reaction (bird chirps + hops when request claimed). */
  accepted?: boolean;
  /** Trigger the "donation" micro-reaction — pledge paid or contribution completed.
   *  Distinct from celebrating: egg glows gold, golden sparkle particles (not teal). */
  donated?: boolean;
  /**
   * Upcoming turn direction from navigation — triggers the bird's anticipatory
   * "glance" behavior. The head tilts toward the upcoming turn a moment before
   * the instruction fires, making the mascot feel intelligent rather than reactive.
   * Only meaningful during active navigation (navigating = true).
   */
  upcomingTurnDirection?: "left" | "right" | null;
  /**
   * Current map zoom level (0–22). Used for Level-of-Detail rendering:
   *  < 10  → simplified silhouette (feather tips, highlights, legs hidden)
   *  10–14 → normal detail
   *  ≥ 15  → full cinematic detail (all layers visible, breathing active)
   * Defaults to 14 (full detail) when omitted.
   */
  mapZoom?: number;
  /**
   * True when another Niakofa user (online helper) is within ~200 m of the
   * user's current position. Triggers the bird's "wing salute" micro-reaction —
   * the left wing briefly lifts in acknowledgement then returns.
   * Reinforces that Niakofa is about human connection.
   */
  nearbyUser?: boolean;
  /**
   * True when the user is within ~50 m of the destination.
   * Triggers the bird's cinematic approach deceleration — slower flap,
   * forward pitch eases off, body begins levelling for descent.
   * The egg stays perfectly level throughout (Sankofa symbolism).
   */
  approaching?: boolean;
  /**
   * True when the user has an active accepted help request and is en route
   * to assist someone. Triggers a warm-gold shimmer on the body and wings —
   * the design doc's "Helping someone → gold shimmer" state, distinct from
   * `celebrating` (teal burst on completion) and `donated` (egg glow).
   * At rest the bird shows a subtle golden ambient halo; while flying the
   * wings shimmer gold-tinted iridescence.
   */
  isHelping?: boolean;
  /**
   * Activates battery-saver / LOD3 mode: all feather-detail, iridescence,
   * particle, and glow animations are suppressed. The bird renders as a
   * teal silhouette that still moves but without GPU-intensive effects.
   * Use when the device reports low battery, data-saving mode is on, or the
   * user opts in via accessibility settings.
   * Design doc: "LOD3 — Minimal silhouette."
   */
  batterySaver?: boolean;
  /**
   * Activates night / low-light mode: all daytime specular highlights are
   * muted, and the hsl palette shifts toward deep blue-teal (hue-rotate +22°,
   * saturate ×0.58, brightness ×0.65). The bird reads as a shadowy nocturnal
   * form rather than vibrant daytime plumage. Celebrating and donated states
   * each relax the filter so key reactions remain legible in the dark.
   * Deprecated in favour of skyTier — kept for backward compatibility.
   */
  nightMode?: boolean;
  /**
   * Community activity level (0–1). 0 = quiet neighbourhood, 1 = very busy.
   * Drives two linked behaviours:
   *  • Blink rate — faster when active (busy = alert bird), slower when quiet
   *    (relaxed sentinel resting between scans). Range: 3.5 s (peak) – 9 s (quiet).
   *  • Crown feather alertness — feathers raise and brighten when activity is
   *    high ("sentinel" posture), relax and dim when quiet ("resting" posture).
   * Updated live from the visible open-request count on the map.
   */
  activityLevel?: number;
  /**
   * Solar sky tier — granular alternative to nightMode that reflects real-world
   * lighting conditions from the NOAA solar position algorithm:
   *   "day"      — full daytime teal plumage (sun > 10°; no filter)
   *   "golden"   — warm amber wash (sun 0°–10°; sunrise/sunset golden hour)
   *   "twilight" — desaturated cool dim (sun -6° to 0°; civil twilight)
   *   "night"    — deep blue-teal shadow (sun < -6°; same as nightMode=true)
   * When omitted, falls back to nightMode prop (day vs night binary).
   * Supplied by useSolarTier() which runs the same solar math as useTimeOfDay().
   */
  skyTier?: "day" | "golden" | "twilight" | "night";
  /**
   * Override the internal navLod (navigation Level-of-Detail) value.
   * Normally the bird auto-escalates navLod based on elapsed navigation time:
   *   0 = full detail (0–10 min), 1 = decorative layers dimmed (10–30 min),
   *   2 = near-silhouette (30 min+).
   * When this prop is set, the internal timer is bypassed — useful for testing
   * and the /bird-test NavLodSimDemo without waiting for real elapsed time.
   */
  navLodOverride?: 0 | 1 | 2;
}

type LandingPhase = LandingPhaseMath;

/**
 * SankofaBird
 *
 * The app's animated navigation marker — a teal Sankofa bird with layered
 * SVG body parts, each animated independently:
 *
 *  Idle:       gentle float + slow wing flap, tail sways, eye blinks.
 *  Navigating: leans forward, wings flap faster with GPS speed, differential
 *              wing banking into turns (outside wing extends, inside folds),
 *              tail bends toward the turn direction.
 *  Landing:    multi-stage sequence: flying → slowflap → hover → perch → idle.
 *  Heading:    whole bird rotates to the compass direction (heading – mapBearing).
 *
 * Micro-reactions (wired to WS events):
 *  celebrating:     bird + egg glow teal, feather shimmer (help completed / donation).
 *  newNotification: head tilts + wing flick, teal pulse.
 *  accepted:        small hop + wing stretch (request claimed).
 *
 * Symbolism: the egg stays perfectly level in the beak at all times, even
 * while banking — "carrying the future forward" regardless of the journey.
 */
export function SankofaBirdSvg({
  heading,
  mapBearing = 0,
  speed = 0,
  navigating = false,
  size = 40,
  celebrating = false,
  newNotification = false,
  accepted = false,
  donated = false,
  upcomingTurnDirection = null,
  mapZoom = 14,
  nearbyUser = false,
  approaching = false,
  isHelping = false,
  batterySaver = false,
  nightMode = false,
  activityLevel = 0,
  skyTier,
  navLodOverride,
}: SankofaBirdProps) {
  const hasHeading = typeof heading === "number" && !Number.isNaN(heading);
  const screenRotationDeg = hasHeading
    ? computeScreenRotation(heading as number, mapBearing)
    : 0;

  // ── Unique gradient IDs — prevents fill:url(#id) collisions when multiple
  //    SankofaBird instances are mounted simultaneously (e.g. /bird-test).
  //    React 18 useId() returns stable, component-scoped strings.
  const _uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const eggGradId     = `sk-egg-${_uid}`;
  const eggGoldGradId = `sk-egg-gold-${_uid}`;
  const bodyGradId    = `sk-body-${_uid}`;
  const wingGradLeftId  = `sk-wl-${_uid}`;
  const wingGradRightId = `sk-wr-${_uid}`;

  // ── Bank angle: computed from heading change RATE, not heading value ────────
  // A straight heading at any speed gives zero bank. Only a heading *change*
  // (turning) produces bank — exactly how a real bird (or aircraft) behaves.
  const lastHeadingRef = useRef<number | null>(null);
  const [bankDeg, setBankDeg] = useState(0);

  useEffect(() => {
    if (!hasHeading) return;
    const prev = lastHeadingRef.current;
    lastHeadingRef.current = heading as number;
    if (prev === null) return;
    const delta = shortestHeadingDelta(prev, heading as number);
    const bank = computeBankAngle(delta);
    setBankDeg(bank);
    const t = setTimeout(() => { setBankDeg(0); }, 700);
    return () => clearTimeout(t);
  }, [heading, hasHeading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Multi-stage takeoff + landing sequence ─────────────────────────────────
  //
  // Takeoff (false→true): idle → takeoff (1 200ms) → flying
  //   The bird crouches, spreads wings, two strong power flaps, then cruises.
  //   This is the "Tap Navigate → Bird chirps → spreads wings → takeoff" flow
  //   described in the vision doc.
  //
  // Landing (true→false): flying → slowflap (800ms) → hover (1 400ms) → perch (2 000ms) → idle
  //   Multi-stage deceleration: "Glide → Wing flare → Legs extend → Touchdown → Wings fold"
  //
  // Initialised from the navigating prop so a component mounted mid-navigation
  // (e.g. navigating=true from the start) doesn't play the takeoff animation.
  const [landingPhase, setLandingPhase] = useState<LandingPhase>(
    () => navigating ? "flying" : "idle",
  );
  const prevNavigatingRef = useRef(navigating);

  useEffect(() => {
    const wasNavigating = prevNavigatingRef.current;
    prevNavigatingRef.current = navigating;

    if (!wasNavigating && navigating) {
      // ── Takeoff: idle → takeoff (1 200ms) → flying ──────────────────────
      setLandingPhase("takeoff");
      const t = setTimeout(() => setLandingPhase("flying"), 1200);
      return () => clearTimeout(t);
    }

    if (wasNavigating && !navigating) {
      // ── Landing: flying → dive → slowflap → hover → perch → idle ────────
      // "dive" (600ms): bird pitches forward sharply, wings pull in — the
      // cinematic approach-to-destination descent from the vision doc.
      // "slowflap" (800ms): wings re-spread, deceleration flaps.
      // "hover" (1 400ms): stable hover, legs dangle.
      // "perch" (2 000ms): final touchdown + wings fold.
      setLandingPhase("dive");
      const t0 = setTimeout(() => setLandingPhase("slowflap"),  600);
      const t1 = setTimeout(() => setLandingPhase("hover"),    1400);  // 600 + 800
      const t2 = setTimeout(() => setLandingPhase("perch"),    2800);  // 600 + 800 + 1 400
      const t3 = setTimeout(() => setLandingPhase("idle"),     4800);  // 600 + 800 + 1 400 + 2 000
      return () => { clearTimeout(t0); clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }

    return undefined;
  }, [navigating]);

  const speedMs = speed ?? 0;

  // ── Level-of-Detail: zoom-driven rendering tier ─────────────────────────────
  // < 10  → "low"  — simplified silhouette (feather tips, highlights, legs hidden)
  // 10-14 → "mid"  — normal detail
  // ≥ 15  → "high" — full cinematic detail
  // 4-tier LOD system matching the design doc (LOD0–LOD3):
  // LOD3="low" (<10), LOD2="mid" (10-13), LOD1="high" (14-16), LOD0="street" (≥17)
  const zoomTier = mapZoom < 10 ? "low" : mapZoom >= 17 ? "street" : mapZoom >= 14 ? "high" : "mid";

  // ── Flight mode flags (pure functions from sankofa-bird-math) ───────────────
  const { isMoving, isGliding, isVisuallyGliding } = computeFlightMode(speedMs, navigating, landingPhase);

  // ── Flap rate: 1/sec idle → 5/sec driving → glide at airplane speed ────────
  const flapPeriodMs = useMemo(
    () => computeFlapPeriodMs({ isMoving, isGliding, speedMs, landingPhase }),
    [isMoving, isGliding, speedMs, landingPhase],
  );

  // ── Wingbeat variability (Phase 16) — Niakofa doc §1 ────────────────────────
  // Real birds never flap at a perfectly constant rhythm. Introduce ±12% random
  // timing variation that cycles every 3–8 flap periods — below conscious
  // perception, reads as organic (Niakofa doc: "tiny variations make it alive").
  // Battery-saver and idle states: jitter suppressed (jitter = 1.0, steady rhythm).
  // The jitter is a multiplier on flapPeriodMs; effectiveFlapMs is what CSS sees.
  const [flapJitter, setFlapJitter] = useState(1.0);
  const flapJitterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (batterySaver || !isMoving) {
      setFlapJitter(1.0);
      if (flapJitterTimerRef.current) clearTimeout(flapJitterTimerRef.current);
      return;
    }
    const schedule = () => {
      const cyclesUntilNext = 3 + Math.random() * 5; // 3–8 flap cycles
      flapJitterTimerRef.current = setTimeout(() => {
        setFlapJitter(0.88 + Math.random() * 0.24); // [0.88, 1.12] = ±12%
        schedule();
      }, flapPeriodMs * cyclesUntilNext);
    };
    schedule();
    return () => { if (flapJitterTimerRef.current) clearTimeout(flapJitterTimerRef.current); };
  }, [isMoving, batterySaver, flapPeriodMs]); // eslint-disable-line react-hooks/exhaustive-deps

  // effectiveFlapMs: jittered period injected into --flap-period CSS var.
  // All wing, tail, float, and glow animations read this var, so the entire
  // body animates at the same jittered rate — no per-element math needed.
  const effectiveFlapMs = Math.round(flapPeriodMs * flapJitter);

  // ── Body lean angle ─────────────────────────────────────────────────────────
  const leanDeg = useMemo(
    () => computeLeanDeg({ isMoving, isGliding, speedMs, landingPhase }),
    [isMoving, isGliding, speedMs, landingPhase],
  );

  // ── Differential wing banking ───────────────────────────────────────────────
  // Turning left  (bankDeg < 0): right (outside) extends, left (inside) folds
  // Turning right (bankDeg > 0): left (outside) extends, right (inside) folds
  const { leftExtra: leftWingExtra, rightExtra: rightWingExtra } = computeWingExtras(bankDeg);

  // ── Tail direction: bends toward the turning direction ──────────────────────
  const tailBendDeg = computeTailBend(bankDeg);

  // ── Head-lead: head rotates into the turn ahead of the body ─────────────────
  // Combines the reactive bank signal with the anticipatory upcoming-turn glance.
  // When data-upcoming-turn is set the existing anticipate-left/right animation
  // fires; this var still contributes via [data-upcoming-turn="none"] CSS rule
  // so the head pre-rotates even without an explicit upcoming-turn signal.
  const headLeadDeg = computeHeadLeadDeg(bankDeg, upcomingTurnDirection);

  // ── data-turning: actual in-progress bank direction (Phase 14) ───────────────
  // Distinct from data-upcoming-turn (nav signal, fires 1-2 s BEFORE the turn).
  // data-turning fires when the bird IS actively banking (|bankDeg| ≥ 8°).
  // Threshold 8° filters micro heading-drift — only committed turns trigger it.
  // Used by CSS Phase 14 for stronger wing-sweep and body-commit than upcoming-turn alone.
  const turningDir: "left" | "right" | "none" =
    Math.abs(bankDeg) >= 8 ? (bankDeg < 0 ? "left" : "right") : "none";
  // Normalized bank intensity [0, 1]: 0 = straight flight, 1 = max 25° bank.
  // Injected as --turn-intensity CSS var for smooth intensity-scaled effects.
  const turnIntensity = Math.min(1, Math.abs(bankDeg) / 25);

  // ── Real-time gaze vector (Phase 12 / Phase 13) ──────────────────────────────
  // Combines bank, anticipatory turn signal, flight phase, and speed into a
  // 2D gaze direction that drives analog CSS-var eye/iris translation AND a
  // discrete data-gaze attribute for head/neck structural rotation.
  //
  // Key behavior: the bird glances toward the NEXT turn BEFORE the map
  // instruction fires — upcomingTurnDirection is set 1-2 s before the turn,
  // so the eye/head both pre-rotate while the body is still flying straight.
  const { gazeDirX, gazeDirY, gazeDir8 } = computeGazeVector({
    bankDeg,
    upcomingTurn: upcomingTurnDirection,
    landingPhase,
    speedMs,
    isHelping,
    approaching,
  });
  // ── Phase 15: Autonomous idle scan ──────────────────────────────────────────
  // When the bird is perched/idle and not navigating, computeGazeVector always
  // returns "center" (bankDeg=0, no upcoming turn, speedMs=0). The idle scan
  // overrides this with a periodic directional cycle — a real avian alertness
  // behavior (scanning for predators, noticing movement). This makes the perched
  // bird feel alive without any external input.
  //
  // Scan interval: 3.5–6.5 s random — below conscious perception, reads as organic.
  // Pattern: cycles through all 8 directions + center pauses for natural rhythm.
  // Battery-saver: scan halted, eye/head returns to center.
  const [idleScanDir, setIdleScanDir] = useState<GazeDir8>("center");
  const idleScanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isIdle = !isMoving && (landingPhase === "idle" || landingPhase === "perch");

  useEffect(() => {
    if (!isIdle || batterySaver) {
      setIdleScanDir("center");
      if (idleScanTimerRef.current) clearTimeout(idleScanTimerRef.current);
      return;
    }
    const scanPattern: GazeDir8[] = [
      "center", "left", "up-left", "up", "center",
      "up-right", "right", "down-right", "center", "down", "down-left", "center",
    ];
    let idx = 0;
    const schedule = () => {
      const delay = 3500 + Math.random() * 3000; // 3.5–6.5 s per position
      idleScanTimerRef.current = setTimeout(() => {
        idx = (idx + 1) % scanPattern.length;
        setIdleScanDir(scanPattern[idx]);
        schedule();
      }, delay);
    };
    schedule();
    return () => { if (idleScanTimerRef.current) clearTimeout(idleScanTimerRef.current); };
  }, [isIdle, batterySaver]); // eslint-disable-line react-hooks/exhaustive-deps

  // Merge idle scan with computed gaze.
  // Flying/navigating: use computeGazeVector output (bank-reactive + anticipatory).
  // Perched/idle:      use idle scan direction (autonomous alertness cycle).
  const effectiveGazeDir8: GazeDir8 = (isIdle && !batterySaver) ? idleScanDir : gazeDir8;
  // Derive analog X/Y from idle scan direction for smooth eye/iris movement.
  // These map the discrete GazeDir8 string back to analog [-1, 1] values.
  const effectiveGazeDirX: number = (isIdle && !batterySaver)
    ? (idleScanDir.includes("left") ? -0.55 : idleScanDir.includes("right") ? 0.55 : 0)
    : gazeDirX;
  const effectiveGazeDirY: number = (isIdle && !batterySaver)
    ? (idleScanDir.includes("up") ? -0.42 : idleScanDir.includes("down") ? 0.42 : 0)
    : gazeDirY;

  // ── Speed factor CSS var — drives flutter amplitude beyond the base flap ──
  // Walking: 0.0 → minimal turbulence. Driving: 0.8 → visible flutter.
  // Airplane: 1.0 → maximum trailing-edge blur. Used in CSS for feather
  // micro-movement that scales with wind pressure, not just flap timing.
  const speedFactor = Math.min(1, speedMs / 15);

  // ── Navigation session duration → auto-escalating LOD throttle ──────────────
  // Prevents GPU/battery drain on older phones during long navigation sessions.
  // After 10 min of continuous navigating → navLod=1 (pause decorative layers).
  // After 30 min → navLod=2 (pause nearly all non-essential GPU work).
  // Resets to 0 immediately when navigation ends.
  const navStartRef = useRef<number | null>(null);
  const [navLod, setNavLod] = useState(0);

  // ── IntersectionObserver — off-screen animation pause ────────────────────────
  // When the bird rig scrolls off-screen (e.g. on a long nav session where the
  // user leaves the map tab open but isn't looking), pausing all CSS animations
  // via animation-play-state removes GPU rasterisation cost entirely.
  // Critical for older phones (Snapdragon 636, Mali-G51) during 30+ min sessions.
  const rigRef = useRef<HTMLDivElement>(null);
  const [isOffScreen, setIsOffScreen] = useState(false);
  useEffect(() => {
    if (navigating) {
      if (navStartRef.current === null) navStartRef.current = Date.now();
      const id = setInterval(() => {
        const elapsed = Date.now() - (navStartRef.current ?? Date.now());
        if      (elapsed >= 30 * 60_000) setNavLod(2);
        else if (elapsed >= 10 * 60_000) setNavLod(1);
        else                              setNavLod(0);
      }, 60_000);
      return () => clearInterval(id);
    } else {
      navStartRef.current = null;
      setNavLod(0);
      return undefined;
    }
  }, [navigating]);

  // ── IntersectionObserver: pause all animations when off-screen ──────────────
  useEffect(() => {
    const el = rigRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsOffScreen(!entry.isIntersecting),
      { rootMargin: "40px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Activity tier: maps continuous 0–1 level to a named CSS tier ─────────────
  // "quiet"  0–0.2  — relaxed idle (slow blink, drooped crown)
  // "normal" 0.2–0.6 — standard animation; the baseline
  // "busy"   0.6–0.85 — alert posture (faster blink, raised crown, brighter tips)
  // "peak"   0.85–1.0 — maximum alert (rapid blink, fully-erect crown, micro-tremble)
  const activityTier =
    activityLevel >= 0.85 ? "peak"  :
    activityLevel >= 0.60 ? "busy"  :
    activityLevel >= 0.20 ? "normal" : "quiet";

  // Blink period (ms): slower when the community is quiet, faster when busy.
  // The eye is a social organ — the bird blinks more when it's scanning the
  // neighbourhood. Range: 3.5 s (peak) – 9 s (quiet). Injected as CSS var.
  const blinkPeriodMs =
    activityTier === "peak"   ? 3500 :
    activityTier === "busy"   ? 5000 :
    activityTier === "quiet"  ? 9000 : 7000;

  // ── Effective sky tier ────────────────────────────────────────────────────────
  // skyTier prop takes precedence; nightMode provides boolean backward-compat.
  const effectiveSkyTier = skyTier ?? (nightMode ? "night" : "day");

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size * 1.6, height: size * 1.6, overflow: "visible" }}
      data-celebrating={celebrating ? "true" : "false"}
      data-notification={newNotification ? "true" : "false"}
      data-accepted={accepted ? "true" : "false"}
      data-donated={donated ? "true" : "false"}
      data-nearby-user={nearbyUser ? "true" : "false"}
    >
      {/* Ground-presence rings — pulse faster while moving */}
      <div
        className="absolute rounded-full bg-primary opacity-15 animate-ping"
        style={{
          width: size, height: size,
          animationDuration: isMoving ? "1.2s" : "2s",
        }}
      />
      <div
        className="absolute rounded-full bg-primary opacity-25 animate-ping"
        style={{
          width: size * 0.6, height: size * 0.6,
          animationDuration: isMoving ? "1.2s" : "2s",
          animationDelay: "0.5s",
        }}
      />

      {/* Heart pulse ring — expands from center on "someone helps" (request completed) */}
      {celebrating && (
        <div
          className="absolute rounded-full border-2 border-primary sankofa-heart-pulse pointer-events-none"
          style={{ width: size * 1.3, height: size * 1.3 }}
        />
      )}

      {/* Teal particle burst — appears on help completed.
          Each particle uses --deg so the keyframe can rotate it outward correctly.
          Inline transform was previously overridden by the animation (CSS animations
          take precedence over inline styles), causing all 8 particles to fire from
          the center instead of their pre-rotated positions. */}
      {celebrating && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => (
            <div
              key={deg}
              className="absolute w-1 h-1 rounded-full bg-primary sankofa-particle"
              style={{
                "--deg": `${deg}deg`,
                animationDelay: `${deg * 2}ms`,
              } as React.CSSProperties}
            />
          ))}
        </div>
      )}

      {/* Golden sparkle particles — pledge paid / donation completed.
          Distinct from celebrating: these are gold not teal, and 6-pointed.
          Same --deg pattern as teal burst: keyframe owns the rotation so
          the animation doesn't clobber an inline transform. */}
      {donated && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {[0, 60, 120, 180, 240, 300].map(deg => (
            <div
              key={deg}
              className="absolute sankofa-golden-sparkle"
              style={{
                "--deg": `${deg}deg`,
                width: size * 0.12,
                height: size * 0.12,
                background: "#f5d98a",
                borderRadius: "2px",
                animationDelay: `${deg * 3}ms`,
              } as React.CSSProperties}
            />
          ))}
        </div>
      )}

      {/* ── Compass rotation wrapper ─────────────────────────────────── */}
      <div
        className="absolute transition-transform duration-150 ease-linear"
        style={{
          width: size,
          height: size,
          transform: `rotate(${screenRotationDeg}deg)`,
          willChange: "transform",
        }}
      >
        {/* Trailing particles — positioned below the bird body (backward in
            SVG-local space). Appear during movement AND the first landing phase.
            Also visible during takeoff so the burst starts immediately.
            Speed-tiered shapes per the vision doc:
              walking  → tiny soft feather dots (3 small circles, staggered)
              running  → longer particle streaks (elongated ovals, wider spacing)
              driving  → slim wind-streak rectangles, 4 particles
              airplane → 2 wide wisp bars with blur */}
        {(isMoving || landingPhase === "slowflap" || landingPhase === "dive" || landingPhase === "takeoff") && (() => {
          const tier = getSpeedTier(speedMs);
          if (tier === "airplane") {
            // Wide wisp bars — horizontal blur streaks for near-aircraft speed
            return [0, 1].map(i => (
              <div
                key={i}
                className="absolute bg-primary sankofa-trail"
                style={{
                  width:         size * (0.28 - i * 0.06),
                  height:        size * 0.025,
                  borderRadius:  "3px",
                  left:          size * (0.22 + i * 0.18),
                  top:           size * (0.76 + i * 0.04),
                  opacity:       0.6 - i * 0.12,
                  animationDelay: `${i * 80}ms`,
                }}
              />
            ));
          }
          if (tier === "driving") {
            // Slim wind-streak rectangles — 4 narrow bars
            return [0, 1, 2, 3].map(i => (
              <div
                key={i}
                className="absolute bg-primary sankofa-trail"
                style={{
                  width:         size * 0.055,
                  height:        size * 0.028,
                  borderRadius:  "2px",
                  left:          size * (0.28 + i * 0.12),
                  top:           size * 0.78,
                  opacity:       0.58 - i * 0.08,
                  animationDelay: `${i * 110}ms`,
                }}
              />
            ));
          }
          if (tier === "running") {
            // Elongated ovals — longer than walking dots, wider spacing
            return [0, 1, 2].map(i => (
              <div
                key={i}
                className="absolute bg-primary sankofa-trail"
                style={{
                  width:         size * 0.1,
                  height:        size * 0.055,
                  borderRadius:  "50%",
                  left:          size * (0.32 + i * 0.13),
                  top:           size * 0.79,
                  opacity:       0.75 - i * 0.15,
                  animationDelay: `${i * 160}ms`,
                }}
              />
            ));
          }
          // walking — tiny soft feather dots, tightly grouped
          return [0, 1, 2].map(i => (
            <div
              key={i}
              className="absolute bg-primary sankofa-trail"
              style={{
                width:         size * 0.075,
                height:        size * 0.075,
                borderRadius:  "50%",
                left:          size * (0.38 + i * 0.09),
                top:           size * 0.80,
                opacity:       0.55 - i * 0.1,
                animationDelay: `${i * 240}ms`,
              }}
            />
          ));
        })()}

        {/* ── Body-bank rig + animation state ─────────────────────── */}
        <div
          ref={rigRef}
          className="sankofa-bird-rig"
          style={
            {
              width: size,
              height: size,
              transform: `rotate(${bankDeg}deg)`,
              // Banking settle: @property-registered vars can be transitioned.
              // Merging here alongside transform so inline style doesn't suppress
              // CSS-level transitions. When bankDeg→0, lean/wing/tail all ease
              // back smoothly — the "everything settles" effect from the doc.
              transition: "transform 0.35s ease-out, --lean-deg 0.45s ease-out, --tail-bend 0.40s ease-out, --bank-angle 0.35s ease-out, --left-wing-extra 0.40s ease-out, --right-wing-extra 0.40s ease-out",
              willChange: "transform",
              "--flap-period": `${effectiveFlapMs}ms`,
              "--lean-deg": `${leanDeg}deg`,
              "--left-wing-extra": `${leftWingExtra}deg`,
              "--right-wing-extra": `${rightWingExtra}deg`,
              "--tail-bend": `${tailBendDeg}deg`,
              // --bank-angle is the raw bank-in-degrees value (not scaled like --tail-bend).
              // Required by effect #22 (asymmetric tail banking spread) which drives outer vs.
              // inner tail feather asymmetry directly from the bankDeg value.
              "--bank-angle": `${bankDeg}deg`,
              "--head-lead-deg": `${headLeadDeg}deg`,
              // Heading-aware iridescence: as the bird rotates on screen, the wing-
              // highlight hue shifts to mimic real iridescent feathers (hummingbird
              // effect). Uses screenRotationDeg (screen-relative), NOT raw heading —
              // iridescence is a viewer-angle effect (you see different feather colors
              // depending on your viewing angle), which is screen-relative. This is
              // intentionally different from --lighting-factor which uses world-frame
              // heading because the sun is fixed in the real world.
              // CSS keyframe applies 0.25× scale: 90°→22.5°, 180°→45°, 270°→67.5° hue-shift.
              "--heading-deg": `${screenRotationDeg}deg`,
              // Speed factor (0–1) drives feather flutter amplitude beyond
              // the base flap timing — at driving speed secondary feathers
              // vibrate visibly; at airplane speed trailing edges blur.
              "--speed-factor": `${speedFactor}`,
              // Blink period (ms): driven by community activity level.
              // quiet=9 s, normal=7 s (default), busy=5 s, peak=3.5 s.
              // Declared here as an inline CSS var so the eye/eyelid/iris
              // animations can all reference var(--blink-period) from CSS
              // without any JS-level DOM manipulation.
              "--blink-period": `${blinkPeriodMs}ms`,
              // Real-time gaze direction (-1 to +1 on each axis).
              // X: -1=look left (beak direction), +1=look right.
              // Y: -1=look up (skyward), +1=look down (groundward).
              // CSS uses these to translate eye/iris/catchlight smoothly.
              "--gaze-x": `${effectiveGazeDirX.toFixed(3)}`,
              "--gaze-y": `${effectiveGazeDirY.toFixed(3)}`,
              // Normalized bank intensity [0,1] — used by Phase 14 CSS for
              // intensity-scaled wing-sweep and body-commit during hard banking.
              "--turn-intensity": `${turnIntensity.toFixed(3)}`,
              // Directional lighting factor: "sun" from upper-left (NW = 315°).
              // cos((rawHeading − 315°)) gives +1 when the bird faces the sun, −1 away.
              // Scaled to [0.18, 0.82] → breast sheen brightest when facing NW.
              // MUST use the raw world-frame heading, not screenRotationDeg:
              //   screenRotationDeg = (heading − mapBearing) is screen-relative and
              //   moves with the camera. The sun is fixed in the real world — it never
              //   rotates with the map. Using screenRotationDeg was the physics bug.
              //   When heading is unknown, neutral 0.5 gives static opacity 0.22.
              // initial-value 0.5 in @property gives static 0.22 on old browsers.
              "--lighting-factor": `${Math.round((Math.cos(((hasHeading ? (heading as number) : 0) - 315) * Math.PI / 180) * 0.32 + 0.5) * 100) / 100}`,
            } as React.CSSProperties
          }
          data-flying={isMoving ? "true" : "false"}
          data-gliding={isVisuallyGliding ? "true" : "false"}
          data-landing={landingPhase}
          data-celebrating={celebrating ? "true" : "false"}
          data-notification={newNotification ? "true" : "false"}
          data-accepted={accepted ? "true" : "false"}
          data-donated={donated ? "true" : "false"}
          data-upcoming-turn={upcomingTurnDirection ?? "none"}
          data-zoom={zoomTier}
          data-nearby-user={nearbyUser ? "true" : "false"}
          data-speed={getSpeedTier(speedMs)}
          data-approaching={approaching ? "true" : "false"}
          data-helping={isHelping ? "true" : "false"}
          data-battery-saver={batterySaver ? "true" : "false"}
          data-night-mode={effectiveSkyTier === "night" ? "true" : "false"}
          data-sky-tier={effectiveSkyTier}
          data-activity={activityTier}
          data-nav-lod={(navLodOverride ?? navLod).toString()}
          data-off-screen={isOffScreen ? "true" : "false"}
          data-gaze={effectiveGazeDir8}
          data-turning={turningDir}
        >
          <svg
            width={size}
            height={size}
            viewBox="0 0 40 40"
            overflow="visible"
            style={{ overflow: "visible" }}
            className="drop-shadow-[0_0_10px_rgba(0,212,255,0.9)] sankofa-bird-body sankofa-svg-root"
          >
            {/* ── Gradient defs — unique IDs per instance avoid fill:url() clashes ── */}
            <defs>
              {/* Egg: jade-like inner glow — light at top-left (highlight), deep teal
                  at the rim — mimics polished stone catching light from inside. */}
              <radialGradient id={eggGradId} cx="38%" cy="28%" r="68%" fx="32%" fy="22%">
                <stop offset="0%"   stopColor="hsl(190, 100%, 90%)" />
                <stop offset="35%"  stopColor="hsl(190, 100%, 70%)" />
                <stop offset="100%" stopColor="hsl(190, 85%, 42%)" />
              </radialGradient>
              {/* Egg gold: celebration / donation state — warm golden jade */}
              <radialGradient id={eggGoldGradId} cx="38%" cy="28%" r="68%" fx="32%" fy="22%">
                <stop offset="0%"   stopColor="#fff8d6" />
                <stop offset="35%"  stopColor="#ffe066" />
                <stop offset="100%" stopColor="#b87200" />
              </radialGradient>
              {/* Body: 3-D depth gradient — bright highlight at chest-top-left (NW lit),
                  rich mid-teal in centre, deep shadow at lower-right belly. This single
                  gradient replaces the flat-colour ellipse and instantly reads as a
                  rounded 3-D form — "like polished jade" from the design doc.
                  cx/cy at 28/22% places the specular at the upper-left (the "sun from NW"
                  lighting model used for --lighting-factor). */}
              <radialGradient id={bodyGradId} cx="28%" cy="22%" r="78%" fx="20%" fy="15%">
                <stop offset="0%"   stopColor="hsl(190, 100%, 80%)" />
                <stop offset="30%"  stopColor="hsl(190, 100%, 55%)" />
                <stop offset="70%"  stopColor="hsl(190, 90%, 40%)" />
                <stop offset="100%" stopColor="hsl(190, 80%, 28%)" />
              </radialGradient>
              {/* Left wing gradient: leading-edge highlight → trailing-edge shadow.
                  Applied as a fill on the main wing shape for an angled wing-panel
                  depth cue — the leading edge (toward head) is lighter because it
                  faces the light; the trailing edge (toward tail) is shadowed. */}
              <linearGradient id={wingGradLeftId} x1="100%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%"   stopColor="hsl(190, 100%, 62%)" stopOpacity="0.9" />
                <stop offset="50%"  stopColor="hsl(190, 100%, 48%)" stopOpacity="1" />
                <stop offset="100%" stopColor="hsl(190, 80%, 35%)"  stopOpacity="1" />
              </linearGradient>
              {/* Right wing gradient: mirror of left — leading edge (toward head = rightward) */}
              <linearGradient id={wingGradRightId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%"   stopColor="hsl(190, 100%, 62%)" stopOpacity="0.9" />
                <stop offset="50%"  stopColor="hsl(190, 100%, 44%)" stopOpacity="1" />
                <stop offset="100%" stopColor="hsl(190, 80%, 32%)"  stopOpacity="1" />
              </linearGradient>
            </defs>
            {/* ── Dynamic ground shadow — altitude illusion ─────────────────── */}
            {/* Hovering: shadow small and round. Fast flight: shadow stretches
                wide and flattens (bird is "higher"). Landing: widens as bird
                descends. The brain instantly reads depth from this single cue.
                Shadow is rendered first (below all body parts in z-order). */}
            <ellipse
              className="sankofa-bird-shadow"
              cx="20"
              cy="39.5"
              rx={isGliding ? 10
                : isMoving ? 7 + Math.min(speedMs * 0.25, 3)
                // Doc: "Landing: shadow widens." The approach and hover phases show
                // a wider shadow as the bird descends (altitude illusion — lower bird
                // = larger ground shadow). Perch settles to a medium spread before
                // narrowing to the idle resting shadow at the end of the sequence.
                : (landingPhase === "hover" || landingPhase === "slowflap") ? 8
                : landingPhase === "perch" ? 6.5
                : landingPhase === "dive" ? 7.5
                : 5}
              ry={isGliding ? 0.7
                : isMoving ? 0.9
                : (landingPhase === "hover" || landingPhase === "slowflap") ? 1.1
                : landingPhase === "perch" ? 1.25
                : landingPhase === "dive" ? 1.0
                : 1.4}
              fill="rgba(0,0,0,0.22)"
              style={{
                transition: "rx 0.6s ease-out, ry 0.6s ease-out",
                filter: "blur(1px)",
              }}
            />

            {/* ── Ambient glow layer ─────────────────────────────────────────────
                Doc (20-30 independent parts): "Glow Layer" as a named rig piece.
                A large blurred ellipse behind all feathers and body — CSS animates
                its opacity when navigating, celebrating, or donating.
                blur(4px) spreads the fill into a soft bioluminescent halo:
                the "glow comes from inside, like polished jade" effect.
                Default opacity 0 (hidden); CSS drives all visible states. */}
            <ellipse
              className="sankofa-glow-layer"
              cx="20" cy="21"
              rx="13" ry="11"
              fill="hsl(190, 100%, 55%)"
              opacity={0}
              style={{ filter: "blur(4px)" }}
            />

            {/* ── Tail — directional bend, distinct feather tips ────────────── */}
            {/* Base tail shape — also tagged sankofa-tail-center for Phase 3 differential iridescence.
                The central rectrices face dorsally and catch light at a different angle than the
                outer fan feathers; CSS drives their hue-rotate independently via .sankofa-tail-center. */}
            <path
              className="sankofa-bird-tail sankofa-tail-center"
              d="M20 24 C17 30 15 34 12 37 C16 35.5 19 34.5 20 33 C21 34.5 24 35.5 28 37 C25 34 23 30 20 24 Z"
              fill="hsl(190, 90%, 40%)"
              opacity={0.9}
            />
            {/* Tail primary feather tip — centre */}
            <path
              className="sankofa-bird-tail sankofa-tail-center"
              d="M20 32 C19.5 34.5 20 36.5 20 38 C20.5 36.5 20.5 34.5 20 32 Z"
              fill="hsl(190, 100%, 55%)"
              opacity={0.85}
            />
            {/* Tail primary feather tip — left */}
            <path
              className="sankofa-bird-tail"
              d="M16.5 33.5 C15.5 35.5 14.5 37 13.5 38 C15 37 16.5 35.5 17 33.5 Z"
              fill="hsl(190, 100%, 50%)"
              opacity={0.75}
            />
            {/* Tail primary feather tip — right */}
            <path
              className="sankofa-bird-tail"
              d="M23.5 33.5 C24.5 35.5 25.5 37 26.5 38 C25 37 23.5 35.5 23 33.5 Z"
              fill="hsl(190, 100%, 50%)"
              opacity={0.75}
            />
            {/* Tail outer-left feather tip — 5th feather (doc: "Tail 5 feathers").
                The outermost rectrix on each side; shorter and curved outward,
                creating the characteristic fan shape of a bird in glide/hover.
                Slight hue shift (186°) separates it from the inner feathers,
                giving the tail band visual depth. */}
            <path
              className="sankofa-bird-tail sankofa-tail-outer-left"
              d="M13.5 34 C12 35.5 11 37 10 38.5 C11.5 37.5 13 36 14.5 34.5 Z"
              fill="hsl(186, 95%, 44%)"
              opacity={0.62}
            />
            {/* Tail outer-right feather tip — symmetrical with outer-left */}
            <path
              className="sankofa-bird-tail sankofa-tail-outer-right"
              d="M26.5 34 C28 35.5 29 37 30 38.5 C28.5 37.5 27 36 25.5 34.5 Z"
              fill="hsl(186, 95%, 44%)"
              opacity={0.62}
            />

                        {/* Tail far-outer feathers — complete the 8-feather fan matching the reference image.
                The extreme outer curved tips that finish the tail spread silhouette. */}
            <path
              className="sankofa-bird-tail sankofa-tail-far-left"
              d="M11.0 35.5 C9.5 37.5 8.5 39.0 7.5 40.0 C9.0 38.5 10.5 37.0 12.0 35.5 Z"
              fill="hsl(186, 90%, 42%)"
              opacity={0.5}
            />
            <path
              className="sankofa-bird-tail sankofa-tail-far-right"
              d="M29.0 35.5 C30.5 37.5 31.5 39.0 32.5 40.0 C31.0 38.5 29.5 37.0 28.0 35.5 Z"
              fill="hsl(186, 90%, 42%)"
              opacity={0.5}
            />

            {/* ── Right wing (outside on left turns) ───────────────────────── */}
            <path
              className="sankofa-bird-wing-right"
              d="M20 17 C26 14 33 12 37 7 C35 14 31 19 25 22 C22.5 21 20.5 19 20 17 Z"
              fill={`url(#${wingGradRightId})`}
            />
            {/* ── Right wing BOTTOM surface (design doc: RIGHT WING BOTTOM layer) ───────
                Underside of the right wing — lighter cream-teal, visible when the bird
                banks left (inside wing shows underside) or during hover phase.
                Sits below primary tips in z-order. Hidden at low zoom to reduce noise. */}
            <path
              className="sankofa-bird-wing-right-btm"
              d="M20 19 C25 18.5 31 17.5 35 15.5 C32.5 18.5 28 22 23 23.5 C21.2 23 20.2 21.2 20 19 Z"
              fill="hsl(190, 55%, 70%)"
              opacity={0}
            />
            {/* Right wing primary feather tips — 5 separated tips (layer 1: primaries).
                r0: extreme outermost, r1–r3: main fan, r4: inner bridge to secondaries.
                Numbered classes give each tip its own animation-delay so outer primaries
                move first — "Primary feathers move first → Secondary feathers lag." */}
            {/* r5 — most extreme right primary: beyond r0, the single outermost feather.
                Lightest colour (furthest from body, most exposed). Moves FIRST. Mid+ zoom. */}
            <path
              className="sankofa-bird-wing-right-feathers sankofa-feather-r5"
              d="M39.5 4.5 C40.8 2.5 40.5 0.8 39.3 0.2 C38.4 1.6 37.4 3.4 37.0 5.2 Z"
              fill="hsl(184, 100%, 78%)"
              opacity={0.7}
            />
            {/* r0 — extreme outermost primary, mirror of l0 */}
            <path
              className="sankofa-bird-wing-right-feathers sankofa-feather-r0"
              d="M38.2 6.0 C39.5 3.8 39.8 2.0 38.6 1.2 C37.6 2.6 36.0 4.8 34.8 7.0 Z"
              fill="hsl(190, 100%, 68%)"
              opacity={0.85}
            />
            <path
              className="sankofa-bird-wing-right-feathers sankofa-feather-r1"
              d="M36 8 C37.5 5.5 38.5 4 37.5 3 C36.5 4.5 34.5 6.5 33 8.5 Z"
              fill="hsl(190, 100%, 62%)"
              opacity={0.8}
            />
            <path
              className="sankofa-bird-wing-right-feathers sankofa-feather-r2"
              d="M30 10 C31.5 7.5 32 5.5 31 4.5 C30 6 28 8.5 26.5 10.5 Z"
              fill="hsl(190, 100%, 58%)"
              opacity={0.75}
            />
            <path
              className="sankofa-bird-wing-right-feathers sankofa-feather-r3"
              d="M25 13 C26.5 10.5 26.5 8.5 25.5 7.5 C24.5 9 22.5 11.5 21.5 13.5 Z"
              fill="hsl(190, 100%, 54%)"
              opacity={0.7}
            />
            {/* r4 — inner primary: mirror of l4 */}
            <path
              className="sankofa-bird-wing-right-feathers sankofa-feather-r4"
              d="M23.0 14.8 C23.8 13.0 24.0 11.4 23.2 10.8 C22.2 12.2 21.4 14.0 21.0 15.8 Z"
              fill="hsl(190, 100%, 50%)"
              opacity={0.62}
            />
            {/* Right wing secondary feather tips — layer 2 (mid-wing coverts).
                Smaller, slightly behind the primaries in z-order and position.
                sankofa-feather-rs1/rs2 classes apply a longer lag delay so
                these secondaries trail the primaries — exactly the cascade
                "Primary → Secondary lag → Body catches up" from the doc. */}
            <path
              className="sankofa-bird-wing-right-feathers sankofa-feather-rs1"
              d="M32 11.5 C33.5 9.5 33.5 8 32.5 7.5 C31.5 9 30 11 29 12.5 Z"
              fill="hsl(185, 100%, 52%)"
              opacity={0.6}
            />
            <path
              className="sankofa-bird-wing-right-feathers sankofa-feather-rs2"
              d="M27.5 14 C28.5 12 28.5 10.5 27.5 10 C26.5 11.5 25 13.5 24 15 Z"
              fill="hsl(185, 100%, 48%)"
              opacity={0.55}
            />
            {/* rs3 — 3rd secondary: fills the arc between rs2 and the covert rc1.
                Makes the secondary fan continuous with no gap at mid/high zoom. */}
            <path
              className="sankofa-bird-wing-right-feathers sankofa-feather-rs3"
              d="M29.5 13.5 C30.0 12.0 30.0 10.8 29.0 10.2 C28.0 11.5 27.0 13.5 26.5 15.0 Z"
              fill="hsl(185, 95%, 46%)"
              opacity={0.5}
            />
            {/* Right wing covert layer — smallest inner feathers closest to body
                (layer 3 per doc: "3 layers per wing"). Very subtle at low zoom,
                visible as texture depth at high zoom. Longer lag delay. */}
            <path
              className="sankofa-bird-wing-right-feathers sankofa-feather-rc1"
              d="M23.5 15.5 C24 14 24 12.5 23 12 C22 13 21 15 20.5 16.5 Z"
              fill="hsl(183, 100%, 44%)"
              opacity={0.45}
            />
            {/* Right wing covert iridescent band — dedicated highlight at the covert layer.
                A thin arc gleaming at high/street zoom, giving the innermost feather
                layer its own structural colour distinct from the primary highlights.
                Heading-aware via CSS hue-rotate on --heading-deg. */}
            <path
              className="sankofa-wing-covert-band sankofa-wing-covert-band-r"
              d="M21.5 15.8 C22.8 14.2 24.0 13.0 25.5 12.2 C24.5 13.5 23.2 15.0 22.0 16.5 Z"
              fill="hsl(188, 100%, 76%)"
              opacity={0}
            />
            {/* Right wing iridescent highlight — upper surface sheen */}
            <path
              className="sankofa-bird-wing-right-highlight"
              d="M21 17.5 C25 15.5 30 14 33.5 11.5 C31 14 27.5 17 23.5 18.5 Z"
              fill="hsl(190, 100%, 82%)"
              opacity={0.35}
            />

            {/* ── Left wing (outside on right turns) ───────────────────────── */}
            <path
              className="sankofa-bird-wing-left"
              d="M20 17 C14 14 7 12 3 7 C5 14 9 19 15 22 C17.5 21 19.5 19 20 17 Z"
              fill={`url(#${wingGradLeftId})`}
            />
            {/* ── Left wing BOTTOM surface (design doc: LEFT WING BOTTOM layer) ────────
                Underside of the left wing — lighter cream-teal, visible when banking right
                or during hover. In z-order below the primary tips. */}
            <path
              className="sankofa-bird-wing-left-btm"
              d="M20 19 C15 18.5 9 17.5 5 15.5 C7.5 18.5 12 22 17 23.5 C18.8 23 19.8 21.2 20 19 Z"
              fill="hsl(190, 55%, 70%)"
              opacity={0}
            />
            {/* Left wing primary feather tips — layer 1 (primaries).
                5 primaries total (l0→l4, outermost first) for a full feather fan.
                l0: extreme outer tip — the longest flight feather, extends beyond the wing body.
                l1–l3: main spread. l4: inner primary bridging to secondaries. */}
            {/* l5 — most extreme left primary: beyond l0, mirror of r5. Lightest, first. */}
            <path
              className="sankofa-bird-wing-left-feathers sankofa-feather-l5"
              d="M0.5 4.5 C-0.8 2.5 -0.5 0.8 0.7 0.2 C1.6 1.6 2.6 3.4 3.0 5.2 Z"
              fill="hsl(184, 100%, 78%)"
              opacity={0.7}
            />
            {/* l0 — extreme outermost primary: beyond the wing tip, curves furthest */}
            <path
              className="sankofa-bird-wing-left-feathers sankofa-feather-l0"
              d="M1.8 6.0 C0.5 3.8 0.2 2.0 1.4 1.2 C2.4 2.6 4.0 4.8 5.2 7.0 Z"
              fill="hsl(190, 100%, 68%)"
              opacity={0.85}
            />
            <path
              className="sankofa-bird-wing-left-feathers sankofa-feather-l1"
              d="M4 8 C2.5 5.5 1.5 4 2.5 3 C3.5 4.5 5.5 6.5 7 8.5 Z"
              fill="hsl(190, 100%, 62%)"
              opacity={0.8}
            />
            <path
              className="sankofa-bird-wing-left-feathers sankofa-feather-l2"
              d="M10 10 C8.5 7.5 8 5.5 9 4.5 C10 6 12 8.5 13.5 10.5 Z"
              fill="hsl(190, 100%, 58%)"
              opacity={0.75}
            />
            <path
              className="sankofa-bird-wing-left-feathers sankofa-feather-l3"
              d="M15 13 C13.5 10.5 13.5 8.5 14.5 7.5 C15.5 9 17.5 11.5 18.5 13.5 Z"
              fill="hsl(190, 100%, 54%)"
              opacity={0.7}
            />
            {/* l4 — inner primary: between l3 and the secondary layer, fills the gap */}
            <path
              className="sankofa-bird-wing-left-feathers sankofa-feather-l4"
              d="M17.0 14.8 C16.2 13.0 16.0 11.4 16.8 10.8 C17.8 12.2 18.6 14.0 19.0 15.8 Z"
              fill="hsl(190, 100%, 50%)"
              opacity={0.62}
            />
            {/* Left wing secondary feather tips — layer 2 (mid-wing coverts).
                Mirror of the right-wing secondary pattern; longer delay so they
                trail the primary l1/l2/l3 tips by ~35% of the flap period. */}
            <path
              className="sankofa-bird-wing-left-feathers sankofa-feather-ls1"
              d="M8 11.5 C6.5 9.5 6.5 8 7.5 7.5 C8.5 9 10 11 11 12.5 Z"
              fill="hsl(185, 100%, 52%)"
              opacity={0.6}
            />
            <path
              className="sankofa-bird-wing-left-feathers sankofa-feather-ls2"
              d="M12.5 14 C11.5 12 11.5 10.5 12.5 10 C13.5 11.5 15 13.5 16 15 Z"
              fill="hsl(185, 100%, 48%)"
              opacity={0.55}
            />
            {/* ls3 — 3rd secondary on left wing: mirror of rs3. */}
            <path
              className="sankofa-bird-wing-left-feathers sankofa-feather-ls3"
              d="M10.5 13.5 C10.0 12.0 10.0 10.8 11.0 10.2 C12.0 11.5 13.0 13.5 13.5 15.0 Z"
              fill="hsl(185, 95%, 46%)"
              opacity={0.5}
            />
            {/* Left wing covert layer — layer 3 (coverts closest to body).
                Subtle at low zoom; adds texture depth at street level. */}
            <path
              className="sankofa-bird-wing-left-feathers sankofa-feather-lc1"
              d="M16.5 15.5 C16 14 16 12.5 17 12 C18 13 19 15 19.5 16.5 Z"
              fill="hsl(183, 100%, 44%)"
              opacity={0.45}
            />
            {/* Left wing covert iridescent band — mirror of right covert band */}
            <path
              className="sankofa-wing-covert-band sankofa-wing-covert-band-l"
              d="M18.5 15.8 C17.2 14.2 16.0 13.0 14.5 12.2 C15.5 13.5 16.8 15.0 18.0 16.5 Z"
              fill="hsl(188, 100%, 76%)"
              opacity={0}
            />
            {/* Left wing iridescent highlight — upper surface sheen */}
            <path
              className="sankofa-bird-wing-left-highlight"
              d="M19 17.5 C15 15.5 10 14 6.5 11.5 C9 14 12.5 17 16.5 18.5 Z"
              fill="hsl(190, 100%, 82%)"
              opacity={0.35}
            />

            {/* ── Wing-joint shoulder highlights ─────────────────────────────
                Real birds have a bright "scapular shoulder" glint where the
                upper-wing coverts meet the body — a structural specular that
                makes the wing attachment look physically real.
                Rendered above the wings (in z-order) so it sits on top of
                both left and right wing shapes.
                CSS gate: visible only at zoom ≥ 10 (mid/high) so they don't
                appear as noise at city/country scale.
                Left shoulder (bird's right, visually left of centre since the
                neck curves that way) and right shoulder both have a slight
                rotation to match the wing cant angle. */}
            <ellipse
              className="sankofa-wing-joint sankofa-wing-joint-left"
              cx="18.0" cy="17.0"
              rx="1.2" ry="0.6"
              fill="hsl(190, 90%, 90%)"
              opacity={0}
              style={{
                transform: "rotate(-22deg)",
                transformBox: "view-box",
                transformOrigin: "18.0px 17.0px",
              } as React.CSSProperties}
            />
            <ellipse
              className="sankofa-wing-joint sankofa-wing-joint-right"
              cx="22.0" cy="17.0"
              rx="1.2" ry="0.6"
              fill="hsl(190, 90%, 90%)"
              opacity={0}
              style={{
                transform: "rotate(22deg)",
                transformBox: "view-box",
                transformOrigin: "22.0px 17.0px",
              } as React.CSSProperties}
            />

            {/* ── Scapular shoulder feathers (design doc: Wing→Shoulder sublayer) ───────────
                Overlapping rounded feathers at the wing-root junction. Visible at mid+
                zoom as the characteristic shoulder puff seen in the reference image. */}
            <path className="sankofa-wing-scap sankofa-wing-scap-l1"
              d="M19.0 16.5 C17.5 15.0 15.5 14.2 14.0 14.7 C15.2 16.2 17.2 17.4 19.0 18.2 Z"
              fill="hsl(190, 100%, 56%)" opacity={0} />
            <path className="sankofa-wing-scap sankofa-wing-scap-l2"
              d="M18.5 14.5 C17.2 13.2 15.5 12.5 14.2 13.0 C15.2 14.5 17.0 15.5 18.5 16.2 Z"
              fill="hsl(190, 100%, 60%)" opacity={0} />
            <path className="sankofa-wing-scap sankofa-wing-scap-r1"
              d="M21.0 16.5 C22.5 15.0 24.5 14.2 26.0 14.7 C24.8 16.2 22.8 17.4 21.0 18.2 Z"
              fill="hsl(190, 100%, 56%)" opacity={0} />
            <path className="sankofa-wing-scap sankofa-wing-scap-r2"
              d="M21.5 14.5 C22.8 13.2 24.5 12.5 25.8 13.0 C24.8 14.5 23.0 15.5 21.5 16.2 Z"
              fill="hsl(190, 100%, 60%)" opacity={0} />

                        {/* ── Body — glowing breast highlight ──────────────────────────── */}
            {/* sankofa-bird-chest owns the breathing animation — a subtle
                1-2% scale pulse (transform-box: fill-box ensures it scales
                from the ellipse's own center, not the SVG origin). This is
                the "chest expands/relaxes" breathing detail from the doc —
                almost imperceptible but convinces the brain the bird is alive.
                Only active at mid/high zoom (low LOD hides it via display:none
                on the class). */}
            <ellipse
              className="sankofa-bird-chest"
              cx="20"
              cy="22"
              rx="6"
              ry="8"
              fill={`url(#${bodyGradId})`}
              stroke="hsl(190, 60%, 75%)"
              strokeWidth="0.35"
              strokeOpacity="0.5"
            />
            {/* Breast sheen — heading-reactive directional lighting highlight.
                sankofa-breast-sheen class lets CSS use --lighting-factor to vary
                opacity based on heading: brightest facing NW "sun" (315°), dimmest
                facing SE — the "highlights rotate with the bird" from doc item 3.
                opacity={0} here; CSS calc() fully owns the visible value. */}
            <ellipse
              className="sankofa-breast-sheen"
              cx="19.5"
              cy="19.5"
              rx="3.5"
              ry="3"
              fill="hsl(190, 100%, 72%)"
              opacity={0}
            />
            {/* ── Back — design doc hierarchy: Body → Back ─────────────────────
                Dorsal surface of the body — slightly darker, deeper teal overlay
                on the upper half of the body ellipse. Represents the bird's back
                feathers which are typically darker/richer than the breast.
                Rendered after the chest ellipse so it layers on top; kept at
                low opacity so the chest colour shows through as a base.
                Semi-ellipse arc: upper half of body ellipse (cx=20, cy=22, rx=5.5, ry=7.5)
                CSS shows it at mid+ zoom — at low zoom it's invisible noise. */}
            <path
              className="sankofa-bird-back"
              d="M 14.5 22 A 5.5 7.5 0 0 1 25.5 22 C 24 16.5 16 16.5 14.5 22 Z"
              fill="hsl(190, 85%, 32%)"
              opacity={0}
              style={{ transformBox: "view-box", transformOrigin: "20px 22px" } as React.CSSProperties}
            />
            {/* ── Belly — design doc hierarchy: Body → Belly ───────────────────
                Ventral/lower surface. Real teal birds (kingfishers, etc.) have
                a pale cream-teal underside — this adds that anatomical accuracy.
                Semi-ellipse arc: lower half of body ellipse.
                Breathing animation is inverted vs the back (belly expands when
                chest expands, back narrows slightly) — gives the breathing a
                more 3-dimensional feel at high zoom. */}
            <path
              className="sankofa-bird-belly"
              d="M 14.5 22 A 5.5 7.5 0 0 0 25.5 22 C 24 27.5 16 27.5 14.5 22 Z"
              fill="hsl(195, 55%, 72%)"
              opacity={0}
              style={{ transformBox: "view-box", transformOrigin: "20px 22px" } as React.CSSProperties}
            />
            {/* Body micro-feather texture — visible only at high zoom (≥15).
                Doc: "At street level: individual feathers gleaming in sunlight."
                Three thin feather-shaped curved paths on the breast surface.
                Staggered animation-delay so they shimmer asynchronously —
                the organic randomness prevents the pattern looking mechanical.
                Opacity is intentionally low (0.15-0.22) so they read as
                texture, not as separate objects. */}
            <path
              className="sankofa-body-feather sankofa-body-feather-1"
              d="M18 19 C17.5 20.5 18 22.5 18.5 23.5 C18.8 22 18.5 20.5 18.8 19.5 Z"
              fill="hsl(190, 100%, 68%)"
              opacity={0}
            />
            <path
              className="sankofa-body-feather sankofa-body-feather-2"
              d="M20 19.5 C19.5 21 20 23 20.5 24 C20.8 22.5 20.5 21 20.8 20 Z"
              fill="hsl(190, 100%, 65%)"
              opacity={0}
            />
            <path
              className="sankofa-body-feather sankofa-body-feather-3"
              d="M22 19 C21.5 20.5 22 22.5 22.5 23.5 C22.8 22 22.5 20.5 22.8 19.5 Z"
              fill="hsl(190, 100%, 62%)"
              opacity={0}
            />

            {/* Additional body feather scale rows (design doc: "hundreds of feather paths").
                Staggered positions + delays prevent a mechanical grid look.
                Row A (4–6): lower chest; Row B (7–9): mid breast; Row C (10–11): upper belly. */}
            <path className="sankofa-body-feather sankofa-body-feather-4"
              d="M17.0 22.0 C16.7 23.5 17.1 25.0 17.8 26.0 C18.0 24.5 17.7 23.0 18.0 22.5 Z"
              fill="hsl(190, 90%, 62%)" opacity={0} />
            <path className="sankofa-body-feather sankofa-body-feather-5"
              d="M20.5 21.5 C20.2 23.0 20.6 24.5 21.2 25.5 C21.5 24.0 21.2 22.5 21.5 22.0 Z"
              fill="hsl(190, 90%, 60%)" opacity={0} />
            <path className="sankofa-body-feather sankofa-body-feather-6"
              d="M23.0 22.0 C22.7 23.5 23.1 25.0 23.7 26.0 C24.0 24.5 23.7 23.0 24.0 22.5 Z"
              fill="hsl(190, 85%, 58%)" opacity={0} />
            <path className="sankofa-body-feather sankofa-body-feather-7"
              d="M16.5 20.0 C16.2 21.2 16.8 22.5 17.5 23.5 C17.8 22.0 17.5 20.8 17.8 20.2 Z"
              fill="hsl(188, 90%, 65%)" opacity={0} />
            <path className="sankofa-body-feather sankofa-body-feather-8"
              d="M19.0 18.5 C18.7 19.8 19.2 21.2 19.8 22.2 C20.1 20.8 19.8 19.5 20.1 18.8 Z"
              fill="hsl(190, 95%, 67%)" opacity={0} />
            <path className="sankofa-body-feather sankofa-body-feather-9"
              d="M21.8 19.0 C21.5 20.2 22.0 21.5 22.6 22.5 C22.9 21.0 22.6 19.8 22.8 19.2 Z"
              fill="hsl(192, 88%, 63%)" opacity={0} />
            <path className="sankofa-body-feather sankofa-body-feather-10"
              d="M18.2 25.0 C17.9 26.2 18.4 27.5 19.0 28.5 C19.3 27.0 19.0 25.8 19.2 25.2 Z"
              fill="hsl(190, 92%, 60%)" opacity={0} />
            <path className="sankofa-body-feather sankofa-body-feather-11"
              d="M21.0 25.5 C20.7 26.7 21.2 28.0 21.8 29.0 C22.1 27.5 21.8 26.2 22.0 25.7 Z"
              fill="hsl(190, 87%, 57%)" opacity={0} />

            {/* ── Neck + head — Sankofa backward-looking pose ───────────────── */}
            <g className="sankofa-bird-head">
              <path
                className="sankofa-bird-neck"
                d="M18 16 C15 13 12 12 9 13.5"
                fill="none"
                stroke="hsl(190, 100%, 52%)"
                strokeWidth="3.4"
                strokeLinecap="round"
              />
              {/* ── Neck chain segments — multi-segment S-curve physics ──────────
                  Two thinner paths overlaid on the main neck stroke, each covering
                  half the arc. Their individual CSS opacity animations create a true
                  travelling S-wave effect impossible to achieve with one path:
                  neck-seg-1 brightens while neck-seg-2 dims, then they swap — the
                  luminous peak appears to travel up the neck like real feather sheen.
                  neck-top-sheen marks the dorsal edge catchlight of the S-curve. */}
              <path
                className="sankofa-neck-seg sankofa-neck-seg-1"
                d="M18 16 C16.5 14.5 14.5 13.5 13 13.2"
                fill="none"
                stroke="hsl(190, 100%, 66%)"
                strokeWidth="1.8"
                strokeLinecap="round"
                opacity={0}
              />
              <path
                className="sankofa-neck-seg sankofa-neck-seg-2"
                d="M13 13.2 C11.5 13.0 10.2 13.0 9 13.5"
                fill="none"
                stroke="hsl(190, 100%, 60%)"
                strokeWidth="1.8"
                strokeLinecap="round"
                opacity={0}
              />
              {/* Dorsal edge — bright highlight sheen on the top of the S-curve */}
              <path
                className="sankofa-neck-top-sheen"
                d="M18 15.2 C15 12.1 12 11.2 9.2 12.6"
                fill="none"
                stroke="hsl(190, 100%, 84%)"
                strokeWidth="0.55"
                strokeLinecap="round"
                opacity={0}
              />
              <circle
                cx="8"
                cy="13"
                r="3.4"
                fill={celebrating ? "hsl(190, 100%, 68%)" : "hsl(190, 100%, 55%)"}
                stroke="white"
                strokeWidth="0.5"
              />
              {/* ── CrownFeathers — Sankofa bird's tuft (design doc: Head → CrownFeathers)
                  Five narrow curved paths (crown-4 → crown-5, far-left to far-right) in a
                  fan formation. This is the bird's most distinctive visual identifier — the
                  crest that makes a Sankofa silhouette immediately recognisable even at small
                  size. The design doc layer spec shows a prominent tuft; 5 feathers render
                  it as a full fan rather than a sparse 3-tip stub.
                  All use view-box transform so iOS Safari respects the origin. */}
              {/* crown-4 — far-left background feather (behind crown-1, slightly hidden) */}
              <path
                className="sankofa-crown-feather sankofa-crown-feather-4"
                d="M5.8 11.0 C5.5 10.2 5.8 9.3 6.3 8.9 C6.5 9.7 6.2 10.6 6.1 11.4 Z"
                fill="hsl(190, 90%, 50%)"
                opacity={0}
                style={{ transformBox: "view-box", transformOrigin: "6.1px 11.4px" } as React.CSSProperties}
              />
              <path
                className="sankofa-crown-feather sankofa-crown-feather-1"
                d="M6.8 10.0 C6.6 9.2 7.0 8.4 7.6 8.0 C7.6 8.8 7.3 9.7 7.1 10.5 Z"
                fill="hsl(190, 100%, 58%)"
                opacity={0}
                style={{ transformBox: "view-box", transformOrigin: "7.1px 10.5px" } as React.CSSProperties}
              />
              <path
                className="sankofa-crown-feather sankofa-crown-feather-2"
                d="M7.8 9.6 C7.9 8.7 8.4 8.0 9.0 7.7 C8.8 8.5 8.5 9.4 8.3 10.2 Z"
                fill="hsl(190, 100%, 68%)"
                opacity={0}
                style={{ transformBox: "view-box", transformOrigin: "8.3px 10.2px" } as React.CSSProperties}
              />
              <path
                className="sankofa-crown-feather sankofa-crown-feather-3"
                d="M9.0 10.1 C9.4 9.2 9.9 8.5 10.4 8.3 C10.1 9.1 9.7 10.0 9.4 10.7 Z"
                fill="hsl(190, 100%, 62%)"
                opacity={0}
                style={{ transformBox: "view-box", transformOrigin: "9.4px 10.7px" } as React.CSSProperties}
              />
              {/* crown-5 — far-right foreground feather (most upright, catches most light) */}
              <path
                className="sankofa-crown-feather sankofa-crown-feather-5"
                d="M10.2 10.5 C10.7 9.6 11.2 9.0 11.6 8.8 C11.4 9.6 11.0 10.4 10.7 11.2 Z"
                fill="hsl(190, 100%, 72%)"
                opacity={0}
                style={{ transformBox: "view-box", transformOrigin: "10.7px 11.2px" } as React.CSSProperties}
              />
              {/* Crown tip specular catchlights — tiny bright circle at the tip of each
                  major crown feather (visible at street zoom only). Real iridescent crown
                  feathers have a dense barbule specular at the very tip — the "jewel at
                  the crest" seen in turkeys, hummingbirds, and Sankofa iconography.
                  crown-tip-2 (centre foremost) is brightest; crown-tip-3 and -5 follow.
                  These are ~0.18–0.22 SVG units — invisible at any LOD below street. */}
              <circle
                className="sankofa-crown-tip sankofa-crown-tip-2"
                cx="9.0" cy="7.6" r="0.22"
                fill="hsl(190, 100%, 94%)"
                opacity={0}
              />
              <circle
                className="sankofa-crown-tip sankofa-crown-tip-3"
                cx="10.4" cy="8.2" r="0.18"
                fill="hsl(190, 100%, 90%)"
                opacity={0}
              />
              <circle
                className="sankofa-crown-tip sankofa-crown-tip-5"
                cx="11.6" cy="8.7" r="0.16"
                fill="hsl(190, 100%, 96%)"
                opacity={0}
              />
              {/* Eye — iris depth ring + pupil + dual catchlights */}
              {/* Iris ring: warm amber circle behind the pupil — "iris depth"
                  from the doc. The slight amber/gold hue contrasts with the
                  teal body and gives the eye a jewel-like quality.
                  transformBox+origin set inline so it moves with the pupil
                  during look-left/right (same 7s animation as the pupil). */}
              <circle
                className="sankofa-bird-iris"
                cx="7.1" cy="12.2" r="0.85"
                fill="hsl(32, 85%, 42%)"
                opacity={0.88}
                style={{
                  // view-box + explicit SVG coords works on all Safari versions.
                  // fill-box breaks Safari < 16.4 (uses wrong transform origin).
                  transformBox: "view-box",
                  transformOrigin: "7.1px 12.2px",
                } as React.CSSProperties}
              />
              {/* Iris inner ring — dark limbal band between iris and pupil */}
              <circle
                cx="7.1" cy="12.2" r="0.7"
                fill="hsl(190, 60%, 18%)"
                opacity={0.6}
              />
              {/* transformBox+origin set inline so translateX is relative to the
                  circle's own center — required for the look-left/right behavior
                  in sankofa-eye-live to work correctly in SVG space. */}
              <circle
                className="sankofa-bird-eye"
                cx="7.1" cy="12.2" r="0.55" fill="#04121a"
                style={{
                  transformBox: "view-box",
                  transformOrigin: "7.1px 12.2px",
                } as React.CSSProperties}
              />
              {/* Eye highlight — primary corneal glint (static anchor) */}
              <circle cx="7.4" cy="11.95" r="0.2" fill="white" opacity={0.9} />
              {/* Eye catchlight — secondary specular that tracks the pupil's
                  look-left / look-right motion for a "living eye" depth effect.
                  Synced to the same 7s cycle as sankofa-eye-live.
                  transformBox+origin set inline for the same reason as the pupil. */}
              <circle
                className="sankofa-bird-eye-catchlight"
                cx="7.6" cy="11.85" r="0.13" fill="white" opacity={0.7}
                style={{
                  transformBox: "view-box",
                  transformOrigin: "7.6px 11.85px",
                } as React.CSSProperties}
              />
              {/* Eyelid — thin crescent arc that slides down during blinks.
                  Invisible at rest (opacity 0); CSS animates it to opacity 1
                  during the blink frames of the 7s eye cycle so the pupil
                  disappearing + eyelid appearing reads as a real eyelid close. */}
              <path
                className="sankofa-bird-eyelid"
                d="M6.6 11.85 Q7.1 11.45 7.6 11.85"
                fill="none"
                stroke="hsl(190, 85%, 38%)"
                strokeWidth="0.45"
                strokeLinecap="round"
                opacity={0}
              />
              {/* Lower eyelid — thin counter-arc below the pupil.
                  Real birds show a nictitating membrane sweep from below;
                  this lower-arc approximation adds depth to the eye anatomy.
                  It rises slightly during blinks (the upper eyelid comes down,
                  lower eyelid comes up — they meet in the middle). Timed to
                  the same 7s cycle but with a smaller opacity range so it
                  reads as a subtle complement, not a duplicate of the upper lid. */}
              <path
                className="sankofa-bird-lower-eyelid"
                d="M6.7 12.55 Q7.1 12.95 7.5 12.55"
                fill="none"
                stroke="hsl(190, 75%, 35%)"
                strokeWidth="0.30"
                strokeLinecap="round"
                opacity={0}
              />
              {/* Beak — split into upper + lower jaw for chirp animation.
                  Doc: "bird chirps → Looks toward destination → Spreads wings → Takeoff"
                  Lower beak opens 1-2° on notification/accepted events, then closes.
                  Transform origin is the back of the jaw (SVG coords ~5.45, 14.2)
                  so the tip (x=2.2) swings down naturally on rotation. */}
              {/* Upper beak — animates open on chirp states (P8.9).
                  transform-origin at beak base (5.45, 14.2) so the tip
                  swings upward naturally on rotation. */}
              <path
                className="sankofa-bird-beak-upper"
                d="M5.3 13.4 L2.2 14.25 L5.45 14.2 Z"
                fill="#1a2733"
                style={{
                  transformBox: "view-box",
                  transformOrigin: "5.45px 14.2px",
                } as React.CSSProperties}
              />
              {/* Beak specular glint — matches the eye highlight treatment.
                  A tiny white circle on the culmen (ridge of upper beak) gives
                  the beak dimension and wetness at mid/high zoom — the same
                  technique used for the corneal glint on the eye. */}
              <circle
                className="sankofa-beak-gloss"
                cx="4.1" cy="13.55"
                r="0.17"
                fill="white"
                opacity={0}
              />
              {/* Lower beak (animated on chirp) */}
              <path
                className="sankofa-bird-beak-lower"
                d="M5.45 14.2 L2.2 14.25 L5.6 15.1 Z"
                fill="#121e29"
                style={{
                  transformBox: "view-box",
                  transformOrigin: "5.45px 14.2px",
                } as React.CSSProperties}
              />
              {/* ── Chirp rings — sound-wave concentric circles from beak tip ─────
                  Doc: "bird chirps → Looks toward destination → Spreads wings →
                  Takeoff" and "Notification: Small chirp → Notification appears."
                  Two rings with staggered delays create a rippling pulse effect.
                  transform-origin is the beak tip (2.2, 14.25) so they expand
                  outward from where the sound originates — not from the SVG center.
                  Both invisible at rest (opacity: 0); CSS activates them on
                  data-notification="true" and data-nearby-user="true". */}
              <circle
                className="sankofa-chirp-ring-1"
                cx="2.2" cy="14.25" r="1.2"
                fill="none"
                stroke="hsl(190, 100%, 72%)"
                strokeWidth="0.25"
                opacity={0}
                style={{ transformBox: "view-box", transformOrigin: "2.2px 14.25px" } as React.CSSProperties}
              />
              <circle
                className="sankofa-chirp-ring-2"
                cx="2.2" cy="14.25" r="1.2"
                fill="none"
                stroke="hsl(190, 100%, 82%)"
                strokeWidth="0.18"
                opacity={0}
                style={{ transformBox: "view-box", transformOrigin: "2.2px 14.25px" } as React.CSSProperties}
              />
              {/* Third chirp ring — outermost wavefront, expands slowest + furthest.
                  The three rings at overlapping durations produce a true ripple-
                  interference pattern impossible to replicate in a single Rive state.
                  On donation events the stroke is warm gold to match the pledge palette. */}
              <circle
                className="sankofa-chirp-ring-3"
                cx="2.2" cy="14.25" r="1.2"
                fill="none"
                stroke="hsl(190, 100%, 78%)"
                strokeWidth="0.12"
                opacity={0}
                style={{ transformBox: "view-box", transformOrigin: "2.2px 14.25px" } as React.CSSProperties}
              />
              {/* ── Beak moisture glint (Phase 4 #26) ────────────────────────────
                  Real bird beaks are hydrated keratin — they carry a sub-pixel wet
                  specular at the tip that catches light independently of the beak
                  colour. A tiny white circle at the culmen tip (cx=2.4, cy=14.15)
                  flashes with a brightness+desaturate filter at 2.8s intervals.
                  Only visible at street zoom; opacity ≤ 0.62 so it reads as a glint
                  not a glow. 1.1s initial delay keeps it out of phase with eye blinks. */}
              <circle
                className="sankofa-beak-glint"
                cx="2.4" cy="14.15" r="0.18"
                fill="white"
                opacity={0}
                style={{ transformBox: "view-box", transformOrigin: "2.4px 14.15px" } as React.CSSProperties}
              />
              {/* Egg counter-rotation wrapper — keeps egg perfectly stable in the beak
                  while the bird banks. The rig rotates by bankDeg around the pivot
                  (50% × 62% of the 40×40 viewBox = SVG coords 20, 24.8). Applying
                  an equal-and-opposite rotation here, anchored to the same pivot,
                  cancels the bank so the egg appears motionless — symbolising
                  "carrying the future forward regardless of the journey". */}
              <g
                style={{
                  transform: `rotate(${-bankDeg}deg)`,
                  transformOrigin: "20px 24.8px",
                  transformBox: "view-box",
                  transition: "transform 0.35s ease-out",
                } as React.CSSProperties}
              >
                {/* Egg — luminous teal sphere (matching reference image), gold on celebration.
                    The egg symbolises wisdom and carrying the future forward. */}
                <circle
                  className="sankofa-bird-egg"
                  cx="3.4"
                  cy="15.6"
                  r="1.45"
                  fill={(celebrating || donated) ? `url(#${eggGoldGradId})` : `url(#${eggGradId})`}
                  stroke={(celebrating || donated) ? "#f0b800" : "hsl(190, 80%, 50%)"}
                  strokeWidth="0.35"
                />
                {/* Egg specular highlight — white shine spot matching reference */}
                <circle
                  cx="2.85"
                  cy="14.95"
                  r="0.45"
                  fill="white"
                  opacity={(celebrating || donated) ? 0.9 : 0.75}
                />
                {/* Egg ripple — outward community pulse when celebrating.
                    Doc: "Completing a community action: The egg emits a soft pulse
                    that travels outward like a ripple." A transform:scale circle grows
                    from the egg center and fades — distinct from the heart-pulse-ring
                    that expands from the bird body center.
                    Inactive at rest (opacity:0); CSS activates via sankofa-egg-ripple-out
                    when data-celebrating="true". The ring is inside the egg counter-rotation
                    wrapper so it stays anchored to the egg position during banking. */}
                <circle
                  className="sankofa-egg-ripple"
                  cx="3.4"
                  cy="15.6"
                  r="1.5"
                  fill="none"
                  stroke="hsl(190, 100%, 78%)"
                  strokeWidth="0.35"
                  opacity={0}
                  style={{
                    transformBox: "view-box",
                    transformOrigin: "3.4px 15.6px",
                  } as React.CSSProperties}
                />
                {/* Egg orbit particle — internal light swirl when helping/donated.
                    Positioned 1.4 SVG units above the egg center (cy=14.2 vs egg
                    cy=15.6). The CSS orbit keyframe rotates this point around the
                    egg center (transform-origin: 3.4px 15.6px), tracing a full
                    circle — "glow from inside, like polished jade" from the doc.
                    Invisible at rest (opacity:0 inline); CSS activates it when
                    data-celebrating="true" or data-donated="true". */}
                {/* Primary egg orbit particle — 1.4 SVG units above egg center.
                    Rotates clockwise; CSS activates on celebrating/donated/flying. */}
                <circle
                  className="sankofa-egg-orbit sankofa-egg-orbit-a"
                  cx="3.4"
                  cy="14.2"
                  r="0.22"
                  fill="white"
                  opacity={0}
                  style={{
                    transformBox: "view-box",
                    transformOrigin: "3.4px 15.6px",
                  } as React.CSSProperties}
                />
                {/* Secondary egg orbit particle — 1.4 SVG units below egg center.
                    Rotates counter-clockwise at a different speed, creating a
                    "double-helix light swirl" inside the jade — the doc's
                    "glow from inside, like polished jade / internal light swirl" cue.
                    Starts at 180° (bottom) so it's always opposite to orbit-a. */}
                <circle
                  className="sankofa-egg-orbit sankofa-egg-orbit-b"
                  cx="3.4"
                  cy="17.0"
                  r="0.17"
                  fill="hsl(190, 100%, 80%)"
                  opacity={0}
                  style={{
                    transformBox: "view-box",
                    transformOrigin: "3.4px 15.6px",
                  } as React.CSSProperties}
                />
                {/* ── Egg thermal depth layers (Phase 4 #25) ─────────────────────
                    Two concentric circles with deliberately different periods
                    (inner 1.65s, mid 2.45s) so they never phase-sync — the egg
                    reads as perpetually alive, "like polished jade holding heat".
                    Both shift to gold on helping/donated states via CSS filter. */}
                <circle
                  className="sankofa-egg-thermal-inner"
                  cx="3.4" cy="15.6" r="0.60"
                  fill="none"
                  stroke="hsl(192, 100%, 82%)"
                  strokeWidth="0.22"
                  opacity={0}
                  style={{ transformBox: "view-box", transformOrigin: "3.4px 15.6px" } as React.CSSProperties}
                />
                <circle
                  className="sankofa-egg-thermal-mid"
                  cx="3.4" cy="15.6" r="0.98"
                  fill="none"
                  stroke="hsl(192, 100%, 76%)"
                  strokeWidth="0.16"
                  opacity={0}
                  style={{ transformBox: "view-box", transformOrigin: "3.4px 15.6px" } as React.CSSProperties}
                />
              </g>
            </g>

            {/* Legs — separate animated layer; subtle perch sway at rest,
                alternating step during flight, dangle during landing hover. */}
            <g className="sankofa-bird-legs">
              {/* Left leg — wrapped for P8.10 individual alternating cadence.
                  transform-origin at hip joint (18.5, 29.5) in SVG space. */}
              <g
                className="sankofa-leg-left"
                style={{ transformBox: "view-box", transformOrigin: "18.5px 29.5px" } as React.CSSProperties}
              >
                <line
                  x1="18.5" y1="29.5"
                  x2="16.5" y2="34"
                  stroke="hsl(190, 70%, 36%)"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
                {/* Left foot toes */}
                <line x1="16.5" y1="34" x2="14.5" y2="35.5" stroke="hsl(190, 70%, 36%)" strokeWidth="0.8" strokeLinecap="round" />
                <line x1="16.5" y1="34" x2="16.2" y2="36"   stroke="hsl(190, 70%, 36%)" strokeWidth="0.8" strokeLinecap="round" />
                <line x1="16.5" y1="34" x2="18.2" y2="35.4" stroke="hsl(190, 70%, 36%)" strokeWidth="0.8" strokeLinecap="round" />
              </g>

              {/* Right leg — wrapped for P8.10 individual alternating cadence.
                  transform-origin at hip joint (21.5, 29.5) in SVG space. */}
              <g
                className="sankofa-leg-right"
                style={{ transformBox: "view-box", transformOrigin: "21.5px 29.5px" } as React.CSSProperties}
              >
                <line
                  x1="21.5" y1="29.5"
                  x2="23.5" y2="34"
                  stroke="hsl(190, 70%, 36%)"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
                {/* Right foot toes */}
                <line x1="23.5" y1="34" x2="25.5" y2="35.5" stroke="hsl(190, 70%, 36%)" strokeWidth="0.8" strokeLinecap="round" />
                <line x1="23.5" y1="34" x2="23.8" y2="36"   stroke="hsl(190, 70%, 36%)" strokeWidth="0.8" strokeLinecap="round" />
                <line x1="23.5" y1="34" x2="21.8" y2="35.4" stroke="hsl(190, 70%, 36%)" strokeWidth="0.8" strokeLinecap="round" />
              </g>

              {/* ── Talon specular catchlights (Phase 3) ────────────────────────
                  Thin crescent-shaped specular overlays on each foot's talon tips.
                  Real bird talons (dark-grey keratin) have a wet, curved highlight
                  on the dorsal surface. At street zoom, sankofa-talon-left/right
                  animate with a staggered brightness cycle (opposite phase) so the
                  two feet never glint simultaneously — subconsciously organic.
                  Opacity 0 at baseline (CSS rules unlock per zoom+state). */}
              <path
                className="sankofa-talon-left"
                d="M14.2 35.8 C13.6 36.5 13.4 37.0 13.8 37.1 C14.2 36.6 14.6 36.0 14.5 35.6 Z"
                fill="hsl(196, 40%, 72%)"
                opacity={0}
                style={{ transformBox: "view-box", transformOrigin: "14px 36.4px" } as React.CSSProperties}
              />
              <path
                className="sankofa-talon-right"
                d="M25.8 35.8 C26.4 36.5 26.6 37.0 26.2 37.1 C25.8 36.6 25.4 36.0 25.5 35.6 Z"
                fill="hsl(196, 40%, 72%)"
                opacity={0}
                style={{ transformBox: "view-box", transformOrigin: "26px 36.4px" } as React.CSSProperties}
              />
            </g>

            {/* Idle dust motes — tiny teal particles that drift upward near the
                bird's feet when perched (not flying). Doc: "Idle: Tiny teal dust."
                Three micro-circles at staggered delays produce an organic floating
                quality. CSS gate: data-landing="idle" AND data-flying="false".
                Hidden at low zoom (data-zoom="low") to save GPU at city scale.
                Uses transform-box:view-box so origins are in SVG coordinate space. */}
            <circle className="sankofa-idle-dust sankofa-dust-1"
              cx="15.5" cy="35.5" r="0.32" fill="hsl(190, 100%, 72%)" opacity={0}
              style={{ transformBox: "view-box", transformOrigin: "15.5px 35.5px" } as React.CSSProperties}
            />
            <circle className="sankofa-idle-dust sankofa-dust-2"
              cx="20" cy="37" r="0.26" fill="hsl(190, 100%, 78%)" opacity={0}
              style={{ transformBox: "view-box", transformOrigin: "20px 37px" } as React.CSSProperties}
            />
            <circle className="sankofa-idle-dust sankofa-dust-3"
              cx="24.5" cy="35.5" r="0.22" fill="hsl(190, 100%, 72%)" opacity={0}
              style={{ transformBox: "view-box", transformOrigin: "24.5px 35.5px" } as React.CSSProperties}
            />

            {/* ── Walk-dust lateral pair (Phase 4 #16) ───────────────────────────
                Two additional particle circles that kick sideways (left/right foot
                alternating) when the bird walks at ground level. dust-4 is the left
                lateral; dust-5 is the right. They blend naturally with the idle-dust
                cloud and animate at 0.48s cadence (comfortable bird walking pace).
                CSS triggers: data-speed="walking" AND data-flying="false". */}
            <circle className="sankofa-walk-dust-4"
              cx="14.0" cy="35.0" r="0.28" fill="hsl(190, 100%, 68%)" opacity={0}
              style={{ transformBox: "view-box", transformOrigin: "14px 35px" } as React.CSSProperties}
            />
            <circle className="sankofa-walk-dust-5"
              cx="26.0" cy="35.0" r="0.24" fill="hsl(190, 100%, 68%)" opacity={0}
              style={{ transformBox: "view-box", transformOrigin: "26px 35px" } as React.CSSProperties}
            />

            {/* ── Helping orbit particles ─────────────────────────────────────────
                Three tiny gold dots orbit the bird body (120° apart) while the
                bird is actively helping. Only visible at high+street zoom.
                The transform-origin is the body center (20px, 21px) so they
                orbit the body at a fixed radius. Conditional rendering so they're
                not in the DOM at all during non-helping states, keeping layout clean. */}
            {isHelping && !celebrating && !donated && ([0, 120, 240] as const).map((deg) => (
              <circle
                key={deg}
                className="sankofa-helping-orbit-dot"
                cx="20" cy="13.5"
                r="0.42"
                fill="hsl(45, 95%, 68%)"
                opacity={0}
                style={{
                  transformBox: "view-box",
                  transformOrigin: "20px 21px",
                  animationDelay: `${deg * 0.00778}s`,
                } as React.CSSProperties}
              />
            ))}

            {/* ── Wing-beat air pressure ring (Phase 4 #18) ──────────────────────
                During active flight each downstroke compresses air beneath the wings.
                A teal stroke-circle pulses outward from just below the body belly
                (cx=20, cy=27) then fades — an aerodynamic signature that reads as
                powered thrust. Only fires at high/street zoom where per-element
                detail is legible. Opacity 0 baseline; CSS drives pulse on data-flying. */}
            <circle
              className="sankofa-wing-beat-ring"
              cx="20" cy="27" r="2.4"
              fill="none"
              stroke="hsl(192, 100%, 78%)"
              strokeWidth="0.48"
              opacity={0}
              style={{ transformBox: "view-box", transformOrigin: "20px 27px" } as React.CSSProperties}
            />

            {/* ── Speed streaks (Phase 4 #24) ───────────────────────────────────────
                Three horizontal motion-blur lines trailing behind the bird at airplane
                speed. Staggered vertical positions (y=14 wing-tip, y=18 body, y=22 tail)
                create parallax depth. Only visible at low/mid zoom where the detailed
                contrail particles are too small to register. CSS drives slide+fade. */}
            <line className="sankofa-speed-streak sankofa-speed-streak-1"
              x1="22" y1="14" x2="28" y2="14"
              stroke="hsl(192, 100%, 80%)" strokeWidth="0.45" strokeLinecap="round" opacity={0}
              style={{ transformBox: "view-box", transformOrigin: "20px 14px" } as React.CSSProperties}
            />
            <line className="sankofa-speed-streak sankofa-speed-streak-2"
              x1="22" y1="18" x2="27" y2="18"
              stroke="hsl(192, 100%, 85%)" strokeWidth="0.35" strokeLinecap="round" opacity={0}
              style={{ transformBox: "view-box", transformOrigin: "20px 18px" } as React.CSSProperties}
            />
            <line className="sankofa-speed-streak sankofa-speed-streak-3"
              x1="22" y1="22" x2="26" y2="22"
              stroke="hsl(192, 100%, 75%)" strokeWidth="0.28" strokeLinecap="round" opacity={0}
              style={{ transformBox: "view-box", transformOrigin: "20px 22px" } as React.CSSProperties}
            />

            {/* ── Notification arrival ring (Phase 4 #30) ─────────────────────────
                A large concentric ring expanding from the bird's body center when
                data-notification="true" — 3 pulses at 1.35s each. Distinct from the
                chirp-rings at the beak tip (sound source); this ring is a whole-body
                visual broadcast readable even at low zoom when the bird is small.
                cx=20, cy=20 = SVG body center. Stroke-only, no fill. */}
            <circle
              className="sankofa-notification-ring"
              cx="20" cy="20" r="3.5"
              fill="none"
              stroke="hsl(192, 100%, 72%)"
              strokeWidth="0.50"
              opacity={0}
              style={{ transformBox: "view-box", transformOrigin: "20px 20px" } as React.CSSProperties}
            />

            {/* ── Wing-tip vortex rings (Phase 3) ────────────────────────────────
                During takeoff and airplane-speed flight, the outermost primary tips
                generate wingtip vortices — the circular turbulence rings that are
                a real aerodynamic signature of powered flight. Two SVG circles
                positioned at each wing's extreme tip (left ≈ cx 4,cy 7; right ≈ 36,7
                in the 40×40 viewBox); the CSS animation scales and fades them outward
                from the tip as if the vortex is being shed.
                Opacity 0 at baseline — CSS rules under data-landing="takeoff" and
                data-speed="airplane" unlock the animation.
                Hidden at low/mid zoom via CSS (too small to register). */}
            <circle
              className="sankofa-vortex sankofa-vortex-left"
              cx="3.5" cy="6.5"
              r="1.1"
              fill="none"
              stroke="hsl(192, 100%, 76%)"
              strokeWidth="0.55"
              opacity={0}
              style={{ transformBox: "view-box", transformOrigin: "3.5px 6.5px" } as React.CSSProperties}
            />
            <circle
              className="sankofa-vortex sankofa-vortex-right"
              cx="36.5" cy="6.5"
              r="1.1"
              fill="none"
              stroke="hsl(192, 100%, 76%)"
              strokeWidth="0.55"
              opacity={0}
              style={{ transformBox: "view-box", transformOrigin: "36.5px 6.5px" } as React.CSSProperties}
            />
          </svg>
        </div>
      </div>

      {/* Center dot */}
      <div
        className="rounded-full bg-primary border-2 border-background shadow-[0_0_12px_rgba(0,212,255,0.9)]"
        style={{ width: size * 0.14, height: size * 0.14 }}
      />

      <style>{`
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
          /* Full spectral cycle — doc: "Blue → Turquoise → Emerald → Silver → Blue"
             like a hummingbird. The --heading-deg CSS var blends in compass
             direction at 0.25 scale (vs the old 0.08) so the color shift is now
             clearly visible and direction-dependent:
               north  (0°)  → hue offset  0° (pure teal / cyan)
               east   (90°) → hue offset 22° (warm turquoise / aqua)
               south (180°) → hue offset 45° (emerald green)
               west  (270°) → hue offset 67° (blue-green / silver-teal)
             The ±45° oscillation layers on top for a dramatic spectral sweep
             on every flap cycle. Opacity ramps up at peak color shift so the
             highlight "flashes" iridescent rather than fading quietly. */
          0%   { opacity: 0.22; filter: hue-rotate(calc(var(--heading-deg, 0deg) * 0.25))                                    saturate(1.2); }
          18%  { opacity: 0.55; filter: hue-rotate(calc(var(--heading-deg, 0deg) * 0.25 + 45deg))  brightness(1.25)         saturate(1.5); }
          36%  { opacity: 0.38; filter: hue-rotate(calc(var(--heading-deg, 0deg) * 0.25 - 20deg))                            saturate(1.3); }
          52%  { opacity: 0.62; filter: hue-rotate(calc(var(--heading-deg, 0deg) * 0.25 + 80deg))  brightness(1.35)         saturate(1.6); }
          68%  { opacity: 0.30; filter: hue-rotate(calc(var(--heading-deg, 0deg) * 0.25 + 160deg)) brightness(1.15)         saturate(1.1); }
          82%  { opacity: 0.50; filter: hue-rotate(calc(var(--heading-deg, 0deg) * 0.25 - 40deg))  brightness(1.2)          saturate(1.4); }
          100% { opacity: 0.22; filter: hue-rotate(calc(var(--heading-deg, 0deg) * 0.25))                                    saturate(1.2); }
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
             rotate: composes with the head-bob (transform:) in P6.8.
             Phase 14 increase: 0.20 -> 0.24 for more readable head-lead. */
          .sankofa-bird-rig[data-flying="true"] .sankofa-bird-head {
            rotate: calc(var(--bank-angle, 0deg) * 0.24);
            transform-box: view-box;
            transform-origin: 20px 12px;
            transition: rotate 0.30s ease-out;
          }
          /* Neck follows head with slight lag. Phase 14: 0.14 -> 0.18 (more visible bone-chain). */
          .sankofa-bird-rig[data-flying="true"] .sankofa-bird-neck {
            rotate: calc(var(--bank-angle, 0deg) * 0.18);
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
             Battery-saver guard clears transform alongside rotate (see below).
             Phase 14 increase: 0.42 -> 0.52 for sharper visible S-arc. */
          .sankofa-bird-rig[data-flying="true"][data-zoom="high"] .sankofa-bird-neck,
          .sankofa-bird-rig[data-flying="true"][data-zoom="street"] .sankofa-bird-neck {
            transform: skewX(calc(var(--bank-angle, 0deg) * 0.52));
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
          /* Body leans last and least: torso inertia resists lateral turn.
             Phase 14 increase: 0.07 -> 0.11 — now visibly readable as tilt. */
          .sankofa-bird-rig[data-flying="true"] .sankofa-bird-body {
            rotate: calc(var(--bank-angle, 0deg) * 0.11);
            transform-box: view-box;
            transform-origin: center;
            transition: rotate 0.45s ease-out;
          }
          /* Chest and back feather surfaces lean with the body.
             Phase 14 increase: 0.06 -> 0.09. */
          .sankofa-bird-rig[data-flying="true"] .sankofa-bird-chest,
          .sankofa-bird-rig[data-flying="true"] .sankofa-bird-back {
            rotate: calc(var(--bank-angle, 0deg) * 0.09);
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
           The inner-wing joint compresses and dims slightly. */
        .sankofa-bird-rig[data-flying="true"] .sankofa-wing-joint {
          transition: opacity 0.40s ease-out, filter 0.40s ease-out;
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
           (bird is too small; effects would be invisible noise). */
        .sankofa-bird-rig[data-zoom="low"] .sankofa-tail-outer-left,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-tail-outer-right,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-tail-center,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-bird-beak-upper,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-leg-left,
        .sankofa-bird-rig[data-zoom="low"] .sankofa-leg-right {
          animation: none !important;
          transform: none !important;
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
           @property block and var(prop, fallback) at point of use. */


        /* ═══════════════════════════════════════════════════════════════════
           PHASE 12 — Real-time gaze vector & 8-direction head/neck awareness
           PHASE 13 — Gap-closure: all 10 remaining Phase 12 audit items
           ═══════════════════════════════════════════════════════════════════

           The Sankofa bird now has ANALOG, REAL-TIME directional gaze driven by
           two CSS custom properties injected inline:
             --gaze-x  : -1 (look toward beak/left) to +1 (look away/right)
             --gaze-y  : -1 (look skyward/up)       to +1 (look groundward/down)

           These are computed each render from: bank angle (reactive to current
           turn), upcomingTurnDirection (anticipatory — fires BEFORE the map
           instruction), landingPhase (takeoff=up, hover=down), speed (airplane
           scan=up), isHelping, and approaching.

           The gaze drives THREE layers:
             1. Eye/iris/catchlight — analog translate via CSS calc()
             2. Head rotation       — discrete data-gaze classes (head follows eye)
             3. Neck rotation       — lags head by ~0.35s (bone chain lag)

           All gaze effects are guarded by battery-saver and reduced-motion. */

        /* ── P12.1: Analog eye/iris/catchlight translation ──────────────── */
        /* Uses --gaze-x and --gaze-y CSS vars injected by the component.
           Range: ±0.38px horizontal, ±0.25px vertical for the pupil.
           Iris moves at 62% of pupil travel (parallax depth illusion).
           Transition 0.28s ease-out gives smooth real-time feel, not snap. */
        @property --gaze-x {
          syntax: "<number>"; inherits: true; initial-value: 0;
        }
        @property --gaze-y {
          syntax: "<number>"; inherits: true; initial-value: 0;
        }

        /* Pupil: largest travel range */
        .sankofa-bird-rig:not([data-battery-saver="true"]):not([data-notification="true"]) .sankofa-bird-eye {
          transform: translate(
            calc(var(--gaze-x, 0) * 0.38px),
            calc(var(--gaze-y, 0) * 0.25px)
          ) !important;
          transition: transform 0.28s ease-out;
        }
        /* During notification the alert animation takes full control — skip gaze override */

        /* Iris: 62% of pupil (parallax) */
        .sankofa-bird-rig:not([data-battery-saver="true"]):not([data-notification="true"]) .sankofa-bird-iris {
          transform: translate(
            calc(var(--gaze-x, 0) * 0.24px),
            calc(var(--gaze-y, 0) * 0.16px)
          ) !important;
          transition: transform 0.32s ease-out;
        }
        /* Catchlight: tracks with pupil at 80% travel (stays near the specular source) */
        .sankofa-bird-rig:not([data-battery-saver="true"]):not([data-notification="true"]) .sankofa-bird-eye-catchlight {
          transform: translate(
            calc(var(--gaze-x, 0) * 0.30px),
            calc(var(--gaze-y, 0) * 0.20px)
          ) !important;
          transition: transform 0.26s ease-out;
        }

        /* ── P12.2: Head rotation from gaze direction ────────────────────── */
        /* Head rotates into the gaze direction. data-gaze is the discrete enum
           computed from the analog vector; transitions provide the smooth motion.
           Positive X (look right) = CW rotation; negative X (look left) = CCW.
           Y gaze adds a very slight pitch (±2deg) — readable at street zoom. */
        @supports (rotate: 0deg) {
          /* Center: neutral, already handled by P9.7 rotate resets */
          .sankofa-bird-rig[data-gaze="center"]:not([data-flying="true"]) .sankofa-bird-head {
            rotate: 0deg;
            transition: rotate 0.45s ease-out;
          }
          /* Left — head turns toward the beak (further into the Sankofa backward look) */
          .sankofa-bird-rig[data-gaze="left"][data-zoom="high"] .sankofa-bird-head,
          .sankofa-bird-rig[data-gaze="left"][data-zoom="street"] .sankofa-bird-head {
            rotate: -8deg;
            transition: rotate 0.40s cubic-bezier(0.34, 1.1, 0.64, 1);
          }
          /* Right — head turns away from beak */
          .sankofa-bird-rig[data-gaze="right"][data-zoom="high"] .sankofa-bird-head,
          .sankofa-bird-rig[data-gaze="right"][data-zoom="street"] .sankofa-bird-head {
            rotate: 8deg;
            transition: rotate 0.40s cubic-bezier(0.34, 1.1, 0.64, 1);
          }
          /* Up — slight head tip up (scanning sky / takeoff excitement) */
          .sankofa-bird-rig[data-gaze="up"][data-zoom="high"] .sankofa-bird-head,
          .sankofa-bird-rig[data-gaze="up"][data-zoom="street"] .sankofa-bird-head {
            rotate: -2.5deg;
            transition: rotate 0.50s ease-out;
          }
          /* Down — slight head dip (descending / approaching destination) */
          .sankofa-bird-rig[data-gaze="down"][data-zoom="high"] .sankofa-bird-head,
          .sankofa-bird-rig[data-gaze="down"][data-zoom="street"] .sankofa-bird-head {
            rotate: 2.5deg;
            transition: rotate 0.50s ease-out;
          }
          /* Diagonals */
          .sankofa-bird-rig[data-gaze="up-left"][data-zoom="high"] .sankofa-bird-head,
          .sankofa-bird-rig[data-gaze="up-left"][data-zoom="street"] .sankofa-bird-head {
            rotate: -6.5deg;
            transition: rotate 0.38s cubic-bezier(0.34, 1.1, 0.64, 1);
          }
          .sankofa-bird-rig[data-gaze="up-right"][data-zoom="high"] .sankofa-bird-head,
          .sankofa-bird-rig[data-gaze="up-right"][data-zoom="street"] .sankofa-bird-head {
            rotate: 6.5deg;
            transition: rotate 0.38s cubic-bezier(0.34, 1.1, 0.64, 1);
          }
          .sankofa-bird-rig[data-gaze="down-left"][data-zoom="high"] .sankofa-bird-head,
          .sankofa-bird-rig[data-gaze="down-left"][data-zoom="street"] .sankofa-bird-head {
            rotate: -5deg;
            transition: rotate 0.42s ease-out;
          }
          .sankofa-bird-rig[data-gaze="down-right"][data-zoom="high"] .sankofa-bird-head,
          .sankofa-bird-rig[data-gaze="down-right"][data-zoom="street"] .sankofa-bird-head {
            rotate: 5deg;
            transition: rotate 0.42s ease-out;
          }

          /* ── P12.3: Neck follows head with ~0.35s bone-chain lag ─────── */
          /* The neck rotation is 55% of the head rotation — real bird anatomy:
             neck is stiffer than the head joint, so it follows with less range
             and more delay. This creates the head-then-neck sequential motion. */
          .sankofa-bird-rig[data-gaze="left"][data-zoom="high"] .sankofa-bird-neck,
          .sankofa-bird-rig[data-gaze="left"][data-zoom="street"] .sankofa-bird-neck {
            rotate: -4.5deg;
            transition: rotate 0.55s ease-out 0.12s; /* lag behind head */
          }
          .sankofa-bird-rig[data-gaze="right"][data-zoom="high"] .sankofa-bird-neck,
          .sankofa-bird-rig[data-gaze="right"][data-zoom="street"] .sankofa-bird-neck {
            rotate: 4.5deg;
            transition: rotate 0.55s ease-out 0.12s;
          }
          .sankofa-bird-rig[data-gaze="up"][data-zoom="high"] .sankofa-bird-neck,
          .sankofa-bird-rig[data-gaze="up"][data-zoom="street"] .sankofa-bird-neck {
            rotate: -1.5deg;
            transition: rotate 0.60s ease-out 0.15s;
          }
          .sankofa-bird-rig[data-gaze="down"][data-zoom="high"] .sankofa-bird-neck,
          .sankofa-bird-rig[data-gaze="down"][data-zoom="street"] .sankofa-bird-neck {
            rotate: 1.5deg;
            transition: rotate 0.60s ease-out 0.15s;
          }
          .sankofa-bird-rig[data-gaze="up-left"][data-zoom="high"] .sankofa-bird-neck,
          .sankofa-bird-rig[data-gaze="up-left"][data-zoom="street"] .sankofa-bird-neck {
            rotate: -3.5deg;
            transition: rotate 0.52s ease-out 0.12s;
          }
          .sankofa-bird-rig[data-gaze="up-right"][data-zoom="high"] .sankofa-bird-neck,
          .sankofa-bird-rig[data-gaze="up-right"][data-zoom="street"] .sankofa-bird-neck {
            rotate: 3.5deg;
            transition: rotate 0.52s ease-out 0.12s;
          }
          .sankofa-bird-rig[data-gaze="down-left"][data-zoom="high"] .sankofa-bird-neck,
          .sankofa-bird-rig[data-gaze="down-left"][data-zoom="street"] .sankofa-bird-neck {
            rotate: -2.8deg;
            transition: rotate 0.56s ease-out 0.14s;
          }
          .sankofa-bird-rig[data-gaze="down-right"][data-zoom="high"] .sankofa-bird-neck,
          .sankofa-bird-rig[data-gaze="down-right"][data-zoom="street"] .sankofa-bird-neck {
            rotate: 2.8deg;
            transition: rotate 0.56s ease-out 0.14s;
          }
          /* Center reset — release gaze when none */
          .sankofa-bird-rig[data-gaze="center"] .sankofa-bird-neck {
            rotate: 0deg;
            transition: rotate 0.50s ease-out;
          }

          /* Battery-saver: suppress all gaze rotations */
          .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-head,
          .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-neck {
            rotate: 0deg !important;
            transition: none !important;
          }
        }

        /* ── P12.4: Body lean into upcoming turn (aerodynamic anticipation) */
        /* When data-upcoming-turn fires, the BODY pre-leans into the bank
           direction BEFORE the actual bank happens. Real birds pre-weight
           the turn so the lean sequence is: body tilts → bank → turn.
           This is gap G3 from the Phase 12 audit. */
        @supports (rotate: 0deg) {
          .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="left"] .sankofa-bird-body {
            rotate: -2.5deg;
            transition: rotate 0.80s cubic-bezier(0.34, 1.1, 0.64, 1);
          }
          .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="right"] .sankofa-bird-body {
            rotate: 2.5deg;
            transition: rotate 0.80s cubic-bezier(0.34, 1.1, 0.64, 1);
          }
          .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="none"] .sankofa-bird-body,
          .sankofa-bird-rig[data-flying="true"]:not([data-upcoming-turn]) .sankofa-bird-body {
            rotate: 0deg;
            transition: rotate 0.65s ease-out;
          }
          .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-body {
            rotate: 0deg !important;
            transition: none !important;
          }
        }

        /* ── P12.5: Upcoming-turn wing pre-extension (actual geometric movement)
           G10: The inside wing of the upcoming turn folds; the outside wing
           EXTENDS outward with a real translateX+rotate. Previously only the
           animation-duration changed (cosmetic). Now the outside wing physically
           pre-opens to initiate the bank geometry. */
        @supports (translate: 0px) {
          /* Upcoming left: right wing (outside) extends outward */
          .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="left"][data-zoom="high"] .sankofa-bird-wing-right,
          .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="left"][data-zoom="street"] .sankofa-bird-wing-right {
            translate: 0.8px 0;
            transition: translate 0.85s cubic-bezier(0.34, 1.15, 0.64, 1);
          }
          /* Upcoming right: left wing (outside) extends outward */
          .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="right"][data-zoom="high"] .sankofa-bird-wing-left,
          .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="right"][data-zoom="street"] .sankofa-bird-wing-left {
            translate: -0.8px 0;
            transition: translate 0.85s cubic-bezier(0.34, 1.15, 0.64, 1);
          }
          /* Reset when no upcoming turn */
          .sankofa-bird-rig[data-upcoming-turn="none"] .sankofa-bird-wing-left,
          .sankofa-bird-rig[data-upcoming-turn="none"] .sankofa-bird-wing-right,
          .sankofa-bird-rig:not([data-upcoming-turn]) .sankofa-bird-wing-left,
          .sankofa-bird-rig:not([data-upcoming-turn]) .sankofa-bird-wing-right {
            translate: 0 0;
            transition: translate 0.65s ease-out;
          }
          .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-left,
          .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-right {
            translate: 0 0 !important;
            transition: none !important;
          }
        }

        /* ── P12.6: Gliding thermal lift — upward body translation ───────── */
        /* G4: The existing gliding animation has body elongation and wing spread
           but lacks the characteristic upward float of a soaring bird riding
           a thermal. A slow oscillating translateY creates the "lifted by warm
           air" impression. amplitude: 1.2px at driving speed, 2px at airplane. */
        @keyframes sankofa-thermal-lift {
          0%,100% { transform: translateY(0px);   }
          38%     { transform: translateY(-1.8px); }
          72%     { transform: translateY(-0.6px); }
        }
        .sankofa-bird-rig[data-gliding="true"][data-speed="airplane"]:not([data-battery-saver="true"]) .sankofa-bird-body {
          animation: sankofa-thermal-lift 3.2s ease-in-out infinite;
        }
        @keyframes sankofa-thermal-lift-light {
          0%,100% { transform: translateY(0px);   }
          45%     { transform: translateY(-1.2px); }
        }
        .sankofa-bird-rig[data-gliding="true"][data-speed="driving"]:not([data-battery-saver="true"]) .sankofa-bird-body {
          animation: sankofa-thermal-lift-light 4.0s ease-in-out infinite;
        }

        /* ── P12.7: Shadow coloring — gold when helping, teal when celebrating */
        /* G2: The shadow was monochrome (rgba black). Now it tints gold while
           helping (the bird's "golden hour" state) and teal when celebrating.
           The filter tint is subtle (0.35 opacity) so the shadow still reads
           as a shadow, not a colored glow. */
        .sankofa-bird-rig[data-helping="true"][data-celebrating="false"] .sankofa-bird-shadow {
          fill: rgba(200, 140, 20, 0.28);
          filter: blur(1px) sepia(0.4) saturate(1.8);
          transition: fill 0.9s ease-out, filter 0.9s ease-out;
        }
        .sankofa-bird-rig[data-celebrating="true"] .sankofa-bird-shadow {
          fill: rgba(0, 180, 220, 0.25);
          filter: blur(1px) hue-rotate(-20deg) saturate(1.6);
          transition: fill 0.5s ease-out, filter 0.5s ease-out;
        }
        .sankofa-bird-rig:not([data-helping="true"]):not([data-celebrating="true"]) .sankofa-bird-shadow {
          fill: rgba(0,0,0,0.22);
          filter: blur(1px);
          transition: fill 0.7s ease-out, filter 0.7s ease-out;
        }

        /* ── P12.8: Eye micro-saccades enhanced on notification ──────────── */
        /* G5: The existing notification triggers sankofa-eye-alert (a lateral
           pop). Enhanced: add Y-axis dart so the eye moves diagonally (more
           realistic rapid-onset alertness response to stimulus). */
        @keyframes sankofa-eye-alert-enhanced {
          0%          { transform: translate(0, 0); opacity: 1; }
          8%          { transform: translate(0.28px, -0.20px); opacity: 1; }
          16%         { transform: translate(-0.22px, 0.12px); opacity: 1; }
          24%         { transform: translate(0.18px, -0.14px); opacity: 1; }
          35%, 37%    { transform: translate(0, 0); opacity: 0; } /* blink */
          39%         { transform: translate(0, 0); opacity: 1; }
          48%         { transform: translate(-0.30px, 0.08px); opacity: 1; }
          58%         { transform: translate(0.20px, -0.16px); opacity: 1; }
          70%,100%    { transform: translate(0, 0); opacity: 1; }
        }
        .sankofa-bird-rig[data-zoom="street"][data-notification="true"]:not([data-battery-saver="true"]) .sankofa-bird-eye {
          animation: sankofa-eye-alert-enhanced 1.8s ease-out !important;
        }
        .sankofa-bird-rig[data-zoom="high"][data-notification="true"]:not([data-battery-saver="true"]) .sankofa-bird-eye {
          animation: sankofa-eye-alert 1.4s ease-out !important;
        }

        /* ── P12.9: Per-feather ambient micro-oscillations during flight ──── */
        /* G6: Feather micro-oscillations previously only fired at idle.
           During flight, individual secondary + covert rows vibrate at low
           amplitude — simulating real aerodynamic flutter from airstream
           turbulence. Amplitude scales with --speed-factor. */
        @keyframes sankofa-feather-ambient-l {
          0%,100%  { transform: rotate(0deg)   scaleY(1); }
          18%      { transform: rotate(-0.8deg) scaleY(0.998); }
          42%      { transform: rotate(0.5deg)  scaleY(1.001); }
          67%      { transform: rotate(-0.6deg) scaleY(0.999); }
          83%      { transform: rotate(0.4deg)  scaleY(1); }
        }
        @keyframes sankofa-feather-ambient-r {
          0%,100%  { transform: rotate(0deg)   scaleY(1); }
          22%      { transform: rotate(0.7deg)  scaleY(0.998); }
          45%      { transform: rotate(-0.5deg) scaleY(1.001); }
          70%      { transform: rotate(0.6deg)  scaleY(0.999); }
          88%      { transform: rotate(-0.4deg) scaleY(1); }
        }
        /* Apply to secondary feather rows (l2/r2 = secondaries, l3/r3 = coverts) */
        .sankofa-bird-rig[data-flying="true"][data-zoom="high"]:not([data-battery-saver="true"]) .sankofa-feather-l2,
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"]:not([data-battery-saver="true"]) .sankofa-feather-l2 {
          animation: sankofa-feather-ambient-l calc(var(--flap-period, 1400ms) * 0.68) ease-in-out infinite !important;
        }
        .sankofa-bird-rig[data-flying="true"][data-zoom="high"]:not([data-battery-saver="true"]) .sankofa-feather-r2,
        .sankofa-bird-rig[data-flying="true"][data-zoom="street"]:not([data-battery-saver="true"]) .sankofa-feather-r2 {
          animation: sankofa-feather-ambient-r calc(var(--flap-period, 1400ms) * 0.71) ease-in-out infinite !important;
        }

        /* ── P12.10: Pre-bank leading-edge feather compression ───────────── */
        /* G7: When banking left (bankDeg < 0), the LEFT wing's leading-edge
           feathers (l1, the outermost primary) compress slightly inward — the
           bird "loads" the feathers before the downstroke. This is the
           aerodynamic "pre-bank compression" described in the vision doc.
           Uses @supports (translate) so it only applies where safe. */
        @supports (translate: 0px) {
          .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="left"][data-zoom="street"] .sankofa-feather-l1 {
            translate: 0 0.6px;
            transition: translate 0.55s ease-out;
          }
          .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="right"][data-zoom="street"] .sankofa-feather-r1 {
            translate: 0 0.6px;
            transition: translate 0.55s ease-out;
          }
          .sankofa-bird-rig[data-upcoming-turn="none"] .sankofa-feather-l1,
          .sankofa-bird-rig[data-upcoming-turn="none"] .sankofa-feather-r1 {
            translate: 0 0;
            transition: translate 0.50s ease-out;
          }
        }

        /* ── P12.11: Helping state low-zoom rules ────────────────────────── */
        /* G8: At low zoom (< 10) the bird is just a silhouette. Add a minimal
           gold ambient ring to distinguish the helping state even at this LOD —
           the halo ensures the user's bird doesn't look identical to a neutral
           bird when they're actively helping someone. */
        .sankofa-bird-rig[data-helping="true"][data-zoom="low"] .sankofa-glow-layer {
          fill: hsl(45, 95%, 58%);
          opacity: 0.18;
          animation: sankofa-helping-glow 2.4s ease-in-out infinite !important;
        }
        .sankofa-bird-rig[data-helping="true"][data-zoom="low"] .sankofa-bird-body {
          filter: drop-shadow(0 0 3px rgba(255, 190, 40, 0.38));
        }

        /* ── P12.12: Speed-correlated crown sway ────────────────────────── */
        /* G9: Crown sway period was fixed. At high speed the feathers should
           vibrate faster (air stream forces shorter oscillation). At idle they
           sway slowly. This animates the sway period from ~2.8s (airplane) to
           ~5.5s (idle) via CSS variable scaling. */
        .sankofa-bird-rig[data-speed="airplane"][data-zoom="high"] .sankofa-crown-feather,
        .sankofa-bird-rig[data-speed="airplane"][data-zoom="street"] .sankofa-crown-feather {
          animation-duration: 2.2s !important; /* fastest sway at airplane speed */
        }
        .sankofa-bird-rig[data-speed="driving"][data-zoom="high"] .sankofa-crown-feather,
        .sankofa-bird-rig[data-speed="driving"][data-zoom="street"] .sankofa-crown-feather {
          animation-duration: 3.0s !important;
        }
        .sankofa-bird-rig[data-speed="running"][data-zoom="high"] .sankofa-crown-feather,
        .sankofa-bird-rig[data-speed="running"][data-zoom="street"] .sankofa-crown-feather {
          animation-duration: 4.0s !important;
        }
        .sankofa-bird-rig[data-speed="walking"][data-zoom="high"] .sankofa-crown-feather,
        .sankofa-bird-rig[data-speed="walking"][data-zoom="street"] .sankofa-crown-feather {
          animation-duration: 5.0s !important;
        }
        .sankofa-bird-rig[data-speed="idle"][data-zoom="high"] .sankofa-crown-feather,
        .sankofa-bird-rig[data-speed="idle"][data-zoom="street"] .sankofa-crown-feather {
          animation-duration: 5.8s !important;
        }

        /* ── P12.13: Aerodynamic neck/body arc on direction change ───────── */
        /* Real birds have dynamic neck and body movements during turns:
           - Neck extends forward-left or forward-right into the turn
           - Body tilts into the bank while wings counter-balance
           - Tail fans in the opposite direction to the turn as a rudder
           This compounds the existing bank/tail CSS with a neck skew that
           gives a 3D "the whole bird turns" impression. */
        /* P12.13 BUG-FIX: Previous version used @supports (skewX: 0deg) which always
           evaluates FALSE — skewX is not a valid individual CSS property (only rotate:,
           translate:, scale: exist as individuals; skewX lives inside transform: only).
           The block was completely dead code. Fixed: use transform: skewX() compounded
           with the bank-angle term from E8. Higher selector specificity (5 attrs)
           overrides E8 base rule (4 attrs) when upcoming-turn + zoom both match.
           Left turn: extra -2.5deg arc INTO the turn; right: +2.5deg. */
        .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="left"][data-zoom="high"] .sankofa-bird-neck,
        .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="left"][data-zoom="street"] .sankofa-bird-neck {
          transform: skewX(calc(var(--bank-angle, 0deg) * 0.52 - 2.5deg));
          transform-box: view-box; transform-origin: 18px 22px;
          transition: rotate 0.40s ease-out, transform 0.50s ease-out;
        }
        .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="right"][data-zoom="high"] .sankofa-bird-neck,
        .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="right"][data-zoom="street"] .sankofa-bird-neck {
          transform: skewX(calc(var(--bank-angle, 0deg) * 0.52 + 2.5deg));
          transform-box: view-box; transform-origin: 18px 22px;
          transition: rotate 0.40s ease-out, transform 0.50s ease-out;
        }
        /* Mid-zoom: 60% arc — thicker neck path at this LOD reads better with less skew */
        .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="left"][data-zoom="mid"] .sankofa-bird-neck {
          transform: skewX(calc(var(--bank-angle, 0deg) * 0.22 - 1.5deg));
          transition: rotate 0.40s ease-out, transform 0.50s ease-out;
        }
        .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="right"][data-zoom="mid"] .sankofa-bird-neck {
          transform: skewX(calc(var(--bank-angle, 0deg) * 0.22 + 1.5deg));
          transition: rotate 0.40s ease-out, transform 0.50s ease-out;
        }

        /* ── P12.14: Reduced-motion guard for all Phase 12/13 additions ──── */
        @media (prefers-reduced-motion: reduce) {
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-eye,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-iris,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-eye-catchlight {
            transform: none !important;
            transition: none !important;
          }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-body {
            animation: none !important;
            rotate: 0deg !important;
          }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-feather-l1,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-feather-r1,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-feather-l2,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-feather-r2 {
            animation: none !important;
            translate: 0 0 !important;
          }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-wing-left,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-wing-right {
            translate: 0 0 !important;
            transition: none !important;
          }
        }

        /* ═══════════════════════════════════════════════════════════════════
           PHASE 14 — BIOMECHANICAL TURN COMMITMENT & FULL-BODY AWARENESS
           July 2026. Implements the remaining gaps from the brief:
             P14.1: Wing physical sweep during ACTUAL banking (data-turning)
             P14.2: Body lateral center-of-mass commit on hard banking
             P14.3: Tail cross-rudder asymmetric fan during committed turns
             P14.4: Gaze-driven body weight-shift for perched state
             P14.5: Speed-scaled aerodynamic tuck at airplane speed
           All gated on data-turning (|bankDeg| >= 8deg) not data-upcoming-turn,
           so they fire for REAL turns (GPS heading change) not just nav previews.
           Battery-saver and reduced-motion guards at end of phase.
           ═══════════════════════════════════════════════════════════════════ */

        /* P14.1: Wing physical sweep during actual banking
           When data-turning fires (bird is actively in a banked turn), the OUTSIDE
           wing extends outward and slightly forward — aerodynamic lift asymmetry.
           The INSIDE wing pulls back and inward — feathers loaded for the downstroke.
           This is more aggressive than P12.5 (upcoming-turn) which was 0.8px and
           anticipatory. These are 1.4px actual-bank extensions and fire simultaneously
           with P12.5 when both upcoming-turn and turning are active.
           @supports translate so it composes with P12.5 translate cleanly. */
        @supports (translate: 0px) {
          /* Banking left: right wing (outside) sweeps out+forward */
          .sankofa-bird-rig[data-flying="true"][data-turning="left"][data-zoom="high"] .sankofa-bird-wing-right,
          .sankofa-bird-rig[data-flying="true"][data-turning="left"][data-zoom="street"] .sankofa-bird-wing-right {
            translate: 1.4px -0.4px;
            transition: translate 0.30s cubic-bezier(0.34, 1.15, 0.64, 1);
          }
          /* Banking left: left wing (inside) tucks inward */
          .sankofa-bird-rig[data-flying="true"][data-turning="left"][data-zoom="high"] .sankofa-bird-wing-left,
          .sankofa-bird-rig[data-flying="true"][data-turning="left"][data-zoom="street"] .sankofa-bird-wing-left {
            translate: -0.6px 0.3px;
            transition: translate 0.32s cubic-bezier(0.34, 1.15, 0.64, 1);
          }
          /* Banking right: left wing (outside) sweeps out+forward */
          .sankofa-bird-rig[data-flying="true"][data-turning="right"][data-zoom="high"] .sankofa-bird-wing-left,
          .sankofa-bird-rig[data-flying="true"][data-turning="right"][data-zoom="street"] .sankofa-bird-wing-left {
            translate: -1.4px -0.4px;
            transition: translate 0.30s cubic-bezier(0.34, 1.15, 0.64, 1);
          }
          /* Banking right: right wing (inside) tucks inward */
          .sankofa-bird-rig[data-flying="true"][data-turning="right"][data-zoom="high"] .sankofa-bird-wing-right,
          .sankofa-bird-rig[data-flying="true"][data-turning="right"][data-zoom="street"] .sankofa-bird-wing-right {
            translate: 0.6px 0.3px;
            transition: translate 0.32s cubic-bezier(0.34, 1.15, 0.64, 1);
          }
          /* Reset when bank clears */
          .sankofa-bird-rig[data-turning="none"] .sankofa-bird-wing-left,
          .sankofa-bird-rig[data-turning="none"] .sankofa-bird-wing-right {
            translate: 0 0;
            transition: translate 0.55s ease-out;
          }
          /* Battery-saver: suppress wing sweep */
          .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-left,
          .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-right {
            translate: 0 0 !important;
          }
        }

        /* P14.2: Body lateral center-of-mass commit on hard banking
           At full committed bank the bird's entire center of mass shifts slightly
           toward the turn — exactly as a cyclist leans a bike, or a raptor rolls.
           translateX moves the BODY element (not the rig, which already rotates)
           so it reads as "the whole torso shifting into the turn" rather than just
           an angle change. Uses individual translate: property so it composes with
           E7's rotate: on .sankofa-bird-body without any shorthand conflict. */
        @supports (translate: 0px) {
          .sankofa-bird-rig[data-flying="true"][data-turning="left"][data-zoom="high"] .sankofa-bird-body,
          .sankofa-bird-rig[data-flying="true"][data-turning="left"][data-zoom="street"] .sankofa-bird-body {
            translate: -0.7px 0.1px;
            transition: translate 0.38s cubic-bezier(0.34, 1.1, 0.64, 1);
          }
          .sankofa-bird-rig[data-flying="true"][data-turning="right"][data-zoom="high"] .sankofa-bird-body,
          .sankofa-bird-rig[data-flying="true"][data-turning="right"][data-zoom="street"] .sankofa-bird-body {
            translate: 0.7px 0.1px;
            transition: translate 0.38s cubic-bezier(0.34, 1.1, 0.64, 1);
          }
          .sankofa-bird-rig[data-turning="none"] .sankofa-bird-body {
            translate: 0 0;
            transition: translate 0.50s ease-out;
          }
          .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-body {
            translate: 0 0 !important;
          }
        }

        /* P14.3: Tail cross-rudder asymmetric fan during committed turns
           During a hard bank the outer tail feathers spread asymmetrically —
           the inside-turn feathers compress (folded for bank geometry) while
           outside-turn feathers fan wider for drag-steering (the avian rudder).
           Uses individual transform on outer tail elements with @supports guard. */
        @supports (translate: 0px) {
          .sankofa-bird-rig[data-flying="true"][data-turning="left"] .sankofa-tail-outer-right {
            translate: 0.5px -0.2px;
            transition: translate 0.40s ease-out;
          }
          .sankofa-bird-rig[data-flying="true"][data-turning="left"] .sankofa-tail-outer-left {
            translate: -0.3px 0.1px;
            transition: translate 0.42s ease-out;
          }
          .sankofa-bird-rig[data-flying="true"][data-turning="right"] .sankofa-tail-outer-left {
            translate: -0.5px -0.2px;
            transition: translate 0.40s ease-out;
          }
          .sankofa-bird-rig[data-flying="true"][data-turning="right"] .sankofa-tail-outer-right {
            translate: 0.3px 0.1px;
            transition: translate 0.42s ease-out;
          }
          .sankofa-bird-rig[data-turning="none"] .sankofa-tail-outer-left,
          .sankofa-bird-rig[data-turning="none"] .sankofa-tail-outer-right {
            translate: 0 0;
            transition: translate 0.50s ease-out;
          }
          .sankofa-bird-rig[data-battery-saver="true"] .sankofa-tail-outer-left,
          .sankofa-bird-rig[data-battery-saver="true"] .sankofa-tail-outer-right {
            translate: 0 0 !important;
          }
        }

        /* P14.4: Gaze-driven body weight-shift for perched/idle state
           When the bird is perched and gazes sideways ("left" or "right"),
           its body shifts weight toward the gaze direction — a real avian
           perch-weight behavior. The shift is tiny (0.4px) but makes the
           gaze feel biomechanically connected to the whole body, not just
           the head. Only fires when NOT flying (idle, perch). */
        @supports (translate: 0px) {
          .sankofa-bird-rig:not([data-flying="true"])[data-gaze="left"][data-zoom="high"] .sankofa-bird-body,
          .sankofa-bird-rig:not([data-flying="true"])[data-gaze="left"][data-zoom="street"] .sankofa-bird-body,
          .sankofa-bird-rig:not([data-flying="true"])[data-gaze="up-left"][data-zoom="high"] .sankofa-bird-body,
          .sankofa-bird-rig:not([data-flying="true"])[data-gaze="up-left"][data-zoom="street"] .sankofa-bird-body,
          .sankofa-bird-rig:not([data-flying="true"])[data-gaze="down-left"][data-zoom="high"] .sankofa-bird-body,
          .sankofa-bird-rig:not([data-flying="true"])[data-gaze="down-left"][data-zoom="street"] .sankofa-bird-body {
            translate: -0.4px 0;
            transition: translate 0.65s ease-out;
          }
          .sankofa-bird-rig:not([data-flying="true"])[data-gaze="right"][data-zoom="high"] .sankofa-bird-body,
          .sankofa-bird-rig:not([data-flying="true"])[data-gaze="right"][data-zoom="street"] .sankofa-bird-body,
          .sankofa-bird-rig:not([data-flying="true"])[data-gaze="up-right"][data-zoom="high"] .sankofa-bird-body,
          .sankofa-bird-rig:not([data-flying="true"])[data-gaze="up-right"][data-zoom="street"] .sankofa-bird-body,
          .sankofa-bird-rig:not([data-flying="true"])[data-gaze="down-right"][data-zoom="high"] .sankofa-bird-body,
          .sankofa-bird-rig:not([data-flying="true"])[data-gaze="down-right"][data-zoom="street"] .sankofa-bird-body {
            translate: 0.4px 0;
            transition: translate 0.65s ease-out;
          }
          .sankofa-bird-rig:not([data-flying="true"])[data-gaze="center"] .sankofa-bird-body,
          .sankofa-bird-rig:not([data-flying="true"])[data-gaze="up"] .sankofa-bird-body,
          .sankofa-bird-rig:not([data-flying="true"])[data-gaze="down"] .sankofa-bird-body {
            translate: 0 0;
            transition: translate 0.60s ease-out;
          }
          .sankofa-bird-rig[data-battery-saver="true"]:not([data-flying="true"]) .sankofa-bird-body {
            translate: 0 0 !important;
          }
        }

        /* P14.5: Head forward-dart at airplane speed
           P8.4 already handles neck dart at airplane speed (translate: -1.15px 0).
           P8.4 does NOT have a HEAD dart rule — P14.5 fills that gap.
           Guard: not([data-helping="true"]) — E2 helping-crane already moves the head
           forward (-0.8px via transform: shorthand). Without the guard, the two would
           stack (individual translate: composes additively with transform:) creating
           a double-forward head displacement at airplane speed while helping.
           Battery-saver: suppressed. Composes with P9.7 rotate: additively. */
        @supports (translate: 0px) {
          .sankofa-bird-rig[data-flying="true"][data-speed="airplane"]:not([data-helping="true"])[data-zoom="high"] .sankofa-bird-head,
          .sankofa-bird-rig[data-flying="true"][data-speed="airplane"]:not([data-helping="true"])[data-zoom="street"] .sankofa-bird-head {
            translate: -0.5px -0.1px;
            transition: translate 0.55s cubic-bezier(0.25, 0.8, 0.25, 1);
          }
          /* Release head dart when speed drops or bird lands */
          .sankofa-bird-rig[data-flying="true"]:not([data-speed="airplane"]) .sankofa-bird-head,
          .sankofa-bird-rig:not([data-flying="true"]) .sankofa-bird-head {
            translate: 0 0;
            transition: translate 0.60s ease-out;
          }
          .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-head {
            translate: 0 0 !important;
          }
        }

        /* P14 -- Reduced-motion guards */
        @media (prefers-reduced-motion: reduce) {
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-wing-left,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-wing-right {
            translate: 0 0 !important;
            transition: none !important;
          }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-body {
            translate: 0 0 !important;
          }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-tail-outer-left,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-tail-outer-right {
            translate: 0 0 !important;
            transition: none !important;
          }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-neck,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-head {
            translate: 0 0 !important;
            transition: none !important;
          }
        }

        /* ═══════════════════════════════════════════════════════════════════
           PHASE 15 — REAL-TIME FULL-BODY DIRECTIONAL AWARENESS
           July 2026. Core request: "Look right to left, up, down, diagonal
           in real time. Real-time head AND neck awareness."
           Sources: user brief + autonomous idle scan added in JS (above).

           P15.1: Gaze-driven neck arc — when data-gaze fires from ANY source
                  (bank-reactive, anticipatory upcoming-turn, or idle scan),
                  the neck physically arcs via transform:skewX toward the gaze
                  direction — the cervical S-curve a real bird shows when turning.
           P15.2: Mid-zoom gaze head rotation — phones at zoom 10-13 get no head
                  rotation from P12.2 (only high/street). Added at 60% amplitude.
           P15.3: Beak vertical pitch — up/down gaze tilts the beak at street zoom.
           P15.4: Eye alive shimmer — subtle opacity pulse on catchlight between
                  saccades; "live" eye without conflicting with P12.1 transform.
           P15.5: Gaze-correlated wing micro-lift — outside wing feathers lift
                  fractionally when the bird looks in their direction while flying.
           Battery-saver + reduced-motion guards at end of phase.
           ═══════════════════════════════════════════════════════════════════ */

        /* ── P15.1: Gaze-driven neck arc ────────────────────────────────────
           The neck arcs via transform:skewX toward the gaze direction.
           For FLYING: compounds with E8 bank-skew (both inside transform:).
           For PERCHED: operates standalone (no bank active at idle).
           Specificity (0,5,0) overrides E8's base rule (0,4,0) when gaze fires.
           Amplitude: 4deg pure lateral, 2.5deg diagonals — enough to read without
           distorting the neck path. Transition 0.55s ease-out matches P12.3 lag. */

        /* ── Flying + high/street zoom: compound bank + gaze arc ───────────── */
        .sankofa-bird-rig[data-flying="true"][data-gaze="left"][data-zoom="high"] .sankofa-bird-neck,
        .sankofa-bird-rig[data-flying="true"][data-gaze="left"][data-zoom="street"] .sankofa-bird-neck {
          transform: skewX(calc(var(--bank-angle, 0deg) * 0.52 - 4.0deg));
          transform-box: view-box; transform-origin: 18px 22px;
          transition: rotate 0.40s ease-out, transform 0.55s ease-out;
        }
        .sankofa-bird-rig[data-flying="true"][data-gaze="right"][data-zoom="high"] .sankofa-bird-neck,
        .sankofa-bird-rig[data-flying="true"][data-gaze="right"][data-zoom="street"] .sankofa-bird-neck {
          transform: skewX(calc(var(--bank-angle, 0deg) * 0.52 + 4.0deg));
          transform-box: view-box; transform-origin: 18px 22px;
          transition: rotate 0.40s ease-out, transform 0.55s ease-out;
        }
        .sankofa-bird-rig[data-flying="true"][data-gaze="up-left"][data-zoom="high"] .sankofa-bird-neck,
        .sankofa-bird-rig[data-flying="true"][data-gaze="up-left"][data-zoom="street"] .sankofa-bird-neck,
        .sankofa-bird-rig[data-flying="true"][data-gaze="down-left"][data-zoom="high"] .sankofa-bird-neck,
        .sankofa-bird-rig[data-flying="true"][data-gaze="down-left"][data-zoom="street"] .sankofa-bird-neck {
          transform: skewX(calc(var(--bank-angle, 0deg) * 0.52 - 2.5deg));
          transform-box: view-box; transform-origin: 18px 22px;
          transition: rotate 0.40s ease-out, transform 0.55s ease-out;
        }
        .sankofa-bird-rig[data-flying="true"][data-gaze="up-right"][data-zoom="high"] .sankofa-bird-neck,
        .sankofa-bird-rig[data-flying="true"][data-gaze="up-right"][data-zoom="street"] .sankofa-bird-neck,
        .sankofa-bird-rig[data-flying="true"][data-gaze="down-right"][data-zoom="high"] .sankofa-bird-neck,
        .sankofa-bird-rig[data-flying="true"][data-gaze="down-right"][data-zoom="street"] .sankofa-bird-neck {
          transform: skewX(calc(var(--bank-angle, 0deg) * 0.52 + 2.5deg));
          transform-box: view-box; transform-origin: 18px 22px;
          transition: rotate 0.40s ease-out, transform 0.55s ease-out;
        }
        /* center/up/down gaze while flying: release gaze skew, keep bank-only skew */
        .sankofa-bird-rig[data-flying="true"][data-gaze="center"][data-zoom="high"] .sankofa-bird-neck,
        .sankofa-bird-rig[data-flying="true"][data-gaze="center"][data-zoom="street"] .sankofa-bird-neck,
        .sankofa-bird-rig[data-flying="true"][data-gaze="up"][data-zoom="high"] .sankofa-bird-neck,
        .sankofa-bird-rig[data-flying="true"][data-gaze="up"][data-zoom="street"] .sankofa-bird-neck,
        .sankofa-bird-rig[data-flying="true"][data-gaze="down"][data-zoom="high"] .sankofa-bird-neck,
        .sankofa-bird-rig[data-flying="true"][data-gaze="down"][data-zoom="street"] .sankofa-bird-neck {
          transform: skewX(calc(var(--bank-angle, 0deg) * 0.52));
          transform-box: view-box; transform-origin: 18px 22px;
          transition: rotate 0.40s ease-out, transform 0.42s ease-out;
        }

        /* ── Flying + mid-zoom: lighter arc (2.4deg lateral, 1.5deg diagonal) ── */
        .sankofa-bird-rig[data-flying="true"][data-gaze="left"][data-zoom="mid"] .sankofa-bird-neck {
          transform: skewX(calc(var(--bank-angle, 0deg) * 0.22 - 2.4deg));
          transition: rotate 0.40s ease-out, transform 0.55s ease-out;
        }
        .sankofa-bird-rig[data-flying="true"][data-gaze="right"][data-zoom="mid"] .sankofa-bird-neck {
          transform: skewX(calc(var(--bank-angle, 0deg) * 0.22 + 2.4deg));
          transition: rotate 0.40s ease-out, transform 0.55s ease-out;
        }
        .sankofa-bird-rig[data-flying="true"][data-gaze="up-left"][data-zoom="mid"] .sankofa-bird-neck,
        .sankofa-bird-rig[data-flying="true"][data-gaze="down-left"][data-zoom="mid"] .sankofa-bird-neck {
          transform: skewX(calc(var(--bank-angle, 0deg) * 0.22 - 1.5deg));
          transition: rotate 0.40s ease-out, transform 0.55s ease-out;
        }
        .sankofa-bird-rig[data-flying="true"][data-gaze="up-right"][data-zoom="mid"] .sankofa-bird-neck,
        .sankofa-bird-rig[data-flying="true"][data-gaze="down-right"][data-zoom="mid"] .sankofa-bird-neck {
          transform: skewX(calc(var(--bank-angle, 0deg) * 0.22 + 1.5deg));
          transition: rotate 0.40s ease-out, transform 0.55s ease-out;
        }

        /* ── Perched/idle: standalone gaze arc (no bank term) ───────────────── */
        /* Fires from idle scan cycle and any other non-flying gaze driver.
           This is what makes the perched bird visually turn its neck when it
           looks sideways — the key "real-time neck awareness" behavior. */
        .sankofa-bird-rig:not([data-flying="true"])[data-gaze="left"][data-zoom="high"] .sankofa-bird-neck,
        .sankofa-bird-rig:not([data-flying="true"])[data-gaze="left"][data-zoom="street"] .sankofa-bird-neck {
          transform: skewX(-4.0deg);
          transform-box: view-box; transform-origin: 18px 22px;
          transition: rotate 0.55s ease-out, transform 0.65s ease-out;
        }
        .sankofa-bird-rig:not([data-flying="true"])[data-gaze="right"][data-zoom="high"] .sankofa-bird-neck,
        .sankofa-bird-rig:not([data-flying="true"])[data-gaze="right"][data-zoom="street"] .sankofa-bird-neck {
          transform: skewX(4.0deg);
          transform-box: view-box; transform-origin: 18px 22px;
          transition: rotate 0.55s ease-out, transform 0.65s ease-out;
        }
        .sankofa-bird-rig:not([data-flying="true"])[data-gaze="up-left"][data-zoom="high"] .sankofa-bird-neck,
        .sankofa-bird-rig:not([data-flying="true"])[data-gaze="up-left"][data-zoom="street"] .sankofa-bird-neck,
        .sankofa-bird-rig:not([data-flying="true"])[data-gaze="down-left"][data-zoom="high"] .sankofa-bird-neck,
        .sankofa-bird-rig:not([data-flying="true"])[data-gaze="down-left"][data-zoom="street"] .sankofa-bird-neck {
          transform: skewX(-2.5deg);
          transform-box: view-box; transform-origin: 18px 22px;
          transition: rotate 0.55s ease-out, transform 0.65s ease-out;
        }
        .sankofa-bird-rig:not([data-flying="true"])[data-gaze="up-right"][data-zoom="high"] .sankofa-bird-neck,
        .sankofa-bird-rig:not([data-flying="true"])[data-gaze="up-right"][data-zoom="street"] .sankofa-bird-neck,
        .sankofa-bird-rig:not([data-flying="true"])[data-gaze="down-right"][data-zoom="high"] .sankofa-bird-neck,
        .sankofa-bird-rig:not([data-flying="true"])[data-gaze="down-right"][data-zoom="street"] .sankofa-bird-neck {
          transform: skewX(2.5deg);
          transform-box: view-box; transform-origin: 18px 22px;
          transition: rotate 0.55s ease-out, transform 0.65s ease-out;
        }
        /* Center/up/down perched: return neck to neutral (no lateral arc) */
        .sankofa-bird-rig:not([data-flying="true"])[data-gaze="center"] .sankofa-bird-neck,
        .sankofa-bird-rig:not([data-flying="true"])[data-gaze="up"] .sankofa-bird-neck,
        .sankofa-bird-rig:not([data-flying="true"])[data-gaze="down"] .sankofa-bird-neck {
          transform: skewX(0deg);
          transition: rotate 0.55s ease-out, transform 0.65s ease-out;
        }
        /* Battery-saver: suppress all P15.1 neck arcs */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-neck {
          transform: skewX(0deg) !important;
        }

        /* ── P15.2: Mid-zoom gaze head rotation ─────────────────────────────
           P12.2 only rotates the head at high/street zoom (zoom 14+).
           Phones typically navigate at zoom 10-13 (mid) — the bird's head
           was completely static there despite active gaze. Added at 60% amplitude.
           Uses @supports (rotate) like P12.2 for identical browser compatibility. */
        @supports (rotate: 0deg) {
          .sankofa-bird-rig[data-gaze="left"][data-zoom="mid"] .sankofa-bird-head {
            rotate: -4.8deg;
            transition: rotate 0.42s cubic-bezier(0.34, 1.1, 0.64, 1);
          }
          .sankofa-bird-rig[data-gaze="right"][data-zoom="mid"] .sankofa-bird-head {
            rotate: 4.8deg;
            transition: rotate 0.42s cubic-bezier(0.34, 1.1, 0.64, 1);
          }
          .sankofa-bird-rig[data-gaze="up"][data-zoom="mid"] .sankofa-bird-head {
            rotate: -1.5deg;
            transition: rotate 0.52s ease-out;
          }
          .sankofa-bird-rig[data-gaze="down"][data-zoom="mid"] .sankofa-bird-head {
            rotate: 1.5deg;
            transition: rotate 0.52s ease-out;
          }
          .sankofa-bird-rig[data-gaze="up-left"][data-zoom="mid"] .sankofa-bird-head {
            rotate: -3.9deg;
            transition: rotate 0.40s cubic-bezier(0.34, 1.1, 0.64, 1);
          }
          .sankofa-bird-rig[data-gaze="up-right"][data-zoom="mid"] .sankofa-bird-head {
            rotate: 3.9deg;
            transition: rotate 0.40s cubic-bezier(0.34, 1.1, 0.64, 1);
          }
          .sankofa-bird-rig[data-gaze="down-left"][data-zoom="mid"] .sankofa-bird-head {
            rotate: -3.0deg;
            transition: rotate 0.44s ease-out;
          }
          .sankofa-bird-rig[data-gaze="down-right"][data-zoom="mid"] .sankofa-bird-head {
            rotate: 3.0deg;
            transition: rotate 0.44s ease-out;
          }
          .sankofa-bird-rig[data-gaze="center"][data-zoom="mid"] .sankofa-bird-head {
            rotate: 0deg;
            transition: rotate 0.45s ease-out;
          }
          /* Mid-zoom neck follows head at 55% (same ratio as P12.3) */
          .sankofa-bird-rig[data-gaze="left"][data-zoom="mid"] .sankofa-bird-neck {
            rotate: -2.7deg;
            transition: rotate 0.58s ease-out 0.12s;
          }
          .sankofa-bird-rig[data-gaze="right"][data-zoom="mid"] .sankofa-bird-neck {
            rotate: 2.7deg;
            transition: rotate 0.58s ease-out 0.12s;
          }
          .sankofa-bird-rig[data-gaze="up-left"][data-zoom="mid"] .sankofa-bird-neck {
            rotate: -2.1deg;
            transition: rotate 0.54s ease-out 0.12s;
          }
          .sankofa-bird-rig[data-gaze="up-right"][data-zoom="mid"] .sankofa-bird-neck {
            rotate: 2.1deg;
            transition: rotate 0.54s ease-out 0.12s;
          }
          .sankofa-bird-rig[data-gaze="down-left"][data-zoom="mid"] .sankofa-bird-neck {
            rotate: -1.6deg;
            transition: rotate 0.58s ease-out 0.14s;
          }
          .sankofa-bird-rig[data-gaze="down-right"][data-zoom="mid"] .sankofa-bird-neck {
            rotate: 1.6deg;
            transition: rotate 0.58s ease-out 0.14s;
          }
          .sankofa-bird-rig[data-gaze="up"][data-zoom="mid"] .sankofa-bird-neck,
          .sankofa-bird-rig[data-gaze="down"][data-zoom="mid"] .sankofa-bird-neck {
            rotate: 0deg; /* vertical gaze: no lateral neck lean at mid zoom */
            transition: rotate 0.60s ease-out;
          }
          /* Battery-saver: suppress mid-zoom gaze rotation */
          .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-head,
          .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-neck {
            rotate: 0deg !important;
          }
        }

        /* ── P15.3: Beak vertical pitch from vertical gaze ──────────────────
           When the bird looks up or down, the beak naturally tilts with the
           head — a real anatomical result of cervical flexion. Subtle (±2.5deg)
           so it reads as organic not exaggerated. Street zoom only (beak is a
           few pixels wide at high zoom — too small for this detail to register).
           Fires from all vertical gaze sources: idle scan, takeoff, hover, dive.
           Uses rotate: individual property. Composes with P5.5 beak-chirp. */
        @supports (rotate: 0deg) {
          .sankofa-bird-rig[data-gaze="up"][data-zoom="street"] .sankofa-bird-beak-upper,
          .sankofa-bird-rig[data-gaze="up-left"][data-zoom="street"] .sankofa-bird-beak-upper,
          .sankofa-bird-rig[data-gaze="up-right"][data-zoom="street"] .sankofa-bird-beak-upper {
            rotate: -2.5deg;
            transform-box: view-box; transform-origin: 2px 14px;
            transition: rotate 0.45s ease-out;
          }
          .sankofa-bird-rig[data-gaze="down"][data-zoom="street"] .sankofa-bird-beak-upper,
          .sankofa-bird-rig[data-gaze="down-left"][data-zoom="street"] .sankofa-bird-beak-upper,
          .sankofa-bird-rig[data-gaze="down-right"][data-zoom="street"] .sankofa-bird-beak-upper {
            rotate: 2.0deg;
            transform-box: view-box; transform-origin: 2px 14px;
            transition: rotate 0.45s ease-out;
          }
          .sankofa-bird-rig[data-gaze="center"][data-zoom="street"] .sankofa-bird-beak-upper,
          .sankofa-bird-rig[data-gaze="left"][data-zoom="street"] .sankofa-bird-beak-upper,
          .sankofa-bird-rig[data-gaze="right"][data-zoom="street"] .sankofa-bird-beak-upper {
            rotate: 0deg;
            transition: rotate 0.50s ease-out;
          }
          /* Also tilt beak lower jaw with same direction (beak moves as a unit) */
          .sankofa-bird-rig[data-gaze="up"][data-zoom="street"] .sankofa-bird-beak-lower,
          .sankofa-bird-rig[data-gaze="up-left"][data-zoom="street"] .sankofa-bird-beak-lower,
          .sankofa-bird-rig[data-gaze="up-right"][data-zoom="street"] .sankofa-bird-beak-lower {
            rotate: -2.0deg;
            transform-box: view-box; transform-origin: 2px 14px;
            transition: rotate 0.48s ease-out;
          }
          .sankofa-bird-rig[data-gaze="down"][data-zoom="street"] .sankofa-bird-beak-lower,
          .sankofa-bird-rig[data-gaze="down-left"][data-zoom="street"] .sankofa-bird-beak-lower,
          .sankofa-bird-rig[data-gaze="down-right"][data-zoom="street"] .sankofa-bird-beak-lower {
            rotate: 1.5deg;
            transform-box: view-box; transform-origin: 2px 14px;
            transition: rotate 0.48s ease-out;
          }
          .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-beak-upper,
          .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-beak-lower {
            rotate: 0deg !important;
          }
        }

        /* ── P15.4: Eye alive shimmer ────────────────────────────────────────
           P12.1 uses !important on transform: to lock eye position to gaze.
           This means CSS animation on transform: is overridden. Instead, animate
           the catchlight's opacity — a slow irregular pulse that reads as the
           corneal surface reflecting shifting ambient light. Period tied to
           --blink-period so activity level drives the shimmer rate (busy bird
           = faster shimmer = more alert eye appearance).
           This is additive to P10.1 night-mode shimmer (different keyframe,
           different scope — daytime-only). */
        @keyframes sankofa-eye-alive-shimmer {
          0%,  100% { opacity: 0.88; }
          18%        { opacity: 0.65; }
          38%        { opacity: 0.95; }
          58%        { opacity: 0.72; }
          78%        { opacity: 0.90; }
        }
        .sankofa-bird-rig:not([data-night-mode="true"]):not([data-battery-saver="true"]):not([data-notification="true"])[data-zoom="street"] .sankofa-bird-eye-catchlight,
        .sankofa-bird-rig:not([data-night-mode="true"]):not([data-battery-saver="true"]):not([data-notification="true"])[data-zoom="high"] .sankofa-bird-eye-catchlight {
          animation: sankofa-eye-alive-shimmer calc(var(--blink-period, 7000ms) * 0.55) ease-in-out infinite !important;
        }
        /* Override: during notification, P12.8 alert animation takes full control */
        .sankofa-bird-rig[data-notification="true"] .sankofa-bird-eye-catchlight {
          animation-name: sankofa-eye-alert-enhanced !important;
        }

        /* ── P15.5: Gaze-correlated wing micro-lift during flight ────────────
           When banking left (bird looks left via gaze), the RIGHT wing (outside)
           should show a fractional leading-edge lift — the outside wing "opens"
           toward the gaze direction, completing the visual read that the whole
           body is committed to looking/turning in that direction.
           Uses filter:brightness on the wing highlight as a proxy for "wing opened
           more, catching more light" — avoids adding another transform that could
           conflict with the banking/flap animation chain.
           Only at high/street zoom where the wing highlight reads clearly. */
        .sankofa-bird-rig[data-flying="true"][data-gaze="left"][data-zoom="high"] .sankofa-bird-wing-right-highlight,
        .sankofa-bird-rig[data-flying="true"][data-gaze="left"][data-zoom="street"] .sankofa-bird-wing-right-highlight,
        .sankofa-bird-rig[data-flying="true"][data-gaze="up-left"][data-zoom="high"] .sankofa-bird-wing-right-highlight,
        .sankofa-bird-rig[data-flying="true"][data-gaze="up-left"][data-zoom="street"] .sankofa-bird-wing-right-highlight,
        .sankofa-bird-rig[data-flying="true"][data-gaze="down-left"][data-zoom="high"] .sankofa-bird-wing-right-highlight,
        .sankofa-bird-rig[data-flying="true"][data-gaze="down-left"][data-zoom="street"] .sankofa-bird-wing-right-highlight {
          filter: brightness(1.35) saturate(1.15);
          transition: filter 0.35s ease-out;
        }
        .sankofa-bird-rig[data-flying="true"][data-gaze="right"][data-zoom="high"] .sankofa-bird-wing-left-highlight,
        .sankofa-bird-rig[data-flying="true"][data-gaze="right"][data-zoom="street"] .sankofa-bird-wing-left-highlight,
        .sankofa-bird-rig[data-flying="true"][data-gaze="up-right"][data-zoom="high"] .sankofa-bird-wing-left-highlight,
        .sankofa-bird-rig[data-flying="true"][data-gaze="up-right"][data-zoom="street"] .sankofa-bird-wing-left-highlight,
        .sankofa-bird-rig[data-flying="true"][data-gaze="down-right"][data-zoom="high"] .sankofa-bird-wing-left-highlight,
        .sankofa-bird-rig[data-flying="true"][data-gaze="down-right"][data-zoom="street"] .sankofa-bird-wing-left-highlight {
          filter: brightness(1.35) saturate(1.15);
          transition: filter 0.35s ease-out;
        }
        /* Neutral gaze: reset highlight to standard brightness */
        .sankofa-bird-rig[data-flying="true"][data-gaze="center"] .sankofa-bird-wing-left-highlight,
        .sankofa-bird-rig[data-flying="true"][data-gaze="center"] .sankofa-bird-wing-right-highlight,
        .sankofa-bird-rig[data-flying="true"][data-gaze="up"] .sankofa-bird-wing-left-highlight,
        .sankofa-bird-rig[data-flying="true"][data-gaze="up"] .sankofa-bird-wing-right-highlight,
        .sankofa-bird-rig[data-flying="true"][data-gaze="down"] .sankofa-bird-wing-left-highlight,
        .sankofa-bird-rig[data-flying="true"][data-gaze="down"] .sankofa-bird-wing-right-highlight {
          filter: none;
          transition: filter 0.45s ease-out;
        }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-left-highlight,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-right-highlight {
          filter: none !important;
        }

        /* ── P15: Battery-saver guard ────────────────────────────────────────
           Suppress all P15 animation/transform/filter additions. */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-eye-catchlight {
          animation: none !important;
        }

        /* ── P15: Reduced-motion guard ───────────────────────────────────────
           Suppress neck arcs, head/neck rotation, beak pitch, and eye shimmer
           in prefers-reduced-motion mode (unless overridden by data-bird-anim). */
        @media (prefers-reduced-motion: reduce) {
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-neck {
            transform: skewX(0deg) !important;
          }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-head {
            rotate: 0deg !important;
            transition: none !important;
          }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-beak-upper,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-beak-lower {
            rotate: 0deg !important;
            transition: none !important;
          }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-eye-catchlight {
            animation: none !important;
          }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-wing-left-highlight,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-wing-right-highlight {
            filter: none !important;
            transition: none !important;
          }
        }

        /* ═══════════════════════════════════════════════════════════════════
           PHASE 16 — LIVE MAP WIRING, CROSS-DEVICE COMPAT & BIOMECHANICS
           July 2026. Companion to useBirdNavigation.ts + NavigationBird.tsx.
           Sources: design docs line-by-line — Niakofa doc §1-24, How-to doc
           §1-16, Build doc asset hierarchy.

           P16.1: Curiosity head tilt — diagonal idle-scan gaze adds a Z-axis
                  "quizzical" tilt on top of P12.2 gaze rotation (doc §15/§7).
           P16.2: Egg pendulum physics — egg swings counter-turn on bank,
                  returns on neutral (Niakofa doc §16, "Bird turns left → Egg
                  swings slightly → Returns").
           P16.3: WAIR wing flutter — walking (not flying) gets a subtle upward
                  wing bounce, mimicking Wing-Assisted Incline Running.
           P16.4: Performance hardening for iOS Safari + older Android Chrome:
                  CSS containment, GPU layer promotion hints, will-change gating.
           P16.5: NavLod escalation guards — stronger suppression at navLod=2
                  (30 min+ sessions) to protect older GPU memory budgets.
           P16.6: Wind-compensation posture at headwind speeds (doc §8).
           All effects guarded: battery-saver, reduced-motion, @supports.
           ═══════════════════════════════════════════════════════════════════ */

        /* ── P16.1: Curiosity head tilt ──────────────────────────────────────
           When the idle-scan cycle reaches a diagonal direction (up-left,
           up-right, down-left, down-right) the head adds a slight Z-tilt —
           the "quizzical ear-toward-sound" pose every curious bird makes.
           Uses transform:rotate() which composes additively with P12.2's
           rotate: individual property. Total visible rotation = P12.2 + P16.1.
           Only fires when not flying (idle scan active), street/high zoom.
           Amplitude ±4deg — enough to register without distorting. */
        @supports (rotate: 0deg) {
          /* Up-left scan: additional 4deg clockwise tilt (ear toward right) */
          .sankofa-bird-rig:not([data-flying="true"])[data-gaze="up-left"][data-zoom="high"] .sankofa-bird-head,
          .sankofa-bird-rig:not([data-flying="true"])[data-gaze="up-left"][data-zoom="street"] .sankofa-bird-head {
            transform: rotate(4deg);
            transition: rotate 0.50s cubic-bezier(0.34, 1.1, 0.64, 1), transform 0.50s cubic-bezier(0.34, 1.1, 0.64, 1);
          }
          /* Up-right scan: additional 4deg counter-clockwise tilt (ear toward left) */
          .sankofa-bird-rig:not([data-flying="true"])[data-gaze="up-right"][data-zoom="high"] .sankofa-bird-head,
          .sankofa-bird-rig:not([data-flying="true"])[data-gaze="up-right"][data-zoom="street"] .sankofa-bird-head {
            transform: rotate(-4deg);
            transition: rotate 0.50s cubic-bezier(0.34, 1.1, 0.64, 1), transform 0.50s cubic-bezier(0.34, 1.1, 0.64, 1);
          }
          /* Down-left: shallower tilt 2deg (looking down is less curious, more watchful) */
          .sankofa-bird-rig:not([data-flying="true"])[data-gaze="down-left"][data-zoom="high"] .sankofa-bird-head,
          .sankofa-bird-rig:not([data-flying="true"])[data-gaze="down-left"][data-zoom="street"] .sankofa-bird-head {
            transform: rotate(2deg);
            transition: rotate 0.55s ease-out, transform 0.55s ease-out;
          }
          /* Down-right: shallower tilt -2deg */
          .sankofa-bird-rig:not([data-flying="true"])[data-gaze="down-right"][data-zoom="high"] .sankofa-bird-head,
          .sankofa-bird-rig:not([data-flying="true"])[data-gaze="down-right"][data-zoom="street"] .sankofa-bird-head {
            transform: rotate(-2deg);
            transition: rotate 0.55s ease-out, transform 0.55s ease-out;
          }
          /* Horizontal/vertical/center gaze: no curiosity tilt */
          .sankofa-bird-rig:not([data-flying="true"])[data-gaze="left"] .sankofa-bird-head,
          .sankofa-bird-rig:not([data-flying="true"])[data-gaze="right"] .sankofa-bird-head,
          .sankofa-bird-rig:not([data-flying="true"])[data-gaze="up"] .sankofa-bird-head,
          .sankofa-bird-rig:not([data-flying="true"])[data-gaze="down"] .sankofa-bird-head,
          .sankofa-bird-rig:not([data-flying="true"])[data-gaze="center"] .sankofa-bird-head {
            transform: rotate(0deg);
            transition: rotate 0.45s ease-out, transform 0.45s ease-out;
          }
          /* Battery-saver: suppress tilt */
          .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-head {
            transform: none !important;
          }
        }

        /* ── P16.2: Egg pendulum physics ──────────────────────────────────────
           When the bird banks (data-turning fires at |bankDeg|≥8°), the egg
           swings slightly in the OPPOSITE direction — pendulum physics.
           Real pendulums overshoot; cubic-bezier(0.34,1.56,0.64,1) spring easing
           gives the 1-2px overshoot the Niakofa doc describes ("just a few pixels").
           Also fires during upcoming-turn anticipation (smaller amplitude, 2deg)
           so the egg begins moving before the full bank commitment.
           Composes with existing egg transform: (hover/beak compensation). */
        @supports (rotate: 0deg) {
          /* Actual committed bank: egg swings 3.5deg counter to turn direction */
          .sankofa-bird-rig[data-turning="left"] .sankofa-bird-egg {
            rotate: 3.5deg;
            transition: rotate 0.38s cubic-bezier(0.34, 1.56, 0.64, 1);
          }
          .sankofa-bird-rig[data-turning="right"] .sankofa-bird-egg {
            rotate: -3.5deg;
            transition: rotate 0.38s cubic-bezier(0.34, 1.56, 0.64, 1);
          }
          /* Anticipatory: upcoming-turn pre-swings egg 2deg before bank fires */
          .sankofa-bird-rig[data-turning="none"][data-upcoming-turn="left"] .sankofa-bird-egg {
            rotate: 2.0deg;
            transition: rotate 0.55s ease-out;
          }
          .sankofa-bird-rig[data-turning="none"][data-upcoming-turn="right"] .sankofa-bird-egg {
            rotate: -2.0deg;
            transition: rotate 0.55s ease-out;
          }
          /* Neutral: egg returns to upright (gravity wins) */
          .sankofa-bird-rig[data-turning="none"]:not([data-upcoming-turn="left"]):not([data-upcoming-turn="right"]) .sankofa-bird-egg {
            rotate: 0deg;
            transition: rotate 0.60s cubic-bezier(0.34, 1.2, 0.64, 1);
          }
          .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-egg {
            rotate: 0deg !important;
            transition: none !important;
          }
        }

        /* ── P16.3: WAIR wing flutter (Wing-Assisted Incline Running) ─────────
           When the bird is walking (data-speed="walking" or "running") but NOT
           flying, give the wings a subtle periodic flutter — like the bird is
           considering taking off or compensating for uneven ground.
           Uses a short flutter keyframe at a slow rhythm (1.8s period).
           This fires from the idle-scan state when speed is low but nonzero,
           or when the app has walking-speed movement without active navigation.
           Only at mid+ zoom where wing shape is visible. */
        @keyframes sankofa-wair-flutter {
          0%,  100% { transform: translateY(0px)   rotate(0deg);   }
          18%        { transform: translateY(-1.2px) rotate(-2deg);  }
          36%        { transform: translateY(0px)   rotate(0.5deg); }
          55%        { transform: translateY(-0.6px) rotate(-1deg);  }
          72%        { transform: translateY(0px)   rotate(0.3deg); }
        }
        @keyframes sankofa-wair-flutter-right {
          0%,  100% { transform: translateY(0px)   rotate(0deg);   }
          20%        { transform: translateY(-1.0px) rotate(2deg);   }
          38%        { transform: translateY(0px)   rotate(-0.5deg);}
          57%        { transform: translateY(-0.5px) rotate(1deg);   }
          74%        { transform: translateY(0px)   rotate(-0.3deg);}
        }
        .sankofa-bird-rig[data-speed="walking"]:not([data-flying="true"]):not([data-battery-saver="true"])[data-zoom="mid"] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-speed="walking"]:not([data-flying="true"]):not([data-battery-saver="true"])[data-zoom="high"] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-speed="walking"]:not([data-flying="true"]):not([data-battery-saver="true"])[data-zoom="street"] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-speed="running"]:not([data-flying="true"]):not([data-battery-saver="true"])[data-zoom="mid"] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-speed="running"]:not([data-flying="true"]):not([data-battery-saver="true"])[data-zoom="high"] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-speed="running"]:not([data-flying="true"]):not([data-battery-saver="true"])[data-zoom="street"] .sankofa-bird-wing-left {
          animation: sankofa-wair-flutter 1.8s ease-in-out infinite;
        }
        .sankofa-bird-rig[data-speed="walking"]:not([data-flying="true"]):not([data-battery-saver="true"])[data-zoom="mid"] .sankofa-bird-wing-right,
        .sankofa-bird-rig[data-speed="walking"]:not([data-flying="true"]):not([data-battery-saver="true"])[data-zoom="high"] .sankofa-bird-wing-right,
        .sankofa-bird-rig[data-speed="walking"]:not([data-flying="true"]):not([data-battery-saver="true"])[data-zoom="street"] .sankofa-bird-wing-right,
        .sankofa-bird-rig[data-speed="running"]:not([data-flying="true"]):not([data-battery-saver="true"])[data-zoom="mid"] .sankofa-bird-wing-right,
        .sankofa-bird-rig[data-speed="running"]:not([data-flying="true"]):not([data-battery-saver="true"])[data-zoom="high"] .sankofa-bird-wing-right,
        .sankofa-bird-rig[data-speed="running"]:not([data-flying="true"]):not([data-battery-saver="true"])[data-zoom="street"] .sankofa-bird-wing-right {
          animation: sankofa-wair-flutter-right 1.8s ease-in-out infinite;
          animation-delay: 18ms; /* maintain the same left/right asymmetry as flight */
        }

        /* ── P16.4: Performance hardening — iOS Safari + older Android Chrome ──
           Goal: smooth 60 FPS through a 20-min navigation session on iPhone 8.

           Strategy:
           1. CSS containment (contain: layout style) — tells browser the bird's
              layout is isolated; prevents map repaints from cascading into the
              bird's composite layer. @supports guarded (Chrome 52+, iOS 14+).

           2. will-change: transform gated to flying-only. Promoting every idle
              bird to a GPU layer wastes limited VRAM on older devices. Only
              promote when the transform is actively animated.

           3. transform: translateZ(0) on low zoom — at low detail (< 10) the
              bird is just a small silhouette. Promote it cheaply to its own
              layer; the full-detail bird is already promoted via will-change.

           4. overflow: hidden on the rig — prevents the SVG shadow/glow from
              triggering unnecessary paint rectangles outside the bird bounds.

           5. NavLod=2 (30 min+): aggressive suppression. Most decorative CSS
              animations are paused. Only core body/wing motion and gaze remain. */
        @supports (contain: layout style) {
          .sankofa-bird-rig {
            contain: layout style;
          }
        }
        /* Promote to composited GPU layer ONLY during active flight */
        .sankofa-bird-rig[data-flying="true"] {
          will-change: transform;
        }
        /* Release will-change when grounded (prevents stale layers eating VRAM) */
        .sankofa-bird-rig:not([data-flying="true"]) {
          will-change: auto;
        }
        /* Low-zoom: small silhouette — cheap layer promotion */
        .sankofa-bird-rig[data-zoom="low"] {
          transform: translateZ(0);
        }

        /* ── P16.5: NavLod=2 aggressive suppression (30 min+ sessions) ────────
           The existing navLod escalation (data-nav-lod attr) already dims
           decorative layers at LOD1 (10 min) and LOD2 (30 min+). P16.5 adds
           explicit animation-play-state:paused overrides for the heaviest
           effects to protect older iPhone GPU memory after long rides.
           Priority: 1. keep head/eye motion alive, 2. preserve wing beat,
           3. suppress particles + glow + shimmer + iridescence. */
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-glow-layer,
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-bird-body-shimmer,
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-wing-scap-l1,
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-wing-scap-l2,
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-wing-scap-r1,
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-wing-scap-r2,
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-crown-feather {
          animation-play-state: paused !important;
          opacity: 0 !important;
          transition: opacity 1.5s ease-out !important; /* graceful fade-out */
        }
        /* At navLod=2 also mute heavy filter operations */
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-bird-wing-left-highlight,
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-bird-wing-right-highlight,
        .sankofa-bird-rig[data-nav-lod="2"] .sankofa-bird-body-highlight {
          filter: none !important;
          opacity: 0.4 !important;
        }
        /* Battery-saver overrides navLod (already the strongest suppressor) */

        /* ── P16.6: Wind-compensation headwind posture ──────────────────────────
           Niakofa doc §8: "Strong headwind → Flaps harder → Neck lowers → Tail opens."
           GPS driving speed > 15 m/s (54 km/h) approximates headwind effects:
           neck drops 0.8px below neutral, tail spreads slightly.
           Composes with E7 bank rotation and P8.4 speed neck dart. */
        @supports (translate: 0px) {
          .sankofa-bird-rig[data-flying="true"][data-speed="driving"]:not([data-battery-saver="true"])[data-zoom="high"] .sankofa-bird-neck,
          .sankofa-bird-rig[data-flying="true"][data-speed="driving"]:not([data-battery-saver="true"])[data-zoom="street"] .sankofa-bird-neck {
            translate: calc(var(--speed-factor, 0) * -0.55px) calc(var(--speed-factor, 0) * 0.4px);
            transition: translate 0.65s ease-out;
          }
        }
        /* Tail opens slightly at driving speed (rudder-spread for stability) */
        @supports (rotate: 0deg) {
          .sankofa-bird-rig[data-flying="true"][data-speed="driving"]:not([data-battery-saver="true"]) .sankofa-tail-outer-left {
            rotate: calc(-1deg * var(--speed-factor, 0));
            transition: rotate 0.70s ease-out;
          }
          .sankofa-bird-rig[data-flying="true"][data-speed="driving"]:not([data-battery-saver="true"]) .sankofa-tail-outer-right {
            rotate: calc(1deg * var(--speed-factor, 0));
            transition: rotate 0.70s ease-out;
          }
        }

        /* ── P16: Battery-saver guard ─────────────────────────────────────────
           All P16 new animations + transforms suppressed in battery-saver mode. */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-right {
          animation-name: none !important; /* stops WAIR flutter */
        }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-egg {
          rotate: 0deg !important;
        }

        /* ── P16: Reduced-motion guard ────────────────────────────────────────
           All P16 motion suppressed when prefers-reduced-motion:reduce is set
           and data-bird-anim="enabled" has not explicitly overridden it. */
        @media (prefers-reduced-motion: reduce) {
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-head {
            transform: none !important;
          }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-egg {
            rotate: 0deg !important;
            transition: none !important;
          }
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-wing-left,
          html:not([data-bird-anim="enabled"]) .sankofa-bird-rig .sankofa-bird-wing-right {
            animation: none !important;
          }
        }

      `}</style>
    </div>
  );
}
