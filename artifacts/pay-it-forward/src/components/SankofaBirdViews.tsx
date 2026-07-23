/**
 * SankofaBirdViews.tsx
 *
 * Full 360° Sankofa Bird SVG Asset Pipeline.
 *
 * Visual Reference: public/SANKOFA_BIRD_OFFICIAL_REFERENCE.png
 * Spec:             public/SANKOFA_BIRD_ASSET_PIPELINE.md
 *
 * Provides:
 *   • 8 cardinal + 3/4-angle views (Front, Front3QRight, Front3QLeft,
 *     LeftSide, RightSide, Back3QLeft, Back3QRight, Back)
 *   • 7 vertical + diagonal + cross views (TopDown, BottomUp,
 *     DiagonalUpLeft, DiagonalUpRight, DiagonalDownLeft, DiagonalDownRight,
 *     CrossView)
 *   • 5 wing deformation states (HighStretch, Relaxed, PowerStroke,
 *     Braking, Glide)
 *   • 4 tail deformation states (Wide, Speed, Braking, Stream)
 *   • Turn sequence (12-step illusion perspective)
 *   • Full asset-pipeline spritesheet grid
 *
 * All views are derived from a single layered SVG vocabulary via CSS
 * transform skew/scale — achieves a convincing 2.5D illusion of 3D rotation
 * through foreshortening + path-morphing, without any real 3D geometry.
 *
 * ViewBox: 200×200 — center at (100,100).
 * Pivots:
 *   Body center:     (100,110)
 *   Wing base L:     (68,108)
 *   Wing base R:     (132,108)
 *   Neck base:       (100,88)
 *   Tail base:       (100,150)
 *   Leg base L:      (90,152)
 *   Leg base R:      (110,152)
 *   Egg center:      (128,70)
 */

import React, { useEffect, useId, useRef, useState } from "react";

/** Stable per-instance gradient/marker ID prefix — avoids SVG id collisions
 *  when multiple bird view instances render simultaneously (e.g. the asset
 *  pipeline grid). Strips React's colon characters for CSS/SVG id safety. */
function useBirdId(prefix: string): string {
  const raw = useId();
  return `${prefix}-${raw.replace(/:/g, "")}`;
}

// ── Color palette ──────────────────────────────────────────────────────────────
const C = {
  bright:    "#0FE5D4",
  mid:       "#2683AB",
  deep:      "#0D7F7A",
  body:      "#095E5A",
  shadow:    "#062E2E",
  highlight: "#5FFBF1",
  specular:  "#C8FFF8",
  beak:      "#0AF012",
  claws:     "#0AF012",
  eggBody:   "#D0F5F0",
  eggHigh:   "#FFFFFF",
  gold:      "#F5D98A",
  goldDeep:  "#C8860A",
} as const;

// ── Gradient defs shared across all views ─────────────────────────────────────
function BirdDefs({ id }: { id: string }) {
  return (
    <defs>
      {/* Major feather gradient — bright tip → deep base */}
      <linearGradient id={`${id}-feather`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%"   stopColor={C.bright}    />
        <stop offset="28%"  stopColor={C.mid}       />
        <stop offset="58%"  stopColor={C.deep}      />
        <stop offset="82%"  stopColor={C.body}      />
        <stop offset="100%" stopColor={C.shadow}    />
      </linearGradient>
      {/* Body gradient — mid→deep */}
      <linearGradient id={`${id}-body`} x1="30%" y1="0%" x2="70%" y2="100%">
        <stop offset="0%"   stopColor={C.mid}       />
        <stop offset="45%"  stopColor={C.deep}      />
        <stop offset="100%" stopColor={C.body}      />
      </linearGradient>
      {/* Wing top gradient */}
      <linearGradient id={`${id}-wing-top`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%"   stopColor={C.bright}    />
        <stop offset="35%"  stopColor={C.mid}       />
        <stop offset="75%"  stopColor={C.deep}      />
        <stop offset="100%" stopColor={C.shadow}    />
      </linearGradient>
      {/* Wing under gradient — darker */}
      <linearGradient id={`${id}-wing-under`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%"   stopColor={C.deep}      />
        <stop offset="60%"  stopColor={C.body}      />
        <stop offset="100%" stopColor={C.shadow}    />
      </linearGradient>
      {/* Head gradient */}
      <radialGradient id={`${id}-head`} cx="42%" cy="38%" r="55%">
        <stop offset="0%"   stopColor={C.specular}  />
        <stop offset="28%"  stopColor={C.bright}    />
        <stop offset="70%"  stopColor={C.mid}       />
        <stop offset="100%" stopColor={C.body}      />
      </radialGradient>
      {/* Egg gradient — pearl */}
      <radialGradient id={`${id}-egg`} cx="38%" cy="30%" r="60%">
        <stop offset="0%"   stopColor={C.eggHigh}   />
        <stop offset="45%"  stopColor={C.eggBody}   />
        <stop offset="100%" stopColor={C.deep}      stopOpacity="0.35" />
      </radialGradient>
      {/* Tail gradient */}
      <linearGradient id={`${id}-tail`} x1="50%" y1="0%" x2="50%" y2="100%">
        <stop offset="0%"   stopColor={C.body}      />
        <stop offset="40%"  stopColor={C.deep}      />
        <stop offset="100%" stopColor={C.bright}    stopOpacity="0.7" />
      </linearGradient>
      {/* Iridescent specular overlay */}
      <linearGradient id={`${id}-iri`} x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%"   stopColor={C.specular}  stopOpacity="0"   />
        <stop offset="40%"  stopColor={C.specular}  stopOpacity="0.25"/>
        <stop offset="70%"  stopColor={C.bright}    stopOpacity="0.12"/>
        <stop offset="100%" stopColor={C.specular}  stopOpacity="0"   />
      </linearGradient>
    </defs>
  );
}

// ── Shared wing path factories ─────────────────────────────────────────────────
/**
 * Returns the left wing primary feather path in a given deformation state.
 * All paths share the same wing-base attachment point (~68,108).
 */
function leftWingPath(state: WingState): string {
  switch (state) {
    case "high-stretch":
      // Upstroke — primary feathers angled up-rearward
      return "M 90 105 C 74 92 50 68 22 58 C 12 68 18 82 38 86 C 56 88 74 100 86 112 Z";
    case "power-stroke":
      // Downstroke — cupped, leading edge forward, tips down
      return "M 90 112 C 72 118 42 128 16 118 C 8 128 18 140 42 134 C 62 130 78 126 88 122 Z";
    case "braking":
      // Wrists forward, wide fan, decelerating
      return "M 88 108 C 64 88 28 72 6 85 C 2 102 12 118 38 112 C 60 108 78 112 86 118 Z";
    case "glide":
      // Swept back narrow chord, high-speed cruise
      return "M 90 110 C 76 105 58 100 36 102 C 22 106 18 114 32 116 C 52 114 74 112 88 115 Z";
    case "relaxed":
    default:
      // Neutral horizontal spread
      return "M 90 108 C 76 96 44 84 14 92 C 8 106 18 120 42 116 C 62 112 80 114 88 120 Z";
  }
}

function leftWingCovertsPath(state: WingState): string {
  switch (state) {
    case "high-stretch":
      return "M 86 112 C 70 100 48 84 30 86 C 24 92 32 102 50 100 C 65 98 78 106 85 112 Z";
    case "power-stroke":
      return "M 86 120 C 70 126 48 132 28 126 C 22 132 32 140 50 136 C 66 132 78 126 86 120 Z";
    case "braking":
      return "M 86 116 C 68 108 40 100 20 108 C 16 116 26 124 46 120 C 62 116 78 116 86 118 Z";
    case "glide":
      return "M 88 114 C 74 112 56 108 38 110 C 28 112 24 118 36 118 C 54 116 74 114 88 115 Z";
    default:
      return "M 86 118 C 72 114 48 112 28 118 C 22 124 32 128 50 124 C 66 120 78 118 86 118 Z";
  }
}

type WingState = "relaxed" | "high-stretch" | "power-stroke" | "braking" | "glide";
type TailState = "wide" | "speed" | "braking" | "stream";
type ViewAngle =
  | "front" | "front-3q-right" | "front-3q-left"
  | "left-side" | "right-side"
  | "back-3q-left" | "back-3q-right" | "back"
  | "top-down" | "bottom-up"
  | "diagonal-up-left" | "diagonal-up-right"
  | "diagonal-down-left" | "diagonal-down-right"
  | "cross";

// ── Tail path factory ──────────────────────────────────────────────────────────
function tailPath(state: TailState): string {
  switch (state) {
    case "wide":
      // Fan-spread; max width for braking / display
      return "M 84 150 C 70 162 56 178 44 195 L 100 190 L 156 195 C 144 178 130 162 116 150 Z";
    case "speed":
      // Pinched closed; narrow arrow shape
      return "M 92 150 C 88 162 88 180 96 198 L 100 198 L 104 198 C 112 180 112 162 108 150 Z";
    case "braking":
      // Folded up tight, raised
      return "M 88 148 C 82 155 80 165 82 175 L 100 172 L 118 175 C 120 165 118 155 112 148 Z";
    case "stream":
      // Long central stream, outer feathers slightly spread
      return "M 88 150 C 80 165 76 182 78 198 L 100 196 L 122 198 C 124 182 120 165 112 150 Z";
    default:
      return "M 86 150 C 78 164 72 180 64 195 L 100 192 L 136 195 C 128 180 122 164 114 150 Z";
  }
}

// ── The core bird SVG paths (front-facing canonical pose) ──────────────────────
interface BirdSvgPathsProps {
  id: string;
  wingState?: WingState;
  tailState?: TailState;
  showBack?: boolean;       // back plumage instead of front feathers
  showLegs?: boolean;
  highlightLayer?: boolean; // iridescent specular overlay
}

function BirdBody({ id, wingState = "relaxed", tailState = "wide", showBack = false, showLegs = true, highlightLayer = true }: BirdSvgPathsProps) {
  return (
    <g className="sankofa-bird-rig-body">
      {/* ── Tail ─────────────────────────────────────────────────────── */}
      <g className="sankofa-view-tail">
        {/* Central tail feather stream */}
        <path
          d={tailPath(tailState)}
          fill={`url(#${id}-tail)`}
          stroke={C.shadow} strokeWidth="0.5"
        />
        {/* Outer tail feathers – left */}
        <path
          d="M 86 152 C 76 164 65 180 58 196 L 70 193 C 76 178 82 162 88 152 Z"
          fill={C.deep} opacity="0.85"
        />
        {/* Outer tail feathers – right */}
        <path
          d="M 114 152 C 124 164 135 180 142 196 L 130 193 C 124 178 118 162 112 152 Z"
          fill={C.deep} opacity="0.85"
        />
        {/* Tail feather tip highlights */}
        <path d="M 96 190 C 98 196 100 198 100 198 C 100 198 102 196 104 190 Z"
          fill={C.bright} opacity="0.6" />
      </g>

      {/* ── Wings (bottom/secondary layer — rendered before body) ─────── */}
      <g className="sankofa-view-wing-left-under">
        <path d={leftWingCovertsPath(wingState)} fill={`url(#${id}-wing-under)`} opacity="0.9" />
      </g>
      <g className="sankofa-view-wing-right-under" transform="translate(200,0) scale(-1,1)">
        <path d={leftWingCovertsPath(wingState)} fill={`url(#${id}-wing-under)`} opacity="0.9" />
      </g>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <g className="sankofa-view-body">
        {/* Main body ellipse */}
        <ellipse cx="100" cy="118" rx="34" ry="30" fill={`url(#${id}-body)`} />
        {showBack ? (
          /* Back plumage — scapular + mantle visible from behind */
          <>
            <path d="M 82 96 C 78 88 80 80 100 78 C 120 80 122 88 118 96 C 112 92 88 92 82 96 Z"
              fill={C.mid} />
            <path d="M 85 96 C 88 90 100 88 100 88 C 100 88 112 90 115 96 C 108 94 92 94 85 96 Z"
              fill={C.bright} opacity="0.5" />
            {/* Scapular feather stripes */}
            {[-8,-4,0,4,8].map(x => (
              <line key={x} x1={100+x} y1={90} x2={100+x*0.7} y2={118}
                stroke={C.deep} strokeWidth="1" opacity="0.5"/>
            ))}
          </>
        ) : (
          /* Front chest plate */
          <>
            <ellipse cx="100" cy="112" rx="22" ry="18" fill={C.mid} opacity="0.6" />
            <ellipse cx="100" cy="108" rx="14" ry="11" fill={C.bright} opacity="0.2" />
          </>
        )}
        {/* Body underbelly */}
        <path d="M 68 130 C 72 148 84 158 100 162 C 116 158 128 148 132 130 Z"
          fill={C.body} opacity="0.8" />
        {/* Body iridescent specular */}
        {highlightLayer && (
          <ellipse cx="94" cy="108" rx="28" ry="18" fill={`url(#${id}-iri)`} opacity="0.7" />
        )}
      </g>

      {/* ── Wings (top layer) ─────────────────────────────────────────── */}
      <g className="sankofa-view-wing-left">
        {/* Primary feathers */}
        <path d={leftWingPath(wingState)} fill={`url(#${id}-wing-top)`} />
        {/* Wing coverts / secondary feathers */}
        <path d={leftWingCovertsPath(wingState)} fill={`url(#${id}-feather)`} opacity="0.75" />
        {/* Wing tip primary highlight */}
        <path
          d="M 16 94 C 12 100 14 108 22 108 C 26 100 20 98 16 94 Z"
          fill={C.bright} opacity="0.5"
        />
        {/* Wing specular sheen */}
        <path
          d="M 40 90 C 60 86 80 92 90 108 C 78 102 56 100 40 104 Z"
          fill={C.specular} opacity="0.18"
        />
      </g>
      <g className="sankofa-view-wing-right" transform="translate(200,0) scale(-1,1)">
        <path d={leftWingPath(wingState)} fill={`url(#${id}-wing-top)`} />
        <path d={leftWingCovertsPath(wingState)} fill={`url(#${id}-feather)`} opacity="0.75" />
        <path d="M 16 94 C 12 100 14 108 22 108 C 26 100 20 98 16 94 Z" fill={C.bright} opacity="0.5" />
        <path d="M 40 90 C 60 86 80 92 90 108 C 78 102 56 100 40 104 Z" fill={C.specular} opacity="0.18" />
      </g>

      {/* ── Neck ─────────────────────────────────────────────────────── */}
      <g className="sankofa-view-neck">
        <path
          d="M 88 90 C 88 82 92 76 100 74 C 108 76 112 82 112 90 C 108 86 92 86 88 90 Z"
          fill={`url(#${id}-body)`}
        />
      </g>

      {/* ── Head ─────────────────────────────────────────────────────── */}
      <g className="sankofa-view-head">
        <circle cx="100" cy="68" r="20" fill={`url(#${id}-head)`} />
        {/* Crest feathers — 3 curved tips arcing back */}
        <path d="M 96 50 C 92 40 82 32 78 28 C 80 36 84 44 88 50 Z"
          fill={C.deep} />
        <path d="M 100 48 C 98 36 96 24 90 16 C 94 26 98 38 100 48 Z"
          fill={C.mid} />
        <path d="M 104 50 C 106 38 110 28 116 22 C 112 32 106 42 104 50 Z"
          fill={C.bright} opacity="0.85" />
        {/* Crown specular tip highlights */}
        <circle cx="82" cy="34" r="2" fill={C.specular} opacity="0.7" />
        <circle cx="92" cy="22" r="2" fill={C.specular} opacity="0.7" />
        <circle cx="114" cy="26" r="1.5" fill={C.specular} opacity="0.7" />
        {/* Eye */}
        <circle cx="108" cy="65" r="5" fill={C.shadow} />
        <circle cx="108" cy="65" r="3.5" fill="#1a1a1a" />
        <circle cx="110" cy="63" r="1.2" fill="white" />
        <circle cx="106" cy="66" r="0.8" fill="white" opacity="0.6" />
        {/* Eye ring */}
        <circle cx="108" cy="65" r="5" fill="none" stroke={C.deep} strokeWidth="0.8" />
        {/* Beak — upper */}
        <path d="M 112 69 C 122 66 132 70 130 76 C 128 80 120 80 112 78 Z"
          fill={C.beak} />
        {/* Beak — lower */}
        <path d="M 112 77 C 120 78 126 80 124 84 C 122 87 116 86 112 84 Z"
          fill={C.beak} opacity="0.85" />
        {/* Beak highlight */}
        <path d="M 116 68 C 124 67 128 70 126 73 Z" fill="white" opacity="0.3" />
        {/* Egg in beak */}
        <ellipse cx="130" cy="72" rx="7.5" ry="6.5" fill={`url(#${id}-egg)`} />
        <ellipse cx="128" cy="70" rx="3" ry="2.5" fill="white" opacity="0.5" />
      </g>

      {/* ── Legs ─────────────────────────────────────────────────────── */}
      {showLegs && (
        <g className="sankofa-view-legs" opacity="0.9">
          {/* Left leg */}
          <path d="M 90 150 C 88 158 84 166 80 174 L 83 174 C 87 166 91 158 92 150 Z"
            fill={C.body} stroke={C.shadow} strokeWidth="0.5" />
          <path d="M 80 174 C 76 176 72 174 70 172 M 80 174 C 80 178 78 180 76 178 M 80 174 C 82 178 84 178 84 175"
            fill="none" stroke={C.claws} strokeWidth="1.2" strokeLinecap="round" />
          {/* Right leg */}
          <path d="M 110 150 C 112 158 116 166 120 174 L 117 174 C 113 166 109 158 108 150 Z"
            fill={C.body} stroke={C.shadow} strokeWidth="0.5" />
          <path d="M 120 174 C 124 176 128 174 130 172 M 120 174 C 120 178 122 180 124 178 M 120 174 C 118 178 116 178 116 175"
            fill="none" stroke={C.claws} strokeWidth="1.2" strokeLinecap="round" />
        </g>
      )}
    </g>
  );
}

// ── View wrapper ───────────────────────────────────────────────────────────────
interface BirdViewProps {
  size?: number;
  wingState?: WingState;
  tailState?: TailState;
  className?: string;
  label?: string;
  showLabel?: boolean;
}

// ── 1. FRONT VIEW ─────────────────────────────────────────────────────────────
export function SankofaBirdFront({
  size = 120, wingState = "relaxed", tailState = "wide",
  className = "", label = "FRONT", showLabel = false,
}: BirdViewProps) {
  const id = useBirdId("sbv-front");
  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      {showLabel && <div className="absolute bottom-0 left-0 right-0 text-center text-xs text-muted-foreground font-mono pb-1">{label}</div>}
      <svg viewBox="0 0 200 200" width={size} height={size} overflow="visible">
        <BirdDefs id={id} />
        <BirdBody id={id} wingState={wingState} tailState={tailState} />
      </svg>
    </div>
  );
}

// ── 2. FRONT 3/4 RIGHT ────────────────────────────────────────────────────────
// Right wing foreshortened (~55%), left wing full; body skewed for depth
export function SankofaBirdFront3QRight({
  size = 120, wingState = "relaxed", tailState = "wide",
  className = "", label = "FRONT 3/4 RIGHT", showLabel = false,
}: BirdViewProps) {
  const id = useBirdId("sbv-f3qr");
  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      {showLabel && <div className="absolute bottom-0 left-0 right-0 text-center text-xs text-muted-foreground font-mono pb-1">{label}</div>}
      <svg viewBox="0 0 200 200" width={size} height={size} overflow="visible">
        <BirdDefs id={id} />
        {/* Perspective transform: skewX gives depth illusion */}
        <g transform="translate(0,0) skewX(-10) scale(1,1)">
          {/* Far (right) wing — foreshortened, rendered first */}
          <g transform="scale(-1,1) translate(-200,0) translate(20,0) scale(0.52,0.88) translate(-20,0)">
            <path d={leftWingPath(wingState)} fill={`url(#${id}-wing-under)`} opacity="0.75" />
          </g>
          {/* Body + head + near wing */}
          <BirdBody id={id} wingState={wingState} tailState={tailState} />
          {/* Extra depth shadow on far side */}
          <ellipse cx="122" cy="115" rx="18" ry="24" fill={C.shadow} opacity="0.18" />
        </g>
      </svg>
    </div>
  );
}

// ── 3. FRONT 3/4 LEFT ─────────────────────────────────────────────────────────
// CSS mirror of Front3QRight — avoids SVG double-negation of BirdBody internal mirrors
export function SankofaBirdFront3QLeft({
  size = 120, wingState = "relaxed", tailState = "wide",
  className = "", label = "FRONT 3/4 LEFT", showLabel = false,
}: BirdViewProps) {
  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      {showLabel && (
        <div
          className="absolute bottom-0 left-0 right-0 text-center text-xs text-muted-foreground font-mono pb-1"
          style={{ transform: "scaleX(-1)", zIndex: 1 }}
        >
          {label}
        </div>
      )}
      {/* Mirror the Front3QRight horizontally — no SVG double-negation */}
      <div style={{ transform: "scaleX(-1)", transformOrigin: "center", width: size, height: size }}>
        <SankofaBirdFront3QRight size={size} wingState={wingState} tailState={tailState} />
      </div>
    </div>
  );
}

// ── 4. LEFT SIDE VIEW ─────────────────────────────────────────────────────────
// Full profile: near (left) wing shown, far (right) wing hidden behind body.
// Body squished horizontally to simulate 90° rotation.
export function SankofaBirdLeftSide({
  size = 120, wingState = "relaxed", tailState = "speed",
  className = "", label = "LEFT SIDE", showLabel = false,
}: BirdViewProps) {
  const id = useBirdId("sbv-lside");
  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      {showLabel && <div className="absolute bottom-0 left-0 right-0 text-center text-xs text-muted-foreground font-mono pb-1">{label}</div>}
      <svg viewBox="0 0 200 200" width={size} height={size} overflow="visible">
        <BirdDefs id={id} />
        {/* Side-profile body: squished X, slight elevation */}
        <g transform="translate(20,0)">
          {/* Tail — narrow profile */}
          <g transform="translate(-5,0)">
            <path d="M 92 150 C 84 162 76 178 68 196 L 78 194 L 100 196 L 122 194 L 132 196 C 124 178 116 162 108 150 Z"
              fill={`url(#${id}-tail)`} />
          </g>
          {/* Body — profile ellipse (narrower in X) */}
          <ellipse cx="100" cy="118" rx="22" ry="30" fill={`url(#${id}-body)`} />
          {/* Front chest shading */}
          <path d="M 78 100 C 78 90 86 82 100 80 C 100 95 92 108 82 115 Z"
            fill={C.mid} opacity="0.55" />
          {/* Under-tail coverts */}
          <path d="M 82 146 C 80 152 78 158 80 164 C 86 158 90 152 90 146 Z"
            fill={C.deep} opacity="0.7" />

          {/* Near wing (left) — full detail, side-on */}
          <g transform="translate(0,-4)">
            <path
              d={
                wingState === "high-stretch"
                  ? "M 80 105 C 70 88 56 65 30 52 C 20 62 26 78 46 80 C 60 82 72 96 80 108 Z"
                  : wingState === "power-stroke"
                  ? "M 82 112 C 66 120 40 130 18 120 C 12 132 24 144 48 136 C 66 130 78 126 82 122 Z"
                  : wingState === "braking"
                  ? "M 80 108 C 56 90 24 72 4 86 C 0 104 12 118 38 110 C 60 106 74 108 80 114 Z"
                  : wingState === "glide"
                  ? "M 82 108 C 68 104 52 102 34 106 C 24 110 20 118 36 118 C 56 116 74 110 82 114 Z"
                  : "M 82 108 C 66 96 38 84 14 92 C 8 106 20 120 44 116 C 64 112 78 112 84 118 Z"
              }
              fill={`url(#${id}-feather)`}
            />
            {/* Wing coverts */}
            <path
              d={
                wingState === "high-stretch"
                  ? "M 80 108 C 66 100 50 88 36 86 C 30 92 36 102 52 100 C 66 98 76 104 80 108 Z"
                  : "M 82 116 C 68 112 48 110 30 116 C 24 122 36 128 54 124 C 68 120 78 116 82 116 Z"
              }
              fill={`url(#${id}-wing-top)`} opacity="0.8"
            />
            {/* Primaries — separate tips in side view */}
            {[0,1,2,3].map(i => (
              <path key={i}
                d={`M ${20+i*8} ${98-i*2} C ${16+i*8} ${106-i} ${18+i*8} ${112} ${24+i*8} ${110} Z`}
                fill={C.bright} opacity={0.6-i*0.1}
              />
            ))}
          </g>

          {/* Far wing hint — tiny visible behind body */}
          <path d="M 110 108 C 118 100 128 95 140 96 C 144 102 138 110 130 112 Z"
            fill={C.body} opacity="0.45" />

          {/* Neck — side profile */}
          <path d="M 85 90 C 84 80 88 72 100 70 C 112 72 116 80 114 90 C 108 86 92 86 85 90 Z"
            fill={`url(#${id}-body)`} />

          {/* Head — profile, eye on near side, beak pointing left */}
          <circle cx="88" cy="68" r="19" fill={`url(#${id}-head)`} />
          {/* Crest feathers in profile */}
          <path d="M 84 50 C 78 40 70 32 66 28 C 70 36 76 44 82 50 Z" fill={C.deep} />
          <path d="M 90 48 C 88 36 84 24 80 18 C 84 28 88 40 90 48 Z" fill={C.mid} />
          <path d="M 96 50 C 98 38 100 28 100 20 C 98 30 96 42 96 50 Z" fill={C.bright} opacity="0.8" />
          {/* Eye (near side) */}
          <circle cx="94" cy="66" r="5" fill={C.shadow} />
          <circle cx="94" cy="66" r="3.5" fill="#1a1a1a" />
          <circle cx="96" cy="64" r="1.2" fill="white" />
          {/* Beak pointing left */}
          <path d="M 70 70 C 60 68 52 72 54 78 C 56 82 66 80 72 76 Z" fill={C.beak} />
          <path d="M 70 76 C 62 78 56 80 58 85 C 60 88 68 86 72 82 Z" fill={C.beak} opacity="0.85" />
          {/* Egg in beak */}
          <ellipse cx="54" cy="74" rx="6.5" ry="5.5" fill={`url(#${id}-egg)`} />
          <ellipse cx="52" cy="72" rx="2.5" ry="2" fill="white" opacity="0.5" />

          {/* Leg profile */}
          <path d="M 92 150 C 90 160 86 170 82 178 L 85 178 C 89 170 93 160 94 150 Z"
            fill={C.body} />
          <path d="M 82 178 C 78 180 74 178 72 176 M 82 178 C 82 182 80 184 78 182"
            fill="none" stroke={C.claws} strokeWidth="1.2" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
}

// ── 5. RIGHT SIDE VIEW ────────────────────────────────────────────────────────
// Mirror of Left Side — SVG scaleX(-1) applied to the whole group in a wrapper div
export function SankofaBirdRightSide({
  size = 120, wingState = "relaxed", tailState = "speed",
  className = "", label = "RIGHT SIDE", showLabel = false,
}: BirdViewProps) {
  return (
    <div
      className={`relative ${className}`}
      style={{ width: size, height: size, transform: "scaleX(-1)", transformOrigin: "center" }}
    >
      {showLabel && (
        <div
          className="absolute bottom-0 left-0 right-0 text-center text-xs text-muted-foreground font-mono pb-1"
          style={{ transform: "scaleX(-1)" }}
        >
          {label}
        </div>
      )}
      <SankofaBirdLeftSide size={size} wingState={wingState} tailState={tailState} />
    </div>
  );
}

// ── 6. BACK VIEW ──────────────────────────────────────────────────────────────
// Classic Sankofa pose: bird facing away, head turned back to the left
export function SankofaBirdBack({
  size = 120, wingState = "relaxed", tailState = "wide",
  className = "", label = "BACK", showLabel = false,
}: BirdViewProps) {
  const id = useBirdId("sbv-back");
  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      {showLabel && <div className="absolute bottom-0 left-0 right-0 text-center text-xs text-muted-foreground font-mono pb-1">{label}</div>}
      <svg viewBox="0 0 200 200" width={size} height={size} overflow="visible">
        <BirdDefs id={id} />
        {/* Tail fan — prominent from behind */}
        <path d={tailPath(tailState)} fill={`url(#${id}-tail)`} />
        <path d="M 86 152 C 76 164 65 180 58 196 L 72 192 C 78 178 84 162 88 152 Z" fill={C.bright} opacity="0.7" />
        <path d="M 114 152 C 124 164 135 180 142 196 L 128 192 C 122 178 116 162 112 152 Z" fill={C.bright} opacity="0.7" />
        {/* Far outer tail feathers */}
        <path d="M 78 154 C 66 168 52 184 42 198 L 56 194 Z" fill={C.deep} opacity="0.8" />
        <path d="M 122 154 C 134 168 148 184 158 198 L 144 194 Z" fill={C.deep} opacity="0.8" />

        {/* Wings from behind — dorsal (top) surface */}
        <g>
          <path d={leftWingPath(wingState)} fill={`url(#${id}-feather)`} />
          <path d={leftWingCovertsPath(wingState)} fill={`url(#${id}-wing-top)`} opacity="0.8" />
        </g>
        <g transform="translate(200,0) scale(-1,1)">
          <path d={leftWingPath(wingState)} fill={`url(#${id}-feather)`} />
          <path d={leftWingCovertsPath(wingState)} fill={`url(#${id}-wing-top)`} opacity="0.8" />
        </g>

        {/* Back / mantle plumage */}
        <ellipse cx="100" cy="118" rx="34" ry="30" fill={`url(#${id}-body)`} />
        {/* Scapular + mantle feather detail */}
        <path d="M 80 95 C 78 86 82 78 100 76 C 118 78 122 86 120 95 C 114 90 86 90 80 95 Z"
          fill={C.mid} />
        <path d="M 84 95 C 88 88 100 86 100 86 C 100 86 112 88 116 95 C 108 92 92 92 84 95 Z"
          fill={C.bright} opacity="0.4" />
        {/* Back feather stripes */}
        {[-10,-5,0,5,10].map(x => (
          <path key={x}
            d={`M ${100+x} 90 C ${100+x*0.7} 100 ${100+x*0.5} 118 ${100+x*0.3} 130 Z`}
            stroke={C.deep} strokeWidth="1.2" fill="none" opacity="0.5"
          />
        ))}
        {/* Rump iridescence */}
        <ellipse cx="100" cy="112" rx="24" ry="16" fill={`url(#${id}-iri)`} opacity="0.55" />

        {/* Neck — from behind, curved left for Sankofa pose */}
        <path d="M 88 90 C 86 82 88 74 95 70 C 85 72 80 80 80 90 Z"
          fill={`url(#${id}-body)`} />

        {/* Head TURNED BACK — classic Sankofa (looking over left shoulder) */}
        <g transform="rotate(-160, 88, 80)">
          <circle cx="88" cy="68" r="19" fill={`url(#${id}-head)`} />
          {/* Crest visible from this angle */}
          <path d="M 82 50 C 78 40 70 32 66 28 C 70 36 76 44 80 50 Z" fill={C.deep} />
          <path d="M 88 48 C 86 36 82 24 78 18 C 82 28 86 40 88 48 Z" fill={C.mid} />
          {/* Eye (left, now facing viewer due to head turn) */}
          <circle cx="93" cy="66" r="5" fill={C.shadow} />
          <circle cx="93" cy="66" r="3.5" fill="#1a1a1a" />
          <circle cx="95" cy="64" r="1.2" fill="white" />
          {/* Beak */}
          <path d="M 70 70 C 58 68 50 72 52 78 C 54 82 64 80 70 76 Z" fill={C.beak} />
          <path d="M 70 76 C 60 78 54 80 56 85 C 58 88 66 86 70 82 Z" fill={C.beak} opacity="0.85" />
          {/* Egg — held in beak, now visible from rear-left */}
          <ellipse cx="52" cy="74" rx="7" ry="6" fill={`url(#${id}-egg)`} />
          <ellipse cx="50" cy="72" rx="3" ry="2.5" fill="white" opacity="0.5" />
        </g>

        {/* Legs from behind */}
        <path d="M 90 150 C 88 160 84 170 80 178 L 84 178 C 88 170 92 160 92 150 Z" fill={C.body} />
        <path d="M 110 150 C 112 160 116 170 120 178 L 116 178 C 112 170 108 160 108 150 Z" fill={C.body} />
      </svg>
    </div>
  );
}

// ── 7. BACK 3/4 LEFT ──────────────────────────────────────────────────────────
// CSS mirror of Back3QRight — avoids SVG double-negation of BirdBody internal mirrors
export function SankofaBirdBack3QLeft({
  size = 120, wingState = "relaxed", tailState = "wide",
  className = "", label = "BACK 3/4 LEFT", showLabel = false,
}: BirdViewProps) {
  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      {showLabel && (
        <div
          className="absolute bottom-0 left-0 right-0 text-center text-xs text-muted-foreground font-mono pb-1"
          style={{ transform: "scaleX(-1)", zIndex: 1 }}
        >
          {label}
        </div>
      )}
      <div style={{ transform: "scaleX(-1)", transformOrigin: "center", width: size, height: size }}>
        <SankofaBirdBack3QRight size={size} wingState={wingState} tailState={tailState} />
      </div>
    </div>
  );
}

// ── 8. BACK 3/4 RIGHT ─────────────────────────────────────────────────────────
export function SankofaBirdBack3QRight({
  size = 120, wingState = "relaxed", tailState = "wide",
  className = "", label = "BACK 3/4 RIGHT", showLabel = false,
}: BirdViewProps) {
  const id = useBirdId("sbv-b3qr");
  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      {showLabel && <div className="absolute bottom-0 left-0 right-0 text-center text-xs text-muted-foreground font-mono pb-1">{label}</div>}
      <svg viewBox="0 0 200 200" width={size} height={size} overflow="visible">
        <BirdDefs id={id} />
        <g transform="scale(-1,1) translate(-200,0) skewX(10) scale(1,1)">
          <BirdBody id={id} wingState={wingState} tailState={tailState} showBack />
          <ellipse cx="78" cy="115" rx="18" ry="24" fill={C.shadow} opacity="0.2" />
        </g>
      </svg>
    </div>
  );
}

// ── 9. TOP-DOWN VIEW ──────────────────────────────────────────────────────────
// Extreme vertical perspective: dorsal (top) surface dominates
export function SankofaBirdTopDown({
  size = 120, wingState = "relaxed",
  className = "", label = "UP VIEW (TOP)", showLabel = false,
}: BirdViewProps) {
  const id = useBirdId("sbv-top");
  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      {showLabel && <div className="absolute bottom-0 left-0 right-0 text-center text-xs text-muted-foreground font-mono pb-1">{label}</div>}
      <svg viewBox="0 0 200 200" width={size} height={size} overflow="visible">
        <BirdDefs id={id} />
        {/* Top-down: full wing spread, compressed body */}
        {/* Wings — dorsal view, full span */}
        <path d={leftWingPath(wingState)} fill={`url(#${id}-feather)`} />
        <g transform="translate(200,0) scale(-1,1)">
          <path d={leftWingPath(wingState)} fill={`url(#${id}-feather)`} />
        </g>
        {/* Wing coverts — brighter on top */}
        <path d={leftWingCovertsPath(wingState)} fill={`url(#${id}-wing-top)`} opacity="0.9" />
        <g transform="translate(200,0) scale(-1,1)">
          <path d={leftWingCovertsPath(wingState)} fill={`url(#${id}-wing-top)`} opacity="0.9" />
        </g>

        {/* Body — top view, foreshortened vertically (looks like an oval from above) */}
        <ellipse cx="100" cy="118" rx="34" ry="18" fill={`url(#${id}-body)`} />
        {/* Mantle / back plumage pattern */}
        <ellipse cx="100" cy="112" rx="22" ry="12" fill={C.mid} opacity="0.5" />
        <ellipse cx="100" cy="108" rx="12" ry="6" fill={C.bright} opacity="0.2" />
        {/* Spine line */}
        <path d="M 100 78 L 100 150" stroke={C.shadow} strokeWidth="1.5" opacity="0.4" />
        {/* Scapular feather rows */}
        {[-8,-4,0,4,8].map(x => (
          <line key={x} x1={100+x} y1={88} x2={100+x*0.5} y2={145}
            stroke={C.body} strokeWidth="1" opacity="0.45"/>
        ))}

        {/* Tail — top view */}
        <ellipse cx="100" cy="158" rx="28" ry="12" fill={`url(#${id}-tail)`} />
        {/* Tail feather tips */}
        {[-24,-14,-6,0,6,14,24].map(x => (
          <ellipse key={x} cx={100+x} cy={168} rx={2} ry={5} fill={C.bright} opacity={0.5} />
        ))}

        {/* Head — small oval from above */}
        <ellipse cx="100" cy="80" rx="16" ry="12" fill={`url(#${id}-head)`} />
        <ellipse cx="100" cy="76" rx="8" ry="6" fill={C.specular} opacity="0.2" />
        {/* Crest feathers from above */}
        <path d="M 88 74 C 82 64 78 54 76 46 Z" fill={C.deep} />
        <path d="M 100 72 C 98 60 96 48 94 40 Z" fill={C.mid} />
        <path d="M 112 74 C 118 64 122 54 124 46 Z" fill={C.bright} opacity="0.8" />
        {/* Beak from above — thin line */}
        <path d="M 112 80 C 120 78 130 80 130 82 C 130 84 120 85 112 84 Z"
          fill={C.beak} />
        {/* Egg from above — small oval */}
        <ellipse cx="130" cy="80" rx="7" ry="5" fill={`url(#${id}-egg)`} />

        {/* Iridescent specular highlight */}
        <ellipse cx="94" cy="100" rx="28" ry="18" fill={`url(#${id}-iri)`} opacity="0.6" />
      </svg>
    </div>
  );
}

// ── 10. BOTTOM-UP VIEW ────────────────────────────────────────────────────────
export function SankofaBirdBottomUp({
  size = 120, wingState = "relaxed",
  className = "", label = "DOWN VIEW (BOTTOM)", showLabel = false,
}: BirdViewProps) {
  const id = useBirdId("sbv-bot");
  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      {showLabel && <div className="absolute bottom-0 left-0 right-0 text-center text-xs text-muted-foreground font-mono pb-1">{label}</div>}
      <svg viewBox="0 0 200 200" width={size} height={size} overflow="visible">
        <BirdDefs id={id} />
        {/* Wings — undersurface (darker) */}
        <path d={leftWingPath(wingState)} fill={`url(#${id}-wing-under)`} />
        <g transform="translate(200,0) scale(-1,1)">
          <path d={leftWingPath(wingState)} fill={`url(#${id}-wing-under)`} />
        </g>
        <path d={leftWingCovertsPath(wingState)} fill={C.body} opacity="0.8" />
        <g transform="translate(200,0) scale(-1,1)">
          <path d={leftWingCovertsPath(wingState)} fill={C.body} opacity="0.8" />
        </g>

        {/* Belly — lighter, fluffy look */}
        <ellipse cx="100" cy="118" rx="34" ry="18" fill={C.mid} />
        <ellipse cx="100" cy="112" rx="22" ry="12" fill={C.bright} opacity="0.25" />
        <ellipse cx="100" cy="108" rx="12" ry="6" fill={C.specular} opacity="0.15" />
        {/* Belly feather rows */}
        {[-10,-5,0,5,10].map(x => (
          <ellipse key={x} cx={100+x} cy={115} rx={3} ry={6} fill={C.deep} opacity={0.3} />
        ))}

        {/* Tail from below */}
        <ellipse cx="100" cy="158" rx="28" ry="12" fill={C.deep} opacity="0.8" />
        {[-24,-14,-6,0,6,14,24].map(x => (
          <ellipse key={x} cx={100+x} cy={166} rx={2} ry={5} fill={C.bright} opacity={0.4} />
        ))}

        {/* Legs — prominent from below */}
        <path d="M 88 150 C 84 158 80 168 76 178 L 80 178 C 84 168 88 158 90 150 Z" fill={C.body} />
        <path d="M 112 150 C 116 158 120 168 124 178 L 120 178 C 116 168 112 158 110 150 Z" fill={C.body} />
        {/* Foot claws — visible from below */}
        <path d="M 76 178 C 70 180 64 178 62 175 M 76 178 C 76 182 74 184 72 182 M 76 178 C 78 182 80 182 80 178"
          fill="none" stroke={C.claws} strokeWidth="1.5" strokeLinecap="round" />
        <path d="M 124 178 C 130 180 136 178 138 175 M 124 178 C 124 182 126 184 128 182 M 124 178 C 122 182 120 182 120 178"
          fill="none" stroke={C.claws} strokeWidth="1.5" strokeLinecap="round" />

        {/* Head from below — chin/throat visible */}
        <ellipse cx="100" cy="80" rx="16" ry="10" fill={C.bright} opacity="0.6" />
        <ellipse cx="100" cy="76" rx="8" ry="5" fill={C.specular} opacity="0.3" />
        {/* Beak from below */}
        <path d="M 110 80 C 118 78 128 80 128 83 C 128 86 118 86 110 85 Z" fill={C.beak} opacity="0.9" />
        <ellipse cx="128" cy="80" rx="6" ry="5" fill={`url(#${id}-egg)`} />
      </svg>
    </div>
  );
}

// ── 11. DIAGONAL UP LEFT ──────────────────────────────────────────────────────
export function SankofaBirdDiagonalUpLeft({
  size = 120, wingState = "relaxed", tailState = "wide",
  className = "", label = "DIAGONAL UP LEFT", showLabel = false,
}: BirdViewProps) {
  const id = useBirdId("sbv-dul");
  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      {showLabel && <div className="absolute bottom-0 left-0 right-0 text-center text-xs text-muted-foreground font-mono pb-1">{label}</div>}
      <svg viewBox="0 0 200 200" width={size} height={size} overflow="visible">
        <BirdDefs id={id} />
        {/* Elevated left quarter: skew + compress to simulate viewing from high-left */}
        <g transform="skewX(-10) skewY(-15) translate(10, 20)">
          <BirdBody id={id} wingState={wingState} tailState={tailState} />
        </g>
      </svg>
    </div>
  );
}

// ── 12. DIAGONAL UP RIGHT ─────────────────────────────────────────────────────
export function SankofaBirdDiagonalUpRight({
  size = 120, wingState = "relaxed", tailState = "wide",
  className = "", label = "DIAGONAL UP RIGHT", showLabel = false,
}: BirdViewProps) {
  const id = useBirdId("sbv-dur");
  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      {showLabel && <div className="absolute bottom-0 left-0 right-0 text-center text-xs text-muted-foreground font-mono pb-1">{label}</div>}
      <svg viewBox="0 0 200 200" width={size} height={size} overflow="visible">
        <BirdDefs id={id} />
        <g transform="scale(-1,1) translate(-200,0) skewX(-10) skewY(-15) translate(10,20)">
          <BirdBody id={id} wingState={wingState} tailState={tailState} />
        </g>
      </svg>
    </div>
  );
}

// ── 13. DIAGONAL DOWN LEFT ────────────────────────────────────────────────────
export function SankofaBirdDiagonalDownLeft({
  size = 120, wingState = "relaxed", tailState = "wide",
  className = "", label = "DIAGONAL DOWN LEFT", showLabel = false,
}: BirdViewProps) {
  const id = useBirdId("sbv-ddl");
  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      {showLabel && <div className="absolute bottom-0 left-0 right-0 text-center text-xs text-muted-foreground font-mono pb-1">{label}</div>}
      <svg viewBox="0 0 200 200" width={size} height={size} overflow="visible">
        <BirdDefs id={id} />
        <g transform="skewX(-10) skewY(15) translate(10,-20)">
          <BirdBody id={id} wingState={wingState} tailState={tailState} />
        </g>
      </svg>
    </div>
  );
}

// ── 14. DIAGONAL DOWN RIGHT ───────────────────────────────────────────────────
export function SankofaBirdDiagonalDownRight({
  size = 120, wingState = "relaxed", tailState = "wide",
  className = "", label = "DIAGONAL DOWN RIGHT", showLabel = false,
}: BirdViewProps) {
  const id = useBirdId("sbv-ddr");
  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      {showLabel && <div className="absolute bottom-0 left-0 right-0 text-center text-xs text-muted-foreground font-mono pb-1">{label}</div>}
      <svg viewBox="0 0 200 200" width={size} height={size} overflow="visible">
        <BirdDefs id={id} />
        <g transform="scale(-1,1) translate(-200,0) skewX(-10) skewY(15) translate(10,-20)">
          <BirdBody id={id} wingState={wingState} tailState={tailState} />
        </g>
      </svg>
    </div>
  );
}

// ── 15. CROSS VIEW ────────────────────────────────────────────────────────────
// Structural wireframe / X-ray cross-section — shows skeleton, pivots, layers
export function SankofaBirdCrossView({
  size = 120,
  className = "", label = "CROSS VIEW", showLabel = false,
}: { size?: number; className?: string; label?: string; showLabel?: boolean }) {
  const markerId = useBirdId("cv-arrow");
  return (
    <div className={`relative ${className}`} style={{ width: size, height: size }}>
      {showLabel && <div className="absolute bottom-0 left-0 right-0 text-center text-xs text-muted-foreground font-mono pb-1">{label}</div>}
      <svg viewBox="0 0 200 200" width={size} height={size} overflow="visible">
        <defs>
          <marker id={markerId} markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill={C.bright} opacity="0.8" />
          </marker>
        </defs>
        {/* Grid lines */}
        <line x1="100" y1="20" x2="100" y2="195" stroke={C.mid} strokeWidth="0.5" strokeDasharray="3,4" opacity="0.3" />
        <line x1="20"  y1="110" x2="180" y2="110" stroke={C.mid} strokeWidth="0.5" strokeDasharray="3,4" opacity="0.3" />

        {/* Body skeleton outline */}
        <ellipse cx="100" cy="118" rx="34" ry="30" fill="none" stroke={C.bright} strokeWidth="1" strokeDasharray="2,3" />
        {/* Keel bone */}
        <line x1="100" y1="88" x2="100" y2="150" stroke={C.gold} strokeWidth="1.5" />
        {/* Spine curve */}
        <path d="M 100 70 C 98 80 100 88 100 88" stroke={C.gold} strokeWidth="1.5" fill="none" />

        {/* Wing skeleton — humerus + radius/ulna + primaries */}
        {/* Left wing */}
        <line x1="68" y1="108" x2="32" y2="98" stroke={C.gold} strokeWidth="2" />    {/* humerus */}
        <line x1="32" y1="98" x2="12" y2="92" stroke={C.gold} strokeWidth="1.5" />   {/* radius */}
        <line x1="12" y1="92" x2="10" y2="88" stroke={C.bright} strokeWidth="1" />
        <line x1="12" y1="92" x2="8" y2="94" stroke={C.bright} strokeWidth="1" />
        <line x1="12" y1="92" x2="9" y2="98" stroke={C.bright} strokeWidth="1" />
        <line x1="12" y1="92" x2="11" y2="102" stroke={C.bright} strokeWidth="1" />
        <line x1="12" y1="92" x2="14" y2="106" stroke={C.bright} strokeWidth="1" />
        {/* Right wing (mirror) */}
        <line x1="132" y1="108" x2="168" y2="98" stroke={C.gold} strokeWidth="2" />
        <line x1="168" y1="98" x2="188" y2="92" stroke={C.gold} strokeWidth="1.5" />
        <line x1="188" y1="92" x2="190" y2="88" stroke={C.bright} strokeWidth="1" />
        <line x1="188" y1="92" x2="192" y2="94" stroke={C.bright} strokeWidth="1" />
        <line x1="188" y1="92" x2="191" y2="98" stroke={C.bright} strokeWidth="1" />
        <line x1="188" y1="92" x2="189" y2="102" stroke={C.bright} strokeWidth="1" />
        <line x1="188" y1="92" x2="186" y2="106" stroke={C.bright} strokeWidth="1" />

        {/* Neck vertebrae dots */}
        {[88,82,76,70].map((y,i) => (
          <circle key={i} cx="100" cy={y} r="2" fill={C.gold} opacity="0.7" />
        ))}

        {/* Head circle + beak bone */}
        <circle cx="100" cy="68" r="20" fill="none" stroke={C.bright} strokeWidth="1" />
        <line x1="112" y1="69" x2="134" y2="74" stroke={C.gold} strokeWidth="1.5" />

        {/* Tail vertebrae */}
        <path d="M 100 150 C 96 162 90 178 84 192" stroke={C.gold} strokeWidth="1.5" fill="none" />
        <path d="M 100 150 C 104 162 110 178 116 192" stroke={C.gold} strokeWidth="1.5" fill="none" />

        {/* Leg skeleton */}
        <line x1="90" y1="150" x2="82" y2="172" stroke={C.gold} strokeWidth="1.5" />
        <line x1="82" y1="172" x2="76" y2="180" stroke={C.bright} strokeWidth="1" />
        <line x1="110" y1="150" x2="118" y2="172" stroke={C.gold} strokeWidth="1.5" />
        <line x1="118" y1="172" x2="124" y2="180" stroke={C.bright} strokeWidth="1" />

        {/* Pivot point markers */}
        {[
          { cx: 100, cy: 118, label: "Body" },
          { cx: 68,  cy: 108, label: "Wing L" },
          { cx: 132, cy: 108, label: "Wing R" },
          { cx: 100, cy: 88,  label: "Neck" },
          { cx: 100, cy: 150, label: "Tail" },
        ].map(({ cx, cy, label: lbl }) => (
          <g key={lbl}>
            <circle cx={cx} cy={cy} r="3.5" fill={C.bright} opacity="0.8" />
            <circle cx={cx} cy={cy} r="1.5" fill="white" />
          </g>
        ))}

        {/* Egg in beak */}
        <ellipse cx="134" cy="72" rx="7" ry="6" fill="none" stroke={C.mid} strokeWidth="1" strokeDasharray="2,2" />
        <circle cx="134" cy="72" r="1.5" fill={C.gold} opacity="0.7" />

        {/* Cross-section center marker */}
        <line x1="96" y1="106" x2="104" y2="106" stroke={C.bright} strokeWidth="1.5" />
        <line x1="100" y1="102" x2="100" y2="110" stroke={C.bright} strokeWidth="1.5" />
        <circle cx="100" cy="106" r="4" fill="none" stroke={C.gold} strokeWidth="1" />
      </svg>
    </div>
  );
}

// ── Wing deformation demo cards ────────────────────────────────────────────────
const WING_STATES: Array<{ state: WingState; label: string; subLabel: string }> = [
  { state: "high-stretch", label: "WINGS UP",      subLabel: "HIGH STRETCH" },
  { state: "relaxed",      label: "WINGS MID",     subLabel: "RELAXED" },
  { state: "power-stroke", label: "WINGS DOWN",    subLabel: "POWER STROKE" },
  { state: "braking",      label: "WINGS FORWARD", subLabel: "BRAKING" },
  { state: "glide",        label: "WINGS BACK",    subLabel: "GLIDE" },
];

const TAIL_STATES: Array<{ state: TailState; label: string; subLabel: string }> = [
  { state: "wide",    label: "TAIL FLARE",  subLabel: "WIDE" },
  { state: "speed",   label: "TAIL NARROW", subLabel: "SPEED" },
  { state: "braking", label: "TAIL FOLDED", subLabel: "BRAKING" },
  { state: "stream",  label: "TAIL STREAM", subLabel: "GLIDE" },
];

// ── Small label card ──────────────────────────────────────────────────────────
function ViewCard({ children, label, subLabel }: {
  children: React.ReactNode; label: string; subLabel: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      {children}
      <p className="text-[9px] font-bold font-mono text-muted-foreground uppercase tracking-wide leading-none">{label}</p>
      <p className="text-[8px] font-mono text-muted-foreground/60 uppercase leading-none">({subLabel})</p>
    </div>
  );
}

// ── Full Asset Pipeline Spritesheet (matches the reference image layout) ───────
export function SankofaBirdAssetPipeline({ tileSize = 90 }: { tileSize?: number }) {
  return (
    <div className="w-full bg-[#04141A] rounded-xl overflow-auto p-4 space-y-6">
      {/* Header */}
      <div className="text-center space-y-0.5">
        <h2 className="text-sm font-bold font-mono text-[#0FE5D4] uppercase tracking-widest">
          Sankofa Bird — Official SVG Asset Pipeline
        </h2>
        <p className="text-[10px] font-mono text-[#2683AB]">
          Built from SankofaBirdSvg.tsx · Master Vector (React SVG)
        </p>
      </div>

      {/* Row 1: Cardinal + 3/4 views */}
      <div>
        <p className="text-[9px] font-mono text-[#2683AB] uppercase mb-2">Cardinal + 3/4 Views (8)</p>
        <div className="flex flex-wrap gap-3">
          {[
            { C: SankofaBirdFront,        label: "FRONT",          sub: "0°" },
            { C: SankofaBirdFront3QRight, label: "FRONT 3/4",      sub: "RIGHT" },
            { C: SankofaBirdFront3QLeft,  label: "FRONT 3/4",      sub: "LEFT" },
            { C: SankofaBirdLeftSide,     label: "LEFT SIDE",      sub: "90°" },
            { C: SankofaBirdRightSide,    label: "RIGHT SIDE",     sub: "270°" },
            { C: SankofaBirdBack3QLeft,   label: "BACK 3/4",       sub: "LEFT" },
            { C: SankofaBirdBack3QRight,  label: "BACK 3/4",       sub: "RIGHT" },
            { C: SankofaBirdBack,         label: "BACK",           sub: "180°" },
          ].map(({ C: ViewComp, label, sub }) => (
            <ViewCard key={label+sub} label={label} subLabel={sub}>
              <ViewComp size={tileSize} />
            </ViewCard>
          ))}
        </div>
      </div>

      {/* Row 2: Vertical + Diagonal + Cross */}
      <div>
        <p className="text-[9px] font-mono text-[#2683AB] uppercase mb-2">Vertical + Diagonal + Cross Views (7)</p>
        <div className="flex flex-wrap gap-3">
          {[
            { C: SankofaBirdTopDown,           label: "UP VIEW",         sub: "TOP" },
            { C: SankofaBirdBottomUp,           label: "DOWN VIEW",       sub: "BOTTOM" },
            { C: SankofaBirdDiagonalUpLeft,     label: "DIAGONAL UP",     sub: "LEFT" },
            { C: SankofaBirdDiagonalUpRight,    label: "DIAGONAL UP",     sub: "RIGHT" },
            { C: SankofaBirdDiagonalDownLeft,   label: "DIAGONAL DOWN",   sub: "LEFT" },
            { C: SankofaBirdDiagonalDownRight,  label: "DIAGONAL DOWN",   sub: "RIGHT" },
          ].map(({ C: ViewComp, label, sub }) => (
            <ViewCard key={label+sub} label={label} subLabel={sub}>
              <ViewComp size={tileSize} />
            </ViewCard>
          ))}
          <ViewCard label="CROSS VIEW" subLabel="WIREFRAME">
            <SankofaBirdCrossView size={tileSize} />
          </ViewCard>
        </div>
      </div>

      {/* Wing deformation states */}
      <div>
        <p className="text-[9px] font-mono text-[#2683AB] uppercase mb-2">Wing Deformation Examples (5)</p>
        <div className="flex flex-wrap gap-3">
          {WING_STATES.map(({ state, label, subLabel }) => (
            <ViewCard key={state} label={label} subLabel={subLabel}>
              <SankofaBirdFront size={tileSize} wingState={state} />
            </ViewCard>
          ))}
        </div>
      </div>

      {/* Tail deformation states */}
      <div>
        <p className="text-[9px] font-mono text-[#2683AB] uppercase mb-2">Tail Deformation Examples (4)</p>
        <div className="flex flex-wrap gap-3">
          {TAIL_STATES.map(({ state, label, subLabel }) => (
            <ViewCard key={state} label={label} subLabel={subLabel}>
              <SankofaBirdFront size={tileSize} tailState={state} />
            </ViewCard>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Exports (all named, tree-shakeable) ────────────────────────────────────────
export type { WingState, TailState, ViewAngle };
export {
  BirdDefs,
  BirdBody,
  leftWingPath,
  leftWingCovertsPath,
  tailPath,
};
