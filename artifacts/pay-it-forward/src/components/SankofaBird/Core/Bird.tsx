/**
 * SankofaBird/Core/Bird.tsx
 *
 * Root orchestrator — calls all system hooks, assembles BirdContextValue,
 * and renders the BirdProvider around the Renderer.
 *
 * System call order (each system may depend on previous outputs):
 *   Navigation/GPSHeading → Navigation/Altitude → Flight/Banking →
 *   Behavior/Landing → Flight/FlightPhysics → Behavior/Idle →
 *   Behavior/Aero → Behavior/Search → Navigation/Compass → P17 kinematics →
 *   Behavior/Deliver → BirdContextValue → BirdProvider<Renderer>
 *
 * Callers should import via the SankofaBird.tsx wrapper or SankofaBirdSvg.tsx shim.
 */

import React, { useId, useRef } from "react";
import {
  computeAeroMode,
  computeGazeVector,
  computeTurnDirection,
  computeTurnIntensity,
  computeNeckCurveDeg,
  computeBodyTwistDeg,
  computeVerticalGazeTiltDeg,
  computeGazeRotateDeg,
  computeInsideWingTuck,
  type AeroMode,
  type GazeDirection,
  type TurnDirection,
} from "@/lib/sankofa-bird-math";

import { BirdProvider, type BirdContextValue } from "./Context";
import type { SankofaBirdProps } from "./Types";
import { useAnimationMixer } from "./useAnimationMixer";
import { createFlightState, type FlightState } from "./FlightState";
import { buildFlightState } from "./SensorEngine";

import { useGPSHeading }   from "../Navigation/GPSHeading";
import { useAltitude }     from "../Navigation/Altitude";
import { useCompass }                                           from "../Navigation/Compass";
import { computeViewOpacities, computeViewAngle, computeDiagonalPoseTransform } from "../Navigation/ViewSelector";
import { useBanking }      from "../Flight/Banking";
import { useFlightPhysics } from "../Flight/FlightPhysics";
import { useLanding }      from "../Behavior/Landing";
import { useIdleState }    from "../Behavior/Idle";
import { computeTrustTier, computeEffectiveSkyTier } from "../Behavior/Deliver";

import { Renderer } from "./Renderer";

/**
 * SankofaBirdSvg — the core SVG bird with all Phase 1-22 animation effects.
 *
 * Phase history:
 *   Phases  1–11: Core flight, banking, landing, LOD, night mode
 *   Phases 12–13: Real-time gaze (8-dir), full aerodynamics
 *   Phases 14–19: Mission rings, chirp, weather, trust tiers, P17 kinematics
 *   Phase  20:    SME v2/v3 physics (notification pulse, body roll, damping)
 *   Phase  21:    Wing/tail deformation (5 wing + 4 tail poses), 360° back-diagonal,
 *                 FrontView/BackView SME wing drive, WAIR, mission cascade
 *   Phase  22:    LUMINARY EDITION — controlled iridescent feathers, luminous overlays,
 *                 Sankofa spiral, dynamic lighting, egg glow, speed shimmer
 *
 * Exported as SankofaBirdSvg for backward compatibility with SankofaBird.tsx
 * (the public wrapper) and SankofaBirdSvg.tsx (the old monolith, now a re-export).
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
  wairMode = false,
  soaring = false,
  matingDisplay = false,
  missionComplete = false,
  chirp = false,
  weather = "clear",
  trustLevel = 0,
  communityMilestone = false,
}: SankofaBirdProps): React.ReactElement {

  // ── Instance IDs ─────────────────────────────────────────────────────────────
  const _uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const eggGradId       = `sk-egg-${_uid}`;
  const eggGoldGradId   = `sk-egg-gold-${_uid}`;
  const bodyGradId      = `sk-body-${_uid}`;
  const wingGradLeftId  = `sk-wl-${_uid}`;
  const wingGradRightId = `sk-wr-${_uid}`;

  // rigRef is created here (attached to rig div in Renderer, observed in Altitude)
  const rigRef = useRef<HTMLDivElement | null>(null);

  // ── SME Layer 2–4: FlightState snapshot (updated each render, read each rAF tick) ─
  // Using a ref (not useState) so the rAF physics loop always reads the latest
  // values without triggering re-renders.  Pattern mirrors Flutter's stateProvider().
  const flightStateRef = useRef<FlightState | null>(createFlightState());

  // ── Navigation: GPS heading + cumulative unwrapping ────────────────────────
  const { hasHeading, screenRotationDeg } =
    useGPSHeading(heading, mapBearing);

  // Last known heading ref for lighting fallback (synchronous ref mutation — safe).
  const lastKnownHeadingRef = useRef<number | null>(null);
  if (hasHeading) lastKnownHeadingRef.current = heading as number;

  // ── Navigation: zoom tier + LOD escalation + off-screen detection ─────────
  const { zoomTier, navLod, isOffScreen } =
    useAltitude(mapZoom, navigating, rigRef, navLodOverride);

  // ── Flight: bank angle ────────────────────────────────────────────────────
  const { bankDeg, effectiveBankDeg } =
    useBanking(heading, hasHeading, zoomTier);

  // ── Behavior: landing sequence ────────────────────────────────────────────
  const { landingPhase } = useLanding(navigating);

  // ── Flight physics ────────────────────────────────────────────────────────
  const speedMs = speed ?? 0;
  const {
    isMoving, isGliding, isVisuallyGliding,
    flapPeriodMs, leanDeg,
    leftWingExtra, rightWingExtra, tailBendDeg, headLeadDeg, speedFactor,
  } = useFlightPhysics(speedMs, navigating, landingPhase, bankDeg, upcomingTurnDirection);

  // ── Behavior: idle activity + saccade ─────────────────────────────────────
  const { activityTier, blinkPeriodMs, saccadePhase, saccadeSnapping } =
    useIdleState(activityLevel, navigating, celebrating, newNotification);

  // ── Behavior: aerodynamic mode (pure) ─────────────────────────────────────
  const aeroMode: AeroMode = computeAeroMode({
    speedMs, navigating, landingPhase, wairMode, soaring, matingDisplay,
  });

  // ── Behavior: real-time gaze direction (pure) ────────────────────────────
  const gazeDir: GazeDirection = computeGazeVector({
    upcomingTurnDirection,
    approaching,
    newNotification,
    isGliding,
    isHelping,
    saccadePhase: (!navigating && !celebrating && !newNotification) ? saccadePhase : undefined,
    bankDeg,
  });

  // ── Navigation: facing direction + heading quadrant ─────────────────────
  const { facingRight, facingSign, headingQuadrant } =
    useCompass(screenRotationDeg, hasHeading, gazeDir);

  // ── 360° multi-view sprite selection (pure — from heading + hasHeading) ──
  const { front: frontOpacity, side: sideOpacity, back: backOpacity } =
    computeViewOpacities(screenRotationDeg, hasHeading);
  const viewAngle       = computeViewAngle(screenRotationDeg, hasHeading);
  const diagonalPose    = computeDiagonalPoseTransform(screenRotationDeg, hasHeading);

  // ── Phase 17: Kinematic chain (pure — all from effectiveBankDeg + gazeDir) ─
  const turnDir: TurnDirection = computeTurnDirection(effectiveBankDeg);
  const turnIntensity          = computeTurnIntensity(effectiveBankDeg);
  const neckCurveDeg           = computeNeckCurveDeg(effectiveBankDeg, gazeDir);
  const bodyTwistDeg           = computeBodyTwistDeg(effectiveBankDeg);
  const verticalGazeDeg        = computeVerticalGazeTiltDeg(gazeDir);
  const insideWingTuck         = computeInsideWingTuck(effectiveBankDeg);
  const p17Active              = !batterySaver && zoomTier !== "low";
  const gazeRotateDeg          = computeGazeRotateDeg(headLeadDeg * facingSign, verticalGazeDeg);

  // ── Wing / tail deformation poses (from official asset spec) ────────────────
  // Wing pose: maps flight state to one of 5 deformation states.
  const wingPose: "up" | "mid" | "down" | "forward" | "back" = (() => {
    if (isGliding)                                          return "back";     // glide — wings swept back
    if (landingPhase === "dive")                            return "down";     // power stroke / dive
    if (landingPhase === "slowflap" || landingPhase === "hover" || landingPhase === "perch")
                                                            return "forward";  // braking
    if (isMoving && speedMs <= 4 && !navigating)            return "up";       // hover / slow climb
    return "mid";                                                              // relaxed cruise
  })();

  // Tail pose: maps flight state to one of 4 deformation states.
  const tailPose: "flare" | "narrow" | "folded" | "stream" = (() => {
    if (landingPhase === "slowflap" || landingPhase === "perch")  return "folded";   // braking spread
    if (Math.abs(effectiveBankDeg) > 22 && isMoving)              return "flare";    // wide steering
    if (isGliding)                                                 return "stream";   // streamlined glide
    if (speedMs > 18)                                              return "narrow";   // high-speed tuck
    return "stream";
  })();

  // ── Behavior: delivery state (pure) ─────────────────────────────────────
  const trustTier      = computeTrustTier(trustLevel ?? 0);
  const effectiveSkyTier = computeEffectiveSkyTier(skyTier, nightMode);

  // ── SME Layer 2-4: Build FlightState from sensor inputs ─────────────────────
  // Written to a ref (not setState) so the rAF loop reads the latest values
  // every frame without triggering React re-renders. Mirrors Flutter's
  // stateProvider() callback pattern in SankofaMotionEngine.
  // Note: speedMs already declared above for useFlightPhysics.
  flightStateRef.current = buildFlightState(
    heading,
    speedMs,
    weather ?? "clear",
    batterySaver ?? false,
    {
      bankDeg,
      landingPhase,
      navigating: navigating ?? false,
      eventFired: !!(celebrating || newNotification),
      screenRotationDeg,
      facingSign,
    },
  );

  // ── SME Layer 5: Animation Mixer — unified spring physics for all channels ─
  // Runs ONE rAF loop; writes --mixer-* CSS vars AND --sme-* solver CSS vars
  // directly to the rig ref.  Disabled in battery-saver mode → CSS transitions
  // act as cheap fallback.
  useAnimationMixer(
    rigRef,
    {
      bankDeg:           effectiveBankDeg,
      leanDeg,
      headLeadDeg:       headLeadDeg * facingSign,
      neckCurveDeg:      p17Active ? neckCurveDeg * facingSign : 0,
      bodyTwistDeg:      p17Active ? bodyTwistDeg : 0,
      verticalGazeDeg:   p17Active ? verticalGazeDeg : 0,
      tailBendDeg,
      leftWingExtra,
      rightWingExtra,
      insideWingTuck:    p17Active ? insideWingTuck : 0,
      screenRotationDeg,
    },
    { enabled: !batterySaver, flightStateRef },
  );

  // ── Lighting factor: sun from NW (315°) ──────────────────────────────────
  const lightingFactor = Math.round(
    (Math.cos(
      ((hasHeading ? (heading as number) : (lastKnownHeadingRef.current ?? 0)) - 315) * Math.PI / 180
    ) * 0.32 + 0.5) * 100
  ) / 100;

  // ── Build BirdContextValue ────────────────────────────────────────────────
  const ctx: BirdContextValue = {
    // Props passed through for leaf components
    size, celebrating, newNotification, accepted, donated, nearbyUser,
    isHelping, batterySaver, nightMode, navigating, approaching,
    wairMode, soaring, matingDisplay, missionComplete, chirp,
    communityMilestone, weather: weather ?? "clear",
    upcomingTurnDirection: upcomingTurnDirection ?? null,
    speedMs, mapZoom, activityLevel, trustLevel: trustLevel ?? 0,
    // Computed state
    bankDeg, effectiveBankDeg, landingPhase, zoomTier,
    isMoving, isGliding, isVisuallyGliding,
    flapPeriodMs, leanDeg, leftWingExtra, rightWingExtra,
    tailBendDeg, headLeadDeg, speedFactor,
    navLod, isOffScreen, saccadePhase, saccadeSnapping,
    activityTier, blinkPeriodMs, effectiveSkyTier, trustTier, aeroMode,
    gazeDir, turnDir, turnIntensity, neckCurveDeg, bodyTwistDeg,
    verticalGazeDeg, insideWingTuck, p17Active,
    facingRight, facingSign, gazeRotateDeg, headingQuadrant,
    screenRotationDeg, hasHeading,
    wingPose, tailPose,
    // 360° multi-view
    viewAngle, frontOpacity, sideOpacity, backOpacity, diagonalPose,
    // Gradient IDs
    eggGradId, eggGoldGradId, bodyGradId, wingGradLeftId, wingGradRightId,
    // Refs
    rigRef,
  };

  return (
    <BirdProvider value={ctx}>
      <Renderer
        lightingFactor={lightingFactor}
        navLodOverride={navLodOverride}
      />
    </BirdProvider>
  );
}
