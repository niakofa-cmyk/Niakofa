/**
 * Kwame Hero Sprite — frame-stepping renderer for the canonical hero atlas.
 *
 * Distinct from the generator library's LegacyCharacterSprite (48x48 tiles,
 * CSS background-position over a fixed 144x192 sheet, used for NPCs/filler).
 * Kwame is a hand-finished canonical story character per the Visual +
 * Runtime Bible ("hand-finish canonical story characters and hero locations
 * so the game has one coherent art identity") at a different scale (256px
 * source cells, ~160px world height) — it needs its own renderer rather than
 * being squeezed into the generator's tile assumptions.
 *
 * Renders one <img> per frame (not a spritesheet crop) because the source
 * atlas frames were extracted to individual transparent PNGs — see
 * kwame-sprite-atlas.ts. Swap the <img> for a canvas-drawImage call with no
 * change to the public API if/when a real packed spritesheet + texture atlas
 * replaces individual files for production performance.
 *
 * For clips that haven't been drawn yet (KWAME_PENDING_ART_CLIPS), renders a
 * styled placeholder that communicates the animation category visually — far
 * better than a bare label box, and useful for gameplay testing before the
 * final hand-drawn frames arrive.
 */
import { useEffect, useRef, useState } from "react";
import {
  KWAME_ATLAS_FRAMES,
  KWAME_ATLAS_FPS,
  KWAME_PENDING_ART_CLIPS,
  type KwameClipName,
} from "@/lib/kwame-sprite-atlas";

export interface KwameHeroSpriteProps {
  clip: KwameClipName;
  /** Pixel height to render at. Width follows the frame's own aspect ratio (frames are square). */
  size?: number;
  className?: string;
  /** false freezes on the clip's first frame — useful for menu/preview contexts. */
  playing?: boolean;
  /** Called once per animation loop, e.g. to chain attack -> recovery -> idle. */
  onLoopComplete?: () => void;
  /** false plays the clip once and holds the last frame instead of looping. */
  loop?: boolean;
}

// ── Placeholder visual config per animation category ─────────────────────────

type PlaceholderCategory = "attack" | "dodge" | "guard" | "jump" | "aerial" | "fall" | "land" | "generic";

function categorizePendingClip(clip: KwameClipName): PlaceholderCategory {
  if (clip.startsWith("light-attack") || clip.startsWith("heavy-attack")) return "attack";
  if (clip.startsWith("dodge")) return "dodge";
  if (clip.startsWith("guard")) return "guard";
  if (clip.startsWith("jump-start") || clip.startsWith("rising") || clip.startsWith("double")) return "jump";
  if (clip.startsWith("aerial")) return "aerial";
  if (clip.startsWith("falling")) return "fall";
  if (clip.startsWith("land")) return "land";
  return "generic";
}

const PLACEHOLDER_CONFIG: Record<PlaceholderCategory, {
  borderColor: string;
  bgColor: string;
  textColor: string;
  pulseClass: string;
  symbol: string;
  label: string;
}> = {
  attack:  { borderColor: "#dc2626", bgColor: "rgba(127,29,29,0.25)", textColor: "#fca5a5", pulseClass: "animate-pulse", symbol: "⚔", label: "ATK" },
  dodge:   { borderColor: "#d97706", bgColor: "rgba(120,53,15,0.25)", textColor: "#fcd34d", pulseClass: "animate-pulse", symbol: "↯", label: "DASH" },
  guard:   { borderColor: "#2563eb", bgColor: "rgba(30,58,138,0.25)", textColor: "#93c5fd", pulseClass: "",             symbol: "🛡", label: "GUARD" },
  jump:    { borderColor: "#7c3aed", bgColor: "rgba(76,29,149,0.25)", textColor: "#c4b5fd", pulseClass: "animate-bounce", symbol: "↑", label: "JUMP" },
  aerial:  { borderColor: "#7c3aed", bgColor: "rgba(76,29,149,0.20)", textColor: "#c4b5fd", pulseClass: "",             symbol: "✦", label: "AIR ATK" },
  fall:    { borderColor: "#6b7280", bgColor: "rgba(31,41,55,0.25)",  textColor: "#d1d5db", pulseClass: "",             symbol: "↓", label: "FALL" },
  land:    { borderColor: "#16a34a", bgColor: "rgba(20,83,45,0.25)",  textColor: "#86efac", pulseClass: "",             symbol: "▼", label: "LAND" },
  generic: { borderColor: "#92400e", bgColor: "rgba(69,26,3,0.25)",   textColor: "#fbbf24", pulseClass: "",             symbol: "◈", label: "???" },
};

/** Human-readable short label for a pending clip name. */
function pendingClipLabel(clip: KwameClipName): string {
  return clip
    .replace(/-down|-up|-left|-right/g, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

// ── Pending-art placeholder ───────────────────────────────────────────────────

function KwamePendingArtPlaceholder({
  clip,
  size,
  className,
}: {
  clip: KwameClipName;
  size: number;
  className: string;
}) {
  const category = categorizePendingClip(clip);
  const cfg = PLACEHOLDER_CONFIG[category];
  const label = pendingClipLabel(clip);
  const fontSize = Math.max(8, Math.round(size * 0.085));
  const symbolSize = Math.max(16, Math.round(size * 0.25));

  return (
    <div
      role="img"
      aria-label={`Kwame ${label} — art not yet delivered`}
      className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed ${cfg.pulseClass} ${className}`}
      style={{
        width: size,
        height: size,
        borderColor: cfg.borderColor,
        backgroundColor: cfg.bgColor,
        gap: Math.round(size * 0.04),
      }}
    >
      {/* Kwame silhouette — simple CSS figure */}
      <div
        aria-hidden="true"
        style={{
          width: Math.round(size * 0.38),
          height: Math.round(size * 0.55),
          position: "relative",
          opacity: 0.35,
        }}
      >
        {/* Head */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: Math.round(size * 0.14),
            height: Math.round(size * 0.14),
            borderRadius: "50%",
            backgroundColor: cfg.textColor,
          }}
        />
        {/* Body */}
        <div
          style={{
            position: "absolute",
            top: Math.round(size * 0.15),
            left: "50%",
            transform: "translateX(-50%)",
            width: Math.round(size * 0.18),
            height: Math.round(size * 0.22),
            borderRadius: "3px",
            backgroundColor: cfg.textColor,
          }}
        />
        {/* Legs */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: Math.round(size * 0.2),
            height: Math.round(size * 0.18),
            borderRadius: "3px",
            backgroundColor: cfg.textColor,
          }}
        />
      </div>

      {/* Action symbol */}
      <div
        aria-hidden="true"
        style={{
          fontSize: symbolSize,
          lineHeight: 1,
          color: cfg.textColor,
          fontStyle: "normal",
        }}
      >
        {cfg.symbol}
      </div>

      {/* Labels */}
      <div
        style={{
          fontSize,
          fontWeight: 800,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: cfg.textColor,
          textAlign: "center",
          lineHeight: 1.1,
          paddingInline: Math.round(size * 0.05),
        }}
      >
        {cfg.label}
      </div>
      <div
        style={{
          fontSize: Math.max(6, Math.round(size * 0.065)),
          color: cfg.textColor,
          opacity: 0.65,
          textAlign: "center",
          lineHeight: 1,
          paddingInline: Math.round(size * 0.05),
        }}
      >
        {label}
      </div>

      {/* Commission indicator dot */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: Math.round(size * 0.04),
          right: Math.round(size * 0.04),
          width: Math.round(size * 0.07),
          height: Math.round(size * 0.07),
          borderRadius: "50%",
          backgroundColor: cfg.borderColor,
          opacity: 0.8,
        }}
      />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * Advances a clip's frame index on a fixed-timestep interval derived from
 * KWAME_ATLAS_FPS (12fps authored, per the production spec) rather than
 * tying frame changes to React's render rate.
 */
export function KwameHeroSprite({
  clip,
  size = 160,
  className = "",
  playing = true,
  onLoopComplete,
  loop = true,
}: KwameHeroSpriteProps) {
  const frames = KWAME_ATLAS_FRAMES[clip];
  const isPendingArt = KWAME_PENDING_ART_CLIPS.includes(clip);
  const [frameIndex, setFrameIndex] = useState(0);
  const rafRef = useRef<number | undefined>(undefined);
  const lastTickRef = useRef<number>(0);

  useEffect(() => {
    setFrameIndex(0);
    lastTickRef.current = 0;
  }, [clip]);

  useEffect(() => {
    if (!playing || !frames || frames.length <= 1) return;
    const msPerFrame = 1000 / KWAME_ATLAS_FPS;

    const tick = (t: number) => {
      if (lastTickRef.current === 0) lastTickRef.current = t;
      const elapsed = t - lastTickRef.current;
      if (elapsed >= msPerFrame) {
        lastTickRef.current = t;
        setFrameIndex((prev) => {
          const next = prev + 1;
          if (next >= frames.length) {
            onLoopComplete?.();
            return loop ? 0 : prev;
          }
          return next;
        });
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, frames, loop, clip]);

  if (isPendingArt || !frames) {
    return (
      <KwamePendingArtPlaceholder
        clip={clip}
        size={size}
        className={className}
      />
    );
  }

  const src = frames[Math.min(frameIndex, frames.length - 1)];
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={`select-none ${className}`}
      style={{ width: size, height: size, imageRendering: "auto" }}
    />
  );
}
