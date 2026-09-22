/**
 * SankofaBird/Flight/FlightPhysics.ts
 *
 * Core flight-physics system — derives flight mode, flap rate, lean angle,
 * wing-extension differentials, tail rudder, and speed factor from props.
 */

import { useMemo } from "react";
import {
  computeFlightMode,
  computeFlapPeriodMs,
  computeLeanDeg,
  computeWingExtras,
  computeTailBend,
  computeHeadLeadDeg,
  type LandingPhase,
} from "@/lib/sankofa-bird-math";

export interface FlightPhysicsState {
  isMoving: boolean;
  isGliding: boolean;
  isVisuallyGliding: boolean;
  flapPeriodMs: number;
  leanDeg: number;
  leftWingExtra: number;
  rightWingExtra: number;
  tailBendDeg: number;
  headLeadDeg: number;
  speedFactor: number;
}

/**
 * useFlightPhysics — derives all flight-mode state from current motion inputs.
 *
 * @param speedMs - Ground speed in m/s.
 * @param navigating - True during active navigation.
 * @param landingPhase - Current landing-sequence phase from useLanding.
 * @param bankDeg - Current bank angle from useBanking.
 * @param upcomingTurnDirection - Anticipatory turn signal from navigation.
 */
export function useFlightPhysics(
  speedMs: number,
  navigating: boolean,
  landingPhase: LandingPhase,
  bankDeg: number,
  upcomingTurnDirection: "left" | "right" | null,
): FlightPhysicsState {
  const { isMoving, isGliding, isVisuallyGliding } =
    computeFlightMode(speedMs, navigating, landingPhase);

  const flapPeriodMs = useMemo(
    () => computeFlapPeriodMs({ isMoving, isGliding, speedMs, landingPhase }),
    [isMoving, isGliding, speedMs, landingPhase],
  );

  const leanDeg = useMemo(
    () => computeLeanDeg({ isMoving, isGliding, speedMs, landingPhase }),
    [isMoving, isGliding, speedMs, landingPhase],
  );

  const { leftExtra: leftWingExtra, rightExtra: rightWingExtra } =
    computeWingExtras(bankDeg);

  const tailBendDeg  = computeTailBend(bankDeg);
  const headLeadDeg  = computeHeadLeadDeg(bankDeg, upcomingTurnDirection);
  const speedFactor  = Math.min(1, speedMs / 15);

  return {
    isMoving,
    isGliding,
    isVisuallyGliding,
    flapPeriodMs,
    leanDeg,
    leftWingExtra,
    rightWingExtra,
    tailBendDeg,
    headLeadDeg,
    speedFactor,
  };
}
