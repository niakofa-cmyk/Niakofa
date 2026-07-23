import React from "react";
import { useBird } from "../Core/Context";

/**
 * Body — Phase 22 LUMINARY EDITION
 *
 * Merges the anatomical rig with the illustration-bird's visual DNA:
 *   • Main body ellipse keeps the spec radial gradient (now boosted with #00D4FF)
 *   • NEW: bodyLuminaryLayer — a second semi-transparent radial that creates
 *     the "glowing from within" quality of the original illustration
 *   • Body feathers now start at VISIBLE opacity (not 0) — layered translucency
 *     is the illustration's signature look
 *   • NEW: three cyan luminous overlay ellipses (opacity 0.20–0.35) to
 *     recreate the original's overlapping semi-transparent shape language
 *   • Breast sheen uses #00D4FF highlight at full brightness
 *
 * Z-order (bottom to top):
 *   body ellipse → back/belly paths → luminary overlay → body feathers → breast sheen
 */
export function Body(): React.ReactElement {
  const { bodyGradId } = useBird();

  // Derived IDs matching Gradients.tsx pattern
  const bodyLuminaryId  = `${bodyGradId}-lum`;
  const glowHaloId      = `${bodyGradId}-halo`;
  // Phase 26: new depth elements
  const bellyGradId     = `${bodyGradId}-belly`;
  const dorsalGradId    = `${bodyGradId}-dorsal`;
  const chestWarmGradId = `${bodyGradId}-chest-warm`;

  return (
    <>
      {/* ── Main body ellipse — spec gradient boosted with #00D4FF focal ── */}
      <ellipse
        className="sankofa-bird-chest"
        cx="20"
        cy="22"
        rx="6"
        ry="8"
        fill={`url(#${bodyGradId})`}
        stroke="#00D4FF"
        strokeWidth="0.30"
        strokeOpacity="0.45"
      />

      {/* ── Back dorsal sheen ──────────────────────────────────────────── */}
      <path
        className="sankofa-bird-back"
        d="M 14.5 22 A 5.5 7.5 0 0 1 25.5 22 C 24 16.5 16 16.5 14.5 22 Z"
        fill="hsl(190, 85%, 32%)"
        opacity={0}
        style={{ transformBox: "view-box", transformOrigin: "20px 22px" } as React.CSSProperties}
      />

      {/* ── Belly underside ───────────────────────────────────────────── */}
      <path
        className="sankofa-bird-belly"
        d="M 14.5 22 A 5.5 7.5 0 0 0 25.5 22 C 24 27.5 16 27.5 14.5 22 Z"
        fill="hsl(195, 55%, 72%)"
        opacity={0}
        style={{ transformBox: "view-box", transformOrigin: "20px 22px" } as React.CSSProperties}
      />

      {/* ── LUMINARY LAYER: semi-transparent #00D4FF overlay ─────────────
          Recreates the illustration's "glowing from within" quality.
          Two radial ellipses layered at different opacities — the same technique
          the original illustration used: full-opacity base + translucent overlays. */}
      <ellipse
        className="sankofa-body-luminary-layer"
        cx="19"
        cy="20"
        rx="4.5"
        ry="5.5"
        fill={`url(#${bodyLuminaryId})`}
        opacity={0.55}
      />

      {/* ── Cyan shimmer highlight — chest focal point ────────────────── */}
      <ellipse
        className="sankofa-body-cyan-shimmer"
        cx="18.5"
        cy="19"
        rx="2.8"
        ry="2.2"
        fill="#00D4FF"
        opacity={0.22}
      />

      {/* ── Wing-root luminous overlap (illustration style) ───────────── */}
      <ellipse
        className="sankofa-body-wing-glow"
        cx="20"
        cy="17.5"
        rx="5.5"
        ry="2.5"
        fill="#00C4EE"
        opacity={0.18}
        transform="rotate(-8 20 17.5)"
      />

      {/* ── Breast sheen — heading-reactive directional lighting ──────── */}
      <ellipse
        className="sankofa-breast-sheen"
        cx="19.5"
        cy="19.5"
        rx="3.5"
        ry="3"
        fill="#00D4FF"
        opacity={0}
      />

      {/* ── Body micro-feathers — LUMINARY EDITION ────────────────────────
          Key change from previous version: base opacity values are now VISIBLE
          (not 0). The illustration bird's magic came from showing overlapping
          semi-transparent feather shapes at rest — not hiding them until CSS
          triggers. CSS phase rules can still boost them further.

          Color progression: outer primaries use bright #00D4FF / #00C4EE,
          inner feathers transition to hsl(190,...) teal. */}

      {/* Upper-body feathers — row 1 */}
      <path
        className="sankofa-body-feather sankofa-body-feather-1"
        d="M18 19 C17.5 20.5 18 22.5 18.5 23.5 C18.8 22 18.5 20.5 18.8 19.5 Z"
        fill="#00D4FF"
        opacity={0.30}
      />
      <path
        className="sankofa-body-feather sankofa-body-feather-2"
        d="M20 19.5 C19.5 21 20 23 20.5 24 C20.8 22.5 20.5 21 20.8 20 Z"
        fill="#00C4EE"
        opacity={0.28}
      />
      <path
        className="sankofa-body-feather sankofa-body-feather-3"
        d="M22 19 C21.5 20.5 22 22.5 22.5 23.5 C22.8 22 22.5 20.5 22.8 19.5 Z"
        fill="#00D4FF"
        opacity={0.25}
      />

      {/* Lower-body feathers — row 2 */}
      <path
        className="sankofa-body-feather sankofa-body-feather-4"
        d="M17.0 22.0 C16.7 23.5 17.1 25.0 17.8 26.0 C18.0 24.5 17.7 23.0 18.0 22.5 Z"
        fill="hsl(190, 100%, 62%)"
        opacity={0.22}
      />
      <path
        className="sankofa-body-feather sankofa-body-feather-5"
        d="M20.5 21.5 C20.2 23.0 20.6 24.5 21.2 25.5 C21.5 24.0 21.2 22.5 21.5 22.0 Z"
        fill="hsl(190, 100%, 60%)"
        opacity={0.22}
      />
      <path
        className="sankofa-body-feather sankofa-body-feather-6"
        d="M23.0 22.0 C22.7 23.5 23.1 25.0 23.7 26.0 C24.0 24.5 23.7 23.0 24.0 22.5 Z"
        fill="hsl(190, 90%, 58%)"
        opacity={0.20}
      />

      {/* Micro-feather row 3 */}
      <path
        className="sankofa-body-feather sankofa-body-feather-7"
        d="M16.5 20.0 C16.2 21.2 16.8 22.5 17.5 23.5 C17.8 22.0 17.5 20.8 17.8 20.2 Z"
        fill="hsl(188, 90%, 65%)"
        opacity={0.18}
      />
      <path
        className="sankofa-body-feather sankofa-body-feather-8"
        d="M19.0 18.5 C18.7 19.8 19.2 21.2 19.8 22.2 C20.1 20.8 19.8 19.5 20.1 18.8 Z"
        fill="#00D4FF"
        opacity={0.20}
      />
      <path
        className="sankofa-body-feather sankofa-body-feather-9"
        d="M21.8 19.0 C21.5 20.2 22.0 21.5 22.6 22.5 C22.9 21.0 22.6 19.8 22.8 19.2 Z"
        fill="hsl(192, 88%, 63%)"
        opacity={0.18}
      />

      {/* Bottom feathers */}
      <path
        className="sankofa-body-feather sankofa-body-feather-10"
        d="M18.2 25.0 C17.9 26.2 18.4 27.5 19.0 28.5 C19.3 27.0 19.0 25.8 19.2 25.2 Z"
        fill="hsl(190, 92%, 60%)"
        opacity={0.15}
      />
      <path
        className="sankofa-body-feather sankofa-body-feather-11"
        d="M21.0 25.5 C20.7 26.7 21.2 28.0 21.8 29.0 C22.1 27.5 21.8 26.2 22.0 25.7 Z"
        fill="hsl(190, 87%, 57%)"
        opacity={0.15}
      />

      {/* ── Ambient glow halo (egg-area / chest) ─────────────────────────
          Very subtle — recreates the original's softly glowing center. */}
      <ellipse
        className="sankofa-body-glow-halo"
        cx="3.4"
        cy="15.6"
        rx="3.2"
        ry="3.2"
        fill={`url(#${glowHaloId})`}
        opacity={0.40}
      />

      {/* ── Phase 26: Belly shadow ellipse ─────────────────────────────────
          Dark semi-transparent radial over the lower body — the belly that
          falls into the shadow of the wings during flight. Hidden at rest;
          CSS activates it (sankofa-belly-shadow) when data-flying="true".
          The gradient runs dark-at-centre → transparent-at-edge so it
          blends naturally with the body gradient underneath. */}
      <ellipse
        className="sankofa-belly-shadow"
        cx="20"
        cy="25"
        rx="5.5"
        ry="4.5"
        fill={`url(#${bellyGradId})`}
        opacity={0}
        style={{ pointerEvents: "none" } as React.CSSProperties}
      />

      {/* ── Phase 26: Dorsal highlight stripe ─────────────────────────────
          Slim luminous path across the upper back — the sky-light catch on
          the dorsal surface during flight. Hidden at rest; CSS activates it
          (sankofa-dorsal-hi) when data-flying="true". Runs as a narrow
          ellipse along the top arc of the body. */}
      <ellipse
        className="sankofa-dorsal-hi"
        cx="20"
        cy="16.5"
        rx="5.0"
        ry="1.4"
        fill={`url(#${dorsalGradId})`}
        opacity={0}
        transform="rotate(-5 20 16.5)"
        style={{ pointerEvents: "none" } as React.CSSProperties}
      />

      {/* ── Phase 26: Chest warmth halo ────────────────────────────────────
          Warm amber/gold radial that blooms outward from the chest on
          meaningful community moments (helping, celebrating, donated).
          CSS class sankofa-chest-warmth controls visibility.
          Larger than the egg warmglow — body-scale, not egg-scale. */}
      <ellipse
        className="sankofa-chest-warmth"
        cx="19"
        cy="20"
        rx="6.5"
        ry="6"
        fill={`url(#${chestWarmGradId})`}
        opacity={0}
        style={{ pointerEvents: "none" } as React.CSSProperties}
      />
    </>
  );
}
