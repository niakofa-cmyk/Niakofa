/**
 * heading-math
 *
 * Shared, correct circular-angle math for compass/GPS heading fusion and
 * map bearing animation. Every heading bug in the original implementation
 * traced back to plain (non-circular) arithmetic breaking at the 359°/0°
 * wrap-around — e.g. averaging 359° and 1° the naive way gives 180°
 * (exactly backwards) instead of the correct answer, 0°. Centralizing the
 * math here means every consumer (compass smoothing, GPS/compass fusion,
 * map camera stepping) shares the same wrap-safe behavior.
 */

/** Normalize any angle to the [0, 360) range. */
export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Shortest signed angular delta from `a` to `b`, in the range (-180, 180].
 * Positive means `b` is clockwise from `a`.
 */
export function shortestDelta(a: number, b: number): number {
  return ((b - a + 540) % 360) - 180;
}

/** @deprecated alias of shortestDelta, kept for readability at call sites. */
export const shortestAngleDiff = shortestDelta;

/**
 * Steps `from` toward `to` by at most `maxStep` degrees, taking the
 * shortest rotational path. Used to drive a single requestAnimationFrame
 * loop toward a target bearing without ever overshooting or wrapping the
 * wrong way around the circle.
 */
export function stepToward(from: number, to: number, maxStep: number): number {
  const delta = shortestDelta(from, to);
  const clamped = Math.max(-maxStep, Math.min(maxStep, delta));
  return normalizeDeg(from + clamped);
}

/**
 * Exponential smoothing over a circular quantity (degrees). Standard EMA
 * breaks at the wrap boundary (e.g. smoothing 359° toward 1° would drag the
 * value backwards through 180°) — this walks the shortest arc instead.
 */
export function smoothHeading(prev: number | null, next: number, alpha: number): number {
  if (prev == null || Number.isNaN(prev)) return normalizeDeg(next);
  return stepToward(prev, next, Math.abs(shortestDelta(prev, next)) * alpha);
}

/**
 * Weighted circular mean of two angles. Used to fuse compass heading with
 * GPS course-over-ground: converts each angle to a unit vector, combines
 * them by weight, then converts back — the only mathematically correct way
 * to average angles without the 359°/0° wrap producing a nonsense result.
 */
export function weightedCircularMean(a: number, weightA: number, b: number, weightB: number): number {
  const totalWeight = weightA + weightB;
  if (totalWeight <= 0) return normalizeDeg(a);
  const radA = (a * Math.PI) / 180;
  const radB = (b * Math.PI) / 180;
  const x = (Math.cos(radA) * weightA + Math.cos(radB) * weightB) / totalWeight;
  const y = (Math.sin(radA) * weightA + Math.sin(radB) * weightB) / totalWeight;
  if (x === 0 && y === 0) return normalizeDeg(a);
  return normalizeDeg((Math.atan2(y, x) * 180) / Math.PI);
}

/** Circular mean across an arbitrary list of angles, each with an optional weight. */
export function circularMean(angles: number[], weights?: number[]): number {
  let x = 0;
  let y = 0;
  angles.forEach((deg, i) => {
    const w = weights?.[i] ?? 1;
    const rad = (deg * Math.PI) / 180;
    x += Math.cos(rad) * w;
    y += Math.sin(rad) * w;
  });
  if (x === 0 && y === 0) return 0;
  return normalizeDeg((Math.atan2(y, x) * 180) / Math.PI);
}
