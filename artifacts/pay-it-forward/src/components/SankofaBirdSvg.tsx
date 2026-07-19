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
  getSpeedTier,
  type LandingPhase as LandingPhaseMath,
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
  const { isMoving, isGliding } = computeFlightMode(speedMs, navigating, landingPhase);

  // ── Flap rate: 1/sec idle → 5/sec driving → glide at airplane speed ────────
  const flapPeriodMs = useMemo(
    () => computeFlapPeriodMs({ isMoving, isGliding, speedMs, landingPhase }),
    [isMoving, isGliding, speedMs, landingPhase],
  );

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

  // ── Speed factor CSS var — drives flutter amplitude beyond the base flap ──
  // Walking: 0.0 → minimal turbulence. Driving: 0.8 → visible flutter.
  // Airplane: 1.0 → maximum trailing-edge blur. Used in CSS for feather
  // micro-movement that scales with wind pressure, not just flap timing.
  const speedFactor = Math.min(1, speedMs / 15);

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
              transition: "transform 0.35s ease-out, --lean-deg 0.45s ease-out, --tail-bend 0.40s ease-out, --left-wing-extra 0.40s ease-out, --right-wing-extra 0.40s ease-out",
              willChange: "transform",
              "--flap-period": `${flapPeriodMs}ms`,
              "--lean-deg": `${leanDeg}deg`,
              "--left-wing-extra": `${leftWingExtra}deg`,
              "--right-wing-extra": `${rightWingExtra}deg`,
              "--tail-bend": `${tailBendDeg}deg`,
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
          data-gliding={isGliding ? "true" : "false"}
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
        >
          <svg
            width={size}
            height={size}
            viewBox="0 0 40 40"
            overflow="visible"
            style={{ overflow: "visible" }}
            className="drop-shadow-[0_0_10px_rgba(0,212,255,0.9)] sankofa-bird-body"
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
            {/* Base tail shape */}
            <path
              className="sankofa-bird-tail"
              d="M20 24 C17 30 15 34 12 37 C16 35.5 19 34.5 20 33 C21 34.5 24 35.5 28 37 C25 34 23 30 20 24 Z"
              fill="hsl(190, 90%, 40%)"
              opacity={0.9}
            />
            {/* Tail primary feather tip — centre */}
            <path
              className="sankofa-bird-tail"
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
              {/* Upper beak (static) */}
              <path
                d="M5.3 13.4 L2.2 14.25 L5.45 14.2 Z"
                fill="#1a2733"
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
              </g>
            </g>

            {/* Legs — separate animated layer; subtle perch sway at rest,
                alternating step during flight, dangle during landing hover. */}
            <g className="sankofa-bird-legs">
              {/* Left leg */}
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

              {/* Right leg */}
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

        /* ── Base rig ─────────────────────────────────────────────────────── */
        .sankofa-bird-rig {
          position: relative;
          overflow: visible;
          transform-origin: 50% 62%;
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
           (set inline on the element) so the pupil moves in local SVG space. */
        .sankofa-bird-eye {
          animation: sankofa-eye-live 7s ease-in-out infinite;
        }

        /* Eye catchlight: secondary specular tracks the pupil's look direction.
           Offset from the primary glint — as the eye moves, this secondary
           highlight lags slightly creating a "depth" parallax on the cornea.
           Same 7s period, same blink timing, slightly different translateX range. */
        .sankofa-bird-eye-catchlight {
          animation: sankofa-eye-catchlight 7s ease-in-out infinite;
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
          animation: sankofa-eyelid 7s ease-in-out infinite;
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
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-right-btm { display: none !important; }
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
        .sankofa-bird-rig[data-zoom="low"] .sankofa-wing-scap { display: none !important; }

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
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-tail-far-right { display: none !important; }

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
          animation: sankofa-iris-track 7s ease-in-out infinite;
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

        /* ── Idle head-bob / weight-shift ───────────────────────────────────── */
        /* Doc: "When idle, the bird does subtle head bobs and weight shifts —
           the micro-behaviours that make it feel alive rather than frozen."
           Only triggers when data-landing="idle" AND data-flying="false".
           The weight-shift uses a very gentle body sway (±1px) timed to the
           head-bob so they feel coordinated, not independent. */
        .sankofa-bird-rig[data-landing="idle"][data-flying="false"] .sankofa-bird-head {
          animation: sankofa-idle-head-bob 4.2s ease-in-out infinite;
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

        /* ── Idle head wander ────────────────────────────────────────────── */
        /* Doc sequence: "Idle: Blink → Look Left → Look Forward → Tiny Head Tilt"
           The eye (sankofa-eye-live) owns the 7s cycle. The head wander matches
           the same 7s period so the tilt lands precisely after the "look right"
           phase ends (~90%) — completing the full observed sequence.
           A gentle ±2° range so it reads as curiosity, not a notification. */
        .sankofa-bird-rig[data-landing="idle"][data-flying="false"] .sankofa-bird-head {
          animation: sankofa-head-idle-wander 7s ease-in-out infinite;
          transform-origin: 12px 16px;
          transform-box: view-box;
        }
        @keyframes sankofa-head-idle-wander {
          /* Forward gaze at rest */
          0%,  32%  { transform: rotate(0deg)   translateY(0px);   }
          /* Head tilts slightly as bird glances left (syncs with eye look-left) */
          50%, 64%  { transform: rotate(-1.5deg) translateY(-0.5px); }
          /* Returns forward after second blink */
          74%       { transform: rotate(0deg)   translateY(0px);   }
          /* Tiny curious tilt right — doc "Tiny Head Tilt" moment, after look-right */
          88%       { transform: rotate(2deg)   translateY(0.3px); }
          100%      { transform: rotate(0deg)   translateY(0px);   }
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
        .sankofa-bird-rig[data-celebrating="true"] .sankofa-bird-body {
          filter: drop-shadow(0 0 8px rgba(0, 212, 255, 1));
          animation: sankofa-shimmer 0.8s ease-in-out infinite;
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
           complements the particle burst (which lives in the SVG as circles). */
        .sankofa-bird-rig[data-celebrating="true"] .sankofa-bird-body {
          filter: drop-shadow(0 0 6px rgba(0, 212, 255, 0.55))
                  drop-shadow(0 0 14px rgba(0, 212, 255, 0.25));
          transition: filter 0.3s ease-out;
        }
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
          animation: sankofa-iris-alert 1.4s ease-out !important;
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

        /* ══ Notification eyes widen ════════════════════════════════════════
           Doc: "Notification: Eyes widen → Looks upward → Small chirp"
           The eye pupil scale already enlarges via sankofa-iris-alert.
           Add a complementary iris ring scale — the whole eye visually "opens"
           wider, then the iris alert animation fires after 150ms. */
        .sankofa-bird-rig[data-notification="true"] .sankofa-bird-iris {
          animation: sankofa-iris-alert 1.8s ease-out 2 !important;
        }

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
          animation: sankofa-body-feather-shimmer 4.6s ease-in-out infinite;
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-body-feather-2 ,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-body-feather-2 {
          opacity: 0.22;
          animation: sankofa-body-feather-shimmer 4.6s ease-in-out infinite;
          animation-delay: 1.6s;
        }
        .sankofa-bird-rig[data-zoom="high"] .sankofa-body-feather-3 ,
        .sankofa-bird-rig[data-zoom="street"] .sankofa-body-feather-3 {
          opacity: 0.18;
          animation: sankofa-body-feather-shimmer 4.6s ease-in-out infinite;
          animation-delay: 3.2s;
        }
        @keyframes sankofa-body-feather-shimmer {
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
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-back { display: none !important; }
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
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-belly { display: none !important; }
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
          animation: sankofa-body-feather-shimmer 3.8s ease-in-out infinite;
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
          animation: sankofa-body-feather-shimmer 2.8s ease-in-out infinite;
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

        /* LOD3: hide all non-essential detail elements */
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
          display: none !important;
        }

        /* LOD3: suppress all animations on visible parts — just float */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-tail,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-neck,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-head,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-eye,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-beak-lower {
          animation: none !important;
          filter: none !important;
          transition: none !important;
        }
        /* LOD3: wings still flap (at idle rate) so the bird looks alive, but
           no differential banking or feather physics */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-left {
          animation: sankofa-flap 1400ms ease-in-out infinite !important;
          filter: none !important;
        }
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-right {
          animation: sankofa-flap-right 1418ms ease-in-out infinite !important;
          filter: none !important;
        }
        /* LOD3: body just floats, no lean/glide effects */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-body,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-chest {
          animation: sankofa-float 1400ms ease-in-out infinite !important;
          filter: none !important;
          transform: none !important;
          transition: none !important;
        }
        /* LOD3: egg still shows but without glow/orbit */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-egg {
          animation: none !important;
          filter: none !important;
        }
        /* LOD3: suppress trail and all particles */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-trail,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-particle,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-golden-sparkle {
          display: none !important;
        }
        /* LOD3: no iridescence on wing bodies */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-left,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-bird-wing-right {
          filter: none !important;
          transition: none !important;
        }

        /* ══ Reduced motion ════════════════════════════════════════════════ */
        @media (prefers-reduced-motion: reduce) {
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
          /* Suppress idle stretch animation */
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

        /* ══════════════════════════════════════════════════════════════════
           GAP-CLOSE ENHANCEMENTS — July 2026
           All remaining audit gaps addressed here:
           1. Upcoming-turn body lean + wing pre-extension
           2. Helping state at low-zoom body glow
           3. Speed-correlated crown sway
           4. Gliding thermal lift on body
           5. Eye iris micro-saccades on notification
           6. Per-feather ambient micro-oscillations (street zoom, idle)
           7. Pre-bank leading-edge feather compression
           8. Shadow gold tint when helping
           ══════════════════════════════════════════════════════════════════ */

        /* ── 1. Upcoming-turn body lean + wing pre-extension ─────────────────
           Design doc gap: only head was anticipating turns. Now the body leans
           slightly into the turn and the OUTSIDE wing pre-extends — exactly the
           "wing pre-extension missing" gap from the audit.
           Outside wing when turning left = RIGHT wing; turning right = LEFT wing.
           Body uses a gentle 2° lean so it reads as anticipatory without
           conflicting with the bank rotation. Wing extension is a subtle scaleX
           stretch on the outside wing — the leading edge "unfurls" before the
           instruction fires. */
        .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="left"] .sankofa-bird-body {
          animation: sankofa-anticipate-body-left 2.2s ease-in-out infinite !important;
          transform-box: view-box;
          transform-origin: 20px 20px;
        }
        .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="right"] .sankofa-bird-body {
          animation: sankofa-anticipate-body-right 2.2s ease-in-out infinite !important;
          transform-box: view-box;
          transform-origin: 20px 20px;
        }
        /* Outside wing pre-extension: right wing leads when turning left */
        .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="left"] .sankofa-bird-wing-right {
          animation: sankofa-anticipate-wing-extend 2.2s ease-in-out infinite !important;
          transform-box: view-box;
          transform-origin: 20px 17px;
        }
        /* Outside wing pre-extension: left wing leads when turning right */
        .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="right"] .sankofa-bird-wing-left {
          animation: sankofa-anticipate-wing-extend 2.2s ease-in-out infinite !important;
          transform-box: view-box;
          transform-origin: 20px 17px;
        }
        @keyframes sankofa-anticipate-body-left {
          0%,100% { transform: rotate(0deg) translateX(0px); }
          35%     { transform: rotate(-2deg) translateX(-0.5px); }
          65%     { transform: rotate(-1.2deg) translateX(-0.3px); }
        }
        @keyframes sankofa-anticipate-body-right {
          0%,100% { transform: rotate(0deg) translateX(0px); }
          35%     { transform: rotate(2deg) translateX(0.5px); }
          65%     { transform: rotate(1.2deg) translateX(0.3px); }
        }
        @keyframes sankofa-anticipate-wing-extend {
          /* Outside wing unfurls: extends 8% beyond normal span, then settles */
          0%,100% { transform: scaleX(1.0);  opacity: 1.0; }
          30%     { transform: scaleX(1.08); opacity: 1.0; }
          55%     { transform: scaleX(1.05); opacity: 0.95; }
        }

        /* ── 2. Helping state at low-zoom body glow ───────────────────────────
           At low zoom (< 10), wings/highlights are hidden so no gold wing
           shimmer is visible. Add a subtle body-level filter so the helping
           state still reads at city/country scale. */
        .sankofa-bird-rig[data-helping="true"][data-zoom="low"] .sankofa-bird-body {
          filter: drop-shadow(0 0 3px rgba(255,165,0,0.45)) drop-shadow(0 0 6px rgba(255,120,0,0.2)) !important;
          animation: sankofa-helping-low-zoom-pulse 2.4s ease-in-out infinite !important;
        }
        @keyframes sankofa-helping-low-zoom-pulse {
          0%,100% { filter: drop-shadow(0 0 3px rgba(255,165,0,0.35)) drop-shadow(0 0 6px rgba(255,120,0,0.15)); }
          50%     { filter: drop-shadow(0 0 5px rgba(255,180,0,0.6))  drop-shadow(0 0 10px rgba(255,140,0,0.3)); }
        }

        /* ── 3. Speed-correlated crown sway ──────────────────────────────────
           Audit gap: crown sway animation was fixed-speed regardless of GPS
           velocity. At walking: gentle 3.5s droop. At running: 2s medium sway.
           At driving: 1.1s rapid sway (wind effect). At airplane: rapid
           streamline compression — feathers press flat against the head. */
        .sankofa-bird-rig[data-flying="true"][data-speed="walking"] .sankofa-crown-feather {
          animation-duration: 3.5s !important;
          animation-timing-function: ease-in-out !important;
        }
        .sankofa-bird-rig[data-flying="true"][data-speed="running"] .sankofa-crown-feather {
          animation-duration: 2.0s !important;
          animation-timing-function: ease-in-out !important;
        }
        .sankofa-bird-rig[data-flying="true"][data-speed="driving"] .sankofa-crown-feather {
          animation: sankofa-crown-speed-sway 1.1s ease-in-out infinite !important;
        }
        .sankofa-bird-rig[data-flying="true"][data-speed="airplane"] .sankofa-crown-feather {
          /* Streamline: crown feathers press flat against the skull */
          animation: sankofa-crown-streamline 0.5s ease-in-out infinite !important;
        }
        @keyframes sankofa-crown-speed-sway {
          0%,100% { transform: rotate(0deg)   translateY(0px);   }
          25%     { transform: rotate(-8deg)  translateY(-0.5px); }
          75%     { transform: rotate(6deg)   translateY(-0.3px); }
        }
        @keyframes sankofa-crown-streamline {
          /* Feathers flatten toward the skull at extreme velocity */
          0%,100% { transform: rotate(-15deg) scaleY(0.7) translateY(0.5px); }
          50%     { transform: rotate(-18deg) scaleY(0.65) translateY(0.7px); }
        }

        /* ── 4. Gliding thermal lift — body oscillation at airplane speed ────
           Audit gap: glide-wing animation existed but body thermal lift was
           not connected. At airplane/glide speed the body shows a lazy
           thermal-ride swell: a slow 4s vertical + pitch oscillation that
           mimics soaring on an updraft. Distinct from the normal flight lean. */
        .sankofa-bird-rig[data-speed="airplane"][data-flying="true"] .sankofa-bird-body {
          animation: sankofa-glide-thermal-body 4.0s ease-in-out infinite !important;
          transform-box: view-box;
          transform-origin: 20px 20px;
        }
        @keyframes sankofa-glide-thermal-body {
          0%,100% { transform: translateY(0px)    rotate(var(--lean-deg, 0deg)); }
          28%     { transform: translateY(-1.8px) rotate(calc(var(--lean-deg, 0deg) + 0.8deg)); }
          58%     { transform: translateY(0.6px)  rotate(calc(var(--lean-deg, 0deg) - 0.4deg)); }
          82%     { transform: translateY(-0.8px) rotate(calc(var(--lean-deg, 0deg) + 0.3deg)); }
        }

        /* ── 5. Eye iris micro-saccades on notification ───────────────────────
           Audit gap: notification triggered head tilt + wing flick + eye alert
           but the IRIS itself did not move. Adding rapid upward-then-scan
           micro-saccades: iris snaps up (alert), darts right (scan), returns.
           3 repetitions matching the head-tilt iteration count. */
        .sankofa-bird-rig[data-notification="true"] .sankofa-bird-iris {
          animation: sankofa-iris-saccade 0.6s ease-in-out 3 !important;
          transform-box: view-box;
          transform-origin: center center;
        }
        @keyframes sankofa-iris-saccade {
          0%      { transform: translate(0px,  0px);   }
          18%     { transform: translate(0px,  -0.4px); } /* snap up: alert */
          38%     { transform: translate(0.3px,-0.2px); } /* dart right: scan */
          58%     { transform: translate(-0.2px,-0.3px); } /* dart left: re-scan */
          80%     { transform: translate(0px,  -0.15px); } /* settle up */
          100%    { transform: translate(0px,  0px);   } /* return */
        }

        /* ── 6. Per-feather ambient micro-oscillations (street zoom, idle) ───
           Audit gap: cascade delays only applied to the main flap keyframe.
           At street zoom with the bird idle, each primary feather should
           show a very-slow independent opacity + slight-scale micro-oscillation
           (akin to the feather tips responding to micro-air-currents).
           Using opacity rather than transform to avoid conflicting with
           the existing cascade delay transforms. Each feather gets a unique
           animation-delay creating a living, breathing wing surface. */
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-l5,
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-r5 {
          animation: sankofa-feather-micro 4.2s ease-in-out infinite;
          animation-delay: 0.0s;
        }
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-l0,
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-r0 {
          animation: sankofa-feather-micro 4.8s ease-in-out infinite;
          animation-delay: 0.6s;
        }
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-l1,
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-r1 {
          animation: sankofa-feather-micro 5.1s ease-in-out infinite;
          animation-delay: 1.1s;
        }
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-l2,
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-r2 {
          animation: sankofa-feather-micro 4.6s ease-in-out infinite;
          animation-delay: 1.7s;
        }
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-l3,
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-r3 {
          animation: sankofa-feather-micro 5.4s ease-in-out infinite;
          animation-delay: 0.4s;
        }
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-l4,
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-r4 {
          animation: sankofa-feather-micro 4.4s ease-in-out infinite;
          animation-delay: 2.1s;
        }
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-ls1,
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-rs1 {
          animation: sankofa-feather-micro 5.8s ease-in-out infinite;
          animation-delay: 0.9s;
        }
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-ls2,
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-rs2 {
          animation: sankofa-feather-micro 6.2s ease-in-out infinite;
          animation-delay: 1.4s;
        }
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-ls3,
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-rs3 {
          animation: sankofa-feather-micro 5.6s ease-in-out infinite;
          animation-delay: 2.5s;
        }
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-lc1,
        .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-rc1 {
          animation: sankofa-feather-micro 6.6s ease-in-out infinite;
          animation-delay: 1.8s;
        }
        @keyframes sankofa-feather-micro {
          /* Subtle opacity breathe — simulates micro-air-current agitation.
             Never fully transparent; range is narrow so it reads as life not flicker. */
          0%,100% { opacity: var(--feather-base-opacity, 0.8); }
          40%     { opacity: calc(var(--feather-base-opacity, 0.8) * 0.82); }
          70%     { opacity: calc(var(--feather-base-opacity, 0.8) * 0.92); }
        }
        /* Battery saver: suppress micro-oscillations */
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-l5,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-l0,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-l1,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-l2,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-l3,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-l4,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-ls1,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-ls2,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-ls3,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-lc1,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-r5,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-r0,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-r1,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-r2,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-r3,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-r4,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-rs1,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-rs2,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-rs3,
        .sankofa-bird-rig[data-battery-saver="true"] .sankofa-feather-rc1 {
          animation: none !important;
        }

        /* ── 7. Pre-bank leading-edge feather compression ─────────────────────
           Audit gap: when banking begins, the outside leading-edge feathers
           should COMPRESS first (press against each other) before extending.
           This mirrors real bird aerodynamics: the outer primaries briefly
           slot closer under aerodynamic load before spreading.
           Using the upcoming-turn signal as the pre-bank proxy:
           turning left → right wing (outside) primaries compress;
           turning right → left wing primaries compress.
           The compression is a scaleX squeeze on the feather group. */
        .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="left"] .sankofa-bird-wing-right-feathers {
          animation: sankofa-prebank-compress 2.2s ease-in-out infinite !important;
          transform-box: view-box;
          transform-origin: 25px 12px;
        }
        .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="right"] .sankofa-bird-wing-left-feathers {
          animation: sankofa-prebank-compress 2.2s ease-in-out infinite !important;
          transform-box: view-box;
          transform-origin: 15px 12px;
        }
        @keyframes sankofa-prebank-compress {
          /* Phase 1 (0–20%): leading-edge feathers slot together under load */
          /* Phase 2 (20–50%): feathers fan back out as wing extends */
          /* Phase 3 (50–100%): settle to normal position */
          0%,100% { transform: scaleX(1.0)  scaleY(1.0); }
          15%     { transform: scaleX(0.88) scaleY(1.05); } /* slot/compress */
          35%     { transform: scaleX(1.06) scaleY(0.97); } /* extend */
          60%     { transform: scaleX(1.02) scaleY(1.0);  } /* settle */
        }

        /* ── 8. Shadow state coloring — gold when helping ─────────────────────
           Audit gap: shadow turned teal on celebrating (already done) but
           had no color change during helping. Adding a warm amber-gold pulse
           on the ground shadow when isHelping=true — subtle radial warmth
           as if the bird is casting warm light downward.
           Selector specificity: [data-helping][data-celebrating="false"]
           ensures celebrating's teal shadow wins when both are active. */
        .sankofa-bird-rig[data-helping="true"][data-celebrating="false"] .sankofa-bird-shadow {
          animation: sankofa-shadow-helping-gold 2.8s ease-in-out infinite !important;
        }
        @keyframes sankofa-shadow-helping-gold {
          0%,100% { transform: scaleX(1.0);  opacity: 0.12; filter: none; }
          50%     { transform: scaleX(1.06); opacity: 0.20; filter: sepia(0.5) saturate(1.4) hue-rotate(-15deg) brightness(1.1); }
        }

        /* ── Reduced-motion: suppress all new gap-close animations ─────────── */
        @media (prefers-reduced-motion: reduce) {
          .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="left"] .sankofa-bird-body,
          .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="right"] .sankofa-bird-body {
            animation: none !important;
          }
          .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="left"] .sankofa-bird-wing-right,
          .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="right"] .sankofa-bird-wing-left,
          .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="left"] .sankofa-bird-wing-right-feathers,
          .sankofa-bird-rig[data-flying="true"][data-upcoming-turn="right"] .sankofa-bird-wing-left-feathers {
            animation: none !important;
          }
          .sankofa-bird-rig[data-helping="true"][data-zoom="low"] .sankofa-bird-body {
            animation: none !important;
            filter: drop-shadow(0 0 3px rgba(255,165,0,0.3)) !important;
          }
          .sankofa-bird-rig[data-flying="true"] .sankofa-crown-feather {
            animation-duration: 2.0s !important;
          }
          .sankofa-bird-rig[data-speed="airplane"][data-flying="true"] .sankofa-bird-body {
            animation: none !important;
          }
          .sankofa-bird-rig[data-notification="true"] .sankofa-bird-iris {
            animation: none !important;
          }
          .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-l5,
          .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-l0,
          .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-l1,
          .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-l2,
          .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-l3,
          .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-l4,
          .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-ls1,
          .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-ls2,
          .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-ls3,
          .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-lc1,
          .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-r5,
          .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-r0,
          .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-r1,
          .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-r2,
          .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-r3,
          .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-r4,
          .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-rs1,
          .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-rs2,
          .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-rs3,
          .sankofa-bird-rig[data-zoom="street"][data-landing="idle"] .sankofa-feather-rc1 {
            animation: none !important;
          }
          .sankofa-bird-rig[data-helping="true"][data-celebrating="false"] .sankofa-bird-shadow {
            animation: none !important;
          }
        }

        /* ── @property for new CSS vars ──────────────────────────────────────
           Any new var used in a keyframe calc() must be declared as @property
           so Safari 15.4 can interpolate it. The cinematic additions above use
           only already-declared vars (--heading-deg, --flap-period, --lean-deg)
           so no new @property declarations are needed. This comment documents
           the check so future authors know it was intentional, not an oversight. */
      `}</style>
    </div>
  );
}
