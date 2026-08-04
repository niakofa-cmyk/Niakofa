/**
 * SankofaBird/Anatomy/BackView.tsx
 *
 * Back-facing (south heading) Sankofa bird sprite.
 *
 * The viewer sees the dorsal (top) surface:
 *   • Dorsal wing surfaces spreading left ↔ right (darker than undersurface)
 *   • Dorsal body ridge (narrower than chest view)
 *   • Back of head / nape — small, mostly hidden
 *   • Scapular feathers on shoulders
 *   • Wide tail fan — the most prominent feature from behind
 *   • Legs visible when slow / grounded
 *
 * Wing-flap animations use classes sankofa-bv-wing-{left|right} driven by
 * CSS in base.ts; leg animations share .sankofa-leg-{left|right} selectors.
 */

import React, { useId } from "react";
import { useBird }      from "../Core/Context";

export function BackView(): React.ReactElement {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const { size, speedMs } = useBird();

  const legsDown = speedMs <= 10;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      overflow="visible"
      style={{ overflow: "visible" }}
      className="drop-shadow-[0_0_10px_rgba(0,212,255,0.9)] sankofa-bird-body sankofa-svg-root sankofa-back-view"
    >
      <defs>
        {/* Left wing dorsal surface (darker — dorsal feathers catch less light) */}
        <linearGradient id={`bv-wl-${uid}`} x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor="hsl(190,78%,40%)" />
          <stop offset="55%"  stopColor="hsl(188,65%,28%)" />
          <stop offset="100%" stopColor="hsl(186,50%,18%)" />
        </linearGradient>

        {/* Right wing dorsal surface */}
        <linearGradient id={`bv-wr-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="hsl(190,78%,40%)" />
          <stop offset="55%"  stopColor="hsl(188,65%,28%)" />
          <stop offset="100%" stopColor="hsl(186,50%,18%)" />
        </linearGradient>

        {/* Dorsal body */}
        <linearGradient id={`bv-body-${uid}`} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%"   stopColor="hsl(190,82%,42%)" />
          <stop offset="100%" stopColor="hsl(186,62%,24%)" />
        </linearGradient>

        {/* Tail fan gradient — root to iridescent tips */}
        <linearGradient id={`bv-tail-${uid}`} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%"   stopColor="hsl(190,88%,46%)" />
          <stop offset="55%"  stopColor="hsl(190,80%,38%)" />
          <stop offset="100%" stopColor="hsl(186,58%,20%)" />
        </linearGradient>
      </defs>

      {/* ═══════════════════════════════════════════════════════════════════
          WINGS — dorsal surface visible from behind
      ═══════════════════════════════════════════════════════════════════ */}

      {/* Left wing (dorsal) */}
      <g
        className="sankofa-bv-wing-left"
        style={{ transformBox: "view-box", transformOrigin: "20px 17px" } as React.CSSProperties}
      >
        {/* Main wing surface */}
        <path
          d="M20 17 C16 13 9 10 2 13 C6 12 13 17 20 21 Z"
          fill={`url(#bv-wl-${uid})`}
        />
        {/* Dorsal primary feather detail lines */}
        <line x1="20" y1="17.5" x2="8"  y2="11"   stroke="hsl(190,82%,56%)" strokeWidth="0.40" opacity="0.46"/>
        <line x1="20" y1="17.5" x2="5"  y2="13.5" stroke="hsl(190,78%,52%)" strokeWidth="0.34" opacity="0.38"/>
        <line x1="20" y1="18.5" x2="11" y2="12"   stroke="hsl(190,74%,48%)" strokeWidth="0.28" opacity="0.32"/>
        {/* Greater coverts leading-edge band */}
        <path
          d="M20 20 C16 17 11 15 7 16.5"
          fill="none"
          stroke="hsl(190,82%,52%)"
          strokeWidth="0.52"
          strokeLinecap="round"
          opacity="0.36"
        />
      </g>

      {/* Right wing (dorsal) */}
      <g
        className="sankofa-bv-wing-right"
        style={{ transformBox: "view-box", transformOrigin: "20px 17px" } as React.CSSProperties}
      >
        <path
          d="M20 17 C24 13 31 10 38 13 C34 12 27 17 20 21 Z"
          fill={`url(#bv-wr-${uid})`}
        />
        <line x1="20" y1="17.5" x2="32" y2="11"   stroke="hsl(190,82%,56%)" strokeWidth="0.40" opacity="0.46"/>
        <line x1="20" y1="17.5" x2="35" y2="13.5" stroke="hsl(190,78%,52%)" strokeWidth="0.34" opacity="0.38"/>
        <line x1="20" y1="18.5" x2="29" y2="12"   stroke="hsl(190,74%,48%)" strokeWidth="0.28" opacity="0.32"/>
        <path
          d="M20 20 C24 17 29 15 33 16.5"
          fill="none"
          stroke="hsl(190,82%,52%)"
          strokeWidth="0.52"
          strokeLinecap="round"
          opacity="0.36"
        />
      </g>

      {/* ═══════════════════════════════════════════════════════════════════
          BODY — dorsal ridge (narrower than chest view)
      ═══════════════════════════════════════════════════════════════════ */}
      <path
        d="M20 17 C22 18 23 22 22 27 C21 30 19 30 18 27 C17 22 18 18 20 17"
        fill={`url(#bv-body-${uid})`}
      />
      {/* Dorsal ridge centerline */}
      <line x1="20" y1="17.5" x2="20" y2="27" stroke="hsl(190,90%,58%)" strokeWidth="0.38" opacity="0.28"/>

      {/* ═══════════════════════════════════════════════════════════════════
          SCAPULARS — dorsal shoulder feathers visible from behind
      ═══════════════════════════════════════════════════════════════════ */}
      <path
        d="M18 17 C16 14 13 13 11 14"
        fill="none"
        stroke="hsl(190,82%,50%)"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.50"
      />
      <path
        d="M22 17 C24 14 27 13 29 14"
        fill="none"
        stroke="hsl(190,82%,50%)"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.50"
      />

      {/* ═══════════════════════════════════════════════════════════════════
          NAPE / BACK OF HEAD — barely visible from behind
      ═══════════════════════════════════════════════════════════════════ */}
      <path
        d="M18 15 C19 12.5 21 12.5 22 15 C21 16.8 19 16.8 18 15"
        fill="hsl(188,72%,32%)"
      />
      <line x1="20" y1="15" x2="20" y2="17" stroke="hsl(190,82%,54%)" strokeWidth="0.48" opacity="0.36"/>

      {/* ═══════════════════════════════════════════════════════════════════
          TAIL FAN — the primary visual feature from behind.
          7 radiating feather-axis lines from the tail base.
          Iridescent specular dots at the tips.
      ═══════════════════════════════════════════════════════════════════ */}
      <g className="sankofa-bv-tail">
        {/* Main tail fan surface */}
        <path
          d="M14 27 C12 31 11 35.5 14 38.5
             C16 37.5 18 35.5 20 36.5
             C22 35.5 24 37.5 26 38.5
             C29 35.5 28 31 26 27
             C24 31 21.5 33.5 20 33.5
             C18.5 33.5 16 31 14 27 Z"
          fill={`url(#bv-tail-${uid})`}
        />
        {/* Feather-axis center lines (7-feather fan) */}
        <line x1="20" y1="27.5" x2="20"   y2="37"   stroke="hsl(190,92%,66%)" strokeWidth="0.46" opacity="0.52"/>
        <line x1="20" y1="27.5" x2="16"   y2="36.5" stroke="hsl(190,86%,60%)" strokeWidth="0.40" opacity="0.44"/>
        <line x1="20" y1="27.5" x2="24"   y2="36.5" stroke="hsl(190,86%,60%)" strokeWidth="0.40" opacity="0.44"/>
        <line x1="20" y1="27.5" x2="12.5" y2="34"   stroke="hsl(190,80%,54%)" strokeWidth="0.34" opacity="0.36"/>
        <line x1="20" y1="27.5" x2="27.5" y2="34"   stroke="hsl(190,80%,54%)" strokeWidth="0.34" opacity="0.36"/>
        <line x1="20" y1="27.5" x2="11"   y2="31"   stroke="hsl(190,74%,50%)" strokeWidth="0.28" opacity="0.30"/>
        <line x1="20" y1="27.5" x2="29"   y2="31"   stroke="hsl(190,74%,50%)" strokeWidth="0.28" opacity="0.30"/>
        {/* Iridescent specular dots at feather tips */}
        <circle cx="14"  cy="38.5" r="0.58" fill="hsl(190,94%,68%)" opacity="0.34"/>
        <circle cx="26"  cy="38.5" r="0.58" fill="hsl(190,94%,68%)" opacity="0.34"/>
        <circle cx="20"  cy="37"   r="0.68" fill="hsl(190,96%,72%)" opacity="0.40"/>
        <circle cx="11.5" cy="31.5" r="0.44" fill="hsl(190,88%,62%)" opacity="0.26"/>
        <circle cx="28.5" cy="31.5" r="0.44" fill="hsl(190,88%,62%)" opacity="0.26"/>
      </g>

      {/* ═══════════════════════════════════════════════════════════════════
          LEGS — visible when slow; share CSS walking animation selectors
      ═══════════════════════════════════════════════════════════════════ */}
      {legsDown && (
        <g className="sankofa-bv-legs" opacity={speedMs < 0.5 ? 0.86 : 0.58}>
          <g
            className="sankofa-leg-left"
            style={{ transformBox: "view-box", transformOrigin: "18.5px 30px" } as React.CSSProperties}
          >
            <line x1="18.5" y1="30"   x2="16.5" y2="34"   stroke="hsl(190,70%,36%)" strokeWidth="1.2"  strokeLinecap="round"/>
            <line x1="16.5" y1="34"   x2="14.5" y2="35.5" stroke="hsl(190,70%,36%)" strokeWidth="0.85" strokeLinecap="round"/>
            <line x1="16.5" y1="34"   x2="16.2" y2="36.2" stroke="hsl(190,70%,36%)" strokeWidth="0.85" strokeLinecap="round"/>
            <line x1="16.5" y1="34"   x2="18.0" y2="35.4" stroke="hsl(190,70%,36%)" strokeWidth="0.85" strokeLinecap="round"/>
          </g>
          <g
            className="sankofa-leg-right"
            style={{ transformBox: "view-box", transformOrigin: "21.5px 30px" } as React.CSSProperties}
          >
            <line x1="21.5" y1="30"   x2="23.5" y2="34"   stroke="hsl(190,70%,36%)" strokeWidth="1.2"  strokeLinecap="round"/>
            <line x1="23.5" y1="34"   x2="25.5" y2="35.5" stroke="hsl(190,70%,36%)" strokeWidth="0.85" strokeLinecap="round"/>
            <line x1="23.5" y1="34"   x2="23.8" y2="36.2" stroke="hsl(190,70%,36%)" strokeWidth="0.85" strokeLinecap="round"/>
            <line x1="23.5" y1="34"   x2="22.0" y2="35.4" stroke="hsl(190,70%,36%)" strokeWidth="0.85" strokeLinecap="round"/>
          </g>
        </g>
      )}
    </svg>
  );
}
