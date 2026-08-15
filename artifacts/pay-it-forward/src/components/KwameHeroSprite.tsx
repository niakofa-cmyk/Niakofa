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
      <div
        role="img"
        aria-label={`Kwame ${clip} (art not yet delivered)`}
        className={`relative flex items-center justify-center rounded-xl border-2 border-dashed border-amber-700/50 bg-amber-950/30 text-[10px] font-bold uppercase tracking-wide text-amber-500/80 ${className}`}
        style={{ width: size, height: size }}
      >
        {clip}
      </div>
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
