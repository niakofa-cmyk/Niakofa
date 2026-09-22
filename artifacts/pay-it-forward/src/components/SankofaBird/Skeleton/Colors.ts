/**
 * SankofaBird/Skeleton/Colors.ts
 *
 * Canonical color palette for the Sankofa Bird.
 *
 * SOURCE OF TRUTH: Official SVG Asset Pipeline spec (ChatGPT_Image_Jul_20_2026)
 * All hex values are sampled directly from the spec's "Color Palette" and
 * "Gradient System" panels. Do NOT change these without updating the spec.
 *
 * Hex-to-HSL mapping (for reference when writing inline SVG / CSS):
 *   #0FE5D4 ≈ hsl(174, 91%, 47%)  — primary teal bright
 *   #2B83AB ≈ hsl(202, 60%, 42%)  — mid blue-teal
 *   #0D77AA ≈ hsl(203, 87%, 36%)  — deeper blue-teal
 *   #095E5A ≈ hsl(178, 83%, 20%)  — dark teal
 *   #062E2E ≈ hsl(180, 77%, 10%)  — very dark teal
 *   #041819 ≈ hsl(183, 72%,  6%)  — near-black teal
 *   #0A0F12 ≈ hsl(210, 26%,  6%)  — almost black
 */

// ── Official hex palette (from spec "Color Palette" panel) ───────────────────
export const HEX = {
  // Primary feather teal (bright face-up)
  teal_bright:   "#0FE5D4",  // hsl(174, 91%, 47%)
  // Mid-tone blue-teal (coverts, secondary feathers)
  teal_mid:      "#2B83AB",  // hsl(202, 60%, 42%)
  // Deeper blue-teal (primary feather undersides)
  teal_deep:     "#0D77AA",  // hsl(203, 87%, 36%)
  // Shadow teal (body underside, bract shadow)
  teal_shadow:   "#095E5A",  // hsl(178, 83%, 20%)
  // Dark teal (deep body shadow)
  teal_dark:     "#062E2E",  // hsl(180, 77%, 10%)
  // Near-black teal (beak, claws, leg tips)
  teal_nearblack:"#041819",  // hsl(183, 72%, 6%)
  // Black base (background fill, eye pupil)
  black:         "#0A0F12",  // hsl(210, 26%, 6%)
  // Covert (bottom layer — slightly blue-grey undertone)
  covert_bottom: "#2B2F32",
  // Egg highlight
  egg_highlight: "#D4F5F0",  // pale teal white
} as const;

// ── Primary teal palette (HSL — for use in inline SVG) ───────────────────────
// Hue updated from 190 (blue-cyan) to 174 (teal-green) to match official spec.
export const TEAL = {
  bright:   "hsl(174, 91%, 80%)",  // specular top / crown tip highlight
  light:    "hsl(174, 91%, 72%)",  // crown feather 5, chirp rings
  mid:      "hsl(174, 91%, 64%)",  // crown feather 2, neck highlight
  standard: "hsl(174, 85%, 55%)",  // primary feathers, head circle
  core:     "hsl(174, 91%, 47%)",  // #0FE5D4 — canonical primary teal
  warm:     "hsl(202, 60%, 42%)",  // #2B83AB — neck, covert mid
  medium:   "hsl(203, 87%, 36%)",  // #0D77AA — tail primary tips L/R
  deep:     "hsl(178, 83%, 20%)",  // #095E5A — wing gradient mid-shadow
  rich:     "hsl(178, 83%, 16%)",  // tail base shape
  leg:      "hsl(202, 60%, 36%)",  // legs, toes, talons
  body:     "hsl(178, 77%, 14%)",  // body gradient shadow edge
  dark:     "hsl(180, 77%, 10%)",  // #062E2E — deep body shadow
} as const;

// ── Feather-tip palette (outer / far feathers) ───────────────────────────────
export const FEATHER = {
  primary_r5:  "hsl(174, 95%, 78%)",  // outermost primary — lightest
  primary_r0:  "hsl(174, 91%, 64%)",
  primary_r1:  "hsl(174, 85%, 55%)",
  primary_r2:  "hsl(174, 82%, 50%)",
  primary_r3:  "hsl(174, 91%, 47%)",  // core teal
  primary_r4:  "hsl(202, 70%, 40%)",  // deeper blue-teal
  secondary_s: "hsl(174, 88%, 52%)",  // secondary feathers
  outer:       "hsl(202, 65%, 38%)",  // tail outer feathers
  far:         "hsl(203, 70%, 34%)",  // tail far feathers
  highlight:   "hsl(174, 95%, 82%)",  // wing trailing-edge highlight
  belly:       "hsl(178, 55%, 68%)",  // belly underside
} as const;

// ── Accent palette ────────────────────────────────────────────────────────────
export const ACCENT = {
  gold_egg:      "#ffe066",   // egg gold gradient mid (celebration state)
  gold_bright:   "#fff8d6",   // egg gold gradient highlight
  gold_deep:     "#b87200",   // egg gold gradient shadow
  gold_particle: "#f5d98a",   // golden donation sparkle particles
  iris_amber:    "hsl(32, 85%, 42%)",  // eye iris warm amber
  eye_dark:      "#04121a",   // pupil
  beak_upper:    "#1a2733",   // upper beak
  beak_lower:    "#121e29",   // lower beak
  limbal_band:   "hsl(178, 60%, 18%)", // iris inner limbal ring (updated hue)
} as const;

// ── Official gradient stops (from spec "Gradient System" panel) ───────────────
export const GRADIENT_STOPS = {
  // Major Feather Gradient: #0FE5D4 → #2B83AB → #0D77AA → #095E5A → #062E2E
  body: [
    { offset: "0%",   color: "#0FE5D4" },   // teal_bright
    { offset: "28%",  color: "#2B83AB" },   // teal_warm
    { offset: "55%",  color: "#0D77AA" },   // teal_medium
    { offset: "78%",  color: "#095E5A" },   // teal_deep
    { offset: "100%", color: "#062E2E" },   // teal_dark
  ],
  // Body Gradient: #2B83AB → #0D77AA → #095E5A
  bodyLinear: [
    { offset: "0%",   color: "#2B83AB" },
    { offset: "50%",  color: "#0D77AA" },
    { offset: "100%", color: "#095E5A" },
  ],
  egg: [
    { offset: "0%",   color: "hsl(174, 91%, 90%)" },
    { offset: "35%",  color: "hsl(174, 91%, 70%)" },
    { offset: "100%", color: "hsl(178, 83%, 42%)" },
  ],
  egg_gold: [
    { offset: "0%",   color: "#fff8d6" },
    { offset: "35%",  color: "#ffe066" },
    { offset: "100%", color: "#b87200" },
  ],
  // Wing Left: leading-edge highlight → trailing shadow (official palette)
  wing_left: [
    { offset: "0%",   color: "#0FE5D4", opacity: 0.9 },  // bright teal leading
    { offset: "45%",  color: "#0D77AA", opacity: 1   },  // deep blue-teal
    { offset: "100%", color: "#095E5A", opacity: 1   },  // shadow teal
  ],
  // Wing Right: mirror of left
  wing_right: [
    { offset: "0%",   color: "#0FE5D4", opacity: 0.9 },
    { offset: "45%",  color: "#0D77AA", opacity: 1   },
    { offset: "100%", color: "#062E2E", opacity: 1   },
  ],
} as const;

// ── Wing deformation pose names (from official spec "Wing Deformation Examples") ─
export type WingPose = "up" | "mid" | "down" | "forward" | "back";

// ── Tail deformation pose names (from official spec "Tail Deformation Examples") ─
export type TailPose = "flare" | "narrow" | "folded" | "stream";
