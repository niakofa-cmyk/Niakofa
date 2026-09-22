/**
 * BlackPantherViews.tsx
 *
 * Expansion scaffold for the Black Panther's 15-view / 12-turn-sequence
 * vocabulary, mirroring SankofaBirdViews.tsx 1:1 in shape so this can
 * become a high-resolution Sprite360-driven companion — see
 * public/BLACK_PANTHER_ASSET_PIPELINE.md.
 *
 * STATUS: every view below renders the shipped layered BlackPantherSvg
 * master with a fixed rotation to approximate the named angle. Replace one
 * function body at a time with high-resolution per-view paths — the exported names, props, and
 * LegState/TailState types are the stable contract the rest of the app
 * (and a future BlackPantherSprite360.tsx) will build on, so they should
 * not change even as the internals get replaced.
 *
 * ViewBox target (per the official pipeline doc): 1024×1024, center
 * origin. Each view component below still renders at the app's 40×40
 * marker viewBox for now (via BlackPantherSvg) — the real art should be
 * authored at 1024×1024 and exported down, same as the Bird's pipeline.
 */

import type { ComponentType, ReactElement } from "react";
import { BlackPantherSvg } from "./BlackPantherSvg";
import type { BlackPantherProps } from "./Core/Types";

/** Leg deformation states — public/BLACK_PANTHER_ASSET_PIPELINE.md § Leg Deformation States */
export type LegState =
  | "reach-forward"  // leading leg fully extended, stride opening
  | "plant"          // paw touches ground, weight transfer begins
  | "push-off"       // trailing leg drives, haunch compresses
  | "curl-up"        // leg tucked under body — mid-stride recovery
  | "reach-back";    // trailing leg fully extended behind

/** Tail deformation states — public/BLACK_PANTHER_ASSET_PIPELINE.md § Tail Deformation States */
export type TailState =
  | "curve-relaxed"    // idle, gentle downward-then-up curve
  | "s-curve-balanced" // walking counterbalance
  | "flick-fast"       // quick snap — alert/notify reaction
  | "loop-tight"       // coiled — pounce wind-up / celebrate
  | "straight-aligned"; // full sprint, trailing straight for balance

interface ViewProps {
  size?: number;
  legState?: LegState;
  tailState?: TailState;
  className?: string;
}

/** Shared master marker used by every view until high-resolution paths land. */
function MasterView({ angle, size = 40, className }: { angle: number; size?: number; className?: string }): ReactElement {
  const props: BlackPantherProps = { heading: angle, mapBearing: 0, size };
  return (
    <div className={className} style={{ display: "inline-block" }}>
      <BlackPantherSvg {...props} />
    </div>
  );
}

// ── Cardinal + 3/4 views (8) ────────────────────────────────────────────────
export function BlackPantherFront(p: ViewProps): ReactElement { return <MasterView angle={0} {...p} />; }
export function BlackPantherFront3QRight(p: ViewProps): ReactElement { return <MasterView angle={30} {...p} />; }
export function BlackPantherFront3QLeft(p: ViewProps): ReactElement { return <MasterView angle={330} {...p} />; }
export function BlackPantherLeftSide(p: ViewProps): ReactElement { return <MasterView angle={270} {...p} />; }
export function BlackPantherRightSide(p: ViewProps): ReactElement { return <MasterView angle={90} {...p} />; }
export function BlackPantherBack3QLeft(p: ViewProps): ReactElement { return <MasterView angle={210} {...p} />; }
export function BlackPantherBack3QRight(p: ViewProps): ReactElement { return <MasterView angle={150} {...p} />; }
export function BlackPantherBack(p: ViewProps): ReactElement { return <MasterView angle={180} {...p} />; }

// ── Vertical + diagonal + cross views (7) ───────────────────────────────────
export function BlackPantherTopDown(p: ViewProps): ReactElement { return <MasterView angle={0} {...p} />; }
export function BlackPantherBottomUp(p: ViewProps): ReactElement { return <MasterView angle={180} {...p} />; }
export function BlackPantherDiagonalUpLeft(p: ViewProps): ReactElement { return <MasterView angle={315} {...p} />; }
export function BlackPantherDiagonalUpRight(p: ViewProps): ReactElement { return <MasterView angle={45} {...p} />; }
export function BlackPantherDiagonalDownLeft(p: ViewProps): ReactElement { return <MasterView angle={225} {...p} />; }
export function BlackPantherDiagonalDownRight(p: ViewProps): ReactElement { return <MasterView angle={135} {...p} />; }
export function BlackPantherCrossView(p: ViewProps): ReactElement { return <MasterView angle={0} {...p} />; }

/** Grid of all 15 views, labeled — dev/audit tool, mirrors SankofaBirdAssetPipeline(). */
export function BlackPantherAssetPipeline({ tileSize = 90 }: { tileSize?: number }): ReactElement {
  const views: { label: string; Component: ComponentType<ViewProps> }[] = [
    { label: "FRONT", Component: BlackPantherFront },
    { label: "FRONT 3/4 (RIGHT)", Component: BlackPantherFront3QRight },
    { label: "FRONT 3/4 (LEFT)", Component: BlackPantherFront3QLeft },
    { label: "LEFT SIDE", Component: BlackPantherLeftSide },
    { label: "RIGHT SIDE", Component: BlackPantherRightSide },
    { label: "BACK 3/4 (LEFT)", Component: BlackPantherBack3QLeft },
    { label: "BACK 3/4 (RIGHT)", Component: BlackPantherBack3QRight },
    { label: "BACK", Component: BlackPantherBack },
    { label: "UP (TOP)", Component: BlackPantherTopDown },
    { label: "DOWN (BOTTOM)", Component: BlackPantherBottomUp },
    { label: "DIAGONAL UP (LEFT)", Component: BlackPantherDiagonalUpLeft },
    { label: "DIAGONAL UP (RIGHT)", Component: BlackPantherDiagonalUpRight },
    { label: "DIAGONAL DOWN (LEFT)", Component: BlackPantherDiagonalDownLeft },
    { label: "DIAGONAL DOWN (RIGHT)", Component: BlackPantherDiagonalDownRight },
    { label: "CROSS VIEW", Component: BlackPantherCrossView },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(5, ${tileSize}px)`, gap: 12 }}>
      {views.map(({ label, Component }) => (
        <div key={label} style={{ textAlign: "center" }}>
          <Component size={tileSize * 0.6} />
          <div style={{ fontSize: 9, opacity: 0.6, marginTop: 4 }}>{label}</div>
        </div>
      ))}
    </div>
  );
}
