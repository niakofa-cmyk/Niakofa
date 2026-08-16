/**
 * LegacyChapterWorld — real, walkable chapter exploration.
 *
 * This replaces the "read scene → tap Next → read next scene" flow that
 * previously WAS legacy-chapter.tsx with actual movement: the player sees
 * a grid world generated from their chapter's real scenes/places
 * (legacy-dynamic-world-layout.ts), walks a character around it with
 * arrow keys / on-screen d-pad, and opens a scene by walking onto its
 * landmark tile. Scenes before the player's current progress are visible
 * as visited landmarks they can revisit; the scene at their current
 * progress glows as the active destination; later scenes are dimmed
 * (visible, so the world doesn't feel truncated, but not yet "walkable
 * into" narratively — walking onto them simply re-opens them early,
 * which is fine, this isn't a puzzle gate).
 *
 * Movement/collision/rendering here is intentionally independent of
 * legacy-living-world.tsx (the House-of-Mensah demo world), which is
 * hardcoded to one fictional family's fixed 12-region map and isn't a fit
 * for an arbitrary real family's generated chapter. This component is the
 * per-family equivalent, built on real data.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, MessageSquare, BookOpen, Sparkles, ScrollText } from "lucide-react";
import {
  buildChapterWorldLayout,
  isChapterWorldPositionWalkable,
  getChapterWorldLandmarkAt,
  type ChapterWorldLayout,
  type ChapterWorldPosition,
  type ChapterWorldSceneInput,
  type ChapterWorldLandmark,
} from "@/lib/legacy-dynamic-world-layout";
import { LegacyCharacterSprite, type LegacySpriteFacing } from "@/components/legacy-character-sprite";
import {
  WORLD_TILE_VISUAL,
  getEnvAsset,
  type LegacyWorldTileId,
} from "@/lib/legacy-environment-assets";

const TILE_PX = 44;

/** CSS fallback colors — still used when the PNG is unavailable. */
const TILE_CSS_FALLBACK: Record<string, string> = {
  grass_01: "#2f4a1e",
  grass_02: "#35521f",
  dirt_path: "#8a6a3a",
  tree_canopy: "#16240f",
  water: "#1c3a52",
  compound_wall: "#4a3624",
  fence: "#5a4530",
  sand: "#c7ad7a",
  red_earth: "#7a4a26",
  thatch_roof: "#6b5024",
  baobab_trunk: "#5a3d1f",
  market_stall: "#8a5a2a",
  cocoa_row: "#3a2a14",
};

const SCENE_ICON: Record<ChapterWorldSceneInput["type"], typeof MessageSquare> = {
  narration: ScrollText,
  dialogue: MessageSquare,
  reflection: Sparkles,
  context: BookOpen,
};

export interface LegacyChapterWorldProps {
  chapterId: number;
  scenes: readonly ChapterWorldSceneInput[];
  /** Scene number the player has reached — landmarks past this are dimmed but still walkable. */
  activeSceneNumber: number;
  /** Which scenes are already completed (for the "visited" checkmark ring). */
  completedSceneNumbers: ReadonlySet<number>;
  ageGroup: "adult" | "kid";
  gender: "male" | "female" | "unspecified";
  characterId?: string;
  lifeStage?: "youth" | "adult" | "mature" | "elder";
  era?: string;
  appearanceSeed?: string;
  /** Display name for the small "Walking as ___" badge. Optional — omitted when no ancestor is resolved. */
  characterName?: string | null;
  /** Fired when the player walks onto a scene's landmark tile. */
  onEnterScene: (sceneNumber: number) => void;
}

export function LegacyChapterWorld({
  chapterId,
  scenes,
  activeSceneNumber,
  completedSceneNumbers,
  ageGroup,
  gender,
  characterId,
  lifeStage,
  era,
  appearanceSeed,
  characterName,
  onEnterScene,
}: LegacyChapterWorldProps) {
  const layout: ChapterWorldLayout = buildChapterWorldLayout(chapterId, scenes);
  const [position, setPosition] = useState<ChapterWorldPosition>(layout.spawn);
  const [facing, setFacing] = useState<LegacySpriteFacing>("down");
  const [motion, setMotion] = useState<"idle" | "walk">("idle");
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enteredRef = useRef<number | null>(null);

  // Re-spawn if the chapter identity changes (new chapter, different layout).
  useEffect(() => {
    setPosition(layout.spawn);
    enteredRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId, scenes.length]);

  const tryMove = useCallback((dRow: number, dCol: number, nextFacing: LegacySpriteFacing) => {
    setFacing(nextFacing);
    setMotion("walk");
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => setMotion("idle"), 220);

    setPosition((prev) => {
      const next = { row: prev.row + dRow, column: prev.column + dCol };
      if (!isChapterWorldPositionWalkable(layout, next)) return prev;
      return next;
    });
  }, [layout]);

  // Keyboard movement
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "w") tryMove(-1, 0, "up");
      else if (e.key === "ArrowDown" || e.key === "s") tryMove(1, 0, "down");
      else if (e.key === "ArrowLeft" || e.key === "a") tryMove(0, -1, "left");
      else if (e.key === "ArrowRight" || e.key === "d") tryMove(0, 1, "right");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tryMove]);

  // Landmark-entered detection — fires once per arrival, resets when the
  // player steps off (so re-entering the same tile re-opens the scene).
  useEffect(() => {
    const landmark = getChapterWorldLandmarkAt(layout, position);
    if (landmark && enteredRef.current !== landmark.sceneNumber) {
      enteredRef.current = landmark.sceneNumber;
      onEnterScene(landmark.sceneNumber);
    } else if (!landmark) {
      enteredRef.current = null;
    }
  }, [position, layout, onEnterScene]);

  return (
    <div className="relative w-full h-full flex flex-col bg-[#0e1111]">
      {characterName && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 text-[11px] font-bold text-amber-300 bg-stone-900/80 border border-amber-900/40 rounded-full px-3 py-1">
          Walking as {characterName}
        </div>
      )}
      {/* Grid world */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-4">
        <div
          className="relative rounded-2xl overflow-hidden border border-stone-800/60 shadow-2xl"
          style={{
            width: layout.columns * TILE_PX,
            height: layout.rows * TILE_PX,
            display: "grid",
            gridTemplateColumns: `repeat(${layout.columns}, ${TILE_PX}px)`,
            gridTemplateRows: `repeat(${layout.rows}, ${TILE_PX}px)`,
          }}
        >
          {layout.map.map((rowTiles, r) =>
            rowTiles.map((tile, c) => {
              const visual = WORLD_TILE_VISUAL[tile as LegacyWorldTileId]?.(r, c);
              const asset = visual?.assetId ? getEnvAsset(visual.assetId) : undefined;
              const fallback = TILE_CSS_FALLBACK[tile] ?? "#222";
              return (
                <div
                  key={`${r}-${c}`}
                  style={{
                    width: TILE_PX,
                    height: TILE_PX,
                    background: fallback,
                    backgroundImage: asset ? `url(${asset.src})` : undefined,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.10)",
                  }}
                />
              );
            }),
          )}

          {/* Landmarks */}
          {layout.landmarks.map((landmark: ChapterWorldLandmark) => {
            const Icon = SCENE_ICON[landmark.type];
            const isActive = landmark.sceneNumber === activeSceneNumber;
            const isDone = completedSceneNumbers.has(landmark.sceneNumber);
            return (
              <div
                key={landmark.sceneNumber}
                className={`absolute flex items-center justify-center rounded-full transition-all ${
                  isActive
                    ? "ring-2 ring-amber-400 bg-amber-500/30 animate-pulse"
                    : isDone
                      ? "ring-1 ring-emerald-500/50 bg-emerald-500/10"
                      : "ring-1 ring-stone-600/40 bg-stone-800/40 opacity-60"
                }`}
                style={{
                  width: TILE_PX - 8,
                  height: TILE_PX - 8,
                  left: landmark.column * TILE_PX + 4,
                  top: landmark.row * TILE_PX + 4,
                  pointerEvents: "none",
                }}
                title={landmark.title}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-amber-300" : isDone ? "text-emerald-400" : "text-stone-500"}`} />
              </div>
            );
          })}

          {/* Player */}
          <div
            className="absolute transition-all duration-150 ease-out"
            style={{
              width: TILE_PX,
              height: TILE_PX,
              left: position.column * TILE_PX,
              top: position.row * TILE_PX,
              pointerEvents: "none",
            }}
          >
            <LegacyCharacterSprite
              ageGroup={ageGroup}
              gender={gender}
              characterId={characterId}
              lifeStage={lifeStage}
              era={era}
              appearanceSeed={appearanceSeed}
              size={TILE_PX}
              facing={facing}
              motion={motion}
            />
          </div>
        </div>
      </div>

      {/* On-screen d-pad — keyboard also works, this is for touch */}
      <div className="flex items-center justify-center gap-2 pb-4">
        <div className="grid grid-cols-3 gap-1.5 w-36">
          <div />
          <DPadButton onPress={() => tryMove(-1, 0, "up")} icon={ArrowUp} />
          <div />
          <DPadButton onPress={() => tryMove(0, -1, "left")} icon={ArrowLeft} />
          <div />
          <DPadButton onPress={() => tryMove(0, 1, "right")} icon={ArrowRight} />
          <div />
          <DPadButton onPress={() => tryMove(1, 0, "down")} icon={ArrowDown} />
          <div />
        </div>
      </div>
    </div>
  );
}

function DPadButton({ onPress, icon: Icon }: { onPress: () => void; icon: typeof ArrowUp }) {
  return (
    <button
      onClick={onPress}
      className="w-11 h-11 rounded-xl bg-stone-800/80 border border-stone-700/60 flex items-center justify-center active:bg-amber-500/30 active:border-amber-400/60 transition-colors"
    >
      <Icon className="w-5 h-5 text-stone-300" />
    </button>
  );
}
