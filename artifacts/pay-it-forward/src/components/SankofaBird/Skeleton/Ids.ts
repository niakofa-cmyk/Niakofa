/**
 * SankofaBird/Skeleton/Ids.ts
 *
 * Canonical CSS class names and SVG element ID prefixes for the Sankofa Bird.
 * Centralised here so a rename is a single change, not a grep hunt.
 */

// ── Rig containers ────────────────────────────────────────────────────────────
export const CLS = {
  // DOM containers
  CONTAINER:     "sankofa-bird-container",
  TRAIL_WRAPPER: "sankofa-bird-trail-wrapper",
  RIG:           "sankofa-bird-rig",
  SVG_ROOT:      "sankofa-bird-body sankofa-svg-root",

  // Tail
  TAIL:              "sankofa-bird-tail",
  TAIL_CENTER:       "sankofa-tail-center",
  TAIL_OUTER_LEFT:   "sankofa-tail-outer-left",
  TAIL_OUTER_RIGHT:  "sankofa-tail-outer-right",
  TAIL_FAR_LEFT:     "sankofa-tail-far-left",
  TAIL_FAR_RIGHT:    "sankofa-tail-far-right",

  // Wings
  WING_RIGHT:         "sankofa-bird-wing-right",
  WING_RIGHT_BTM:     "sankofa-bird-wing-right-btm",
  WING_RIGHT_FEATHERS:"sankofa-bird-wing-right-feathers",
  WING_RIGHT_HL:      "sankofa-bird-wing-right-highlight",
  WING_LEFT:          "sankofa-bird-wing-left",
  WING_LEFT_BTM:      "sankofa-bird-wing-left-btm",
  WING_LEFT_FEATHERS: "sankofa-bird-wing-left-feathers",
  WING_LEFT_HL:       "sankofa-bird-wing-left-highlight",

  // Body
  BODY:         "sankofa-bird-body",
  CHEST:        "sankofa-bird-chest",
  BREAST_SHEEN: "sankofa-breast-sheen",
  BACK:         "sankofa-bird-back",
  BELLY:        "sankofa-bird-belly",
  BODY_FEATHER: "sankofa-body-feather",
  SHADOW:       "sankofa-bird-shadow",
  GLOW:         "sankofa-glow-layer",

  // Head
  NECK:       "sankofa-bird-neck",
  NECK_SEG:   "sankofa-neck-seg",
  NECK_SHEEN: "sankofa-neck-top-sheen",
  HEAD:       "sankofa-bird-head",
  CROWN:      "sankofa-crown-feather",
  CROWN_TIP:  "sankofa-crown-tip",
  IRIS:       "sankofa-bird-iris",
  EYE:        "sankofa-bird-eye",
  CATCHLIGHT: "sankofa-bird-eye-catchlight",
  EYELID:     "sankofa-bird-eyelid",
  LOWER_LID:  "sankofa-bird-lower-eyelid",
  NICTITATING:"sankofa-nictitating",
  BEAK_UPPER: "sankofa-bird-beak-upper",
  BEAK_LOWER: "sankofa-bird-beak-lower",
  BEAK_GLOSS: "sankofa-beak-gloss",
  BEAK_GLINT: "sankofa-beak-glint",
  CHIRP_RING: "sankofa-chirp-ring",
  EGG:        "sankofa-bird-egg",
  EGG_RIPPLE: "sankofa-egg-ripple",
  EGG_ORBIT:  "sankofa-egg-orbit",

  // Legs
  LEGS:          "sankofa-bird-legs",
  LEG_LEFT:      "sankofa-leg-left",
  LEG_RIGHT:     "sankofa-leg-right",
  TALON_LEFT:    "sankofa-talon-left",
  TALON_RIGHT:   "sankofa-talon-right",
  KNEE_JOINT:    "sankofa-knee-joint",

  // Effects
  IDLE_DUST:  "sankofa-idle-dust",
  WALK_DUST:  "sankofa-walk-dust",
  TRAIL:      "sankofa-trail",
  HEART_RING: "sankofa-heart-pulse",
  PARTICLE:   "sankofa-particle",
  SPARKLE:    "sankofa-golden-sparkle",
  MISSION:    "sankofa-mission-ripple",
  CHIRP_ARC:  "sankofa-chirp-arc-ring",
} as const;

/** Gradient ID prefix — actual IDs are `${PREFIX}-${uid}`. */
export const GRAD_PREFIX = {
  EGG:         "sk-egg",
  EGG_GOLD:    "sk-egg-gold",
  BODY:        "sk-body",
  WING_LEFT:   "sk-wl",
  WING_RIGHT:  "sk-wr",
} as const;
