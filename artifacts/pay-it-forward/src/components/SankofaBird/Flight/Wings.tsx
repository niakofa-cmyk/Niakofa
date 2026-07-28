/**
 * SankofaBird/Flight/Wings.tsx — Phase 22 LUMINARY EDITION
 *
 * Visual DNA merge: illustration-bird layered translucency with controlled
 * cyan / turquoise / emerald structural color.
 * applied to the anatomical rigged wing system.
 *
 * Key changes:
 *   • All primary feathers now start at VISIBLE base opacity (0.55–0.92)
 *     matching the illustration's overlapping semi-transparent shapes
 *   • Outer primaries catch the controlled iridescent edge gradients
 *   • NEW: sankofa-wing-luminary-* overlay paths — translucent teal surfaces
 *     ellipse shapes that recreate the illustration's "glowing wing surface"
 *   • NEW: feather iridescent edges — tiny bright highlight paths at feather tips
 *   • Feather secondaries and coverts: more visible, semi-transparent layers
 *   • Wing highlight opacity boosted to 0.55 (was 0.35)
 *
 * Z-order preserved: main wing surface → primaries → secondaries → coverts →
 *   luminary overlay → wing highlight → covert band
 */

import React from "react";
import { useBird } from "../Core/Context";

// ─────────────────────────────────────────────────────────────────────────────
// RIGHT WING
// ─────────────────────────────────────────────────────────────────────────────

export function RightWing(): React.ReactElement {
  const { wingGradRightId, bodyGradId } = useBird();
  const wingCyanGradId = `${wingGradRightId}-cyan`;
  const iriCyanGradId      = `${bodyGradId}-iri-cyan`;
  const iriTurquoiseGradId = `${bodyGradId}-iri-turquoise`;
  const iriEmeraldGradId   = `${bodyGradId}-iri-emerald`;
  // Phase 23: feather depth gradients (tip bright → base deep)
  const featherOuterGradId = `${bodyGradId}-fo`;
  const featherMidGradId   = `${bodyGradId}-fm`;
  const featherInnerGradId = `${bodyGradId}-fi`;
  const featherSecGradId   = `${bodyGradId}-fs`;
  const iriFillStyle = {
    "--iri-cyan-fill": `url(#${iriCyanGradId})`,
    "--iri-turquoise-fill": `url(#${iriTurquoiseGradId})`,
    "--iri-emerald-fill": `url(#${iriEmeraldGradId})`,
  } as React.CSSProperties;

  return (
    <g
      className="sankofa-sme-wing-right-rig"
      style={{
        transformBox: "view-box",
        transformOrigin: "20px 17px",
        rotate: "var(--sme-rwing-upper-deg, 0deg)",
      } as React.CSSProperties}
    >
      {/* ── Main wing surface ─────────────────────────────────────────── */}
      <path
        className="sankofa-bird-wing-right"
        d="M20 17 C26 14 33 12 37 7 C35 14 31 19 25 22 C22.5 21 20.5 19 20 17 Z"
        fill={`url(#${wingGradRightId})`}
      />

      {/* ── Wing luminary overlay — illustration-style translucent layer ──
          Two overlapping semi-transparent #00D4FF shapes over the wing top.
          Recreates the original's "wing surface catches light" quality. */}
      <path
        className="sankofa-wing-luminary-r sankofa-wing-luminary-r-a"
        d="M20 17 C25 14.5 31 12.5 34.5 9 C33 13 29.5 17 24.5 20 C22.5 20 20.8 18.5 20 17 Z"
        fill="#00D4FF"
        opacity={0.22}
      />
      <path
        className="sankofa-wing-luminary-r sankofa-wing-luminary-r-b"
        d="M22 16 C27 13.5 32 11.5 35.5 8 C34 12 30.5 16.5 25.5 19.5 C23.5 19.5 22 17.5 22 16 Z"
        fill="#00C4EE"
        opacity={0.16}
      />

      {/* ── Wing under-surface (low zoom hidden, mid/high visible) ──────── */}
      <path
        className="sankofa-bird-wing-right-btm"
        d="M20 19 C25 18.5 31 17.5 35 15.5 C32.5 18.5 28 22 23 23.5 C21.2 23 20.2 21.2 20 19 Z"
        fill="hsl(190, 55%, 70%)"
        opacity={0}
      />

      {/* ── Primary feathers — LUMINARY EDITION ───────────────────────────
          Outer primaries: #00D4FF at 0.85–0.92 (luminous like illustration)
          Inner primaries: transition through #00C4EE → teal
          All now start visible (not 0) — layered translucency is the key */}

      {/* r5 — extreme outer primary (depth gradient: #00D4FF tip → #0D77AA base) */}
      <path
        className="sankofa-bird-wing-right-feathers sankofa-feather-r5"
        d="M39.5 4.5 C40.8 2.5 40.5 0.8 39.3 0.2 C38.4 1.6 37.4 3.4 37.0 5.2 Z"
        fill={`url(#${featherOuterGradId})`}
        opacity={0.92}
      />

      {/* r0 — outermost primary (depth gradient outer) */}
      <path
        className="sankofa-bird-wing-right-feathers sankofa-feather-r0"
        d="M38.2 6.0 C39.5 3.8 39.8 2.0 38.6 1.2 C37.6 2.6 36.0 4.8 34.8 7.0 Z"
        fill={`url(#${featherOuterGradId})`}
        opacity={0.88}
      />

      {/* r1 — outer primary (depth gradient mid) */}
      <path
        className="sankofa-bird-wing-right-feathers sankofa-feather-r1"
        d="M36 8 C37.5 5.5 38.5 4 37.5 3 C36.5 4.5 34.5 6.5 33 8.5 Z"
        fill={`url(#${featherMidGradId})`}
        opacity={0.82}
      />

      {/* r2 — mid primary (depth gradient mid) */}
      <path
        className="sankofa-bird-wing-right-feathers sankofa-feather-r2"
        d="M30 10 C31.5 7.5 32 5.5 31 4.5 C30 6 28 8.5 26.5 10.5 Z"
        fill={`url(#${featherMidGradId})`}
        opacity={0.78}
      />

      {/* r3 — inner primary (depth gradient inner) */}
      <path
        className="sankofa-bird-wing-right-feathers sankofa-feather-r3"
        d="M25 13 C26.5 10.5 26.5 8.5 25.5 7.5 C24.5 9 22.5 11.5 21.5 13.5 Z"
        fill={`url(#${featherInnerGradId})`}
        opacity={0.72}
      />

      {/* r4 — innermost primary (depth gradient inner) */}
      <path
        className="sankofa-bird-wing-right-feathers sankofa-feather-r4"
        d="M23.0 14.8 C23.8 13.0 24.0 11.4 23.2 10.8 C22.2 12.2 21.4 14.0 21.0 15.8 Z"
        fill={`url(#${featherInnerGradId})`}
        opacity={0.65}
      />

      {/* ── Feather iridescent edge highlights ───────────────────────────
          Tiny bright #00D4FF paths at the leading edge of outer primaries.
          Recreates the "each feather glows at the edge" illustration quality. */}
      <path
        className="sankofa-feather-iri-edge sankofa-feather-iri-r5"
        d="M39.5 4.5 C40.5 3.0 40.4 1.5 39.6 0.8 C39.0 1.8 38.5 3.0 38.2 4.6 Z"
        fill="#00D4FF"
        opacity={0.50}
        style={iriFillStyle}
      />
      <path
        className="sankofa-feather-iri-edge sankofa-feather-iri-r0"
        d="M38.2 6.0 C39.2 4.2 39.5 2.5 38.8 1.6 C38.0 2.8 37.0 4.5 36.0 6.5 Z"
        fill="#00D4FF"
        opacity={0.42}
        style={iriFillStyle}
      />

      {/* ── Right secondaries (depth gradient secondary) ─────────────────── */}
      <path
        className="sankofa-bird-wing-right-feathers sankofa-feather-rs1"
        d="M32 11.5 C33.5 9.5 33.5 8 32.5 7.5 C31.5 9 30 11 29 12.5 Z"
        fill={`url(#${featherSecGradId})`}
        opacity={0.62}
      />
      <path
        className="sankofa-bird-wing-right-feathers sankofa-feather-rs2"
        d="M27.5 14 C28.5 12 28.5 10.5 27.5 10 C26.5 11.5 25 13.5 24 15 Z"
        fill={`url(#${featherSecGradId})`}
        opacity={0.58}
      />
      <path
        className="sankofa-bird-wing-right-feathers sankofa-feather-rs3"
        d="M29.5 13.5 C30.0 12.0 30.0 10.8 29.0 10.2 C28.0 11.5 27.0 13.5 26.5 15.0 Z"
        fill={`url(#${featherSecGradId})`}
        opacity={0.54}
      />

      {/* ── Right covert ─────────────────────────────────────────────── */}
      <path
        className="sankofa-bird-wing-right-feathers sankofa-feather-rc1"
        d="M23.5 15.5 C24 14 24 12.5 23 12 C22 13 21 15 20.5 16.5 Z"
        fill="hsl(183, 100%, 48%)"
        opacity={0.48}
      />

      {/* ── Covert band — luminous stripe (always faintly visible) ───── */}
      <path
        className="sankofa-wing-covert-band sankofa-wing-covert-band-r"
        d="M21.5 15.8 C22.8 14.2 24.0 13.0 25.5 12.2 C24.5 13.5 23.2 15.0 22.0 16.5 Z"
        fill="#00D4FF"
        opacity={0.12}
      />

      {/* ── Wing atmosphere layer — Phase 25 emerald/turquoise depth ──────
          Third translucent overlay using emerald gradient. Invisible at rest;
          CSS activates it on SW/W/S headings and during gliding to create
          layered atmospheric translucency across the wing surface. */}
      <path
        className="sankofa-wing-atmos-r"
        d="M20 17 C25.5 15.2 31 13.2 34.5 10.8 C32.5 14.2 29 17.8 24 20.2 C22 20.2 20.5 18.6 20 17 Z"
        fill={`url(#${iriEmeraldGradId})`}
        opacity={0}
        style={{ pointerEvents: "none" } as React.CSSProperties}
      />

      {/* ── Wing highlight — luminous leading-edge strip ──────────────── */}
      <path
        className="sankofa-bird-wing-right-highlight"
        d="M21 17.5 C25 15.5 30 14 33.5 11.5 C31 14 27.5 17 23.5 18.5 Z"
        fill="#00D4FF"
        opacity={0.55}
      />
      <WingtipFeathers side="right" />
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LEFT WING
// ─────────────────────────────────────────────────────────────────────────────

export function LeftWing(): React.ReactElement {
  const { wingGradLeftId, bodyGradId } = useBird();
  const iriCyanGradId      = `${bodyGradId}-iri-cyan`;
  const iriTurquoiseGradId = `${bodyGradId}-iri-turquoise`;
  const iriEmeraldGradId   = `${bodyGradId}-iri-emerald`;
  // Phase 23: feather depth gradients (tip bright → base deep)
  const featherOuterGradId = `${bodyGradId}-fo`;
  const featherMidGradId   = `${bodyGradId}-fm`;
  const featherInnerGradId = `${bodyGradId}-fi`;
  const featherSecGradId   = `${bodyGradId}-fs`;
  const iriFillStyle = {
    "--iri-cyan-fill": `url(#${iriCyanGradId})`,
    "--iri-turquoise-fill": `url(#${iriTurquoiseGradId})`,
    "--iri-emerald-fill": `url(#${iriEmeraldGradId})`,
  } as React.CSSProperties;

  return (
    <g
      className="sankofa-sme-wing-left-rig"
      style={{
        transformBox: "view-box",
        transformOrigin: "20px 17px",
        rotate: "var(--sme-lwing-upper-deg, 0deg)",
      } as React.CSSProperties}
    >
      {/* ── Main wing surface ─────────────────────────────────────────── */}
      <path
        className="sankofa-bird-wing-left"
        d="M20 17 C14 14 7 12 3 7 C5 14 9 19 15 22 C17.5 21 19.5 19 20 17 Z"
        fill={`url(#${wingGradLeftId})`}
      />

      {/* ── Wing luminary overlay — illustration-style translucent layer ── */}
      <path
        className="sankofa-wing-luminary-l sankofa-wing-luminary-l-a"
        d="M20 17 C15 14.5 9 12.5 5.5 9 C7 13 10.5 17 15.5 20 C17.5 20 19.2 18.5 20 17 Z"
        fill="#00D4FF"
        opacity={0.22}
      />
      <path
        className="sankofa-wing-luminary-l sankofa-wing-luminary-l-b"
        d="M18 16 C13 13.5 8 11.5 4.5 8 C6 12 9.5 16.5 14.5 19.5 C16.5 19.5 18 17.5 18 16 Z"
        fill="#00C4EE"
        opacity={0.16}
      />

      {/* ── Wing under-surface ────────────────────────────────────────── */}
      <path
        className="sankofa-bird-wing-left-btm"
        d="M20 19 C15 18.5 9 17.5 5 15.5 C7.5 18.5 12 22 17 23.5 C18.8 23 19.8 21.2 20 19 Z"
        fill="hsl(190, 55%, 70%)"
        opacity={0}
      />

      {/* ── Primary feathers — LUMINARY EDITION ───────────────────────── */}

      {/* l5 — extreme outer primary (depth gradient outer) */}
      <path
        className="sankofa-bird-wing-left-feathers sankofa-feather-l5"
        d="M0.5 4.5 C-0.8 2.5 -0.5 0.8 0.7 0.2 C1.6 1.6 2.6 3.4 3.0 5.2 Z"
        fill={`url(#${featherOuterGradId})`}
        opacity={0.92}
      />

      {/* l0 — outermost primary (depth gradient outer) */}
      <path
        className="sankofa-bird-wing-left-feathers sankofa-feather-l0"
        d="M1.8 6.0 C0.5 3.8 0.2 2.0 1.4 1.2 C2.4 2.6 4.0 4.8 5.2 7.0 Z"
        fill={`url(#${featherOuterGradId})`}
        opacity={0.88}
      />

      {/* l1 (depth gradient mid) */}
      <path
        className="sankofa-bird-wing-left-feathers sankofa-feather-l1"
        d="M4 8 C2.5 5.5 1.5 4 2.5 3 C3.5 4.5 5.5 6.5 7 8.5 Z"
        fill={`url(#${featherMidGradId})`}
        opacity={0.82}
      />

      {/* l2 (depth gradient mid) */}
      <path
        className="sankofa-bird-wing-left-feathers sankofa-feather-l2"
        d="M10 10 C8.5 7.5 8 5.5 9 4.5 C10 6 12 8.5 13.5 10.5 Z"
        fill={`url(#${featherMidGradId})`}
        opacity={0.78}
      />

      {/* l3 (depth gradient inner) */}
      <path
        className="sankofa-bird-wing-left-feathers sankofa-feather-l3"
        d="M15 13 C13.5 10.5 13.5 8.5 14.5 7.5 C15.5 9 17.5 11.5 18.5 13.5 Z"
        fill={`url(#${featherInnerGradId})`}
        opacity={0.72}
      />

      {/* l4 — innermost primary (depth gradient inner) */}
      <path
        className="sankofa-bird-wing-left-feathers sankofa-feather-l4"
        d="M17.0 14.8 C16.2 13.0 16.0 11.4 16.8 10.8 C17.8 12.2 18.6 14.0 19.0 15.8 Z"
        fill={`url(#${featherInnerGradId})`}
        opacity={0.65}
      />

      {/* ── Feather iridescent edge highlights (left wing) ──────────── */}
      <path
        className="sankofa-feather-iri-edge sankofa-feather-iri-l5"
        d="M0.5 4.5 C-0.5 3.0 -0.4 1.5 0.4 0.8 C1.0 1.8 1.5 3.0 1.8 4.6 Z"
        fill="#00D4FF"
        opacity={0.50}
        style={iriFillStyle}
      />
      <path
        className="sankofa-feather-iri-edge sankofa-feather-iri-l0"
        d="M1.8 6.0 C0.8 4.2 0.5 2.5 1.2 1.6 C2.0 2.8 3.0 4.5 4.0 6.5 Z"
        fill="#00D4FF"
        opacity={0.42}
        style={iriFillStyle}
      />

      {/* ── Left secondaries (depth gradient secondary) ──────────────────── */}
      <path
        className="sankofa-bird-wing-left-feathers sankofa-feather-ls1"
        d="M8 11.5 C6.5 9.5 6.5 8 7.5 7.5 C8.5 9 10 11 11 12.5 Z"
        fill={`url(#${featherSecGradId})`}
        opacity={0.62}
      />
      <path
        className="sankofa-bird-wing-left-feathers sankofa-feather-ls2"
        d="M12.5 14 C11.5 12 11.5 10.5 12.5 10 C13.5 11.5 15 13.5 16 15 Z"
        fill={`url(#${featherSecGradId})`}
        opacity={0.58}
      />
      <path
        className="sankofa-bird-wing-left-feathers sankofa-feather-ls3"
        d="M10.5 13.5 C10.0 12.0 10.0 10.8 11.0 10.2 C12.0 11.5 13.0 13.5 13.5 15.0 Z"
        fill={`url(#${featherSecGradId})`}
        opacity={0.54}
      />

      {/* ── Left covert ──────────────────────────────────────────────── */}
      <path
        className="sankofa-bird-wing-left-feathers sankofa-feather-lc1"
        d="M16.5 15.5 C16 14 16 12.5 17 12 C18 13 19 15 19.5 16.5 Z"
        fill="hsl(183, 100%, 48%)"
        opacity={0.48}
      />

      {/* ── Covert band ──────────────────────────────────────────────── */}
      <path
        className="sankofa-wing-covert-band sankofa-wing-covert-band-l"
        d="M18.5 15.8 C17.2 14.2 16.0 13.0 14.5 12.2 C15.5 13.5 16.8 15.0 18.0 16.5 Z"
        fill="#00D4FF"
        opacity={0.12}
      />

      {/* ── Wing atmosphere layer — Phase 25 emerald/turquoise depth ── */}
      <path
        className="sankofa-wing-atmos-l"
        d="M20 17 C14.5 15.2 9 13.2 5.5 10.8 C7.5 14.2 11 17.8 16 20.2 C18 20.2 19.5 18.6 20 17 Z"
        fill={`url(#${iriEmeraldGradId})`}
        opacity={0}
        style={{ pointerEvents: "none" } as React.CSSProperties}
      />

      {/* ── Wing highlight ────────────────────────────────────────────── */}
      <path
        className="sankofa-bird-wing-left-highlight"
        d="M19 17.5 C15 15.5 10 14 6.5 11.5 C9 14 12.5 17 16.5 18.5 Z"
        fill="#00D4FF"
        opacity={0.55}
      />
      <WingtipFeathers side="left" />
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WING JOINTS
// ─────────────────────────────────────────────────────────────────────────────

export function WingJoints(): React.ReactElement {
  return (
    <>
      <ellipse
        className="sankofa-wing-joint sankofa-wing-joint-left"
        cx="18.0" cy="17.0"
        rx="1.2" ry="0.6"
        fill="#00D4FF"
        opacity={0}
        style={{
          transform: "rotate(-22deg)",
          transformBox: "view-box",
          transformOrigin: "18.0px 17.0px",
        } as React.CSSProperties}
      />
      <ellipse
        className="sankofa-wing-joint sankofa-wing-joint-right"
        cx="22.0" cy="17.0"
        rx="1.2" ry="0.6"
        fill="#00D4FF"
        opacity={0}
        style={{
          transform: "rotate(22deg)",
          transformBox: "view-box",
          transformOrigin: "22.0px 17.0px",
        } as React.CSSProperties}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SCAPULARS
// ─────────────────────────────────────────────────────────────────────────────

export function Scapulars(): React.ReactElement {
  return (
    <>
      <path className="sankofa-wing-scap sankofa-wing-scap-l1"
        d="M19.0 16.5 C17.5 15.0 15.5 14.2 14.0 14.7 C15.2 16.2 17.2 17.4 19.0 18.2 Z"
        fill="#00D4FF" opacity={0.12} />
      <path className="sankofa-wing-scap sankofa-wing-scap-l2"
        d="M18.5 14.5 C17.2 13.2 15.5 12.5 14.2 13.0 C15.2 14.5 17.0 15.5 18.5 16.2 Z"
        fill="#00C4EE" opacity={0.10} />
      <path className="sankofa-wing-scap sankofa-wing-scap-r1"
        d="M21.0 16.5 C22.5 15.0 24.5 14.2 26.0 14.7 C24.8 16.2 22.8 17.4 21.0 18.2 Z"
        fill="#00D4FF" opacity={0.12} />
      <path className="sankofa-wing-scap sankofa-wing-scap-r2"
        d="M21.5 14.5 C22.8 13.2 24.5 12.5 25.8 13.0 C24.8 14.5 23.0 15.5 21.5 16.2 Z"
        fill="#00C4EE" opacity={0.10} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SHOULDER FEATHERS — Phase 27
//
// These small, body-adjacent feathers are separate from the mixer-owned wing
// groups. Their additive rotate channel lets the shoulder lag naturally during
// a wingbeat without changing the primary wing pose.
// ─────────────────────────────────────────────────────────────────────────────

export function ShoulderFeathers(): React.ReactElement {
  const { bodyGradId } = useBird();
  const featherSecGradId = `${bodyGradId}-fs`;
  const shoulderGradId = `${bodyGradId}-fsh`;

  return (
    <>
      <path
        className="sankofa-shoulder-feather sankofa-shoulder-r1"
        d="M22.0 17.2 C23.2 15.8 24.5 15.2 25.2 15.7 C24.3 17.1 23.0 18.1 22.2 18.6 Z"
        fill={`url(#${shoulderGradId})`}
        opacity={0.52}
        style={{ transformBox: "view-box", transformOrigin: "22px 17.2px" } as React.CSSProperties}
      />
      <path
        className="sankofa-shoulder-feather sankofa-shoulder-r2"
        d="M23.6 16.5 C24.9 15.2 26.1 14.8 26.7 15.3 C25.8 16.8 24.4 17.8 23.4 18.2 Z"
        fill="hsl(183, 100%, 52%)"
        opacity={0.44}
        style={{ transformBox: "view-box", transformOrigin: "23.6px 16.5px" } as React.CSSProperties}
      />
      <path
        className="sankofa-shoulder-feather sankofa-shoulder-r3"
        d="M21.0 16.0 C22.2 14.8 23.3 14.4 23.9 14.9 C23.1 16.2 22.0 17.2 21.2 17.6 Z"
        fill={`url(#${featherSecGradId})`}
        opacity={0.36}
        style={{ transformBox: "view-box", transformOrigin: "21px 16px" } as React.CSSProperties}
      />
      <path
        className="sankofa-shoulder-feather sankofa-shoulder-r-iri"
        d="M22.0 17.2 C23.0 15.9 24.2 15.3 24.8 15.8 C24.0 17.0 22.8 17.9 22.0 18.4 Z"
        fill="#0FE5D4"
        opacity={0.25}
        style={{ transformBox: "view-box", transformOrigin: "22px 17.2px" } as React.CSSProperties}
      />

      <path
        className="sankofa-shoulder-feather sankofa-shoulder-l1"
        d="M18.0 17.2 C16.8 15.8 15.5 15.2 14.8 15.7 C15.7 17.1 17.0 18.1 17.8 18.6 Z"
        fill={`url(#${shoulderGradId})`}
        opacity={0.52}
        style={{ transformBox: "view-box", transformOrigin: "18px 17.2px" } as React.CSSProperties}
      />
      <path
        className="sankofa-shoulder-feather sankofa-shoulder-l2"
        d="M16.4 16.5 C15.1 15.2 13.9 14.8 13.3 15.3 C14.2 16.8 15.6 17.8 16.6 18.2 Z"
        fill="hsl(183, 100%, 52%)"
        opacity={0.44}
        style={{ transformBox: "view-box", transformOrigin: "16.4px 16.5px" } as React.CSSProperties}
      />
      <path
        className="sankofa-shoulder-feather sankofa-shoulder-l3"
        d="M19.0 16.0 C17.8 14.8 16.7 14.4 16.1 14.9 C16.9 16.2 18.0 17.2 18.8 17.6 Z"
        fill={`url(#${featherSecGradId})`}
        opacity={0.36}
        style={{ transformBox: "view-box", transformOrigin: "19px 16px" } as React.CSSProperties}
      />
      <path
        className="sankofa-shoulder-feather sankofa-shoulder-l-iri"
        d="M18.0 17.2 C17.0 15.9 15.8 15.3 15.2 15.8 C16.0 17.0 17.2 17.9 18.0 18.4 Z"
        fill="#0FE5D4"
        opacity={0.25}
        style={{ transformBox: "view-box", transformOrigin: "18px 17.2px" } as React.CSSProperties}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WINGTIP FEATHERS — Phase 27
// ─────────────────────────────────────────────────────────────────────────────

export function WingtipFeathers({
  side,
}: {
  side: "left" | "right";
}): React.ReactElement {
  const { bodyGradId } = useBird();
  const featherOuterGradId = `${bodyGradId}-fo`;

  if (side === "right") {
    return (
      <g className="sankofa-wingtip-feathers sankofa-wingtip-feathers-right">
        <path
          className="sankofa-wingtip-feather sankofa-wingtip-r-a"
          d="M40.8 2.4 C41.9 0.3 41.5 -1.0 40.1 -1.2 C39.4 0.4 39.1 2.0 39.6 3.6 Z"
          fill={`url(#${featherOuterGradId})`}
          opacity={0.76}
          style={{ transformBox: "view-box", transformOrigin: "40.8px 2.4px" } as React.CSSProperties}
        />
        <path
          className="sankofa-wingtip-feather sankofa-wingtip-r-b"
          d="M39.4 1.4 C40.2 -0.4 39.9 -1.4 38.7 -1.6 C38.1 0.1 37.9 1.8 38.4 3.1 Z"
          fill="#0FE5D4"
          opacity={0.62}
          style={{ transformBox: "view-box", transformOrigin: "39.4px 1.4px" } as React.CSSProperties}
        />
        <path
          className="sankofa-wingtip-feather sankofa-wingtip-r-c"
          d="M41.6 3.5 C42.5 1.6 42.1 0.2 40.8 0.0 C40.2 1.6 40.0 3.2 40.5 4.4 Z"
          fill="#0FE5D4"
          opacity={0.45}
          style={{ transformBox: "view-box", transformOrigin: "41.6px 3.5px" } as React.CSSProperties}
        />
      </g>
    );
  }

  return (
    <g className="sankofa-wingtip-feathers sankofa-wingtip-feathers-left">
      <path
        className="sankofa-wingtip-feather sankofa-wingtip-l-a"
        d="M-0.8 2.4 C-1.9 0.3 -1.5 -1.0 -0.1 -1.2 C0.6 0.4 0.9 2.0 0.4 3.6 Z"
        fill={`url(#${featherOuterGradId})`}
        opacity={0.76}
        style={{ transformBox: "view-box", transformOrigin: "-0.8px 2.4px" } as React.CSSProperties}
      />
      <path
        className="sankofa-wingtip-feather sankofa-wingtip-l-b"
        d="M0.6 1.4 C-0.2 -0.4 0.1 -1.4 1.3 -1.6 C1.9 0.1 2.1 1.8 1.6 3.1 Z"
        fill="#0FE5D4"
        opacity={0.62}
        style={{ transformBox: "view-box", transformOrigin: "0.6px 1.4px" } as React.CSSProperties}
      />
      <path
        className="sankofa-wingtip-feather sankofa-wingtip-l-c"
        d="M-1.6 3.5 C-2.5 1.6 -2.1 0.2 -0.8 0.0 C-0.2 1.6 0.0 3.2 -0.5 4.4 Z"
        fill="#0FE5D4"
        opacity={0.45}
        style={{ transformBox: "view-box", transformOrigin: "-1.6px 3.5px" } as React.CSSProperties}
      />
    </g>
  );
}
