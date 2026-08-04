/**
 * SankofaBird/Navigation/ViewSelector.ts
 *
 * Computes which of the three bird sprites (front · side · back) to show
 * and at what cross-fade opacity, given the screen-relative heading.
 *
 * Zone map (each zone is 45° wide; transitions are 45° linear cross-fades):
 *
 *   Front      337.5° – 22.5°   (N ± 22.5°)   bird heading toward viewer
 *   NE trans    22.5° – 67.5°   front → side cross-fade  + LEFT_45 skew pose
 *   E side      67.5° – 112.5°  pure east side (beak faces screen-right)
 *   SE trans   112.5° – 157.5°  side → back cross-fade   + RIGHT_45 skew pose
 *   Back       157.5° – 202.5°  (S ± 22.5°)   bird heading away from viewer
 *   SW trans   202.5° – 247.5°  back → side cross-fade   + LEFT_45 skew pose (mirrored)
 *   W side     247.5° – 292.5°  pure west side (beak faces screen-left)
 *   NW trans   292.5° – 337.5°  side → front cross-fade  + RIGHT_45 skew pose (mirrored)
 *
 * ── Diagonal 3/4-view poses ────────────────────────────────────────────────
 * Skeleton/Poses.ts defines LEFT_45 and RIGHT_45 — proper perspective skew
 * matrices for NE/SE/SW/NW headings. computeDiagonalPoseTransform() returns
 * the CSS matrix() string (and wing-foreshortening opacity) for the current
 * heading, which Renderer.tsx applies to the side-view SVG root <g>.
 * At orthogonal headings (N/E/S/W) this returns the identity matrix so the
 * existing artwork is unchanged.
 */

import { LEFT_45, RIGHT_45, BACK_LEFT_45, BACK_RIGHT_45 } from "../Skeleton/Poses";

export type ViewAngle =
  | "front"
  | "front-diagonal"
  | "side"
  | "back-diagonal"
  | "back";

export interface ViewOpacities {
  front: number;
  side: number;
  back: number;
}

/**
 * Given the screen-relative heading (0 = N, 90 = E, 180 = S, 270 = W)
 * and whether a GPS heading is available, returns the opacity weight for each
 * of the three bird sprites. Values always sum to ≤ 1.0.
 *
 * When hasHeading is false the side sprite is shown at full opacity so the
 * existing bird appears unchanged until a heading arrives.
 */
export function computeViewOpacities(
  screenRotationDeg: number,
  hasHeading: boolean,
): ViewOpacities {
  if (!hasHeading) return { front: 0, side: 1, back: 0 };

  const d   = ((screenRotationDeg % 360) + 360) % 360;
  // Linear progress through the current 45° cross-fade zone.
  const t   = (lo: number, hi: number): number =>
    Math.max(0, Math.min(1, (d - lo) / (hi - lo)));

  // ── FRONT zone (337.5–22.5) ──────────────────────────────────────────────
  if (d >= 337.5 || d < 22.5) return { front: 1, side: 0, back: 0 };

  // ── NE transition: front → side (22.5–67.5) ─────────────────────────────
  if (d < 67.5) {
    const p = t(22.5, 67.5);
    return { front: 1 - p, side: p, back: 0 };
  }

  // ── EAST side zone (67.5–112.5) ─────────────────────────────────────────
  if (d < 112.5) return { front: 0, side: 1, back: 0 };

  // ── SE transition: side → back (112.5–157.5) ────────────────────────────
  if (d < 157.5) {
    const p = t(112.5, 157.5);
    return { front: 0, side: 1 - p, back: p };
  }

  // ── BACK zone (157.5–202.5) ─────────────────────────────────────────────
  if (d < 202.5) return { front: 0, side: 0, back: 1 };

  // ── SW transition: back → side (202.5–247.5) ────────────────────────────
  if (d < 247.5) {
    const p = t(202.5, 247.5);
    return { front: 0, side: p, back: 1 - p };
  }

  // ── WEST side zone (247.5–292.5) ────────────────────────────────────────
  if (d < 292.5) return { front: 0, side: 1, back: 0 };

  // ── NW transition: side → front (292.5–337.5) ───────────────────────────
  const p = t(292.5, 337.5);
  return { front: p, side: 1 - p, back: 0 };
}

/**
 * Coarser label for the current view zone — useful for data attributes,
 * debug overlays, and CSS selectors that need named zones.
 */
export function computeViewAngle(
  screenRotationDeg: number,
  hasHeading: boolean,
): ViewAngle {
  if (!hasHeading) return "side";
  const d = ((screenRotationDeg % 360) + 360) % 360;
  if (d >= 337.5 || d < 22.5) return "front";
  if (d < 67.5)               return "front-diagonal";
  if (d < 112.5)              return "side";
  if (d < 157.5)              return "back-diagonal";
  if (d < 202.5)              return "back";
  if (d < 247.5)              return "back-diagonal";
  if (d < 292.5)              return "side";
  return "front-diagonal";
}

/**
 * Diagonal 3/4-view pose transform result.
 * Applied to the side-view SVG root <g> by Renderer.tsx at diagonal headings.
 */
export interface DiagonalPoseTransform {
  /**
   * CSS matrix() string for the perspective skew — apply to the side-view
   * SVG root <g> via transform attribute or inline style.
   * Empty string = identity (orthogonal heading → no change).
   */
  perspectiveMatrix: string;
  /**
   * Foreshortened wing opacity for the inside/receding wing.
   * 1.0 = full opacity (orthogonal heading).
   * ~0.55 at full diagonal.
   */
  insideWingOpacity: number;
  /**
   * Blended 0–1 intensity of the pose (0 = orthogonal, 1 = full 45° diagonal).
   * Used to lerp between identity and the target pose matrix.
   */
  intensity: number;
}

/**
 * computeDiagonalPoseTransform — returns the CSS perspective matrix and
 * wing-foreshortening values for the current screen heading.
 *
 * Uses LEFT_45 and RIGHT_45 from Skeleton/Poses.ts which define proper
 * 2.5D skew matrices for diagonal headings.
 *
 * Quadrant mapping:
 *   NE (22.5–67.5°)   → LEFT_45  pose (bird heading front-right, right wing receding)
 *   SE (112.5–157.5°) → RIGHT_45 pose (bird heading back-right, left wing receding)
 *   SW (202.5–247.5°) → LEFT_45  pose (mirrored by scaleX already in place)
 *   NW (292.5–337.5°) → RIGHT_45 pose (mirrored by scaleX)
 *
 * At orthogonal headings returns identity (empty string, opacity 1, intensity 0).
 */
export function computeDiagonalPoseTransform(
  screenRotationDeg: number,
  hasHeading: boolean,
): DiagonalPoseTransform {
  const IDENTITY: DiagonalPoseTransform = {
    perspectiveMatrix: "",
    insideWingOpacity: 1,
    intensity: 0,
  };

  if (!hasHeading) return IDENTITY;

  const d = ((screenRotationDeg % 360) + 360) % 360;
  const t = (lo: number, hi: number): number =>
    Math.max(0, Math.min(1, (d - lo) / (hi - lo)));

  // The pose intensity follows a triangular wave — peaks at 45° inside each
  // transition zone, zero at the orthogonal edges.
  // triangle(p) = 1 - |2p - 1|  (0→0, 0.5→1, 1→0)
  const triangle = (p: number): number => 1 - Math.abs(2 * p - 1);

  // Interpolate between identity matrix values and the target pose matrix values.
  // identity matrix: matrix(1,0,0,1,0,0)
  // The CSS matrix(a,b,c,d,e,f) values from Poses.ts are interpolated linearly.
  const lerpMatrix = (
    pose: { perspectiveMatrix: string },
    intensity: number,
  ): string => {
    if (intensity <= 0) return "";
    if (intensity >= 1) return pose.perspectiveMatrix;
    // Parse "matrix(a,b,c,d,e,f)" and lerp each value from identity.
    const m = pose.perspectiveMatrix.match(/matrix\(([^)]+)\)/);
    if (!m) return "";
    const vals = m[1].split(",").map(Number);
    // identity: [1, 0, 0, 1, 0, 0]
    const id = [1, 0, 0, 1, 0, 0];
    const lerped = vals.map((v, i) => id[i] + (v - id[i]) * intensity);
    return `matrix(${lerped.join(",")})`;
  };

  // Wing foreshortening: 1.0 → insideWingOpacity from pose at full intensity.
  const lerpWingOpacity = (
    pose: { wingRightScaleX?: number; wingLeftScaleX?: number },
    intensity: number,
  ): number => {
    const target = pose.wingRightScaleX ?? pose.wingLeftScaleX ?? 1;
    return 1 + (target - 1) * intensity;
  };

  // ── NE transition: front → side (22.5°–67.5°) — LEFT_45 pose ───────────
  if (d >= 22.5 && d < 67.5) {
    const p = t(22.5, 67.5);
    const intensity = triangle(p);
    return {
      perspectiveMatrix: lerpMatrix(LEFT_45, intensity),
      insideWingOpacity: lerpWingOpacity(LEFT_45, intensity),
      intensity,
    };
  }

  // ── SE transition: side → back (112.5°–157.5°) — RIGHT_45 pose ──────────
  if (d >= 112.5 && d < 157.5) {
    const p = t(112.5, 157.5);
    const intensity = triangle(p);
    return {
      perspectiveMatrix: lerpMatrix(RIGHT_45, intensity),
      insideWingOpacity: lerpWingOpacity(RIGHT_45, intensity),
      intensity,
    };
  }

  // ── SW transition: back → side (202.5°–247.5°) — LEFT_45 mirrored ───────
  if (d >= 202.5 && d < 247.5) {
    const p = t(202.5, 247.5);
    const intensity = triangle(p);
    return {
      perspectiveMatrix: lerpMatrix(LEFT_45, intensity),
      insideWingOpacity: lerpWingOpacity(LEFT_45, intensity),
      intensity,
    };
  }

  // ── NW transition: side → front (292.5°–337.5°) — RIGHT_45 mirrored ─────
  if (d >= 292.5 && d < 337.5) {
    const p = t(292.5, 337.5);
    const intensity = triangle(p);
    return {
      perspectiveMatrix: lerpMatrix(RIGHT_45, intensity),
      insideWingOpacity: lerpWingOpacity(RIGHT_45, intensity),
      intensity,
    };
  }

  // Orthogonal heading — identity
  return IDENTITY;
}

/**
 * computeBackDiagonalPoseTransform — returns the CSS perspective matrix and
 * wing-foreshortening values for the BackView sprite at SE/SW diagonal headings.
 *
 * Phase 21 addition. Uses BACK_LEFT_45 and BACK_RIGHT_45 from Skeleton/Poses.ts.
 *
 * Quadrant mapping for BackView:
 *   SE (112.5°–157.5°) → BACK_LEFT_45 (right dorsal wing near, left far)
 *   SW (202.5°–247.5°) → BACK_RIGHT_45 (left dorsal wing near, right far)
 *   All other headings → identity (empty string, opacity 1, intensity 0)
 *
 * Applied in Renderer.tsx to the BackView wrapper div.
 */
export function computeBackDiagonalPoseTransform(
  screenRotationDeg: number,
  hasHeading: boolean,
): DiagonalPoseTransform {
  const IDENTITY: DiagonalPoseTransform = {
    perspectiveMatrix: "",
    insideWingOpacity: 1,
    intensity: 0,
  };

  if (!hasHeading) return IDENTITY;

  const d = ((screenRotationDeg % 360) + 360) % 360;
  const t = (lo: number, hi: number): number =>
    Math.max(0, Math.min(1, (d - lo) / (hi - lo)));

  // Triangle wave: peaks at 1.0 at the centre of the 45° zone.
  const triangle = (p: number): number => 1 - Math.abs(2 * p - 1);

  // Interpolate between identity and the target back pose matrix.
  const lerpMatrix = (
    pose: { perspectiveMatrix: string },
    intensity: number,
  ): string => {
    if (intensity <= 0) return "";
    if (intensity >= 1) return pose.perspectiveMatrix;
    const m = pose.perspectiveMatrix.match(/matrix\(([^)]+)\)/);
    if (!m) return "";
    const vals = m[1].split(",").map(Number);
    const id = [1, 0, 0, 1, 0, 0];
    const lerped = vals.map((v, i) => id[i] + (v - id[i]) * intensity);
    return `matrix(${lerped.join(",")})`;
  };

  const lerpWingOpacity = (
    pose: { wingRightScaleX?: number; wingLeftScaleX?: number },
    intensity: number,
  ): number => {
    const target = pose.wingRightScaleX ?? pose.wingLeftScaleX ?? 1;
    return 1 + (target - 1) * intensity;
  };

  // ── SE transition (112.5°–157.5°): BACK_LEFT_45 — right dorsal near ──────
  if (d >= 112.5 && d < 157.5) {
    const p = t(112.5, 157.5);
    const intensity = triangle(p);
    return {
      perspectiveMatrix: lerpMatrix(BACK_LEFT_45, intensity),
      insideWingOpacity: lerpWingOpacity(BACK_LEFT_45, intensity),
      intensity,
    };
  }

  // ── SW transition (202.5°–247.5°): BACK_RIGHT_45 — left dorsal near ──────
  if (d >= 202.5 && d < 247.5) {
    const p = t(202.5, 247.5);
    const intensity = triangle(p);
    return {
      perspectiveMatrix: lerpMatrix(BACK_RIGHT_45, intensity),
      insideWingOpacity: lerpWingOpacity(BACK_RIGHT_45, intensity),
      intensity,
    };
  }

  // Pure BACK zone (157.5°–202.5°) and all other headings → identity
  return IDENTITY;
}
