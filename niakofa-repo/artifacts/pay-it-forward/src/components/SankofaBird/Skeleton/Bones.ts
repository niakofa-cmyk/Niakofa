/**
 * SankofaBird/Skeleton/Bones.ts
 *
 * Canonical SVG path data for all bird anatomy — merged from geometry/*.ts.
 * Pure geometry: no animation, no colour, no React.
 *
 * Import named constants to use in component files. Never inline path strings.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TAIL PATHS
// ═══════════════════════════════════════════════════════════════════════════════

/** Main tail shape (base rectrice fan) — also tagged sankofa-tail-center. */
export const TAIL_CENTER_BASE =
  "M20 24 C17 30 15 34 12 37 C16 35.5 19 34.5 20 33 C21 34.5 24 35.5 28 37 C25 34 23 30 20 24 Z";

/** Central tail primary feather tip (centre rectrix). */
export const TAIL_TIP_CENTER =
  "M20 32 C19.5 34.5 20 36.5 20 38 C20.5 36.5 20.5 34.5 20 32 Z";

/** Left inner primary feather tip. */
export const TAIL_TIP_LEFT =
  "M16.5 33.5 C15.5 35.5 14.5 37 13.5 38 C15 37 16.5 35.5 17 33.5 Z";

/** Right inner primary feather tip. */
export const TAIL_TIP_RIGHT =
  "M23.5 33.5 C24.5 35.5 25.5 37 26.5 38 C25 37 23.5 35.5 23 33.5 Z";

/** Left outer rectrix (5th feather, shorter + curved outward). */
export const TAIL_OUTER_LEFT =
  "M13.5 34 C12 35.5 11 37 10 38.5 C11.5 37.5 13 36 14.5 34.5 Z";

/** Right outer rectrix (symmetrical with outer-left). */
export const TAIL_OUTER_RIGHT =
  "M26.5 34 C28 35.5 29 37 30 38.5 C28.5 37.5 27 36 25.5 34.5 Z";

/** Left far outer rectrix (outermost — faintest). */
export const TAIL_FAR_LEFT =
  "M11.0 35.5 C9.5 37.5 8.5 39.0 7.5 40.0 C9.0 38.5 10.5 37.0 12.0 35.5 Z";

/** Right far outer rectrix (symmetrical with far-left). */
export const TAIL_FAR_RIGHT =
  "M29.0 35.5 C30.5 37.5 31.5 39.0 32.5 40.0 C31.0 38.5 29.5 37.0 28.0 35.5 Z";

/** Iridescence overlay on the upper tail surface (Phase 3). */
export const TAIL_IRI_OVERLAY =
  "M20 28.5 C18 31 16 33 13.5 35.5 C16 34 18.5 32.5 20 31 C21.5 32.5 24 34 26.5 35.5 C24 33 22 31 20 28.5 Z";

/** Outer iridescence arc (far feather tips). */
export const TAIL_IRI_OUTER =
  "M12.5 35 C11 36.5 9.5 38 8 39.5 L9.5 38.5 C10.8 37.2 12.0 35.8 13.5 34.8 Z";

// ═══════════════════════════════════════════════════════════════════════════════
// WING PATHS
// ═══════════════════════════════════════════════════════════════════════════════

/** Right wing main body (gradient fill). */
export const WING_RIGHT_BODY =
  "M20 17 C26 14 33 12 37 7 C35 14 31 19 25 22 C22.5 21 20.5 19 20 17 Z";

/** Right wing underside surface (Phase 2). */
export const WING_RIGHT_BTM =
  "M20 18 C25 16 31 17 35 14 C33 18 29 20.5 24 22 C22 21.5 20.5 19.5 20 18 Z";

/** Right primary feathers (r5 = outermost → r0 = innermost). */
export const RIGHT_PRIMARIES = {
  r5: "M39.5 4.5 C40.8 2.5 40.5 0.8 39.3 0.2 C38.4 1.6 37.4 3.4 37.0 5.2 Z",
  r0: "M38.2 6.0 C39.5 3.8 39.8 2.0 38.6 1.2 C37.6 2.6 36.0 4.8 34.8 7.0 Z",
  r1: "M36 8 C37.5 5.5 38.5 4 37.5 3 C36.5 4.5 34.5 6.5 33 8.5 Z",
  r2: "M30 10 C31.5 7.5 32 5.5 31 4.5 C30 6 28 8.5 26.5 10.5 Z",
  r3: "M25 13 C26.5 10.5 26.5 8.5 25.5 7.5 C24.5 9 22.5 11.5 21.5 13.5 Z",
  r4: "M22 15.5 C23.5 13 23.5 11 22.5 10 C21.5 11.5 20 14 19.5 15.5 Z",
} as const;

/** Right secondary feathers (rs1–rs3). */
export const RIGHT_SECONDARIES = {
  rs1: "M32 11.5 C33.5 9.5 33.5 8 32.5 7.5 C31.5 9 30 11 29 12.5 Z",
  rs2: "M28 13 C29.5 11 30 9.5 29 9 C28 10.5 26.5 12.5 25.5 14 Z",
  rs3: "M24.5 15 C26 13 26.5 11.5 25.5 11 C24.5 12.5 23 14.5 22 16 Z",
} as const;

/** Right covert feather (rc1). */
export const RIGHT_COVERT =
  "M37.5 9.5 C38.2 8.2 38.5 7 37.8 6.5 C37.2 7.8 36.2 9.2 35.5 10.5 Z";

/** Right wing trailing-edge highlight (iridescence rim). */
export const WING_RIGHT_HIGHLIGHT =
  "M21 17.5 C25 15.5 30 14 33.5 11.5 C31 14 27.5 17 23.5 18.5 Z";

/** Left wing main body. */
export const WING_LEFT_BODY =
  "M20 17 C14 14 7 12 3 7 C5 14 9 19 15 22 C17.5 21 19.5 19 20 17 Z";

/** Left wing underside surface. */
export const WING_LEFT_BTM =
  "M20 18 C15 16 9 17 5 14 C7 18 11 20.5 16 22 C18 21.5 19.5 19.5 20 18 Z";

/** Left primary feathers (l5 = outermost → l0 = innermost). */
export const LEFT_PRIMARIES = {
  l5: "M0.5 4.5 C-0.8 2.5 -0.5 0.8 0.7 0.2 C1.6 1.6 2.6 3.4 3.0 5.2 Z",
  l0: "M1.8 6.0 C0.5 3.8 0.2 2.0 1.4 1.2 C2.4 2.6 4.0 4.8 5.2 7.0 Z",
  l1: "M4 8 C2.5 5.5 1.5 4 2.5 3 C3.5 4.5 5.5 6.5 7 8.5 Z",
  l2: "M10 10 C8.5 7.5 8 5.5 9 4.5 C10 6 12 8.5 13.5 10.5 Z",
  l3: "M15 13 C13.5 10.5 13.5 8.5 14.5 7.5 C15.5 9 17.5 11.5 18.5 13.5 Z",
  l4: "M18 15.5 C16.5 13 16.5 11 17.5 10 C18.5 11.5 20 14 20.5 15.5 Z",
} as const;

/** Left secondary feathers (ls1–ls3). */
export const LEFT_SECONDARIES = {
  ls1: "M8 11.5 C6.5 9.5 6.5 8 7.5 7.5 C8.5 9 10 11 11 12.5 Z",
  ls2: "M12 13 C10.5 11 10 9.5 11 9 C12 10.5 13.5 12.5 14.5 14 Z",
  ls3: "M15.5 15 C14 13 13.5 11.5 14.5 11 C15.5 12.5 17 14.5 18 16 Z",
} as const;

/** Left covert feather (lc1). */
export const LEFT_COVERT =
  "M2.5 9.5 C1.8 8.2 1.5 7 2.2 6.5 C2.8 7.8 3.8 9.2 4.5 10.5 Z";

/** Left wing trailing-edge highlight. */
export const WING_LEFT_HIGHLIGHT =
  "M19 17.5 C15 15.5 10 14 6.5 11.5 C9 14 12.5 17 16.5 18.5 Z";

// ═══════════════════════════════════════════════════════════════════════════════
// BODY PATHS
// ═══════════════════════════════════════════════════════════════════════════════

/** Main neck stroke path (S-curve from body to head). */
export const NECK_MAIN      = "M18 16 C15 13 12 12 9 13.5";
/** Upper neck segment (first half of S-wave). */
export const NECK_SEG_1     = "M18 16 C16.5 14.5 14.5 13.5 13 13.2";
/** Lower neck segment (second half of S-wave). */
export const NECK_SEG_2     = "M13 13.2 C11.5 13.0 10.2 13.0 9 13.5";
/** Dorsal neck highlight (bright sheen on dorsal edge). */
export const NECK_TOP_SHEEN = "M18 15.2 C15 12.1 12 11.2 9.2 12.6";

/** Upper beak path. */
export const BEAK_UPPER = "M5.3 13.4 L2.2 14.25 L5.45 14.2 Z";
/** Lower beak path (animated chirp). */
export const BEAK_LOWER = "M5.45 14.2 L2.2 14.25 L5.6 15.1 Z";

/** Crown feather paths (4 = far-left background → 5 = far-right foreground). */
export const CROWN_PATHS: Record<1|2|3|4|5, string> = {
  4: "M5.8 11.0 C5.5 10.2 5.8 9.3 6.3 8.9 C6.5 9.7 6.2 10.6 6.1 11.4 Z",
  1: "M6.8 10.0 C6.6 9.2 7.0 8.4 7.6 8.0 C7.6 8.8 7.3 9.7 7.1 10.5 Z",
  2: "M7.8 9.6 C7.9 8.7 8.4 8.0 9.0 7.7 C8.8 8.5 8.5 9.4 8.3 10.2 Z",
  3: "M9.0 10.1 C9.4 9.2 9.9 8.5 10.4 8.3 C10.1 9.1 9.7 10.0 9.4 10.7 Z",
  5: "M10.2 10.5 C10.7 9.6 11.2 9.0 11.6 8.8 C11.4 9.6 11.0 10.4 10.7 11.2 Z",
};

/** Upper eyelid crescent (slides down on blink). */
export const EYELID_UPPER = "M6.6 11.85 Q7.1 11.45 7.6 11.85";
/** Lower eyelid counter-arc. */
export const EYELID_LOWER = "M6.7 12.55 Q7.1 12.95 7.5 12.55";
/** Nictitating membrane (third eyelid, horizontal sweep). */
export const NICTITATING  = "M6.7 12.1 Q7.1 11.9 7.5 12.1 Q7.1 13.2 6.7 13.2 Z";

/** Back dorsal path (hsl 32% lightness — shadow side). */
export const BACK_PATH =
  "M 14.5 22 A 5.5 7.5 0 0 1 25.5 22 C 24 16.5 16 16.5 14.5 22 Z";

/** Belly underside path. */
export const BELLY_PATH =
  "M 14.5 22 A 5.5 7.5 0 0 0 25.5 22 C 24 27.5 16 27.5 14.5 22 Z";

/** Left talon specular. */
export const TALON_LEFT =
  "M14.2 35.8 C13.6 36.5 13.4 37.0 13.8 37.1 C14.2 36.6 14.6 36.0 14.5 35.6 Z";

/** Right talon specular. */
export const TALON_RIGHT =
  "M25.8 35.8 C26.4 36.5 26.6 37.0 26.2 37.1 C25.8 36.6 25.4 36.0 25.5 35.6 Z";

// ═══════════════════════════════════════════════════════════════════════════════
// HEAD GEOMETRY
// ═══════════════════════════════════════════════════════════════════════════════

export const HEAD_CIRCLE = { cx: 8, cy: 13, r: 3.4 } as const;

export const EYE = {
  iris:       { cx: 7.1, cy: 12.2, r: 0.85 },
  limbal:     { cx: 7.1, cy: 12.2, r: 0.7  },
  pupil:      { cx: 7.1, cy: 12.2, r: 0.55 },
  glint1:     { cx: 7.4, cy: 11.95, r: 0.2 },
  catchlight: { cx: 7.6, cy: 11.85, r: 0.13 },
} as const;

export const BEAK = {
  upper: { d: "M5.3 13.4 L2.2 14.25 L5.45 14.2 Z" },
  lower: { d: "M5.45 14.2 L2.2 14.25 L5.6 15.1 Z" },
  gloss:  { cx: 4.1, cy: 13.55, r: 0.17 },
  glint:  { cx: 2.4, cy: 14.15, r: 0.18 },
  pivot:  { x: 5.45, y: 14.2 },
  tip:    { x: 2.2,  y: 14.25 },
} as const;

export const EGG = {
  circle:    { cx: 3.4, cy: 15.6, r: 1.45 },
  specular:  { cx: 2.85, cy: 14.95, r: 0.45 },
  ripple:    { cx: 3.4, cy: 15.6, r: 1.5 },
  orbitA:    { cx: 3.4, cy: 14.2, r: 0.22 },
  orbitB:    { cx: 3.4, cy: 17.0, r: 0.17 },
  thermalIn: { cx: 3.4, cy: 15.6, r: 0.60 },
  thermalMid:{ cx: 3.4, cy: 15.6, r: 0.98 },
  bankPivot: { x: 20, y: 24.8 },
} as const;

export const CROWN_TIPS = {
  2: { cx: 9.0,  cy: 7.6,  r: 0.22 },
  3: { cx: 10.4, cy: 8.2,  r: 0.18 },
  5: { cx: 11.6, cy: 8.7,  r: 0.16 },
} as const;

export const CHIRP_RINGS = [
  { r: 1.2, strokeW: 0.25 },
  { r: 1.2, strokeW: 0.18 },
  { r: 1.2, strokeW: 0.12 },
] as const;
