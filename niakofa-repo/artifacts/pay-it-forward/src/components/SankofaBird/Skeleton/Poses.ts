/**
 * SankofaBird/Skeleton/Poses.ts
 *
 * 2.5D pose definitions for turnaround views — merged from poses/*.ts.
 * Each pose describes the SVG-level transform + perspective matrix + visibility
 * overrides for element groups.
 *
 * Phase 21 additions:
 *   BACK_LEFT_45  — Back 3/4 Left  (SE heading 112.5°–157.5°): bird heading
 *                   away and to the viewer's left; near wing is right dorsal.
 *   BACK_RIGHT_45 — Back 3/4 Right (SW heading 202.5°–247.5°): bird heading
 *                   away and to the viewer's right; near wing is left dorsal.
 *
 * The back-diagonal poses use a negative skew (compress the far wing) and
 * slightly raise the near wing to simulate the 3/4-behind perspective seen in
 * the official pipeline reference (SANKOFA_BIRD_PIPELINE_REF.png).
 */

/** Default / front-facing pose (identity transforms).
 *  This is the canonical reference pose all other poses derive from. */
export const FRONT = {
  name: "front",
  label: "Front",
  /** SVG-level transform applied to the root <g>. Empty = identity. */
  svgTransform: "",
  /** CSS matrix() for 2.5D projection. Empty = identity. */
  perspectiveMatrix: "",
  /** Opacity overrides for element groups. */
  visibility: {
    eye: 1, beak: 1, egg: 1, back: 0, belly: 0,
    wingLeft: 1, wingRight: 1,
  },
} as const;

/** Full back view (bird facing away).
 *  scaleX(-1) mirror + hide front-facing elements + reveal back dorsal. */
export const BACK = {
  name: "back",
  label: "Back",
  svgTransform: "scale(-1,1) translate(-40,0)",
  perspectiveMatrix: "matrix(-1,0,0,1,40,0)",
  visibility: {
    eye: 0.05, beak: 0.05, egg: 0.05, back: 0.8, belly: 0,
    wingLeft: 1, wingRight: 1,
  },
} as const;

/** Front 3/4 left view.
 *  Slight leftward skew perspective + right wing compressed. */
export const LEFT_45 = {
  name: "left-45",
  label: "Front 3/4 (Left)",
  svgTransform: "",
  perspectiveMatrix: "matrix(0.88,0,-0.12,1,3,0)",
  visibility: {
    eye: 1, beak: 1, egg: 1, back: 0, belly: 0,
    /** Right wing compressed to 55% of normal width. */
    wingLeft: 1,
    wingRight: 0.55,
  },
  wingRightScaleX: 0.55,
} as const;

/** Front 3/4 right view.
 *  Slight rightward skew perspective + left wing compressed. */
export const RIGHT_45 = {
  name: "right-45",
  label: "Front 3/4 (Right)",
  svgTransform: "",
  perspectiveMatrix: "matrix(0.88,0,0.12,1,-1,0)",
  visibility: {
    eye: 1, beak: 1, egg: 1, back: 0, belly: 0,
    wingLeft: 0.55,
    wingRight: 1,
  },
  wingLeftScaleX: 0.55,
} as const;

/**
 * Back 3/4 Left pose (SE heading: bird flies away + toward viewer's right).
 *
 * From SE, the viewer sees the bird's dorsal surface with the right dorsal
 * wing (near) slightly raised and the left dorsal wing (far) compressed.
 * The near wing gets a positive shear so it appears wider/closer.
 * matrix(a,b,c,d,e,f):
 *   a=0.90  — slight x-compress (foreshortening of horizontal span)
 *   b=0.05  — positive b = slight shear (near side of body slightly taller)
 *   c=-0.10 — negative c = perspective converge to right (far side shrinks)
 *   d=0.96  — slight y-shrink (bird slightly foreshortened vertically)
 *   e=1     — small horizontal shift
 *   f=0.5   — small vertical shift
 */
export const BACK_LEFT_45 = {
  name: "back-left-45",
  label: "Back 3/4 (Left)",
  svgTransform: "",
  perspectiveMatrix: "matrix(0.90,0.05,-0.10,0.96,1,0.5)",
  visibility: {
    eye: 0.04, beak: 0.04, egg: 0.04, back: 0.85, belly: 0,
    /** Near (right dorsal) wing at full; far (left dorsal) wing compressed. */
    wingLeft: 0.58,
    wingRight: 1,
  },
  /** The far-side (left) wing is compressed in x to simulate depth recession. */
  wingLeftScaleX: 0.58,
} as const;

/**
 * Back 3/4 Right pose (SW heading: bird flies away + toward viewer's left).
 *
 * Mirror of BACK_LEFT_45: the left dorsal wing (near) is prominent,
 * right dorsal wing (far) is compressed.
 * matrix(a,b,c,d,e,f):
 *   a=0.90  — slight x-compress
 *   b=-0.05 — negative b = shear mirrors (near side left)
 *   c=0.10  — positive c = perspective converge to left
 *   d=0.96  — slight y-shrink
 *   e=-1    — small horizontal shift (mirrored)
 *   f=0.5   — small vertical shift
 */
export const BACK_RIGHT_45 = {
  name: "back-right-45",
  label: "Back 3/4 (Right)",
  svgTransform: "",
  perspectiveMatrix: "matrix(0.90,-0.05,0.10,0.96,-1,0.5)",
  visibility: {
    eye: 0.04, beak: 0.04, egg: 0.04, back: 0.85, belly: 0,
    /** Near (left dorsal) wing at full; far (right dorsal) wing compressed. */
    wingLeft: 1,
    wingRight: 0.58,
  },
  wingRightScaleX: 0.58,
} as const;
