/**
 * SankofaBird/Skeleton/Pivots.ts
 *
 * Canonical pivot point coordinates in SVG space (viewBox 0 0 40 40).
 * All transformBox="view-box" CSS transforms reference these points.
 *
 * Rule: every pivot used in a CSS @keyframe or inline style transform-origin
 * MUST appear here. Components import from here instead of magic numbers.
 */

/** Body bank pivot — rig rotates around this point (50% × 62% of viewBox). */
export const PIVOT_RIG = { x: 20, y: 24.8 } as const;

/** Body geometric center. */
export const PIVOT_BODY = { x: 20, y: 22 } as const;

/** Head center — head circle cx/cy. */
export const PIVOT_HEAD = { x: 8, y: 13 } as const;

/** Neck base — where neck meets the body. */
export const PIVOT_NECK_BASE = { x: 18, y: 16 } as const;

/** Wing attachment point — both wings originate here. */
export const PIVOT_WING = { x: 20, y: 17 } as const;

/** Tail base — all tail rectrice paths originate here. */
export const PIVOT_TAIL = { x: 20, y: 24 } as const;

/** Left leg hip joint. */
export const PIVOT_LEG_LEFT = { x: 18.5, y: 29.5 } as const;

/** Right leg hip joint. */
export const PIVOT_LEG_RIGHT = { x: 21.5, y: 29.5 } as const;

/** Egg center — counter-rotation wrapper anchors to this. */
export const PIVOT_EGG = { x: 3.4, y: 15.6 } as const;

/** Beak tip — chirp rings and beak-glint originate here. */
export const PIVOT_BEAK_TIP = { x: 2.2, y: 14.25 } as const;

/** Upper beak base — jaw pivot for chirp animation. */
export const PIVOT_BEAK_BASE = { x: 5.45, y: 14.2 } as const;

/** Eye / pupil center. */
export const PIVOT_EYE = { x: 7.1, y: 12.2 } as const;

/** Eye catchlight center. */
export const PIVOT_EYE_CATCHLIGHT = { x: 7.6, y: 11.85 } as const;

/** Crown feather roots (fan base). */
export const PIVOT_CROWN: Record<1|2|3|4|5, { x: number; y: number }> = {
  1: { x: 7.1,  y: 10.5 },
  2: { x: 8.3,  y: 10.2 },
  3: { x: 9.4,  y: 10.7 },
  4: { x: 6.1,  y: 11.4 },
  5: { x: 10.7, y: 11.2 },
};

/** Left knee joint midpoint. */
export const PIVOT_KNEE_LEFT = { x: 17.5, y: 31.8 } as const;

/** Right knee joint midpoint. */
export const PIVOT_KNEE_RIGHT = { x: 22.5, y: 31.8 } as const;

/** Talon specular origins. */
export const PIVOT_TALON_LEFT  = { x: 14,   y: 36.4 } as const;
export const PIVOT_TALON_RIGHT = { x: 26,   y: 36.4 } as const;

/** Idle dust mote positions. */
export const DUST_POSITIONS = [
  { x: 15.5, y: 35.5 },
  { x: 20,   y: 37   },
  { x: 24.5, y: 35.5 },
] as const;

/** Helper to format transform-origin from a pivot. */
export function pivotOrigin(pivot: { x: number; y: number }): string {
  return `${pivot.x}px ${pivot.y}px`;
}
