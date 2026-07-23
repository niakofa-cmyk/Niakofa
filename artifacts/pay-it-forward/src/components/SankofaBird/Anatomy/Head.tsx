/**
 * SankofaBird/Anatomy/Head.tsx — Phase 24 PHOTONIC LIGHTING EDITION
 *
 * Phase 22 LUMINARY additions:
 *   • HeadSphere: richer gradient feel using #00D4FF stroke; larger glow
 *   • Neck: luminary overlay adds semi-transparent #00D4FF sheen over the neck stroke
 *   • Crest: crown feathers now start at VISIBLE opacity (0.35–0.55)
 *   • Eye: warm amber iris unchanged; catchlight brighter
 *   • Beak: beak-gloss made slightly more visible
 *
 * Phase 24 PHOTONIC additions:
 *   • Neck: dynamic cubic-bezier path (.sankofa-neck-dynamic) + halo element
 *     written every rAF frame by useAnimationMixer.ts for genuine S-curve flex.
 *     Static segments carry .sankofa-neck-static class so JS can hide them
 *     once the dynamic path takes over. Falls back cleanly on battery-saver.
 *   • Beak: gold catchlight path (.sankofa-beak-catchlight) along the upper
 *     beak ridge — warm amber, driven by CSS --lighting-factor + heading quadrant.
 *   • Egg: warm glow halo (.sankofa-egg-warmglow) using the -egg-warm radial
 *     gradient — pulses amber on helping/nearby/donated/accepted/celebrating.
 *
 * Exports: Neck, HeadSphere, Crest, Eye, Beak, ChirpRings, Egg
 */

import React from "react";
import { useBird } from "../Core/Context";

// ─────────────────────────────────────────────────────────────────────────────
// NECK
// ─────────────────────────────────────────────────────────────────────────────

export function Neck(): React.ReactElement {
  const { bodyGradId } = useBird();
  const neckGradId = `${bodyGradId}-neck`;

  // Two-segment Bezier neck — lower bone (body→mid) + upper bone (mid→head).
  // Each bone rotates at its own pivot point, driven by the MotionSolver vars
  // --sme-neck-lower-deg (banking / body-roll) and --sme-neck-upper-deg
  // (head-lead / gaze vertical tilt).  Junction point: (13, 13.1).
  //
  // Phase 24: a third element — .sankofa-neck-dynamic — is a cubic-bezier path
  // whose control points are computed every rAF frame in useAnimationMixer.ts,
  // producing a genuine S-curve that bends toward where the bird is looking.
  // When the rAF loop is running, JS sets opacity=1 on .sankofa-neck-dynamic and
  // opacity=0 on .sankofa-neck-static (the two static segments below), so the
  // dynamic path fully replaces them.  If JS is disabled or battery-saver is on,
  // the static segments remain as a clean fallback.

  return (
    <>
      {/* ── Dynamic cubic-bezier neck (Phase 24) ──────────────────────────
          Written every rAF frame by useAnimationMixer.ts.
          Starts at opacity 0; JS sets it to 1 once the loop runs.
          The halo path is a wider, blurred copy for depth. */}
      <path
        className="sankofa-neck-dynamic-halo"
        d="M18 16 Q 13 13.1 8 13"
        fill="none"
        stroke="#0FE5D4"
        strokeWidth="5.2"
        strokeLinecap="round"
        opacity={0}
        style={{ pointerEvents: "none" } as React.CSSProperties}
      />
      <path
        className="sankofa-neck-dynamic"
        d="M18 16 Q 13 13.1 8 13"
        fill="none"
        stroke="#0FE5D4"
        strokeWidth="3.2"
        strokeLinecap="round"
        opacity={0}
      />

      {/* ── Static lower neck bone (fallback / battery-saver) ────────────
          Class sankofa-neck-static is used by JS to hide these when the
          dynamic path takes over. */}
      <path
        className="sankofa-bird-neck sankofa-neck-lower-seg sankofa-neck-static"
        d="M18 16 C16 14.5 14.5 13.7 13 13.1"
        fill="none"
        stroke="#0FE5D4"
        strokeWidth="3.4"
        strokeLinecap="round"
        style={{
          transformBox: "view-box",
          transformOrigin: "18px 16px",
          rotate: "var(--sme-neck-lower-deg, 0deg)",
        } as React.CSSProperties}
      />
      {/* Lower neck luminary glow */}
      <path
        className="sankofa-neck-luminary sankofa-neck-static"
        d="M18 16 C16 14.5 14.5 13.7 13 13.1"
        fill="none"
        stroke="#0FE5D4"
        strokeWidth="4.8"
        strokeLinecap="round"
        opacity={0.18}
        style={{
          transformBox: "view-box",
          transformOrigin: "18px 16px",
          rotate: "var(--sme-neck-lower-deg, 0deg)",
        } as React.CSSProperties}
      />

      {/* ── Static upper neck bone (fallback / battery-saver) ────────────── */}
      <path
        className="sankofa-bird-neck sankofa-neck-upper-seg sankofa-neck-static"
        d="M13 13.1 C11.5 12.7 10.2 12.5 9 13.5"
        fill="none"
        stroke="#0FE5D4"
        strokeWidth="3.0"
        strokeLinecap="round"
        style={{
          transformBox: "view-box",
          transformOrigin: "13px 13.1px",
          rotate: "var(--sme-neck-upper-deg, 0deg)",
        } as React.CSSProperties}
      />
      {/* Upper neck sheen + secondary luminary */}
      <path
        className="sankofa-neck-luminary sankofa-neck-luminary-2 sankofa-neck-static"
        d="M13 13.1 C11.5 12.7 10.2 12.5 9 13.5"
        fill="none"
        stroke="#00C4EE"
        strokeWidth="2.0"
        strokeLinecap="round"
        opacity={0.35}
        style={{
          transformBox: "view-box",
          transformOrigin: "13px 13.1px",
          rotate: "var(--sme-neck-upper-deg, 0deg)",
        } as React.CSSProperties}
      />
      <path
        className="sankofa-neck-top-sheen sankofa-neck-static"
        d="M13 12.3 C11.5 11.9 10.2 11.7 9.2 12.6"
        fill="none"
        stroke="#0FE5D4"
        strokeWidth="0.55"
        strokeLinecap="round"
        opacity={0.45}
        style={{
          transformBox: "view-box",
          transformOrigin: "13px 13.1px",
          rotate: "var(--sme-neck-upper-deg, 0deg)",
        } as React.CSSProperties}
      />

      {/* ── S-wave overlay segments — articulate with their parent bone ── */}
      <path
        className="sankofa-neck-seg sankofa-neck-seg-1"
        d="M18 16 C16.5 14.5 14.5 13.5 13 13.2"
        fill="none"
        stroke="#0FE5D4"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity={0}
        style={{
          transformBox: "view-box",
          transformOrigin: "18px 16px",
          rotate: "var(--sme-neck-lower-deg, 0deg)",
        } as React.CSSProperties}
      />
      <path
        className="sankofa-neck-seg sankofa-neck-seg-2"
        d="M13 13.2 C11.5 13.0 10.2 13.0 9 13.5"
        fill="none"
        stroke="#00C4EE"
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity={0}
        style={{
          transformBox: "view-box",
          transformOrigin: "13px 13.1px",
          rotate: "var(--sme-neck-upper-deg, 0deg)",
        } as React.CSSProperties}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HEAD SPHERE
// ─────────────────────────────────────────────────────────────────────────────

export function HeadSphere(): React.ReactElement {
  const { celebrating } = useBird();
  return (
    <>
      {/* ── Head sphere — #00D4FF base ──────────────────────────────── */}
      <circle
        cx="8"
        cy="13"
        r="3.4"
        fill={celebrating ? "#00D4FF" : "hsl(190, 100%, 55%)"}
        stroke="#00D4FF"
        strokeWidth="0.4"
        strokeOpacity={celebrating ? 0.9 : 0.55}
      />

      {/* ── Head luminary overlay — the illustration's "glowing head" ──
          A second semi-transparent #00D4FF circle over the head sphere.
          Very subtle at rest; CSS can boost it during celebration. */}
      <circle
        className="sankofa-head-luminary"
        cx="8"
        cy="12.5"
        r="2.8"
        fill="#00D4FF"
        opacity={celebrating ? 0.35 : 0.15}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CREST
// ─────────────────────────────────────────────────────────────────────────────

export function Crest(): React.ReactElement {
  return (
    <>
      {/* ── Crown feathers — LUMINARY EDITION ────────────────────────────
          Key change: base opacity is now 0.35–0.55 (not 0).
          The illustration bird always showed its crown feathers — they were
          part of the resting visual identity, not just a triggered state.
          CSS phase rules still boost them further on activity triggers. */}

      <path
        className="sankofa-crown-feather sankofa-crown-feather-4"
        d="M5.8 11.0 C5.5 10.2 5.8 9.3 6.3 8.9 C6.5 9.7 6.2 10.6 6.1 11.4 Z"
        fill="#00C4EE"
        opacity={0.40}
        style={{ transformBox: "view-box", transformOrigin: "6.1px 11.4px" } as React.CSSProperties}
      />
      <path
        className="sankofa-crown-feather sankofa-crown-feather-1"
        d="M6.8 10.0 C6.6 9.2 7.0 8.4 7.6 8.0 C7.6 8.8 7.3 9.7 7.1 10.5 Z"
        fill="#00D4FF"
        opacity={0.50}
        style={{ transformBox: "view-box", transformOrigin: "7.1px 10.5px" } as React.CSSProperties}
      />
      <path
        className="sankofa-crown-feather sankofa-crown-feather-2"
        d="M7.8 9.6 C7.9 8.7 8.4 8.0 9.0 7.7 C8.8 8.5 8.5 9.4 8.3 10.2 Z"
        fill="#00D4FF"
        opacity={0.55}
        style={{ transformBox: "view-box", transformOrigin: "8.3px 10.2px" } as React.CSSProperties}
      />
      <path
        className="sankofa-crown-feather sankofa-crown-feather-3"
        d="M9.0 10.1 C9.4 9.2 9.9 8.5 10.4 8.3 C10.1 9.1 9.7 10.0 9.4 10.7 Z"
        fill="#00D4FF"
        opacity={0.52}
        style={{ transformBox: "view-box", transformOrigin: "9.4px 10.7px" } as React.CSSProperties}
      />
      <path
        className="sankofa-crown-feather sankofa-crown-feather-5"
        d="M10.2 10.5 C10.7 9.6 11.2 9.0 11.6 8.8 C11.4 9.6 11.0 10.4 10.7 11.2 Z"
        fill="#00C4EE"
        opacity={0.42}
        style={{ transformBox: "view-box", transformOrigin: "10.7px 11.2px" } as React.CSSProperties}
      />

      {/* ── Crown-tip specular catchlights ─────────────────────────────── */}
      <circle
        className="sankofa-crown-tip sankofa-crown-tip-2"
        cx="9.0" cy="7.6" r="0.22"
        fill="white"
        opacity={0.70}
      />
      <circle
        className="sankofa-crown-tip sankofa-crown-tip-3"
        cx="10.4" cy="8.2" r="0.18"
        fill="white"
        opacity={0.65}
      />
      <circle
        className="sankofa-crown-tip sankofa-crown-tip-5"
        cx="11.6" cy="8.7" r="0.16"
        fill="white"
        opacity={0.60}
      />

      {/* ── Crown luminary glow — ambient cyan at feather bases ────────── */}
      <ellipse
        className="sankofa-crown-luminary"
        cx="8.2" cy="10.2"
        rx="2.8" ry="1.2"
        fill="#00D4FF"
        opacity={0.12}
        transform="rotate(-20 8.2 10.2)"
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EYE
// ─────────────────────────────────────────────────────────────────────────────

export function Eye(): React.ReactElement {
  return (
    <>
      {/*
       * Eye architecture:
       *
       *  sankofa-eye-scan-group  — slow 16-second micro-scan (CSS transform).
       *    Inside it: iris, limbal-ring, pupil, catchlights.
       *    The scan group moves the WHOLE eye assembly ≈ ±1.2 SVG px (≈ 2px
       *    rendered) in any direction on a slow irregular cycle, simulating the
       *    constant low-amplitude scanning real birds do between saccades.
       *
       *  --sme-eye-x / --sme-eye-y  (written by useAnimationMixer rAF loop)
       *    Applied as CSS `translate` on iris, pupil, and catchlight INSIDE the
       *    group — so the gaze direction shifts those elements within the group
       *    while the group itself handles the micro-scan drift.
       *
       *  The limbal ring (r=0.7) has no translate — fixed inside the scan group,
       *    it still acts as an edge clamp for over-travel because it is smaller
       *    than the iris (r=0.85) and renders on top of it.
       *
       *  Primary corneal glint stays outside the scan group — a fixed specular
       *    highlight that doesn't move regardless of gaze, matching real corneal
       *    reflections which are independent of pupil position.
       */}

      {/* Fixed corneal glint — real corneal reflection doesn't move with pupil */}
      <circle cx="7.4" cy="11.95" r="0.2" fill="white" opacity={0.9} />

      {/* Scan group — whole-eye micro-drift, ~2px, 16s irregular period */}
      <g
        className="sankofa-eye-scan-group"
        style={{ transformBox: "fill-box", transformOrigin: "center" } as React.CSSProperties}
      >
        {/* Iris ring — amber, translates with SME gaze */}
        <circle
          className="sankofa-bird-iris"
          cx="7.1" cy="12.2" r="0.85"
          fill="hsl(32, 85%, 42%)"
          opacity={0.88}
          style={{
            transformBox: "view-box",
            transformOrigin: "7.1px 12.2px",
            translate: "var(--sme-eye-x, 0px) var(--sme-eye-y, 0px)",
          } as React.CSSProperties}
        />
        {/* Limbal ring — fixed inside group, crops over-travel at iris edge */}
        <circle
          cx="7.1" cy="12.2" r="0.7"
          fill="hsl(190, 60%, 18%)"
          opacity={0.6}
        />
        {/* Pupil — translates with SME gaze, scales on blink */}
        <circle
          className="sankofa-bird-eye"
          cx="7.1" cy="12.2" r="0.55" fill="#04121a"
          style={{
            transformBox: "view-box",
            transformOrigin: "7.1px 12.2px",
            translate: "var(--sme-eye-x, 0px) var(--sme-eye-y, 0px)",
          } as React.CSSProperties}
        />
        {/* Secondary catchlight — depth parallax, moves with pupil */}
        <circle
          className="sankofa-bird-eye-catchlight"
          cx="7.6" cy="11.85" r="0.13" fill="white" opacity={0.7}
          style={{
            transformBox: "view-box",
            transformOrigin: "7.6px 11.85px",
            translate: "var(--sme-eye-x, 0px) var(--sme-eye-y, 0px)",
          } as React.CSSProperties}
        />
      </g>
      {/* Upper eyelid */}
      <path
        className="sankofa-bird-eyelid"
        d="M6.6 11.85 Q7.1 11.45 7.6 11.85"
        fill="none"
        stroke="hsl(190, 85%, 38%)"
        strokeWidth="0.45"
        strokeLinecap="round"
        opacity={0}
      />
      {/* Lower eyelid */}
      <path
        className="sankofa-bird-lower-eyelid"
        d="M6.7 12.55 Q7.1 12.95 7.5 12.55"
        fill="none"
        stroke="hsl(190, 75%, 35%)"
        strokeWidth="0.30"
        strokeLinecap="round"
        opacity={0}
      />
      {/* Nictitating membrane */}
      <path
        className="sankofa-nictitating"
        d="M6.7 12.1 Q7.1 11.9 7.5 12.1 Q7.1 13.2 6.7 13.2 Z"
        fill="rgba(180,230,240,0.36)"
        stroke="rgba(120,200,220,0.25)"
        strokeWidth="0.08"
        style={{
          transformBox: "view-box",
          transformOrigin: "6.7px 12.65px",
        } as React.CSSProperties}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BEAK
// ─────────────────────────────────────────────────────────────────────────────

export function Beak(): React.ReactElement {
  return (
    <>
      <path
        className="sankofa-bird-beak-upper"
        d="M5.3 13.4 L2.2 14.25 L5.45 14.2 Z"
        fill="#1a2733"
        style={{
          transformBox: "view-box",
          transformOrigin: "5.45px 14.2px",
        } as React.CSSProperties}
      />

      {/* ── Beak gold catchlight (Phase 24) ────────────────────────────────
          A warm amber highlight along the ridge of the upper beak.
          Opacity and warmth are driven by CSS --lighting-factor via the
          .sankofa-beak-catchlight class in phase-24.ts.
          Peaks when heading NW/W (beak faces the virtual light source). */}
      <path
        className="sankofa-beak-catchlight"
        d="M5.3 13.4 L3.2 13.85 L5.0 13.85 Z"
        fill="#f0b800"
        opacity={0}
        style={{
          transformBox: "view-box",
          transformOrigin: "5.45px 14.2px",
        } as React.CSSProperties}
      />

      <circle
        className="sankofa-beak-gloss"
        cx="4.1" cy="13.55"
        r="0.17"
        fill="white"
        opacity={0.12}
      />
      <path
        className="sankofa-bird-beak-lower"
        d="M5.45 14.2 L2.2 14.25 L5.6 15.1 Z"
        fill="#121e29"
        style={{
          transformBox: "view-box",
          transformOrigin: "5.45px 14.2px",
        } as React.CSSProperties}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CHIRP RINGS
// ─────────────────────────────────────────────────────────────────────────────

export function ChirpRings(): React.ReactElement {
  return (
    <>
      <circle
        className="sankofa-chirp-ring-1"
        cx="2.2" cy="14.25" r="1.2"
        fill="none"
        stroke="#00D4FF"
        strokeWidth="0.25"
        opacity={0}
        style={{ transformBox: "view-box", transformOrigin: "2.2px 14.25px" } as React.CSSProperties}
      />
      <circle
        className="sankofa-chirp-ring-2"
        cx="2.2" cy="14.25" r="1.2"
        fill="none"
        stroke="#00C4EE"
        strokeWidth="0.18"
        opacity={0}
        style={{ transformBox: "view-box", transformOrigin: "2.2px 14.25px" } as React.CSSProperties}
      />
      <circle
        className="sankofa-chirp-ring-3"
        cx="2.2" cy="14.25" r="1.2"
        fill="none"
        stroke="hsl(190, 100%, 78%)"
        strokeWidth="0.12"
        opacity={0}
        style={{ transformBox: "view-box", transformOrigin: "2.2px 14.25px" } as React.CSSProperties}
      />
      <circle
        className="sankofa-beak-glint"
        cx="2.4" cy="14.15" r="0.18"
        fill="white"
        opacity={0}
        style={{ transformBox: "view-box", transformOrigin: "2.4px 14.15px" } as React.CSSProperties}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EGG
// ─────────────────────────────────────────────────────────────────────────────

export function Egg(): React.ReactElement {
  const { celebrating, donated, eggGradId, eggGoldGradId, bankDeg, bodyGradId } = useBird();
  const glowHaloId    = `${bodyGradId}-halo`;
  const eggWarmGradId = `${bodyGradId}-egg-warm`;
  const eggGlowFilterId = `${bodyGradId}-egg-glow`;

  return (
    <>
      <g
        style={{
          transform: `rotate(${-bankDeg}deg)`,
          transformOrigin: "20px 24.8px",
          transformBox: "view-box",
          transition: "transform 0.35s ease-out",
        } as React.CSSProperties}
      >
        {/* ── Ambient glow halo (always on, subtle) ─────────────────────
            The illustration bird always had a soft aura around the egg.
            This recreates that quality without the psychedelic intensity. */}
        <circle
          className="sankofa-egg-glow-halo"
          cx="3.4"
          cy="15.6"
          r="2.8"
          fill={`url(#${glowHaloId})`}
          opacity={celebrating || donated ? 0.65 : 0.30}
        />

        {/* ── Main egg sphere ────────────────────────────────────────── */}
        <circle
          className="sankofa-bird-egg"
          cx="3.4"
          cy="15.6"
          r="1.45"
          fill={(celebrating || donated) ? `url(#${eggGoldGradId})` : `url(#${eggGradId})`}
          stroke={(celebrating || donated) ? "#f0b800" : "#00D4FF"}
          strokeWidth="0.35"
        />

        {/* ── Egg specular highlight ─────────────────────────────────── */}
        <circle
          cx="2.85"
          cy="14.95"
          r="0.45"
          fill="white"
          opacity={(celebrating || donated) ? 0.95 : 0.80}
        />

        {/* ── Egg ripple (celebration pulse) ────────────────────────── */}
        <circle
          className="sankofa-egg-ripple"
          cx="3.4"
          cy="15.6"
          r="1.5"
          fill="none"
          stroke="#00D4FF"
          strokeWidth="0.35"
          opacity={0}
          style={{
            transformBox: "view-box",
            transformOrigin: "3.4px 15.6px",
          } as React.CSSProperties}
        />

        {/* ── Orbit particles ──────────────────────────────────────── */}
        <circle
          className="sankofa-egg-orbit sankofa-egg-orbit-a"
          cx="3.4"
          cy="14.2"
          r="0.22"
          fill="white"
          opacity={0}
          style={{
            transformBox: "view-box",
            transformOrigin: "3.4px 15.6px",
          } as React.CSSProperties}
        />
        <circle
          className="sankofa-egg-orbit sankofa-egg-orbit-b"
          cx="3.4"
          cy="17.0"
          r="0.17"
          fill="#00D4FF"
          opacity={0}
          style={{
            transformBox: "view-box",
            transformOrigin: "3.4px 15.6px",
          } as React.CSSProperties}
        />

        {/* ── Thermal layers (energy rings around egg) ─────────────── */}
        <circle
          className="sankofa-egg-thermal-inner"
          cx="3.4" cy="15.6" r="0.60"
          fill="none"
          stroke="#00D4FF"
          strokeWidth="0.22"
          opacity={0}
          style={{ transformBox: "view-box", transformOrigin: "3.4px 15.6px" } as React.CSSProperties}
        />
        <circle
          className="sankofa-egg-thermal-mid"
          cx="3.4" cy="15.6" r="0.98"
          fill="none"
          stroke="#00C4EE"
          strokeWidth="0.16"
          opacity={0}
          style={{ transformBox: "view-box", transformOrigin: "3.4px 15.6px" } as React.CSSProperties}
        />

        {/* ── Warm glow halo (Phase 24) ─────────────────────────────
            A soft amber/gold radial that pulses on meaningful moments:
            helping, nearby-user, donated, accepted, celebrating.
            Driven entirely by CSS .sankofa-egg-warmglow rules in phase-24.ts.
            The warm gradient shifts the normally-teal egg halo toward gold,
            like a lantern lighting up when community connection is active. */}
        <circle
          className="sankofa-egg-warmglow"
          cx="3.4"
          cy="15.6"
          r="2.4"
          fill={`url(#${eggWarmGradId})`}
          opacity={0}
          style={{ transformBox: "view-box", transformOrigin: "3.4px 15.6px" } as React.CSSProperties}
        />
      </g>
    </>
  );
}
