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

/**
 * Great-circle initial bearing (forward azimuth) from point A to point B,
 * in degrees, 0 = true north, clockwise-positive.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 * Root-cause fix for "the Sankofa bird never turns its head": every heading
 * source the bird previously consumed (device compass via useDeviceHeading,
 * GPS course-over-ground via `myLocation.heading`) can legitimately be null
 * for long stretches — desktop browsers never report a compass, iOS 13+
 * requires an explicit permission prompt Niakofa never triggers by default,
 * and `coords.heading` is spec'd to be null whenever the device isn't
 * moving fast enough for the GPS chipset to derive a confident course. When
 * ALL of those are null, `hasHeading` in SankofaBirdSvg is false and the
 * bird's entire directional system (facing flip, bank, head-lead, neck
 * curve, gaze) goes fully idle — reading exactly like "the bird only ever
 * faces one direction."
 *
 * `computeBearingDeg` needs nothing but two consecutive GPS fixes (lat/lon),
 * which `navigator.geolocation.watchPosition` always provides regardless of
 * compass support or permission — so it becomes a heading source available
 * on every device, moving or not (once it has moved at all).
 */
export function computeBearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return normalizeDeg((Math.atan2(y, x) * 180) / Math.PI);
}

/**
 * Haversine great-circle distance between two lat/lon points, in metres.
 * Gates the movement-derived heading fallback — bearing between two fixes
 * only means something once the device has actually moved a meaningful
 * distance (GPS jitter at rest can be a few metres even standing still, so
 * a small floor avoids spurious "spinning" bearings from noise).
 */
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Earth radius, metres
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);
  const a =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
