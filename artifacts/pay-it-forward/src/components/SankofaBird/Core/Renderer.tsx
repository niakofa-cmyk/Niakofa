/**
 * SankofaBird/Core/Renderer.tsx
 *
 * Pure display component — reads BirdContextValue via useBird() and
 * renders the full SVG + DOM layer structure.
 *
 * No hooks beyond useBird() — all animation state comes from context.
 * This keeps the renderer stateless and easily testable.
 *
 * ── 360° multi-view system ────────────────────────────────────────────────
 * Three sprites sit absolutely inside the rig div:
 *   • FrontView — bird heading north (coming toward viewer)
 *   • SideView  — bird heading east / west (existing side-profile anatomy)
 *   • BackView  — bird heading south (flying away from viewer)
 *
 * Their opacities are set by computeViewOpacities() in Bird.tsx and passed
 * through BirdContextValue as frontOpacity / sideOpacity / backOpacity.
 * CSS transition: 0.28s ease (suppressed in battery-saver mode).
 *
 * The scaleX flip on .sankofa-bird-heading-wrapper applies ONLY to the
 * SideView SVG — FrontView and BackView are symmetric.
 */

import React from "react";
import { useBird } from "./Context";
import { sankofaBirdCss }               from "../Effects/Animations";
import { computeBackDiagonalPoseTransform } from "../Navigation/ViewSelector";

// ── Effect imports ────────────────────────────────────────────────────────────
import { Gradients }      from "../Effects/Gradients";
import { Shadow }         from "../Effects/Shadow";
import { GroundRings }    from "../Effects/GroundRings";
import { Particles }      from "../Effects/Particles";
import { MissionRings }   from "../Effects/MissionRings";
import { ChirpArcs }      from "../Effects/ChirpArcs";
import { ParticleTrail }  from "../Effects/ParticleTrail";
import { DustMotes }      from "../Effects/DustMotes";
import { AdinkraOverlay } from "../Effects/AdinkraOverlay";

// ── Anatomy imports (side-profile — layer order matches Skeleton/LayerOrder.ts) ─
import { Tail }           from "../Anatomy/Tail";
import { RightWing }      from "../Flight/Wings";
import { LeftWing }       from "../Flight/Wings";
import { WingJoints }     from "../Flight/Wings";
import { Scapulars }      from "../Flight/Wings";
import { ShoulderFeathers, WingtipFeathers } from "../Flight/Wings";
import { Body }           from "../Anatomy/Body";
import { Neck, HeadSphere, Crest, Eye, Beak, ChirpRings, Egg } from "../Anatomy/Head";
import { Legs }           from "../Anatomy/Legs";

// ── 360° sprite views ────────────────────────────────────────────────────────
import { FrontView } from "../Anatomy/FrontView";
import { BackView }  from "../Anatomy/BackView";

import { getSpeedTier } from "@/lib/sankofa-bird-math";

interface RendererProps {
  /** Lighting factor 0–1 (sun from NW). */
  lightingFactor: number;
  /** External navLod override from caller. */
  navLodOverride?: number;
}

export function Renderer({
  lightingFactor,
  navLodOverride,
}: RendererProps): React.ReactElement {
  const {
    size, celebrating, newNotification, accepted, donated, nearbyUser,
    isHelping, batterySaver, navigating, approaching,
    wairMode, soaring, matingDisplay, missionComplete, chirp,
    communityMilestone, weather,
    upcomingTurnDirection, speedMs, mapZoom,
    bankDeg: _bankDeg, effectiveBankDeg, landingPhase, zoomTier,
    isMoving, isGliding: _isGliding, isVisuallyGliding,
    flapPeriodMs, leanDeg, leftWingExtra, rightWingExtra,
    tailBendDeg, headLeadDeg, speedFactor,
    navLod, isOffScreen, saccadePhase: _saccadePhase, saccadeSnapping,
    wingPose, tailPose,
    activityTier, blinkPeriodMs, effectiveSkyTier, trustTier, aeroMode,
    gazeDir, turnDir,
    turnIntensity, neckCurveDeg, bodyTwistDeg,
    verticalGazeDeg, insideWingTuck, p17Active,
    facingRight, facingSign, gazeRotateDeg, headingQuadrant,
    screenRotationDeg, hasHeading,
    // 360° view
    viewAngle, frontOpacity, sideOpacity, backOpacity,
    diagonalPose,
    rigRef,
  } = useBird();

  // Shared sprite transition — disabled in battery-saver for zero GPU waste.
  const spriteTransition = batterySaver
    ? "none"
    : "opacity 0.28s ease";

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
      {/* Ground-presence rings */}
      <GroundRings />

      {/* DOM-layer celebration + donation particles + heart ring */}
      <Particles />

      {/* Phase 14: Mission-complete ripple rings */}
      <MissionRings />

      {/* Phase 14: Chirp arc rings */}
      <ChirpArcs />

      {/* ── Bird container — body stays UPRIGHT at all times ──────────────── */}
      <div
        className="absolute sankofa-bird-container"
        style={{ width: size, height: size }}
      >
        {/* Trail wrapper — rotates with heading so particles appear behind travel
            direction. The bird rig inside is NOT in this wrapper, so the body
            never rotates. */}
        {(isMoving || landingPhase === "slowflap" || landingPhase === "dive" || landingPhase === "takeoff") && (
          <div
            className="absolute inset-0 pointer-events-none sankofa-bird-trail-wrapper"
            style={{
              transform: `rotate(${screenRotationDeg}deg)`,
              transformOrigin: "center center",
              willChange: "transform",
              transition: speedMs > 50
                ? "transform 0.58s cubic-bezier(0.25, 0.46, 0.45, 0.94)"
                : "transform 0.40s cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
          >
            <ParticleTrail />
          </div>
        )}

        {/* ── Body-bank rig — banks ±25° on turns, never full rotation ─────
            position: relative — needed so the three sprite divs (position:
            absolute; inset: 0) size correctly to the rig's dimensions.
            SME Layer 5: useAnimationMixer writes --mixer-* CSS vars directly
            onto this element via the rigRef rAF loop. The transform here reads
            --mixer-bank-deg (spring-smoothed) with --bank-angle as fallback so
            first-render is correct before the rAF loop fires. CSS transitions
            for mixer-owned channels are removed; the spring handles easing.  */}
        <div
          ref={rigRef}
          className="sankofa-bird-rig"
          style={
            {
              position: "relative",
              width: size,
              height: size,
              // Use spring-smoothed bank from the mixer; fallback to direct value
              // on first render (before rAF fires) and in battery-saver mode.
              transform: batterySaver
                ? `translateZ(0) rotate(${effectiveBankDeg}deg)`
                : "translateZ(0) rotate(var(--mixer-bank-deg, 0deg))",
              // Only transition the transform in battery-saver mode — the mixer
              // owns smoothing in normal mode. Keep non-mixer CSS var transitions.
              transition: batterySaver
                ? "transform 0.35s ease-out"
                : "none",
              willChange: "transform",
              // ── Raw target values (written every render as fallback) ──────
              // The mixer reads these as targets and overwrites --mixer-* vars.
              "--flap-period":       `${flapPeriodMs}ms`,
              "--lean-deg":          batterySaver ? `${leanDeg}deg` : "var(--mixer-lean-deg, 0deg)",
              "--left-wing-extra":   batterySaver ? `${leftWingExtra}deg` : "var(--mixer-left-wing-extra, 0deg)",
              "--right-wing-extra":  batterySaver ? `${rightWingExtra}deg` : "var(--mixer-right-wing-extra, 0deg)",
              "--tail-bend":         batterySaver ? `${tailBendDeg}deg` : "var(--mixer-tail-bend-deg, 0deg)",
              "--bank-angle":        `${effectiveBankDeg}deg`, // kept as raw target for CSS that doesn't use mixer
              "--head-lead-deg":     batterySaver ? `${headLeadDeg * facingSign}deg` : "var(--mixer-head-lead-deg, 0deg)",
              "--heading-deg":       `${screenRotationDeg}deg`,
              "--speed-factor":      `${speedFactor}`,
              "--blink-period":      `${blinkPeriodMs}ms`,
              "--lighting-factor":   `${lightingFactor}`,
              "--neck-curve-deg":    p17Active
                ? (batterySaver ? `${neckCurveDeg * facingSign}deg` : "var(--mixer-neck-curve-deg, 0deg)")
                : "0deg",
              "--body-twist-deg":    p17Active
                ? (batterySaver ? `${bodyTwistDeg}deg` : "var(--mixer-body-twist-deg, 0deg)")
                : "0deg",
              "--vertical-gaze-deg": p17Active
                ? (batterySaver ? `${verticalGazeDeg}deg` : "var(--mixer-vertical-gaze-deg, 0deg)")
                : "0deg",
              "--turn-intensity":    p17Active ? `${turnIntensity}` : "0",
              "--inside-wing-tuck":  p17Active
                ? (batterySaver ? `${insideWingTuck}` : "var(--mixer-inside-wing-tuck, 0)")
                : "0",
              "--gaze-rotate-deg":   p17Active ? `${gazeRotateDeg}deg` : "0deg",
              // Diagonal pose intensity (0–1) for CSS to read if needed
              "--diagonal-pose-intensity":      `${diagonalPose.intensity}`,
              "--diagonal-inside-wing-opacity": `${diagonalPose.insideWingOpacity}`,
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
          data-hard-bank={Math.abs(effectiveBankDeg) > 20 ? "true" : "false"}
          data-bank-dir={effectiveBankDeg > 8 ? "right" : effectiveBankDeg < -8 ? "left" : "none"}
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
          data-gaze={gazeDir ?? "forward"}
          data-gaze-snap={saccadeSnapping ? "true" : "false"}
          data-wair={wairMode ? "true" : "false"}
          data-soaring={soaring ? "true" : "false"}
          data-mating={matingDisplay ? "true" : "false"}
          data-aero-mode={aeroMode}
          data-chirp={chirp ? "true" : "false"}
          data-mission-complete={missionComplete ? "true" : "false"}
          data-community-milestone={communityMilestone ? "true" : "false"}
          data-trust-tier={trustTier}
          data-weather={weather ?? "clear"}
          data-turn-dir={turnDir}
          data-facing={facingRight ? "right" : "left"}
          data-heading-quadrant={headingQuadrant}
          data-view-angle={viewAngle}
          data-wing-pose={wingPose}
          data-tail-pose={tailPose}
        >
          {/* ══════════════════════════════════════════════════════════════════
              FRONT sprite — bird heading north (facing the viewer).
              FrontView renders wings spread L/R, chest, Sankofa backward-head,
              egg in beak. Fades in as heading approaches N (screenRotationDeg≈0).
          ══════════════════════════════════════════════════════════════════ */}
          <div
            className="sankofa-view-sprite"
            style={{
              position: "absolute",
              inset: 0,
              opacity: frontOpacity,
              transition: spriteTransition,
              pointerEvents: "none",
              willChange: frontOpacity > 0 && frontOpacity < 1 ? "opacity" : "auto",
            }}
          >
            <FrontView />
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              SIDE sprite — existing full-detail side-profile anatomy.
              Active for E/W headings; cross-fades with front/back views for
              NE/SE/NW/SW diagonal headings.
              The scaleX flip on .sankofa-bird-heading-wrapper faces the bird
              toward its direction of travel (right for E half, left for W half).
          ══════════════════════════════════════════════════════════════════ */}
          <div
            className="sankofa-view-sprite"
            style={{
              position: "absolute",
              inset: 0,
              opacity: sideOpacity,
              transition: spriteTransition,
              pointerEvents: "none",
              willChange: sideOpacity > 0 && sideOpacity < 1 ? "opacity" : "auto",
            }}
          >
            <svg
              width={size}
              height={size}
              viewBox="0 0 40 40"
              overflow="visible"
              style={{ overflow: "visible" }}
              className="drop-shadow-[0_0_10px_rgba(0,212,255,0.9)] sankofa-bird-body sankofa-svg-root"
            >
              {/* Gradient defs — unique IDs per instance */}
              <Gradients />

              {/* Ground shadow stays OUTSIDE the heading-rotation group so it
                  remains screen-aligned (shadow always appears at the visual bottom
                  of the SVG, regardless of flight direction). */}
              <Shadow />

              {/* ── Heading direction wrapper — body stays UPRIGHT at all times ──
                  scaleX flip: east-half headings → face right, west-half → face left.
                  At diagonal headings (NE/SE/SW/NW) a 2.5D perspective skew matrix
                  from Skeleton/Poses.ts (LEFT_45/RIGHT_45) is blended in via
                  diagonalPose.perspectiveMatrix, giving genuine 3/4-view depth
                  instead of a plain linear opacity cross-fade.
                  Snap instantly in battery-saver / navLod ≥ 2; ease otherwise.
                  The facing scaleX and the diagonal pose matrix are composed:
                  facing first, then pose skew applied on top. */}
              <g
                className="sankofa-bird-heading-wrapper"
                style={(() => {
                  const facingTransform = facingRight ? "scaleX(-1)" : "scaleX(1)";
                  // Compose: facing flip × diagonal perspective skew
                  const poseMatrix = diagonalPose.perspectiveMatrix;
                  const finalTransform = poseMatrix
                    ? `${facingTransform} ${poseMatrix}`
                    : facingTransform;
                  return {
                    transform: finalTransform,
                    transformOrigin: "20px 20px",
                    transformBox: "view-box",
                    transition: (batterySaver || (navLodOverride ?? navLod) >= 2)
                      ? "none"
                      : "transform 0.38s cubic-bezier(0.45, 0, 0.55, 1)",
                    willChange: "transform",
                  } as React.CSSProperties;
                })()}
              >
                <Tail />
                <RightWing />
                <LeftWing />
                <WingtipFeathers />
                <WingJoints />
                <Scapulars />
                <ShoulderFeathers />
                <Body />
                <g className="sankofa-bird-head">
                  <Neck />
                  <HeadSphere />
                  <Crest />
                  <Eye />
                  <Beak />
                  <ChirpRings />
                  <Egg />
                </g>
                <Legs />
                <DustMotes />
                <AdinkraOverlay />
              </g>{/* end sankofa-bird-heading-wrapper */}
            </svg>
          </div>

          {/* ══════════════════════════════════════════════════════════════════
              BACK sprite — bird heading south (flying away from the viewer).
              BackView renders dorsal wings, scapulars, wide tail fan.
              Fades in as heading approaches S (screenRotationDeg≈180).

              Phase 21: Back-diagonal pose (SE/SW headings 112.5°–157.5° /
              202.5°–247.5°) applies a perspective skew matrix so the dorsal
              wings show proper 3/4-behind depth.  The matrix is computed from
              BACK_LEFT_45 / BACK_RIGHT_45 in Skeleton/Poses.ts and blended in
              by computeBackDiagonalPoseTransform() — same lerp pattern as the
              SideView diagonal.  Identity matrix at orthogonal headings (no-op).
          ══════════════════════════════════════════════════════════════════ */}
          {(() => {
            const backDiagPose = computeBackDiagonalPoseTransform(screenRotationDeg, hasHeading);
            const backPoseMatrix = backDiagPose.perspectiveMatrix;
            return (
              <div
                className="sankofa-view-sprite"
                style={{
                  position: "absolute",
                  inset: 0,
                  opacity: backOpacity,
                  transition: spriteTransition,
                  pointerEvents: "none",
                  willChange: backOpacity > 0 && backOpacity < 1 ? "opacity" : "auto",
                  // Phase 21: perspective skew for back-diagonal headings (SE/SW)
                  transform: backPoseMatrix ? backPoseMatrix : undefined,
                  transformOrigin: "20px 20px",
                  // Expose pose intensity for CSS if needed
                  "--diagonal-pose-intensity": backDiagPose.intensity,
                  "--diagonal-inside-wing-opacity": backDiagPose.insideWingOpacity,
                } as React.CSSProperties}
              >
                <BackView />
              </div>
            );
          })()}

        </div>{/* end sankofa-bird-rig */}
      </div>

      {/* Center dot — GPS position indicator */}
      <div
        className="rounded-full bg-primary border-2 border-background shadow-[0_0_12px_rgba(0,212,255,0.9)]"
        style={{ width: size * 0.14, height: size * 0.14 }}
      />

      <style>{sankofaBirdCss}</style>
    </div>
  );
}
