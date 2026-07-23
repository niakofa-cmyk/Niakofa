// Sankofa Bird CSS — barrel export + combined constant
// Single source of truth: edit phase files, not SankofaBirdSvg.tsx CSS directly.
// Renderer.tsx imports sankofaBirdCss from SankofaBird/Effects/Animations which
// re-exports from this module.

import { sankofaCssBase } from "./base";
import { sankofaCssPhase3to11 } from "./phase-3-11";
import { sankofaCssPhase12to13 } from "./phase-12-13";
import { sankofaCssPhase14to19 } from "./phase-14-19";
import { sankofaCssPhase20 } from "./phase-20";
import { sankofaCssPhase21 } from "./phase-21";
import { sankofaCssPhase22 } from "./phase-22";
import { sankofaCssPhase23 } from "./phase-23";
import { sankofaCssPhase24 } from "./phase-24";
import { sankofaCssPhase25 } from "./phase-25";

export { sankofaCssBase } from "./base";
export { sankofaCssPhase3to11 } from "./phase-3-11";
export { sankofaCssPhase12to13 } from "./phase-12-13";
export { sankofaCssPhase14to19 } from "./phase-14-19";
export { sankofaCssPhase20 } from "./phase-20";
export { sankofaCssPhase21 } from "./phase-21";
export { sankofaCssPhase22 } from "./phase-22";
export { sankofaCssPhase23 } from "./phase-23";
export { sankofaCssPhase24 } from "./phase-24";
export { sankofaCssPhase25 } from "./phase-25";

/** Full Sankofa Bird CSS — all 25 phases concatenated in correct order.
 *  Each phase file may be edited independently; this constant assembles them.
 *
 *  Phase history:
 *    base        — CSS reset, @property declarations, base keyframes
 *    phase-3-11  — Flight, landing, banking, gaze, night mode, LOD
 *    phase-12-13 — Real-time gaze (8-dir), full aerodynamics
 *    phase-14-19 — Mission rings, chirp, weather, trust tiers, P17 kinematics
 *    phase-20    — SME v2/v3 physics CSS (notification pulse, body roll, etc.)
 *    phase-21    — Wing/tail deformation (5+4 poses), back-diagonal, FV/BV SME drive
 *    phase-22    — LUMINARY EDITION: illustration DNA merge — controlled iridescent feathers,
 *                  luminous overlays, Sankofa spiral, dynamic lighting, egg glow,
 *                  cyan / turquoise / emerald structural color
 *    phase-23    — STRUCTURAL IRIDESCENCE: heading-reactive wing surface color shifts
 *                  (teal->cyan->emerald with direction), feather depth gradients
 *                  (tip bright / base dark), bank-triggered luminance burst, feather
 *                  cascade shimmer, resting ambient luminosity lift, gliding sweep
 *    phase-24    — PHOTONIC LIGHTING SYSTEM: directional feather brightening/deepening
 *                  with --lighting-factor, beak gold catchlight, egg warm glow on
 *                  meaningful states, neck luminosity + S-wave visibility, wing depth
 *                  segmentation (shoulder/forearm/primary), spherical body shading
 *    phase-25    — IRIDESCENCE DEPTH & ATMOSPHERIC RICHNESS: per-feather outer-to-inner
 *                  hue cascade (outer tips vivid / inner roots steady teal), iridescent
 *                  edge fill-swap activation, wing atmosphere third layer, body/head
 *                  heading-reactive colour unity, neck heading shimmer, beak metallic
 *                  gold-white catchlight, shadow-side feather depth
 */
export const sankofaBirdCss =
  sankofaCssBase +
  sankofaCssPhase3to11 +
  sankofaCssPhase12to13 +
  sankofaCssPhase14to19 +
  sankofaCssPhase20 +
  sankofaCssPhase21 +
  sankofaCssPhase22 +
  sankofaCssPhase23 +
  sankofaCssPhase24 +
  sankofaCssPhase25;
