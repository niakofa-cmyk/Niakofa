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
import { sankofaCssPhase26 } from "./phase-26";
import { sankofaCssPhase27 } from "./phase-27";

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
export { sankofaCssPhase26 } from "./phase-26";
export { sankofaCssPhase27 } from "./phase-27";

/** Full Sankofa Bird CSS — all 27 phases concatenated in correct order.
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
 *    phase-26    — LUMINOUS DEPTH & ORGANIC LIFE (v2 — cascade-conflict-fixed):
 *                  26.1 L/R organic asymmetry via animation keyframe peaks + scapular
 *                       brightness (no hue-rotate on feathers — conflict with P25 fixed)
 *                  26.2 Per-feather luminous breath: distinct R/L keyframes + periods
 *                       (sankofa-breath-outer-r/l, breath-mid-r/l, breath-inner,
 *                        breath-secondary-r/l) — wings never in phase
 *                  26.3 Full sky-lighting system (dorsal/belly/luminary/crown/beak)
 *                  26.4 Wing anatomy zone resting baseline + flight amplification
 *                       (scapulars/secondaries/coverts always-on depth — gap fixed)
 *                  26.5 Body depth: belly shadow + dorsal stripe + 4-tier tonal variation
 *                       (rows 1-3 bright, 4-6 mid, 7-9 transitional, 10-11 dark base)
 *                  26.6 Egg warm atmosphere (nearby/accepted + chest halo + halo pulse)
 *                  26.7 Tail fan luminosity breathing + landing ground-effect tip glow
 *                  26.8 Battery-saver + reduced-motion guards (includes rs3/ls3)
 *                  26.9 Atmosphere: overlapping transparent wing/body layers, softer
 *                       0.85-1.0s transitions, ambient baseline for all luminary elements
 *                  26.10 Iridescent highlights that shift with movement + banking lighting:
 *                        data-bank-dir (left/right/none at 8deg threshold), directional
 *                        wing luminary bright/shadow, scapular sky-catch, tail iri sweep,
 *                        dorsal brightening, breast reflected light, p26-bank-iri-dir keyframe
 *    phase-27    — LIVING FEATHERS & NATURAL LIGHT: night readability, slow
 *                  cyan/teal/turquoise/violet structural-color cycling, shoulder
 *                  and wingtip feather layers, reflected ambient light, organic
 *                  neck/eye overlays, aerodynamic lighting, Safari guards
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
  sankofaCssPhase25 +
  sankofaCssPhase26 +
  sankofaCssPhase27;
