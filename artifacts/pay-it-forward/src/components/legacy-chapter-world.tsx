/**
 * LegacyChapterWorld — real, walkable chapter exploration, PixiJS renderer.
 *
 * Same public component/props as before (legacy-chapter.tsx mounts this
 * with zero changes) — this swap is purely the internals: real WebGL canvas
 * rendering via PixiJS instead of a CSS-grid of <div> tiles. That's what
 * unlocks the things a grid of colored divs can't do — smooth camera,
 * proper animated sprite frames, and later, weather/lighting/parallax
 * layers without a rewrite.
 *
 * Character rendering loads the SAME real spritesheet assets the CSS
 * version used (via resolveWalkingAppearance / legacy-character-engine.ts)
 * as PixiJS Textures, cropped to the correct 48×48 frame per facing
 * direction — same visual result, real texture-cropped sprite this time
 * instead of a background-position hack.
 *
 * World movement/collision/keyboard input is UNCHANGED from the CSS
 * version — that logic never depended on how tiles were drawn, only on
 * the layout data from legacy-dynamic-world-layout.ts.
 */

// Must run before any PixiJS import so this chapter canvas remains compatible
// with strict production Content-Security-Policy headers.
import "pixi.js/unsafe-eval";

import { useEffect, useRef, useState, useCallback } from "react";
import { Application, Container, Graphics, Sprite, Texture, Rectangle, Assets, Text } from "pixi.js";
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";
import {
  buildChapterWorldLayout,
  isChapterWorldPositionWalkable,
  getChapterWorldLandmarkAt,
  type ChapterWorldLayout,
  type ChapterWorldPosition,
  type ChapterWorldSceneInput,
} from "@/lib/legacy-dynamic-world-layout";
import { resolveWalkingAppearance, type LegacyWalkingLayer } from "@/lib/legacy-character-engine";

const TILE_PX = 44;

const TILE_COLOR: Record<string, number> = {
  grass_01: 0x2f4a1e,
  grass_02: 0x35521f,
  dirt_path: 0x8a6a3a,
  red_earth: 0x7a4a26,
  water: 0x1c3a52,
  sand: 0xc7ad7a,
  compound_wall: 0x4a3624,
  thatch_roof: 0x6b5024,
  tree_canopy: 0x16240f,
  baobab_trunk: 0x5a3d1f,
  market_stall: 0x8a5a2a,
  fence: 0x5a4530,
  cocoa_row: 0x3a2a14,
};

const SCENE_ICON_GLYPH: Record<ChapterWorldSceneInput["type"], string> = {
  narration: "\u{1F4DC}", // scroll
  dialogue: "\u{1F4AC}",  // speech balloon
  reflection: "\u{2728}", // sparkles
  context: "\u{1F4D6}",   // open book
};

// Module-level texture cache — same source spritesheet gets reused across
// mounts/characters instead of re-fetching every time this component remounts.
const textureCache = new Map<string, Promise<Texture>>();
function loadBaseTexture(url: string): Promise<Texture> {
  let cached = textureCache.get(url);
  if (!cached) {
    cached = Assets.load(url);
    textureCache.set(url, cached);
  }
  return cached;
}

type Facing = "down" | "left" | "right" | "up";
const FACING_ROW: Record<Facing, number> = { down: 0, left: 1, right: 2, up: 3 };

export interface LegacyChapterWorldProps {
  chapterId: number;
  scenes: readonly ChapterWorldSceneInput[];
  /** Scene number the player has reached — landmarks past this are dimmed but still walkable. */
  activeSceneNumber: number;
  /** Which scenes are already completed (for the "visited" ring). */
  completedSceneNumbers: ReadonlySet<number>;
  ageGroup: "adult" | "kid";
  gender: "male" | "female" | "unspecified";
  characterId?: string;
  lifeStage?: "youth" | "adult" | "mature" | "elder";
  era?: string;
  appearanceSeed?: string;
  /** Display name for the "Walking as ___" badge. Omitted when no ancestor is resolved. */
  characterName?: string | null;
  /**
   * Fired when the player walks onto the always-present Training Ground
   * landmark — this is the Path A mode-switch trigger: the exploration
   * world hands off to LegacyBattleScene for real-time combat, then hands
   * back. Deliberately a fixed practice location generated client-side,
   * not derived from real family scene data — inventing a "combat
   * encounter" tied to someone's actual family history isn't something
   * this world should do implicitly. Optional so existing callers don't
   * need to add it immediately.
   */
  onEnterBattle?: () => void;
  /** Fired when the player walks onto a scene's landmark tile. */
  onEnterScene: (sceneNumber: number) => void;
  /**
   * When false, keyboard movement is ignored entirely — used while a
   * full-screen overlay (LegacyBattleScene, Journal, Map) is open on top
   * of this world, so the same arrow keys don't move both the hidden
   * explorer underneath AND whatever's on top of it. Defaults to true.
   */
  inputEnabled?: boolean;
}

// Sentinel scene number for the synthetic Training Ground landmark —
// guaranteed distinct from real scene numbers, which start at 1.
const TRAINING_GROUND_SCENE_NUMBER = -1;

/**
 * Picks a walkable path cell for the Training Ground landmark that doesn't
 * collide with any real scene landmark, starting near spawn and expanding
 * outward if needed. Deterministic (no randomness) given a fixed layout.
 */
function pickTrainingGroundCell(layout: ChapterWorldLayout): ChapterWorldPosition {
  const used = new Set(layout.landmarks.map((l) => `${l.row},${l.column}`));
  for (let c = layout.spawn.column + 1; c < layout.columns - 1; c += 1) {
    const key = `${layout.spawn.row},${c}`;
    if (!used.has(key)) return { row: layout.spawn.row, column: c };
  }
  for (let r = 1; r < layout.rows - 1; r += 1) {
    for (let c = 1; c < layout.columns - 1; c += 1) {
      const key = `${r},${c}`;
      if (!used.has(key) && layout.map[r]?.[c] !== undefined) return { row: r, column: c };
    }
  }
  return layout.spawn;
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
  onEnterBattle,
  onEnterScene,
  inputEnabled = true,
}: LegacyChapterWorldProps) {
  const layout: ChapterWorldLayout = buildChapterWorldLayout(chapterId, scenes);
  const trainingGroundCell = pickTrainingGroundCell(layout);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const appRef = useRef<Application | null>(null);
  const worldLayerRef = useRef<Container | null>(null);
  const landmarkLayerRef = useRef<Container | null>(null);
  const characterContainerRef = useRef<Container | null>(null);
  const characterSpritesRef = useRef<Sprite[]>([]);

  const [position, setPosition] = useState<ChapterWorldPosition>(layout.spawn);
  const [facing, setFacing] = useState<Facing>("down");
  const [ready, setReady] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enteredRef = useRef<number | null>(null);

  // ── Pixi application lifecycle ────────────────────────────────────────
  useEffect(() => {
    let destroyed = false;
    const app = new Application();
    appRef.current = app;

    (async () => {
      await app.init({
        width: layout.columns * TILE_PX,
        height: layout.rows * TILE_PX,
        backgroundAlpha: 0,
        antialias: false,
        preference: "webgl",
        resolution: Math.min(window.devicePixelRatio || 1, 2),
        autoDensity: true,
      });
      if (destroyed || !containerRef.current) {
        app.destroy(true, { children: true });
        return;
      }
      containerRef.current.appendChild(app.canvas);

      // Static terrain layer — drawn once per layout, never redrawn per frame.
      const worldLayer = new Container();
      const tiles = new Graphics();
      layout.map.forEach((rowTiles, r) => {
        rowTiles.forEach((tile, c) => {
          tiles.rect(c * TILE_PX, r * TILE_PX, TILE_PX, TILE_PX)
            .fill(TILE_COLOR[tile] ?? 0x222222);
        });
      });
      worldLayer.addChild(tiles);
      app.stage.addChild(worldLayer);
      worldLayerRef.current = worldLayer;

      const landmarkLayer = new Container();
      app.stage.addChild(landmarkLayer);
      landmarkLayerRef.current = landmarkLayer;

      const characterContainer = new Container();
      app.stage.addChild(characterContainer);
      characterContainerRef.current = characterContainer;

      setReady(true);
    })();

    return () => {
      destroyed = true;
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      const app = appRef.current;
      appRef.current = null;
      if (app) {
        try { app.destroy(true, { children: true }); } catch { /* already gone */ }
      }
    };
    // Re-create the whole canvas only when the chapter's grid dimensions change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId, layout.rows, layout.columns]);

  // Re-spawn on chapter change.
  useEffect(() => {
    setPosition(layout.spawn);
    enteredRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId, scenes.length]);

  // ── Landmarks — redrawn whenever progress changes, not every frame ─────
  useEffect(() => {
    if (!ready || !landmarkLayerRef.current) return;
    const layer = landmarkLayerRef.current;
    layer.removeChildren();

    for (const landmark of layout.landmarks) {
      const isActive = landmark.sceneNumber === activeSceneNumber;
      const isDone = completedSceneNumbers.has(landmark.sceneNumber);
      const color = isActive ? 0xfbbf24 : isDone ? 0x10b981 : 0x57534e;
      const alpha = isActive || isDone ? 0.85 : 0.45;

      const marker = new Graphics()
        .circle(0, 0, TILE_PX / 2 - 4)
        .fill({ color, alpha: 0.18 })
        .stroke({ color, width: 2, alpha });
      marker.x = landmark.column * TILE_PX + TILE_PX / 2;
      marker.y = landmark.row * TILE_PX + TILE_PX / 2;
      layer.addChild(marker);

      const glyph = new Text({
        text: SCENE_ICON_GLYPH[landmark.type],
        style: { fontSize: 18 },
      });
      glyph.anchor.set(0.5);
      glyph.x = marker.x;
      glyph.y = marker.y;
      glyph.alpha = isActive ? 1 : isDone ? 0.9 : 0.5;
      layer.addChild(glyph);
    }

    // Training Ground — always present, always walkable, not tied to
    // chapter progress (no active/done styling), so it reads as an
    // optional side activity rather than part of the story sequence.
    if (onEnterBattle) {
      const marker = new Graphics()
        .circle(0, 0, TILE_PX / 2 - 4)
        .fill({ color: 0xdc2626, alpha: 0.18 })
        .stroke({ color: 0xdc2626, width: 2, alpha: 0.7 });
      marker.x = trainingGroundCell.column * TILE_PX + TILE_PX / 2;
      marker.y = trainingGroundCell.row * TILE_PX + TILE_PX / 2;
      layer.addChild(marker);

      const glyph = new Text({ text: "\u2694\uFE0F", style: { fontSize: 16 } }); // crossed swords
      glyph.anchor.set(0.5);
      glyph.x = marker.x;
      glyph.y = marker.y;
      layer.addChild(glyph);
    }
  }, [ready, layout.landmarks, activeSceneNumber, completedSceneNumbers, onEnterBattle, trainingGroundCell.row, trainingGroundCell.column]);

  // ── Character sprite — load/rebuild layers when appearance inputs change ──
  useEffect(() => {
    if (!ready || !characterContainerRef.current) return;
    let cancelled = false;
    const appearance = resolveWalkingAppearance({
      ageGroup, gender, characterId, lifeStage, era, appearanceSeed,
    });
    if (!appearance) return;

    (async () => {
      const textures = await Promise.all(
        appearance.layers.map((l: LegacyWalkingLayer) => loadBaseTexture(l.file)),
      );
      if (cancelled || !characterContainerRef.current) return;

      characterContainerRef.current.removeChildren();
      characterSpritesRef.current = textures.map((baseTexture) => {
        const sprite = new Sprite(baseTexture);
        sprite.width = TILE_PX;
        sprite.height = TILE_PX;
        characterContainerRef.current!.addChild(sprite);
        return sprite;
      });
      applyFacingFrame(characterSpritesRef.current, facing);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, ageGroup, gender, characterId, lifeStage, era, appearanceSeed]);

  function applyFacingFrame(sprites: Sprite[], f: Facing) {
    const row = FACING_ROW[f];
    for (const sprite of sprites) {
      const base = sprite.texture;
      // Column 1 (the sheet's idle-facing frame), row = facing — mirrors
      // the CSS version's backgroundPosition math exactly, just as a
      // texture-frame crop instead of a background offset.
      const frame = new Rectangle(48, row * 48, 48, 48);
      sprite.texture = new Texture({ source: base.source, frame });
    }
  }

  // Keep sprite position/frame in sync with movement state every render.
  useEffect(() => {
    if (!characterContainerRef.current) return;
    characterContainerRef.current.x = position.column * TILE_PX;
    characterContainerRef.current.y = position.row * TILE_PX;
    if (characterSpritesRef.current.length) applyFacingFrame(characterSpritesRef.current, facing);
  }, [position, facing]);

  // ── Movement / collision — identical logic to the CSS version ──────────
  const tryMove = useCallback((dRow: number, dCol: number, nextFacing: Facing) => {
    setFacing(nextFacing);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      idleTimerRef.current = null;
    }, 220);

    setPosition((prev: ChapterWorldPosition) => {
      const next = { row: prev.row + dRow, column: prev.column + dCol };
      if (!isChapterWorldPositionWalkable(layout, next)) return prev;
      return next;
    });
  }, [layout]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!inputEnabled) return;
      if (e.key === "ArrowUp" || e.key === "w") tryMove(-1, 0, "up");
      else if (e.key === "ArrowDown" || e.key === "s") tryMove(1, 0, "down");
      else if (e.key === "ArrowLeft" || e.key === "a") tryMove(0, -1, "left");
      else if (e.key === "ArrowRight" || e.key === "d") tryMove(0, 1, "right");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tryMove, inputEnabled]);

  useEffect(() => {
    const isTrainingGround = onEnterBattle
      && position.row === trainingGroundCell.row
      && position.column === trainingGroundCell.column;
    if (isTrainingGround) {
      if (enteredRef.current !== TRAINING_GROUND_SCENE_NUMBER) {
        enteredRef.current = TRAINING_GROUND_SCENE_NUMBER;
        onEnterBattle!();
      }
      return;
    }
    const landmark = getChapterWorldLandmarkAt(layout, position);
    if (landmark && enteredRef.current !== landmark.sceneNumber) {
      enteredRef.current = landmark.sceneNumber;
      onEnterScene(landmark.sceneNumber);
    } else if (!landmark) {
      enteredRef.current = null;
    }
  }, [position, layout, onEnterScene, onEnterBattle, trainingGroundCell.row, trainingGroundCell.column]);

  return (
    <div className="relative w-full h-full flex flex-col bg-[#0e1111]">
      {characterName && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 text-[11px] font-bold text-amber-300 bg-stone-900/80 border border-amber-900/40 rounded-full px-3 py-1">
          Walking as {characterName}
        </div>
      )}

      {/* PixiJS canvas mounts here */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-4">
        <div
          ref={containerRef}
          className="rounded-2xl overflow-hidden border border-stone-800/60 shadow-2xl"
          style={{ width: layout.columns * TILE_PX, height: layout.rows * TILE_PX }}
        />
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
