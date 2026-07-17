/**
 * heading-math.ts
 *
 * Small shared utilities for working with compass/bearing degrees (0–360,
 * wrapping at the 0°/360° boundary). Every "jumping" bug in this codebase's
 * heading/bearing code traced back to doing plain arithmetic on raw degrees
 * across that wrap point — e.g. averaging 359° and 1° naively gives 180°
 * (exactly backwards) instead of 0°. Centralizing this in one place means
 * every consumer (compass smoothing, GPS/compass fusion, map bearing
 * animation) uses the same correct math.
 */

/** Shortest signed delta from `a` to `b`, in the range (-180, 180]. */
export function shortestDelta(a: number, b: number): number {
  return ((b - a + 540) % 360) - 180;
}

/** Exponential smoothing that walks the shortest arc, never the long way around. */
export function smoothHeading(prev: number | null, next: number, alpha: number): number {
  if (prev == null || Number.isNaN(prev)) return next;
  return (prev + shortestDelta(prev, next) * alpha + 360) % 360;
}

/**
 * Weighted circular mean of two headings. Plain weighted averaging of raw
 * degrees fails at the wrap boundary; this sums unit vectors instead, which
 * is the mathematically correct way to average angles.
 */
export function weightedCircularMean(
  angleA: number,
  weightA: number,
  angleB: number,
  weightB: number,
): number {
  const totalWeight = weightA + weightB;
  if (totalWeight <= 0) return angleA;
  const radA = (angleA * Math.PI) / 180;
  const radB = (angleB * Math.PI) / 180;
  const x = (Math.cos(radA) * weightA + Math.cos(radB) * weightB) / totalWeight;
  const y = (Math.sin(radA) * weightA + Math.sin(radB) * weightB) / totalWeight;
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Step `current` toward `target` by at most `maxStepDeg`, shortest arc. */
export function stepToward(current: number, target: number, maxStepDeg: number): number {
  const delta = shortestDelta(current, target);
  const clamped = Math.max(-maxStepDeg, Math.min(maxStepDeg, delta));
  return (current + clamped + 360) % 360;
}
