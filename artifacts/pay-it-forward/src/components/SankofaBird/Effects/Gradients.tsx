import React from "react";
import { useBird } from "../Core/Context";

/**
 * All per-instance SVG gradient defs.
 *
 * Phase 22 LUMINARY UPDATE — merging illustration-bird color DNA into the
 * rigged anatomical bird.  Inspired by the original hand-composed Sankofa bird
 * (public/sankofa-bird-illustration-reference.svg) which used:
 *   • #0FE5D4 / #2B83AB as the official iridescent primary palette
 *   • multiple semi-transparent overlapping layers
 *   • luminous, dreamlike inner glow
 *
 * New gradients added in this update:
 *   iriFeatherGradId   — iridescent feather sheen (teal → cyan → emerald)
 *   featherGlowGradId  — leading-edge luminous highlight (pure #0FE5D4 glow)
 *   neckGradId         — neck luminosity gradient
 *   glowHaloId         — soft radial egg/body ambient halo
 *   bodyLuminaryId     — vibrant body overlay (the "from within" glow)
 *
 * Color palette (official + illustration DNA):
 *   Spec bright:         #0FE5D4  (hue 174 — official spec leading edge)
 *   Spec mid:            #2B83AB  (spec mid-wing)
 *   Spec deep:           #0D77AA → #095E5A → #062E2E
 *   Iridescent emerald:  hsl(156, 90%, 42%)
 */
export function Gradients(): React.ReactElement {
  const {
    eggGradId,
    eggGoldGradId,
    bodyGradId,
    wingGradLeftId,
    wingGradRightId,
  } = useBird();

  // Per-instance IDs for new luminary gradients
  // These are derived from the base IDs to stay unique per bird instance
  const iriFeatherGradId   = `${bodyGradId}-iri`;
  const iriCyanGradId      = `${bodyGradId}-iri-cyan`;
  const iriTurquoiseGradId = `${bodyGradId}-iri-turquoise`;
  const iriEmeraldGradId   = `${bodyGradId}-iri-emerald`;
  const featherGlowGradId  = `${bodyGradId}-glow`;
  const neckGradId         = `${bodyGradId}-neck`;
  const glowHaloId         = `${bodyGradId}-halo`;
  const bodyLuminaryId     = `${bodyGradId}-lum`;
  const wingCyanGradId     = `${wingGradLeftId}-cyan`;

  return (
    <>
      <defs>

        {/* ── Egg: luminous jade inner glow ──────────────────────────────────
            Richer than before — center is near-white to simulate the original
            illustration's "inner light" quality. */}
        <radialGradient id={eggGradId} cx="38%" cy="28%" r="68%" fx="32%" fy="22%">
          <stop offset="0%"   stopColor="#e8fffd" />
          <stop offset="20%"  stopColor="#0FE5D4" stopOpacity="0.9" />
          <stop offset="55%"  stopColor="hsl(174, 91%, 60%)" />
          <stop offset="100%" stopColor="hsl(178, 83%, 32%)" />
        </radialGradient>

        {/* ── Egg gold: celebration / donation state ─────────────────────── */}
        <radialGradient id={eggGoldGradId} cx="38%" cy="28%" r="68%" fx="32%" fy="22%">
          <stop offset="0%"   stopColor="#fff8d6" />
          <stop offset="35%"  stopColor="#ffe066" />
          <stop offset="100%" stopColor="#b87200" />
        </radialGradient>

        {/* ── Body: LUMINARY EDITION ─────────────────────────────────────────
            Merges spec gradient with illustration DNA.
            Bright #0FE5D4 at focal point (the chest "inner light"),
            transitions through spec teal, then to deep ocean.
            This recreates the original "glowing from within" quality. */}
        <radialGradient id={bodyGradId} cx="28%" cy="22%" r="80%" fx="18%" fy="12%">
          <stop offset="0%"   stopColor="#0FE5D4" stopOpacity="0.95" />
          <stop offset="15%"  stopColor="#0FE5D4" />
          <stop offset="35%"  stopColor="#2B83AB" />
          <stop offset="58%"  stopColor="#0D77AA" />
          <stop offset="80%"  stopColor="#095E5A" />
          <stop offset="100%" stopColor="#062E2E" />
        </radialGradient>

        {/* ── Body Luminary overlay: vibrant second radial for glass-like depth ──
            Sits OVER the body gradient at low opacity to add luminous mid-tones.
            Used by the sankofa-body-luminary-layer element. */}
        <radialGradient id={bodyLuminaryId} cx="40%" cy="30%" r="55%" fx="35%" fy="22%">
          <stop offset="0%"   stopColor="#0FE5D4" stopOpacity="0.45" />
          <stop offset="50%"  stopColor="#2B83AB" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#0FE5D4" stopOpacity="0" />
        </radialGradient>

        {/* ── Iridescent feather gradient: restrained structural color ───────
            Shifts teal → bright cyan → emerald at the feather edge.
            Applied to primary feather paths via sankofa-feather-iri class. */}
        <linearGradient id={iriFeatherGradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#0FE5D4" stopOpacity="0.92" />
          <stop offset="25%"  stopColor="#0FE5D4" stopOpacity="0.88" />
          <stop offset="55%"  stopColor="hsl(156, 90%, 42%)" stopOpacity="0.75" />
          <stop offset="82%"  stopColor="#2B83AB" stopOpacity="0.70" />
          <stop offset="100%" stopColor="#095E5A" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id={iriCyanGradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#0FE5D4" />
          <stop offset="52%"  stopColor="#22D3EE" stopOpacity="0.88" />
          <stop offset="100%" stopColor="#2B83AB" stopOpacity="0.72" />
        </linearGradient>
        <linearGradient id={iriTurquoiseGradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#0FE5D4" />
          <stop offset="52%"  stopColor="#14B8A6" stopOpacity="0.88" />
          <stop offset="100%" stopColor="#0D9488" stopOpacity="0.72" />
        </linearGradient>
        <linearGradient id={iriEmeraldGradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#2DD4BF" />
          <stop offset="52%"  stopColor="#10B981" stopOpacity="0.88" />
          <stop offset="100%" stopColor="#0F766E" stopOpacity="0.72" />
        </linearGradient>

        {/* ── Feather leading-edge glow: pure luminous #0FE5D4 radial ──────────
            Tiny radial at the feather tip — recreates the original illustration's
            "each feather glows at the edge" quality. */}
        <radialGradient id={featherGlowGradId} cx="50%" cy="10%" r="80%" fx="50%" fy="5%">
          <stop offset="0%"   stopColor="#0FE5D4" stopOpacity="0.80" />
          <stop offset="40%"  stopColor="#2B83AB" stopOpacity="0.40" />
          <stop offset="100%" stopColor="#0FE5D4" stopOpacity="0" />
        </radialGradient>

        {/* ── Left wing: LUMINARY EDITION ────────────────────────────────────
            Brighter leading edge (#0FE5D4) fades to deep teal.
            The illustration used a bright cyan on the wing body — we keep
            the structural gradient but boost the leading highlight significantly. */}
        <linearGradient id={wingGradLeftId} x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor="#0FE5D4" stopOpacity="0.95" />
          <stop offset="20%"  stopColor="#0FE5D4" stopOpacity="0.92" />
          <stop offset="55%"  stopColor="#0D77AA" stopOpacity="1" />
          <stop offset="100%" stopColor="#095E5A" stopOpacity="1" />
        </linearGradient>

        {/* ── Right wing: mirror of left ─────────────────────────────────── */}
        <linearGradient id={wingGradRightId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#0FE5D4" stopOpacity="0.95" />
          <stop offset="20%"  stopColor="#0FE5D4" stopOpacity="0.92" />
          <stop offset="55%"  stopColor="#0D77AA" stopOpacity="1" />
          <stop offset="100%" stopColor="#062E2E" stopOpacity="1" />
        </linearGradient>

        {/* ── Wing cyan highlight: pure luminous overlay for wing top surface ──
            Used by sankofa-wing-luminary-* paths at low opacity. */}
        <linearGradient id={wingCyanGradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#0FE5D4" stopOpacity="0.70" />
          <stop offset="35%"  stopColor="#2B83AB" stopOpacity="0.45" />
          <stop offset="70%"  stopColor="#0FE5D4" stopOpacity="0.20" />
          <stop offset="100%" stopColor="#0FE5D4" stopOpacity="0" />
        </linearGradient>

        {/* ── Neck gradient: luminous teal cylinder ──────────────────────── */}
        <linearGradient id={neckGradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#0FE5D4" stopOpacity="0.85" />
          <stop offset="45%"  stopColor="#0FE5D4" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#095E5A" stopOpacity="0.90" />
        </linearGradient>

        {/* ── Ambient halo: soft radial around egg / body center ─────────────
            Very subtle — just enough to recreate the original's "inner light."
            Used by sankofa-glow-halo element. */}
        <radialGradient id={glowHaloId} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#0FE5D4" stopOpacity="0.35" />
          <stop offset="50%"  stopColor="#0FE5D4" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#0FE5D4" stopOpacity="0" />
        </radialGradient>

        {/* ── Filter: soft luminous drop-shadow for feather tips ─────────────
            Recreates the "each feather edge glows" quality from the original. */}
        <filter id={`${bodyGradId}-feather-glow`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="0.5" result="blur" />
          <feColorMatrix in="blur" type="matrix"
            values="0 0 0 0 0
                    0.83 0 0 0 0.83
                    1 0 0 0 1
                    0 0 0 0.6 0" result="teal" />
          <feMerge>
            <feMergeNode in="teal" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* ── Filter: egg ambient pulse glow ─────────────────────────────── */}
        <filter id={`${bodyGradId}-egg-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" result="blur" />
          <feColorMatrix in="blur" type="matrix"
            values="0 0 0 0 0
                    0.83 0 0 0 0.83
                    1 0 0 0 1
                    0 0 0 0.5 0" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* ── Egg warm glow gradient (Phase 24) ──────────────────────────────
            Warm amber/gold radial for the egg warmglow element.
            Activates on helping / nearby-user / donated / accepted / celebrating.
            Centre: near-white warm gold; edge: transparent amber. */}
        <radialGradient id={`${bodyGradId}-egg-warm`} cx="40%" cy="30%" r="65%" fx="35%" fy="25%">
          <stop offset="0%"   stopColor="#fff8d0" stopOpacity="0.90" />
          <stop offset="30%"  stopColor="#f0b800" stopOpacity="0.70" />
          <stop offset="65%"  stopColor="#b87200" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#7a4800" stopOpacity="0" />
        </radialGradient>

        {/* ── Feather depth gradients (Phase 23) ─────────────────────────────
            "Lighter feather tips, darker feather bases, soft edge highlights."
            Each gradient runs tip→base (y1=0% bright → y2=100% deep teal),
            giving every primary feather genuine three-dimensional depth.
            The outer primaries (#00D4FF tip) are the brightest; inner feathers
            transition to deeper ocean teal at the base where they meet the wing.

            IDs derived from bodyGradId to stay per-instance unique:
              -fo  = feather outer (r5/r0/l5/l0 — outermost, brightest)
              -fm  = feather mid   (r1/r2/l1/l2)
              -fi  = feather inner (r3/r4/l3/l4)
              -fs  = feather secondary
        */}
        <linearGradient id={`${bodyGradId}-fo`} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%"   stopColor="#00D4FF" stopOpacity="0.96" />
          <stop offset="22%"  stopColor="#00C4EE" stopOpacity="0.93" />
          <stop offset="58%"  stopColor="#0FE5D4" stopOpacity="0.87" />
          <stop offset="100%" stopColor="#0D77AA" stopOpacity="0.80" />
        </linearGradient>
        <linearGradient id={`${bodyGradId}-fm`} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%"   stopColor="#00C4EE" stopOpacity="0.92" />
          <stop offset="38%"  stopColor="#0FE5D4" stopOpacity="0.84" />
          <stop offset="100%" stopColor="#095E5A" stopOpacity="0.76" />
        </linearGradient>
        <linearGradient id={`${bodyGradId}-fi`} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%"   stopColor="#0FE5D4" stopOpacity="0.86" />
          <stop offset="48%"  stopColor="#0D77AA" stopOpacity="0.77" />
          <stop offset="100%" stopColor="#095E5A" stopOpacity="0.66" />
        </linearGradient>
        <linearGradient id={`${bodyGradId}-fs`} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%"   stopColor="#00C4EE" stopOpacity="0.80" />
          <stop offset="55%"  stopColor="#0D9488" stopOpacity="0.68" />
          <stop offset="100%" stopColor="#095E5A" stopOpacity="0.58" />
        </linearGradient>

      </defs>
    </>
  );
}
