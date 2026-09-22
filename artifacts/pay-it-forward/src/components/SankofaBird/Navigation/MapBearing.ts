/**
 * SankofaBird/Navigation/MapBearing.ts
 *
 * Map-bearing utilities — pure functions for converting between
 * world-frame headings and screen-relative rotations.
 */

export { computeScreenRotation } from "@/lib/sankofa-bird-math";

/**
 * normalizeAngle — wraps any angle to [0, 360).
 */
export function normalizeAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * headingToCardinal — converts a heading in degrees to a compass label.
 */
export function headingToCardinal(deg: number): string {
  const sectors = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return sectors[Math.round(normalizeAngle(deg) / 45) % 8];
}
