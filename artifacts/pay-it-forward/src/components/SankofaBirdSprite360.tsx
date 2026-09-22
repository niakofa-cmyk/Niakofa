/**
 * SankofaBirdSprite360.tsx
 *
 * 12-step illusion-perspective turn sequence for the Sankofa Bird.
 *
 * Visual Reference: public/SANKOFA_BIRD_OFFICIAL_REFERENCE.png
 * Spec:             public/SANKOFA_BIRD_ASSET_PIPELINE.md
 *
 * The turn sequence achieves a convincing 3D rotation through CSS-driven
 * transform morphing between 12 discrete angle poses — no WebGL / Three.js.
 * Technique: perspective foreshortening (skewX + scaleX), layered path
 * visibility (front feathers ↔ back feathers), and wing chord compression.
 *
 * Turn steps:
 *   0  FRONT              (  0°)
 *   1  FRONT 3/4 RIGHT    ( 30°)  right wing foreshortens, left extends
 *   2  RIGHT SIDE         ( 90°)  body profile; far wing hidden
 *   3  BACK 3/4 RIGHT     (120°)  back plumage appears; right shoulder
 *   4  BACK               (180°)  head turned left (Sankofa), tail spread
 *   5  BACK 3/4 LEFT      (210°)  mirror of step 3
 *   6  LEFT SIDE          (270°)  mirror of step 2
 *   7  FRONT 3/4 LEFT     (300°)  mirror of step 1
 *   8  DIAGONAL UP LEFT   (315°)  elevated left quarter
 *   9  DIAGONAL DOWN LEFT (330°)  below left quarter
 *  10  FRONT 3/4 LEFT     (345°)  returning
 *  11  FRONT              (360°)  full cycle complete
 *
 * Wing deformation timeline (per step):
 *   0→2  relaxed → power-stroke (acceleration)
 *   2→4  power-stroke → glide (cruise)
 *   4→6  glide → braking (deceleration)
 *   6→8  braking → relaxed (recovery)
 *   8→11 relaxed (idle hover)
 *
 * Usage:
 *   <SankofaBirdTurnSequence autoPlay size={80} />
 *   <SankofaBirdTurnSequenceGrid />  — shows all 12 steps labeled
 *   <SankofaBirdDeformGrid />        — shows wing × tail deformation matrix
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  SankofaBirdFront,
  SankofaBirdFront3QRight,
  SankofaBirdFront3QLeft,
  SankofaBirdLeftSide,
  SankofaBirdRightSide,
  SankofaBirdBack3QLeft,
  SankofaBirdBack3QRight,
  SankofaBirdBack,
  SankofaBirdTopDown,
  SankofaBirdBottomUp,
  SankofaBirdDiagonalUpLeft,
  SankofaBirdDiagonalUpRight,
  SankofaBirdDiagonalDownLeft,
  SankofaBirdDiagonalDownRight,
  SankofaBirdCrossView,
  type WingState,
  type TailState,
} from "./SankofaBirdViews";

// ── Turn step definition ───────────────────────────────────────────────────────
interface TurnStep {
  label: string;
  angle: number;
  wingState: WingState;
  tailState: TailState;
  Component: React.ComponentType<{
    size?: number;
    wingState?: WingState;
    tailState?: TailState;
    className?: string;
  }>;
}

const TURN_STEPS: TurnStep[] = [
  {
    label: "FRONT",            angle:   0, wingState: "relaxed",      tailState: "wide",
    Component: SankofaBirdFront,
  },
  {
    label: "FRONT 3/4\nRIGHT", angle:  30, wingState: "power-stroke", tailState: "speed",
    Component: SankofaBirdFront3QRight,
  },
  {
    label: "RIGHT SIDE",       angle:  90, wingState: "power-stroke", tailState: "speed",
    Component: SankofaBirdRightSide,
  },
  {
    label: "BACK 3/4\nRIGHT",  angle: 120, wingState: "glide",        tailState: "stream",
    Component: SankofaBirdBack3QRight,
  },
  {
    label: "BACK",             angle: 180, wingState: "glide",        tailState: "wide",
    Component: SankofaBirdBack,
  },
  {
    label: "BACK 3/4\nLEFT",   angle: 210, wingState: "glide",        tailState: "stream",
    Component: SankofaBirdBack3QLeft,
  },
  {
    label: "LEFT SIDE",        angle: 270, wingState: "braking",      tailState: "speed",
    Component: SankofaBirdLeftSide,
  },
  {
    label: "FRONT 3/4\nLEFT",  angle: 300, wingState: "braking",      tailState: "speed",
    Component: SankofaBirdFront3QLeft,
  },
  {
    label: "DIAGONAL\nUP LEFT",angle: 315, wingState: "relaxed",      tailState: "wide",
    Component: SankofaBirdDiagonalUpLeft,
  },
  {
    label: "DIAGONAL\nDOWN L", angle: 330, wingState: "relaxed",      tailState: "wide",
    Component: SankofaBirdDiagonalDownLeft,
  },
  {
    label: "FRONT 3/4\nLEFT",  angle: 345, wingState: "relaxed",      tailState: "wide",
    Component: SankofaBirdFront3QLeft,
  },
  {
    label: "FRONT",            angle: 360, wingState: "relaxed",      tailState: "wide",
    Component: SankofaBirdFront,
  },
];

// ── Live turn sequence animator ────────────────────────────────────────────────
/**
 * Animates through all 12 turn steps automatically.
 * Each step is held for `stepMs` milliseconds.
 * `crossFade` enables CSS opacity cross-fade between steps.
 */
export function SankofaBirdTurnSequence({
  size = 80,
  stepMs = 600,
  autoPlay = true,
  crossFade = true,
  showLabel = true,
  showAngle = true,
  onStepChange,
}: {
  size?: number;
  stepMs?: number;
  autoPlay?: boolean;
  crossFade?: boolean;
  showLabel?: boolean;
  showAngle?: boolean;
  onStepChange?: (step: number, angle: number) => void;
}) {
  const [step, setStep] = useState(0);
  const [fading, setFading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const advance = useCallback(() => {
    setFading(true);
    setTimeout(() => {
      setStep(s => {
        const next = (s + 1) % TURN_STEPS.length;
        onStepChange?.(next, TURN_STEPS[next].angle);
        return next;
      });
      setFading(false);
    }, crossFade ? 80 : 0);
  }, [crossFade, onStepChange]);

  useEffect(() => {
    if (!autoPlay) return;
    timerRef.current = setInterval(advance, stepMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoPlay, stepMs, advance]);

  const current = TURN_STEPS[step];
  const { Component } = current;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        style={{
          opacity: fading && crossFade ? 0.3 : 1,
          transition: crossFade ? "opacity 80ms ease" : undefined,
        }}
      >
        <Component size={size} wingState={current.wingState} tailState={current.tailState} />
      </div>
      {(showLabel || showAngle) && (
        <div className="text-center space-y-0.5">
          {showLabel && (
            <p className="text-[9px] font-mono font-bold text-[#0FE5D4] uppercase leading-none whitespace-pre-line">
              {current.label}
            </p>
          )}
          {showAngle && (
            <p className="text-[8px] font-mono text-[#2683AB]">{current.angle}°</p>
          )}
        </div>
      )}
      {/* Step indicator dots */}
      <div className="flex gap-0.5">
        {TURN_STEPS.map((_, i) => (
          <div
            key={i}
            className="rounded-full transition-all duration-150"
            style={{
              width: i === step ? 6 : 3,
              height: 3,
              background: i === step ? "#0FE5D4" : "#2683AB55",
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Static 12-step grid ────────────────────────────────────────────────────────
/**
 * Shows all 12 turn-sequence poses in a labeled grid.
 * Matches the "Turn Sequence (Illusion Perspective — 12 Step)" panel
 * in the official reference image.
 */
export function SankofaBirdTurnSequenceGrid({
  tileSize = 72,
  showNumbers = true,
}: {
  tileSize?: number;
  showNumbers?: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[9px] font-mono text-[#2683AB] uppercase tracking-wider">
        Turn Sequence (Illusion Perspective — 12 Step)
      </p>
      <div className="flex flex-wrap gap-3">
        {TURN_STEPS.map((step, i) => {
          const { Component } = step;
          return (
            <div key={i} className="flex flex-col items-center gap-0.5">
              {showNumbers && (
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold font-mono"
                  style={{ background: "#0FE5D488", color: "#0FE5D4" }}
                >
                  {i + 1}
                </div>
              )}
              <div
                className="rounded-lg overflow-hidden"
                style={{ background: "#04141A", padding: 4 }}
              >
                <Component
                  size={tileSize}
                  wingState={step.wingState}
                  tailState={step.tailState}
                />
              </div>
              <p className="text-[7px] font-bold font-mono text-[#0FE5D4] uppercase text-center leading-tight whitespace-pre-line">
                {step.label}
              </p>
              <p className="text-[7px] font-mono text-[#2683AB]">{step.angle}°</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Wing × Tail deformation matrix ────────────────────────────────────────────
const WING_STATES: WingState[] = ["high-stretch", "relaxed", "power-stroke", "braking", "glide"];
const WING_LABELS: Record<WingState, string> = {
  "high-stretch": "HIGH STRETCH",
  "relaxed":      "RELAXED",
  "power-stroke": "POWER STROKE",
  "braking":      "BRAKING",
  "glide":        "GLIDE",
};
const TAIL_STATES: TailState[] = ["wide", "speed", "braking", "stream"];
const TAIL_LABELS: Record<TailState, string> = {
  "wide":    "WIDE",
  "speed":   "SPEED",
  "braking": "BRAKING",
  "stream":  "GLIDE",
};

/**
 * 5-column wing deformation examples (front view).
 */
export function SankofaBirdWingDeformRow({ tileSize = 80 }: { tileSize?: number }) {
  return (
    <div className="space-y-2">
      <p className="text-[9px] font-mono text-[#2683AB] uppercase tracking-wider">
        Wing Deformation Examples
      </p>
      <div className="flex flex-wrap gap-3">
        {WING_STATES.map(wing => (
          <div key={wing} className="flex flex-col items-center gap-0.5">
            <SankofaBirdFront size={tileSize} wingState={wing} />
            <p className="text-[8px] font-bold font-mono text-[#0FE5D4] uppercase leading-none">
              WINGS {wing === "high-stretch" ? "UP" : wing === "power-stroke" ? "DOWN" : wing === "braking" ? "FORWARD" : wing === "glide" ? "BACK" : "MID"}
            </p>
            <p className="text-[7px] font-mono text-[#2683AB]">({WING_LABELS[wing]})</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 4-column tail deformation examples (front view).
 */
export function SankofaBirdTailDeformRow({ tileSize = 80 }: { tileSize?: number }) {
  return (
    <div className="space-y-2">
      <p className="text-[9px] font-mono text-[#2683AB] uppercase tracking-wider">
        Tail Deformation Examples
      </p>
      <div className="flex flex-wrap gap-3">
        {TAIL_STATES.map(tail => (
          <div key={tail} className="flex flex-col items-center gap-0.5">
            <SankofaBirdFront size={tileSize} tailState={tail} />
            <p className="text-[8px] font-bold font-mono text-[#0FE5D4] uppercase leading-none">
              TAIL {tail === "wide" ? "FLARE" : tail === "speed" ? "NARROW" : tail === "braking" ? "FOLDED" : "STREAM"}
            </p>
            <p className="text-[7px] font-mono text-[#2683AB]">({TAIL_LABELS[tail]})</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Cross-Screen Flight Demo ───────────────────────────────────────────────────
/**
 * Animates the bird physically flying left↔right across a track,
 * with heading synced to travel direction (fixes the "always faces left" issue).
 * Shows the head/neck/body flip as the bird crosses the screen center.
 */
export function SankofaBirdCrossScreenDemo({
  width = 520,
  height = 120,
  size = 64,
  speed = 1,
}: {
  width?: number;
  height?: number;
  size?: number;
  speed?: number;
}) {
  const [x, setX] = useState(0);
  const [facingRight, setFacingRight] = useState(true);
  const dirRef = useRef(1); // 1 = right, -1 = left
  const posRef = useRef(0);

  useEffect(() => {
    let raf: number;
    const maxX = width - size;

    const step = () => {
      posRef.current += dirRef.current * speed * 1.5;
      if (posRef.current >= maxX) {
        posRef.current = maxX;
        dirRef.current = -1;
        setFacingRight(false);
      } else if (posRef.current <= 0) {
        posRef.current = 0;
        dirRef.current = 1;
        setFacingRight(true);
      }
      setX(posRef.current);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [width, size, speed]);

  // Pick the turn-sequence view closest to the heading
  const heading = facingRight ? 90 : 270; // east or west
  const stepIdx = facingRight ? 2 : 6; // RIGHT SIDE or LEFT SIDE
  const { Component } = TURN_STEPS[stepIdx];

  return (
    <div className="space-y-1">
      <p className="text-[9px] font-mono text-[#2683AB] uppercase tracking-wider">
        Cross-Screen Flight Demo — heading synced to travel direction
      </p>
      <div
        className="relative rounded-lg overflow-hidden"
        style={{ width, height, background: "#04141A" }}
      >
        {/* Track line */}
        <div
          className="absolute rounded-full"
          style={{
            left: 0, right: 0,
            top: height / 2 - 0.5,
            height: 1,
            background: "#2683AB33",
          }}
        />
        {/* Ground shadow */}
        <div
          className="absolute rounded-full"
          style={{
            width: size * 0.7,
            height: size * 0.12,
            left: x + size * 0.15,
            top: height / 2 + size * 0.3,
            background: "#0FE5D422",
            filter: "blur(4px)",
            transform: `scaleX(${facingRight ? 1 : -1})`,
          }}
        />
        {/* Bird */}
        <div
          style={{
            position: "absolute",
            left: x,
            top: height / 2 - size / 2,
            transition: "none",
          }}
        >
          <Component size={size} wingState="power-stroke" tailState="speed" />
        </div>
        {/* Heading indicator */}
        <div className="absolute bottom-1 right-2 text-[8px] font-mono text-[#2683AB]">
          heading: {heading}° · {facingRight ? "→ east" : "← west"}
        </div>
      </div>
    </div>
  );
}

// ── Feather Layer Map ─────────────────────────────────────────────────────────
/**
 * Shows the feather depth/overlap layer ordering with numbered labels.
 * Matches the "Feather Layer Map" panel in the official reference image.
 */
export function SankofaBirdFeatherLayerMap({ size = 120 }: { size?: number }) {
  const layers = [
    { n: 1, label: "Primary Feathers (Top)",      color: "#0FE5D4", y: 72 },
    { n: 2, label: "Secondary Feathers (Top)",     color: "#2683AB", y: 80 },
    { n: 3, label: "Coverts (Top)",                color: "#0D7F7A", y: 88 },
    { n: 4, label: "Body Feathers",                color: "#095E5A", y: 96 },
    { n: 5, label: "Tail Feathers (Top)",          color: "#0FE5D4", y: 104 },
    { n: 6, label: "Tail Feathers (Under)",        color: "#2683AB", y: 112 },
    { n: 7, label: "Primary Feathers (Bottom)",    color: "#062E2E", y: 120 },
    { n: 8, label: "Secondary Feathers (Bottom)",  color: "#062E2E", y: 128 },
    { n: 9, label: "Coverts (Bottom)",             color: "#062E2E", y: 136 },
  ];

  return (
    <div className="flex gap-4 items-start">
      <SankofaBirdFront size={size} />
      <div className="space-y-0.5 pt-4">
        {layers.map(({ n, label, color }) => (
          <div key={n} className="flex items-center gap-1.5">
            <div
              className="w-3.5 h-3.5 rounded-sm flex items-center justify-center text-[6px] font-bold"
              style={{ background: color, color: color === "#062E2E" ? "#0FE5D4" : "#04141A" }}
            >
              {n}
            </div>
            <span className="text-[8px] font-mono text-[#2683AB]">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Color + Gradient Legend ────────────────────────────────────────────────────
export function SankofaBirdColorPalette() {
  const swatches = [
    { hex: "#0FE5D4", label: "Primary Bright Teal" },
    { hex: "#2683AB", label: "Mid Teal" },
    { hex: "#0D7F7A", label: "Deep Wing" },
    { hex: "#095E5A", label: "Body Shadow" },
    { hex: "#062E2E", label: "Near-Black Teal" },
    { hex: "#0AF012", label: "Beak / Claws" },
    { hex: "#D0F5F0", label: "Egg Body" },
    { hex: "#FFFFFF", label: "Egg Highlight" },
  ];
  return (
    <div className="space-y-1.5">
      <p className="text-[9px] font-mono text-[#2683AB] uppercase">Color Palette</p>
      <div className="flex flex-wrap gap-2">
        {swatches.map(({ hex, label }) => (
          <div key={hex} className="flex flex-col items-center gap-0.5">
            <div
              className="w-8 h-8 rounded border border-white/10"
              style={{ background: hex }}
            />
            <p className="text-[6px] font-mono text-[#2683AB]">{hex}</p>
            <p className="text-[6px] font-mono text-[#095E5A] max-w-[48px] text-center leading-tight">{label}</p>
          </div>
        ))}
      </div>
      {/* Gradient bars */}
      <div className="space-y-1 pt-1">
        <p className="text-[7px] font-mono text-[#2683AB]">Major Feather Gradient</p>
        <div className="h-3 rounded" style={{
          background: "linear-gradient(90deg, #0FE5D4 0%, #2683AB 28%, #0D7F7A 58%, #095E5A 82%, #062E2E 100%)"
        }} />
        <p className="text-[7px] font-mono text-[#2683AB]">Body Gradient</p>
        <div className="h-3 rounded" style={{
          background: "linear-gradient(90deg, #2683AB 0%, #0D7F7A 45%, #095E5A 100%)"
        }} />
      </div>
    </div>
  );
}

// ── Layer Hierarchy text tree ──────────────────────────────────────────────────
export function SankofaBirdLayerHierarchy() {
  return (
    <div className="space-y-0.5 text-[8px] font-mono text-[#2683AB]">
      <p className="text-[#0FE5D4] font-bold">SankofaBird</p>
      {[
        "└─ Root (Group)",
        "   ├─ Defs (Gradients, Masks, Clips)",
        "   ├─ Body",
        "   │  ├─ Chest",
        "   │  ├─ Back",
        "   │  └─ Underbody",
        "   ├─ Neck",
        "   │  └─ Head",
        "   │     ├─ Crest",
        "   │     ├─ Eye",
        "   │     ├─ Beak (Upper)",
        "   │     └─ Beak (Lower)",
        "   ├─ Egg",
        "   ├─ Left Wing",
        "   │  ├─ Left Wing (Top)",
        "   │  └─ Left Wing (Bottom)",
        "   ├─ Right Wing",
        "   │  ├─ Right Wing (Top)",
        "   │  └─ Right Wing (Bottom)",
        "   ├─ Tail",
        "   │  └─ Tail Feathers",
        "   └─ Legs",
        "      ├─ Left Leg",
        "      └─ Right Leg",
      ].map((line, i) => (
        <p key={i}>{line}</p>
      ))}
    </div>
  );
}

// ── Full 360 Pipeline Showcase (matches reference image layout exactly) ─────────
/**
 * Complete asset pipeline showcase.
 * Mirrors the layout of SANKOFA_BIRD_OFFICIAL_REFERENCE.png:
 *  Row 1: Cardinal + 3/4 views
 *  Row 2: Vertical + Diagonal + Cross views
 *  Row 3: Turn sequence (12 steps)
 *  Row 4: Wing deformation + Tail deformation
 *  Row 5: Feather layer map + Color palette + Layer hierarchy + Pivot points
 */
export function SankofaBird360Pipeline({ tileSize = 80 }: { tileSize?: number }) {
  return (
    <div
      className="w-full rounded-xl overflow-auto p-5 space-y-8 text-left"
      style={{ background: "#04141A", minWidth: 640 }}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-bold font-mono text-[#0FE5D4] uppercase tracking-widest">
            Sankofa Bird — Official SVG Asset Pipeline (From App Source)
          </h2>
          <p className="text-[10px] font-mono text-[#2683AB]">
            Built from SankofaBirdSvg.tsx · Master Vector (React SVG)
          </p>
        </div>
        <div className="text-right text-[8px] font-mono text-[#2683AB] space-y-0.5">
          <p>ASSET TYPE: Vector (SVG)</p>
          <p>STYLE: Layered Gradient Vector</p>
          <p>RENDER: SVG / Rive / Lottie / Canvas</p>
          <p>COORDINATE SYSTEM: Center Origin</p>
          <p>DEFAULT VIEWPORT: 1024 × 1024</p>
          <p>PIVOT (0,0): Body Center</p>
        </div>
      </div>

      {/* Row 1: Cardinal + 3/4 views (8) */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-3 items-end">
          {([
            ["FRONT",          "SankofaBirdFront",        SankofaBirdFront,        {}],
            ["FRONT 3/4\n(RIGHT)","SankofaBirdFront3QRight",SankofaBirdFront3QRight, {}],
            ["FRONT 3/4\n(LEFT)", "SankofaBirdFront3QLeft", SankofaBirdFront3QLeft,  {}],
            ["LEFT SIDE",      "SankofaBirdLeftSide",     SankofaBirdLeftSide,     {}],
            ["RIGHT SIDE",     "SankofaBirdRightSide",    SankofaBirdRightSide,     {}],
            ["BACK 3/4\n(LEFT)", "SankofaBirdBack3QLeft",  SankofaBirdBack3QLeft,   {}],
            ["BACK 3/4\n(RIGHT)","SankofaBirdBack3QRight", SankofaBirdBack3QRight,  {}],
            ["BACK",           "SankofaBirdBack",         SankofaBirdBack,         {}],
          ] as const).map(([label, , Comp, extraProps]) => (
            <div key={String(label)} className="flex flex-col items-center gap-0.5">
              <div style={{ background: "#071C24", borderRadius: 6, padding: 4 }}>
                <Comp size={tileSize} {...(extraProps as object)} />
              </div>
              <p className="text-[7px] font-bold font-mono text-[#0FE5D4] uppercase text-center leading-tight whitespace-pre-line">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Row 2: Vertical + Diagonal + Cross (7) */}
      <div className="space-y-2">
        <div className="flex flex-wrap gap-3 items-end">
          {([
            ["UP VIEW\n(TOP)",         SankofaBirdTopDown],
            ["DOWN VIEW\n(BOTTOM)",    SankofaBirdBottomUp],
            ["DIAGONAL UP\n(LEFT)",    SankofaBirdDiagonalUpLeft],
            ["DIAGONAL UP\n(RIGHT)",   SankofaBirdDiagonalUpRight],
            ["DIAGONAL DOWN\n(LEFT)",  SankofaBirdDiagonalDownLeft],
            ["DIAGONAL DOWN\n(RIGHT)", SankofaBirdDiagonalDownRight],
            ["CROSS VIEW",             SankofaBirdCrossView],
          ] as [string, React.ComponentType<{size?: number}>][]).map(([label, Comp]) => (
            <div key={String(label)} className="flex flex-col items-center gap-0.5">
              <div style={{ background: "#071C24", borderRadius: 6, padding: 4 }}>
                <Comp size={tileSize} />
              </div>
              <p className="text-[7px] font-bold font-mono text-[#0FE5D4] uppercase text-center leading-tight whitespace-pre-line">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Row 3: Turn sequence */}
      <SankofaBirdTurnSequenceGrid tileSize={tileSize * 0.85} />

      {/* Row 4: Wing + Tail deformation */}
      <div className="grid grid-cols-2 gap-6">
        <SankofaBirdWingDeformRow tileSize={tileSize} />
        <SankofaBirdTailDeformRow tileSize={tileSize} />
      </div>

      {/* Row 5: Feather layer map + Color palette + Layer hierarchy */}
      <div className="grid grid-cols-3 gap-6">
        <SankofaBirdFeatherLayerMap size={tileSize} />
        <SankofaBirdColorPalette />
        <div className="space-y-4">
          <div>
            <p className="text-[9px] font-mono text-[#2683AB] uppercase mb-1.5">Layer Hierarchy</p>
            <SankofaBirdLayerHierarchy />
          </div>
          <div>
            <p className="text-[9px] font-mono text-[#2683AB] uppercase mb-1.5">Pivots (Centers)</p>
            <div className="text-[8px] font-mono text-[#2683AB] space-y-0.5">
              {[
                ["Body Center",   "(0,0)"],
                ["Left Wing Base","(-32,-8)"],
                ["Right Wing Base","(32,-8)"],
                ["Neck Base",     "(0,-22)"],
                ["Tail Base",     "(0,28)"],
                ["Leg Base L",    "(-10,30)"],
                ["Leg Base R",    "(10,30)"],
                ["Egg Center",    "(18,-38)"],
              ].map(([name, coord]) => (
                <div key={name} className="flex justify-between gap-4">
                  <span className="text-[#0FE5D4]">●</span>
                  <span className="flex-1">{name}</span>
                  <span className="text-[#0D7F7A]">{coord}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Row 6: Cross-screen flight demo */}
      <SankofaBirdCrossScreenDemo width={560} height={100} size={60} />

      {/* Pipeline compatibility footer */}
      <div className="border-t border-[#2683AB22] pt-4 flex flex-wrap gap-6 text-[8px] font-mono">
        <div className="space-y-0.5">
          <p className="text-[#0FE5D4] font-bold uppercase">Asset Notes</p>
          <p className="text-[#2683AB]">• All views from same source layers via rotation + feature deformation</p>
          <p className="text-[#2683AB]">• Uses layered gradients and path overlaps to achieve depth (2.5D illusion)</p>
          <p className="text-[#2683AB]">• Feather deformation achieved via path morphing (not mesh)</p>
          <p className="text-[#2683AB]">• Egg remains held in beak across all views</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-[#0FE5D4] font-bold uppercase">Pipeline Compatibility</p>
          <p className="text-[#2683AB]">✅ SVG (Web) — Primary</p>
          <p className="text-[#2683AB]">✅ Rive — State machine: BirdStateMachine</p>
          <p className="text-[#2683AB]">✅ Lottie — via Bodymovin export</p>
          <p className="text-[#2683AB]">✅ Spine 2D — bone rig matches pivots</p>
          <p className="text-[#2683AB]">✅ Canvas / PixiJS — rasterise at 3×</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-[#0FE5D4] font-bold uppercase">Export Guidelines</p>
          <p className="text-[#2683AB]">• Keep viewport 1024×1024 for consistency</p>
          <p className="text-[#2683AB]">• Maintain center origin (0,0) for all exports</p>
          <p className="text-[#2683AB]">• Enable "Responsive" = false for pixel-perfect</p>
          <p className="text-[#2683AB]">• Use SVGO with FloatPrecision: 3</p>
        </div>
        <div className="space-y-0.5">
          <p className="text-[#0FE5D4] font-bold uppercase">Animation Recommendations</p>
          <p className="text-[#2683AB]">• Use turn sequence for idle / look-around</p>
          <p className="text-[#2683AB]">• Wing deformations for flight cycle</p>
          <p className="text-[#2683AB]">• Tail deformations for speed / braking</p>
          <p className="text-[#2683AB]">• Add slight head-bob for natural motion</p>
        </div>
      </div>
    </div>
  );
}

// ── Named exports ──────────────────────────────────────────────────────────────
export { TURN_STEPS, WING_STATES, WING_LABELS, TAIL_STATES, TAIL_LABELS };
export type { TurnStep };
