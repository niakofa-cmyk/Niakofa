/**
 * SankofaBird/Skeleton/Constraints.ts
 *
 * CSS transform helpers and pose utilities for the Sankofa Bird.
 * Pure functions — no React, no side effects.
 */

import type { BirdContextValue } from "../Core/Context";

/** Build the inline style object for the sankofa-bird-rig div. */
export function buildRigStyle(ctx: Pick<
  BirdContextValue,
  | "size" | "effectiveBankDeg" | "flapPeriodMs" | "leanDeg"
  | "leftWingExtra" | "rightWingExtra" | "tailBendDeg"
  | "headLeadDeg" | "facingSign" | "speedFactor" | "blinkPeriodMs"
  | "screenRotationDeg" | "hasHeading" | "neckCurveDeg" | "bodyTwistDeg"
  | "verticalGazeDeg" | "turnIntensity" | "insideWingTuck" | "gazeRotateDeg"
  | "p17Active"
>): React.CSSProperties {
  const {
    size, effectiveBankDeg, flapPeriodMs, leanDeg,
    leftWingExtra, rightWingExtra, tailBendDeg,
    headLeadDeg, facingSign, speedFactor, blinkPeriodMs,
    screenRotationDeg, hasHeading, neckCurveDeg, bodyTwistDeg,
    verticalGazeDeg, turnIntensity, insideWingTuck, gazeRotateDeg,
    p17Active,
  } = ctx;

  return {
    width: size,
    height: size,
    transform: `translateZ(0) rotate(${effectiveBankDeg}deg)`,
    transition: [
      "transform 0.35s ease-out",
      "--lean-deg 0.45s ease-out",
      "--tail-bend 0.40s ease-out",
      "--bank-angle 0.35s ease-out",
      "--left-wing-extra 0.40s ease-out",
      "--right-wing-extra 0.40s ease-out",
    ].join(", "),
    willChange: "transform",
    "--flap-period":       `${flapPeriodMs}ms`,
    "--lean-deg":          `${leanDeg}deg`,
    "--left-wing-extra":   `${leftWingExtra}deg`,
    "--right-wing-extra":  `${rightWingExtra}deg`,
    "--tail-bend":         `${tailBendDeg}deg`,
    "--bank-angle":        `${effectiveBankDeg}deg`,
    "--head-lead-deg":     `${headLeadDeg * facingSign}deg`,
    "--heading-deg":       `${screenRotationDeg}deg`,
    "--speed-factor":      `${speedFactor}`,
    "--blink-period":      `${blinkPeriodMs}ms`,
    "--lighting-factor":   `${computeLightingFactor(hasHeading, screenRotationDeg)}`,
    "--neck-curve-deg":    p17Active ? `${neckCurveDeg * facingSign}deg` : "0deg",
    "--body-twist-deg":    p17Active ? `${bodyTwistDeg}deg` : "0deg",
    "--vertical-gaze-deg": p17Active ? `${verticalGazeDeg}deg` : "0deg",
    "--turn-intensity":    p17Active ? `${turnIntensity}` : "0",
    "--inside-wing-tuck":  p17Active ? `${insideWingTuck}` : "0",
    "--gaze-rotate-deg":   p17Active ? `${gazeRotateDeg}deg` : "0deg",
  } as React.CSSProperties;
}

/** Lighting factor: sun from NW (315°), maps to 0.18–0.82. */
function computeLightingFactor(hasHeading: boolean, screenRotationDeg: number): number {
  const angle = hasHeading ? screenRotationDeg : 0;
  return Math.round(
    (Math.cos((angle - 315) * Math.PI / 180) * 0.32 + 0.5) * 100
  ) / 100;
}

/** 2.5D perspective matrix for turnaround views.
 *  scaleX: horizontal compression factor.
 *  skewX:  horizontal shear (creates depth illusion, degrees).
 *  Returns a CSS matrix() string. */
export function perspectiveMatrix(scaleX: number, skewXDeg: number): string {
  const shear = Math.tan(skewXDeg * Math.PI / 180);
  return `matrix(${scaleX}, 0, ${shear}, 1, 0, 0)`;
}
