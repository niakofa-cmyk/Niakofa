/**
 * SankofaBird/Navigation/Compass.ts
 *
 * Compass system — derives facing direction and heading quadrant
 * from screen-relative heading and gaze vector.
 */

import { useRef } from "react";
import type { GazeDirection } from "@/lib/sankofa-bird-math";

export interface CompassState {
  /** True when the bird's beak should face screen-right. */
  facingRight: boolean;
  /** +1 when facing left, -1 when facing right — corrects bank rotations. */
  facingSign: number;
  /** 8-sector compass quadrant string (N/NE/E/SE/S/SW/W/NW/none). */
  headingQuadrant: string;
}

/**
 * useCompass — derives facing direction and heading quadrant.
 *
 * @param screenRotationDeg - Screen-relative heading (0–360).
 * @param hasHeading - True when GPS heading is valid.
 * @param gazeDir - Current gaze direction from Behavior/Search.
 */
export function useCompass(
  screenRotationDeg: number,
  hasHeading: boolean,
  gazeDir: GazeDirection,
): CompassState {
  const gazeFacingRight =
    gazeDir === "right" || gazeDir === "upright" || gazeDir === "downright";

  const rawFacingRight = hasHeading && screenRotationDeg > 10 && screenRotationDeg < 170;
  const stickyFacingRightRef = useRef<boolean | null>(null);
  if (hasHeading) {
    stickyFacingRightRef.current = rawFacingRight;
  }
  const facingRight = hasHeading
    ? rawFacingRight
    : (stickyFacingRightRef.current !== null ? stickyFacingRightRef.current : gazeFacingRight);
  const facingSign = facingRight ? -1 : 1;

  const headingQuadrant: string = hasHeading
    ? screenRotationDeg < 22.5  ? "N"
    : screenRotationDeg < 67.5  ? "NE"
    : screenRotationDeg < 112.5 ? "E"
    : screenRotationDeg < 157.5 ? "SE"
    : screenRotationDeg < 202.5 ? "S"
    : screenRotationDeg < 247.5 ? "SW"
    : screenRotationDeg < 292.5 ? "W"
    : screenRotationDeg < 337.5 ? "NW"
    : "N"
    : "none";

  return { facingRight, facingSign, headingQuadrant };
}
