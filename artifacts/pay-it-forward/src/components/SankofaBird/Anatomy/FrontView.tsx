/**
 * SankofaBird/Anatomy/FrontView.tsx
 *
 * Front-facing (north heading) Sankofa bird sprite.
 *
 * The viewer sees:
 *   • Wing undersurfaces spreading left ↔ right
 *   • Chest / belly (lighter teal, frontal lit)
 *   • Sankofa backward-head turned to the bird's right (viewer's upper-left)
 *   • Egg held in beak
 *   • Narrow tail tip at bottom (foreshortened)
 *   • Legs visible when slow / grounded
 *
 * Color palette consistent with the existing side-profile bird:
 *   Primary hue:  hsl(190, *, *)
 *   Bright:       hsl(190, 100%, 72–80%)
 *   Mid:          hsl(190, 90%,  48–56%)
 *   Shadow:       hsl(188, 64–80%, 24–32%)
 *
 * CSS animations (wing flap, float) are driven by the same CSS vars
 * set on .sankofa-bird-rig by Renderer.tsx, inherited through the DOM.
 */

import React, { useId } from "react";
import { useBird }      from "../Core/Context";

export function FrontView(): React.ReactElement {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const { size, speedMs, celebrating, donated } = useBird();

  // Legs drop when slower than fast running (~10 m/s).
  const legsDown   = speedMs <= 10;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      overflow="visible"
      style={{ overflow: "visible" }}
      className="drop-shadow-[0_0_10px_rgba(0,212,255,0.9)] sankofa-bird-body sankofa-svg-root sankofa-front-view"
    >
      <defs>
        {/* Chest — bright frontal highlight at center, deep shadow at rim */}
        <radialGradient id={`fv-chest-${uid}`} cx="50%" cy="34%" r="62%" fx="42%" fy="24%">
          <stop offset="0%"   stopColor="hsl(190,100%,76%)" />
          <stop offset="38%"  stopColor="hsl(190,100%,56%)" />
          <stop offset="100%" stopColor="hsl(188,80%,28%)" />
        </radialGradient>

        {/* Left wing undersurface: root bright → tip dark */}
        <linearGradient id={`fv-wl-${uid}`} x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor="hsl(190,92%,52%)" />
          <stop offset="52%"  stopColor="hsl(190,82%,38%)" />
          <stop offset="100%" stopColor="hsl(188,60%,22%)" />
        </linearGradient>

        {/* Right wing undersurface: root bright → tip dark */}
        <linearGradient id={`fv-wr-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="hsl(190,92%,52%)" />
          <stop offset="52%"  stopColor="hsl(190,82%,38%)" />
          <stop offset="100%" stopColor="hsl(188,60%,22%)" />
        </linearGradient>

        {/* Tail (narrow foreshortened strip) */}
        <linearGradient id={`fv-tail-${uid}`} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%"   stopColor="hsl(190,88%,44%)" />
          <stop offset="100%" stopColor="hsl(186,66%,24%)" />
        </linearGradient>

        {/* Head sphere */}
        <radialGradient id={`fv-head-${uid}`} cx="55%" cy="36%" r="60%">
          <stop offset="0%"   stopColor="hsl(190,96%,60%)" />
          <stop offset="100%" stopColor="hsl(188,74%,30%)" />
        </radialGradient>

        {/* Egg: jade-like jade inner glow (matches side-view egg gradient) */}
        <radialGradient id={`fv-egg-${uid}`} cx="38%" cy="28%" r="68%" fx="32%" fy="22%">
          <stop offset="0%"   stopColor="hsl(190,100%,90%)" />
          <stop offset="35%"  stopColor="hsl(190,100%,70%)" />
          <stop offset="100%" stopColor="hsl(190,85%,42%)"  />
        </radialGradient>

        {/* Egg gold: celebration / donation */}
        <radialGradient id={`fv-egg-gold-${uid}`} cx="38%" cy="28%" r="68%" fx="32%" fy="22%">
          <stop offset="0%"   stopColor="#fff8d6" />
          <stop offset="35%"  stopColor="#ffe066" />
          <stop offset="100%" stopColor="#b87200" />
        </radialGradient>
      </defs>

      {/* ═══════════════════════════════════════════════════════════════════
          WINGS  (undersurface visible from the front)
          Each wing group has class sankofa-fv-wing-{left|right} so the CSS
          in base.ts can animate them with the flap keyframe.
          transform-origin is set at the wing root (20px 18px) so rotations
          appear as natural wrist-driven beats.
      ═══════════════════════════════════════════════════════════════════ */}

      {/* Left wing */}
      <g
        className="sankofa-fv-wing-left"
        style={{ transformBox: "view-box", transformOrigin: "20px 18px" } as React.CSSProperties}
      >
        {/* Undersurface — crescent from wing root to tip */}
        <path
          d="M20 18 C16 14 9 11 2 14 C6 13 13 18 20 22 Z"
          fill={`url(#fv-wl-${uid})`}
        />
        {/* Primary feather edges */}
        <line x1="20" y1="19" x2="9"  y2="12"  stroke="hsl(190,96%,72%)" strokeWidth="0.42" opacity="0.48"/>
        <line x1="20" y1="19" x2="5"  y2="14"  stroke="hsl(190,96%,72%)" strokeWidth="0.38" opacity="0.42"/>
        <line x1="20" y1="20" x2="13" y2="13"  stroke="hsl(190,90%,68%)" strokeWidth="0.30" opacity="0.34"/>
        {/* Alula / carpal joint accent */}
        <circle cx="9.2" cy="12.6" r="0.55" fill="hsl(190,100%,66%)" opacity="0.48"/>
      </g>

      {/* Right wing */}
      <g
        className="sankofa-fv-wing-right"
        style={{ transformBox: "view-box", transformOrigin: "20px 18px" } as React.CSSProperties}
      >
        <path
          d="M20 18 C24 14 31 11 38 14 C34 13 27 18 20 22 Z"
          fill={`url(#fv-wr-${uid})`}
        />
        <line x1="20" y1="19" x2="31" y2="12"  stroke="hsl(190,96%,72%)" strokeWidth="0.42" opacity="0.48"/>
        <line x1="20" y1="19" x2="35" y2="14"  stroke="hsl(190,96%,72%)" strokeWidth="0.38" opacity="0.42"/>
        <line x1="20" y1="20" x2="27" y2="13"  stroke="hsl(190,90%,68%)" strokeWidth="0.30" opacity="0.34"/>
        <circle cx="30.8" cy="12.6" r="0.55" fill="hsl(190,100%,66%)" opacity="0.48"/>
      </g>

      {/* ═══════════════════════════════════════════════════════════════════
          BODY — chest / belly, radial lit from front-center
      ═══════════════════════════════════════════════════════════════════ */}
      <path
        d="M20 18 C23 20 25 25 23 30 C21 33 19 33 17 30 C15 25 17 20 20 18"
        fill={`url(#fv-chest-${uid})`}
      />
      {/* Subtle feather texture lines on belly */}
      <line x1="18.6" y1="23.5" x2="21.4" y2="23.5" stroke="hsl(190,100%,72%)" strokeWidth="0.28" opacity="0.20"/>
      <line x1="17.8" y1="26.5" x2="22.2" y2="26.5" stroke="hsl(190,100%,72%)" strokeWidth="0.28" opacity="0.16"/>

      {/* ═══════════════════════════════════════════════════════════════════
          TAIL — narrow foreshortened strip (leading edge only visible)
      ═══════════════════════════════════════════════════════════════════ */}
      <path
        d="M17 29 C18 33 19.5 36.5 20 37 C20.5 36.5 22 33 23 29"
        fill={`url(#fv-tail-${uid})`}
      />
      {/* Central tail feather axis */}
      <line x1="20" y1="29" x2="20" y2="37" stroke="hsl(190,96%,64%)" strokeWidth="0.36" opacity="0.40"/>

      {/* ═══════════════════════════════════════════════════════════════════
          NECK — Sankofa backward curve (bird's right = viewer's upper-left)
          Class sankofa-fv-neck so CSS can animate idle neck flex.
      ═══════════════════════════════════════════════════════════════════ */}
      <path
        className="sankofa-fv-neck"
        d="M20 17 C22 14 25.5 12 27.5 10.5"
        fill="none"
        stroke="hsl(190,100%,52%)"
        strokeWidth="3.0"
        strokeLinecap="round"
      />
      {/* Neck specular highlight */}
      <path
        d="M20.3 16.2 C22.3 13.2 25.2 11.2 27.2 9.8"
        fill="none"
        stroke="hsl(190,100%,82%)"
        strokeWidth="0.52"
        strokeLinecap="round"
        opacity="0.50"
      />

      {/* ═══════════════════════════════════════════════════════════════════
          HEAD — sphere, crown crest, eye, beak, egg
      ═══════════════════════════════════════════════════════════════════ */}
      <g className="sankofa-fv-head">

        {/* Head sphere */}
        <circle
          cx="28" cy="10.2" r="3.6"
          fill={`url(#fv-head-${uid})`}
          stroke="hsl(188,76%,32%)"
          strokeWidth="0.26"
        />

        {/* Crown crest — Sankofa bird's upswept crest feathers */}
        <path
          d="M26 7.2 C27 5.4 29 5.4 28.5 7.2"
          fill="hsl(190,100%,58%)"
        />
        {/* Crown tip shimmer */}
        <circle cx="27.6" cy="5.9" r="0.48" fill="hsl(190,100%,84%)" opacity="0.48"/>

        {/* Eye — iris + catchlight translate via SME eye vars written by useAnimationMixer.
            The CSS `translate` individual property composes additively with any existing
            `transform` on this element. Scale matches Head.tsx: 0.4 SVG unit → CSS px. */}
        <circle
          cx="29.6" cy="9.6" r="0.76"
          fill="hsl(210,20%,10%)"
          style={{ translate: "var(--sme-eye-x, 0px) var(--sme-eye-y, 0px)" } as React.CSSProperties}
        />
        <circle
          cx="29.85" cy="9.38" r="0.22"
          fill="white"
          opacity={0.84}
          style={{ translate: "var(--sme-eye-x, 0px) var(--sme-eye-y, 0px)" } as React.CSSProperties}
        />

        {/* Iridescent sheen on forehead */}
        <ellipse
          cx="26.8" cy="9.1"
          rx="1.3" ry="0.85"
          fill="hsl(200,90%,70%)"
          opacity="0.18"
          style={{ transform: "rotate(-14deg)", transformBox: "view-box", transformOrigin: "26.8px 9.1px" } as React.CSSProperties}
        />

        {/* ── Beak (pointing right/backward in Sankofa pose) ─────────────── */}
        <path d="M31 10.2 L33.6 8.4"  stroke="hsl(188,55%,34%)" strokeWidth="1.6" strokeLinecap="round" fill="none"/>
        <path d="M31 10.9 L33.6 9.4"  stroke="hsl(188,50%,26%)" strokeWidth="1.0" strokeLinecap="round" fill="none"/>
        <line x1="31.5" y1="9.9" x2="33.1" y2="8.7" stroke="hsl(190,80%,64%)" strokeWidth="0.30" opacity="0.44"/>

        {/* ── Egg held in beak ─────────────────────────────────────────── */}
        <ellipse
          cx="35.2" cy="7.9"
          rx="2.0" ry="1.5"
          fill={`url(#${(celebrating || donated) ? `fv-egg-gold-${uid}` : `fv-egg-${uid}`})`}
          stroke="hsl(190,60%,56%)"
          strokeWidth="0.36"
        />
        {/* Egg specular highlight */}
        <ellipse
          cx="34.5" cy="7.2"
          rx="0.82" ry="0.50"
          fill="white"
          opacity="0.42"
        />
      </g>

      {/* ═══════════════════════════════════════════════════════════════════
          LEGS — visible when slow (≤ 10 m/s); walking animation driven
          by CSS on .sankofa-leg-left / .sankofa-leg-right selectors.
          Same class names as Legs.tsx so the shared CSS applies to both.
      ═══════════════════════════════════════════════════════════════════ */}
      {legsDown && (
        <g className="sankofa-fv-legs" opacity={speedMs < 0.5 ? 0.90 : 0.62}>
          {/* Left leg */}
          <g
            className="sankofa-leg-left"
            style={{ transformBox: "view-box", transformOrigin: "18px 30px" } as React.CSSProperties}
          >
            <line x1="18"   y1="30"   x2="16.5" y2="34"   stroke="hsl(190,70%,36%)" strokeWidth="1.2" strokeLinecap="round"/>
            <line x1="16.5" y1="34"   x2="14.5" y2="35.5" stroke="hsl(190,70%,36%)" strokeWidth="0.85" strokeLinecap="round"/>
            <line x1="16.5" y1="34"   x2="16.2" y2="36.2" stroke="hsl(190,70%,36%)" strokeWidth="0.85" strokeLinecap="round"/>
            <line x1="16.5" y1="34"   x2="18.0" y2="35.4" stroke="hsl(190,70%,36%)" strokeWidth="0.85" strokeLinecap="round"/>
          </g>
          {/* Right leg */}
          <g
            className="sankofa-leg-right"
            style={{ transformBox: "view-box", transformOrigin: "22px 30px" } as React.CSSProperties}
          >
            <line x1="22"   y1="30"   x2="23.5" y2="34"   stroke="hsl(190,70%,36%)" strokeWidth="1.2" strokeLinecap="round"/>
            <line x1="23.5" y1="34"   x2="25.5" y2="35.5" stroke="hsl(190,70%,36%)" strokeWidth="0.85" strokeLinecap="round"/>
            <line x1="23.5" y1="34"   x2="23.8" y2="36.2" stroke="hsl(190,70%,36%)" strokeWidth="0.85" strokeLinecap="round"/>
            <line x1="23.5" y1="34"   x2="22.0" y2="35.4" stroke="hsl(190,70%,36%)" strokeWidth="0.85" strokeLinecap="round"/>
          </g>
        </g>
      )}
    </svg>
  );
}
