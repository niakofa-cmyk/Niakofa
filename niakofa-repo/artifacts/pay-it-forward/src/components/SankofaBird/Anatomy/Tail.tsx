import React from "react";

/**
 * Tail — Phase 22 LUMINARY EDITION
 *
 * The illustration bird's tail was three overlapping semi-transparent
 * ellipses at 0.85 / 0.75 / 0.70 opacity in #00D4FF / #00C4EE.
 * That language is brought back here:
 *   • Center rectrices: brighter fills, #00D4FF accent
 *   • Tail fan feathers: visible opacity (0.62–0.90 from center out)
 *   • NEW: luminary overlay — soft #00D4FF / #00C4EE translucent shape
 *     at the inner fan to recreate the overlapping-translucency look
 *   • Far rectrices get iridescent tip highlight paths (very subtle)
 *
 * Z-order: center base → center tip → inner tips → outer → far → luminary
 */
export function Tail(): React.ReactElement {
  return (
    <g
      className="sankofa-sme-tail-rig"
      style={{
        transformBox: "view-box",
        transformOrigin: "20px 24px",
        rotate: "var(--sme-tail-deg, 0deg)",
      } as React.CSSProperties}
    >
      {/* ── Center tail fan — base ─────────────────────────────────── */}
      <path
        className="sankofa-bird-tail sankofa-tail-center"
        d="M20 24 C17 30 15 34 12 37 C16 35.5 19 34.5 20 33 C21 34.5 24 35.5 28 37 C25 34 23 30 20 24 Z"
        fill="#00C4EE"
        opacity={0.88}
      />

      {/* ── Center tip rectrix ─────────────────────────────────────── */}
      <path
        className="sankofa-bird-tail sankofa-tail-center"
        d="M20 32 C19.5 34.5 20 36.5 20 38 C20.5 36.5 20.5 34.5 20 32 Z"
        fill="#00D4FF"
        opacity={0.85}
      />

      {/* ── Inner tip left — fans slightly wider than center on turns ── */}
      <path
        className="sankofa-bird-tail sankofa-tail-inner-left"
        d="M16.5 33.5 C15.5 35.5 14.5 37 13.5 38 C15 37 16.5 35.5 17 33.5 Z"
        fill="#0FE5D4"
        opacity={0.78}
        style={{
          transformBox: "view-box",
          transformOrigin: "17px 33.5px",
        } as React.CSSProperties}
      />

      {/* ── Inner tip right ────────────────────────────────────────── */}
      <path
        className="sankofa-bird-tail sankofa-tail-inner-right"
        d="M23.5 33.5 C24.5 35.5 25.5 37 26.5 38 C25 37 23.5 35.5 23 33.5 Z"
        fill="#0FE5D4"
        opacity={0.78}
        style={{
          transformBox: "view-box",
          transformOrigin: "23px 33.5px",
        } as React.CSSProperties}
      />

      {/* ── Outer left rectrix — fans ~2× inner spread on braking/turns */}
      <path
        className="sankofa-bird-tail sankofa-tail-outer-left"
        d="M13.5 34 C12 35.5 11 37 10 38.5 C11.5 37.5 13 36 14.5 34.5 Z"
        fill="hsl(174, 95%, 50%)"
        opacity={0.68}
        style={{
          transformBox: "view-box",
          transformOrigin: "14px 34px",
        } as React.CSSProperties}
      />

      {/* ── Outer right rectrix ────────────────────────────────────── */}
      <path
        className="sankofa-bird-tail sankofa-tail-outer-right"
        d="M26.5 34 C28 35.5 29 37 30 38.5 C28.5 37.5 27 36 25.5 34.5 Z"
        fill="hsl(174, 95%, 50%)"
        opacity={0.68}
        style={{
          transformBox: "view-box",
          transformOrigin: "26px 34px",
        } as React.CSSProperties}
      />

      {/* ── Far left rectrix — maximum fan spread; iridescent tip ───── */}
      <path
        className="sankofa-bird-tail sankofa-tail-far-left"
        d="M11.0 35.5 C9.5 37.5 8.5 39.0 7.5 40.0 C9.0 38.5 10.5 37.0 12.0 35.5 Z"
        fill="hsl(174, 90%, 48%)"
        opacity={0.55}
        style={{
          transformBox: "view-box",
          transformOrigin: "11px 35.5px",
        } as React.CSSProperties}
      />

      {/* ── Far right rectrix ──────────────────────────────────────── */}
      <path
        className="sankofa-bird-tail sankofa-tail-far-right"
        d="M29.0 35.5 C30.5 37.5 31.5 39.0 32.5 40.0 C31.0 38.5 29.5 37.0 28.0 35.5 Z"
        fill="hsl(174, 90%, 48%)"
        opacity={0.55}
        style={{
          transformBox: "view-box",
          transformOrigin: "29px 35.5px",
        } as React.CSSProperties}
      />

      {/* ── Tail luminary overlay — #00D4FF / #00C4EE translucent fan ──
          Two semi-transparent shapes overlapping the center fan.
          Directly replicates the illustration's layered-ellipse technique.
          The inner one (0.22 opacity) is always on; the outer (0.14) is subtle. */}
      <path
        className="sankofa-tail-luminary sankofa-tail-luminary-inner"
        d="M19 25 C17 30 15.5 33 13 36 C16.5 34.8 19 33.8 20 32.5 C21 33.8 23.5 34.8 27 36 C24.5 33 23 30 21 25 Z"
        fill="#00D4FF"
        opacity={0.22}
      />
      <path
        className="sankofa-tail-luminary sankofa-tail-luminary-outer"
        d="M18.5 26 C16 31 14 35.5 11.5 38 C15.5 36.5 18.5 35 20 33.5 C21.5 35 24.5 36.5 28.5 38 C26 35.5 24 31 21.5 26 Z"
        fill="#00C4EE"
        opacity={0.14}
      />

      {/* ── Iridescent far-tip highlights ────────────────────────────
          Tiny bright #00D4FF edges on the far rectrices — the prismatic
          feather-tip glow from the original illustration. */}
      <path
        className="sankofa-tail-iri-left"
        d="M11.0 35.5 C9.8 37.0 9.0 38.5 8.0 39.5 C9.2 38.2 10.5 36.8 11.8 35.5 Z"
        fill="#00D4FF"
        opacity={0.38}
      />
      <path
        className="sankofa-tail-iri-right"
        d="M29.0 35.5 C30.2 37.0 31.0 38.5 32.0 39.5 C30.8 38.2 29.5 36.8 28.2 35.5 Z"
        fill="#00D4FF"
        opacity={0.38}
      />
    </g>
  );
}
