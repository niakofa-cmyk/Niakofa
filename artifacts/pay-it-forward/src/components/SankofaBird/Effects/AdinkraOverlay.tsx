import React from "react";

/**
 * Phase 22 LUMINARY EDITION — Adinkra / Kente trust-tier pattern overlays.
 *
 * Key addition: the Sankofa spiral from the original illustration
 * (public/sankofa-bird-illustration-reference.svg) is now woven into the
 * body as a symbolic cultural identity marker. At rest it's very subtle;
 * CSS trust-tier and celebration rules bring it forward.
 *
 * Three groups:
 *   sankofa-adinkra-covert  — upper wing band (trust tier: growing+)
 *   sankofa-adinkra-breast  — chest Kente dots (trust tier: trusted+)
 *   sankofa-adinkra-crown   — crown cross-knot (trust tier: elder)
 *
 * NEW in Phase 22:
 *   sankofa-adinkra-spiral  — Sankofa return spiral on body (always present,
 *                              very subtle at rest, brightens on celebration /
 *                              community milestones)
 *   sankofa-adinkra-wing-arc — subtle arc detail on wing surface (mid zoom+)
 */
export function AdinkraOverlay(): React.ReactElement {
  return (
    <>
      {/* ──────────────────────────────────────────────────────────────────
          SANKOFA SPIRAL — Cultural heart of the design
          Scaled from the illustration's 180px viewBox to the 40px bird space.
          The original: d="M85 108 Q92 100 100 108 Q108 116 100 124 Q92 132 84 124"
          Scaled to bird space (factor ~0.125): approx 10–13px x range, 13–16px y range
          Positioned on the body (cx≈20, cy≈22).
          ────────────────────────────────────────────────────────────────── */}
      <g className="sankofa-adinkra-spiral" style={{ opacity: 0.18 }}>
        {/* Outer spiral arc */}
        <path
          d="M17.5 22.0 Q19.0 20.2 20.5 22.0 Q22.0 23.8 20.5 25.5 Q19.0 27.2 17.4 25.5"
          stroke="#00D4FF"
          strokeWidth="0.32"
          fill="none"
          strokeLinecap="round"
          opacity={1}
        />
        {/* Inner spiral continuation — the "return" curve */}
        <path
          d="M17.8 25.2 Q18.5 26.4 19.5 25.8 Q20.8 25.0 20.2 23.8 Q19.6 22.8 18.8 23.2"
          stroke="#00C4EE"
          strokeWidth="0.22"
          fill="none"
          strokeLinecap="round"
          opacity={0.80}
        />
        {/* Center point of spiral — the returning bird's eye */}
        <circle cx="19.2" cy="23.5" r="0.22" fill="#00D4FF" opacity={0.65} />
      </g>

      {/* ──────────────────────────────────────────────────────────────────
          WING ARC — subtle flow lines on the wing surface (mid zoom+)
          These represent the "flowing curves" of the original illustration.
          CSS shows them at data-zoom="mid" / "high" / "street".
          ────────────────────────────────────────────────────────────────── */}
      <g className="sankofa-adinkra-wing-arc" style={{ opacity: 0 }}>
        {/* Right wing flow arc */}
        <path
          d="M22 17 C26 14.5 30 13 33 10.5"
          stroke="#00D4FF"
          strokeWidth="0.18"
          fill="none"
          strokeLinecap="round"
          opacity={0.45}
        />
        {/* Left wing flow arc */}
        <path
          d="M18 17 C14 14.5 10 13 7 10.5"
          stroke="#00D4FF"
          strokeWidth="0.18"
          fill="none"
          strokeLinecap="round"
          opacity={0.45}
        />
      </g>

      {/* ──────────────────────────────────────────────────────────────────
          COVERT ADINKRA DOTS — upper wing band (trust: growing+)
          Enhanced with #00D4FF / #00C4EE instead of solid gold only.
          ────────────────────────────────────────────────────────────────── */}
      <g className="sankofa-adinkra-covert" style={{ opacity: 0 }}>
        {/* Gold Adinkra dots (existing pattern) */}
        <circle cx="13.5" cy="15.5" r="0.28" fill="#E8C964" />
        <circle cx="15.5" cy="14.8" r="0.28" fill="#E8C964" />
        <circle cx="17.5" cy="15.2" r="0.28" fill="#E8C964" />
        <circle cx="19.5" cy="14.7" r="0.28" fill="#E8C964" />
        <circle cx="21.5" cy="15.5" r="0.28" fill="#E8C964" />
        <circle cx="14.5" cy="16.8" r="0.22" fill="#C8A840" />
        <circle cx="16.5" cy="16.4" r="0.22" fill="#C8A840" />
        <circle cx="18.5" cy="16.7" r="0.22" fill="#C8A840" />
        <circle cx="20.5" cy="16.3" r="0.22" fill="#C8A840" />
        {/* Cyan accent dots — iridescent Adinkra layer */}
        <circle cx="14.0" cy="15.0" r="0.14" fill="#00D4FF" opacity={0.55} />
        <circle cx="16.5" cy="15.0" r="0.14" fill="#00C4EE" opacity={0.50} />
        <circle cx="19.0" cy="14.6" r="0.14" fill="#00D4FF" opacity={0.55} />
        <circle cx="21.0" cy="15.2" r="0.14" fill="#00C4EE" opacity={0.50} />
      </g>

      {/* ──────────────────────────────────────────────────────────────────
          BREAST KENTE BAND — horizontal across chest (trust: trusted+)
          ────────────────────────────────────────────────────────────────── */}
      <g className="sankofa-adinkra-breast" style={{ opacity: 0 }}>
        <circle cx="15.0" cy="23.0" r="0.30" fill="#E8C964" />
        <circle cx="17.0" cy="22.5" r="0.30" fill="#E8C964" />
        <circle cx="19.0" cy="23.0" r="0.30" fill="#E8C964" />
        <circle cx="21.0" cy="22.5" r="0.30" fill="#E8C964" />
        <circle cx="23.0" cy="23.0" r="0.30" fill="#E8C964" />
        <circle cx="16.0" cy="24.3" r="0.22" fill="#C8A840" />
        <circle cx="18.0" cy="23.9" r="0.22" fill="#C8A840" />
        <circle cx="20.0" cy="24.3" r="0.22" fill="#C8A840" />
        <circle cx="22.0" cy="23.9" r="0.22" fill="#C8A840" />
        {/* Cyan iridescence between kente dots */}
        <circle cx="16.0" cy="22.8" r="0.12" fill="#00D4FF" opacity={0.45} />
        <circle cx="18.0" cy="22.4" r="0.12" fill="#00C4EE" opacity={0.42} />
        <circle cx="20.0" cy="22.8" r="0.12" fill="#00D4FF" opacity={0.45} />
        <circle cx="22.0" cy="22.4" r="0.12" fill="#00C4EE" opacity={0.42} />
      </g>

      {/* ──────────────────────────────────────────────────────────────────
          CROWN ADINKRA MOTIF — cross-knot at crest (trust: elder)
          ────────────────────────────────────────────────────────────────── */}
      <g className="sankofa-adinkra-crown" style={{ opacity: 0 }}>
        <circle cx="19.0" cy="9.5"  r="0.32" fill="#F5D98A" />
        <circle cx="20.5" cy="8.8"  r="0.32" fill="#F5D98A" />
        <circle cx="22.0" cy="9.3"  r="0.32" fill="#F5D98A" />
        <circle cx="20.5" cy="10.2" r="0.26" fill="#E8C964" />
        <line x1="19.0" y1="9.5" x2="22.0" y2="9.3" stroke="#F5D98A" strokeWidth="0.14" opacity={0.6} />
        <line x1="20.5" y1="8.8" x2="20.5" y2="10.2" stroke="#F5D98A" strokeWidth="0.14" opacity={0.6} />
        {/* Cyan accent ring around crown motif */}
        <circle cx="20.5" cy="9.2" r="0.65" fill="none" stroke="#00D4FF" strokeWidth="0.10" opacity={0.40} />
      </g>
    </>
  );
}
