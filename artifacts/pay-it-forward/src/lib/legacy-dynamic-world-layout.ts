/**
 * legacy-dynamic-world-layout.ts
 *
 * Generates a walkable grid world from a REAL chapter's scenes + vault
 * places, instead of the hardcoded 12-region "House of Mensah" demo layout
 * in legacy-world-layout.ts (which only ever represents one fictional demo
 * family and can't describe an arbitrary real family's chapter).
 *
 * Design:
 *  - One landmark tile per scene, laid out along a single winding
 *    (serpentine) walkable path so scenes are naturally visited in order.
 *  - The path is real terrain (dirt_path), not a blocked decoration tile —
 *    the player walks ONTO a landmark to open that scene, rather than
 *    "bumping" an adjacent blocked tile. Simpler and unambiguous for a
 *    per-family generated world where we can't hand-place bump targets.
 *  - Deterministic: the same chapterId + same ordered scene list always
 *    produces the same layout (seeded PRNG, no Math.random). Leaving and
 *    re-entering a chapter — or two players in a co-op session — see the
 *    same world.
 *  - Reuses LegacyWorldTile from legacy-world-layout.ts so the same tile
 *    art / renderer conventions apply; this is a second layout SOURCE, not
 *    a second tile vocabulary.
 */

import type { LegacyWorldTile } from "./legacy-world-layout";

export type ChapterSceneType = "narration" | "dialogue" | "reflection" | "context";

export interface ChapterWorldSceneInput {
  sceneNumber: number;
  title: string;
  type: ChapterSceneType;
  placeId: number | null;
}

export interface ChapterWorldLandmark {
  sceneNumber: number;
  row: number;
  column: number;
  title: string;
  type: ChapterSceneType;
  placeId: number | null;
}

export interface ChapterWorldPosition {
  row: number;
  column: number;
}

export interface ChapterWorldLayout {
  map: readonly (readonly LegacyWorldTile[])[];
  landmarks: readonly ChapterWorldLandmark[];
  spawn: ChapterWorldPosition;
  rows: number;
  columns: number;
}

// Tiles a player can never stand on — border/decoration only.
const BLOCKED: ReadonlySet<LegacyWorldTile> = new Set<LegacyWorldTile>([
  "water",
  "compound_wall",
  "tree_canopy",
  "fence",
]);

// All landmark tiles use the walkable path tile itself — scene-type
// distinction (dialogue vs reflection vs context) is drawn as an icon
// overlay by the renderer, not encoded as a different (possibly blocked)
// tile type. Kept as a lookup so the renderer has one place to extend.
const SCENE_TILE: Record<ChapterSceneType, LegacyWorldTile> = {
  narration: "dirt_path",
  dialogue: "dirt_path",
  reflection: "dirt_path",
  context: "dirt_path",
};

// ── Deterministic PRNG (mulberry32) — no Math.random anywhere below ──────
function mulberry32(seed: number) {
  let s = seed >>> 0;
  return function random(): number {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromChapter(chapterId: number, sceneCount: number): number {
  // Simple, stable hash — same chapterId + scene count always seeds the same.
  return Math.imul(chapterId + 1, 2654435761) ^ Math.imul(sceneCount + 1, 40503);
}

/**
 * Builds a walkable world for one chapter.
 *
 * Grid sizing scales with scene count so a 3-scene chapter isn't a vast
 * empty field and a 12-scene chapter isn't cramped: roughly 2 columns of
 * path per row, at least 7×7.
 */
export function buildChapterWorldLayout(
  chapterId: number,
  scenes: readonly ChapterWorldSceneInput[],
): ChapterWorldLayout {
  const sceneCount = Math.max(scenes.length, 1);
  const columns = Math.max(7, Math.min(11, sceneCount + 3));
  const interiorRowCount = Math.max(3, Math.ceil(sceneCount / (columns - 2)));
  const rows = interiorRowCount + 2; // + border rows top/bottom

  const rand = mulberry32(seedFromChapter(chapterId, sceneCount));

  // 1. Base field — mostly grass, with a light scatter of tree_canopy
  //    decoration so the world doesn't read as an empty rectangle.
  const map: LegacyWorldTile[][] = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => (rand() < 0.12 ? "tree_canopy" : (rand() < 0.5 ? "grass_01" : "grass_02"))),
  );

  // Border ring is always blocked (walls the explorable area in).
  for (let c = 0; c < columns; c += 1) {
    map[0][c] = "tree_canopy";
    map[rows - 1][c] = "tree_canopy";
  }
  for (let r = 0; r < rows; r += 1) {
    map[r][0] = "tree_canopy";
    map[r][columns - 1] = "tree_canopy";
  }

  // 2. Serpentine walkable path through the interior, row by row,
  //    alternating direction — classic snake layout, always fully connected.
  const pathCells: ChapterWorldPosition[] = [];
  for (let i = 0; i < interiorRowCount; i += 1) {
    const row = 1 + i;
    const leftToRight = i % 2 === 0;
    const colsInRow = Array.from({ length: columns - 2 }, (_, k) => 1 + (leftToRight ? k : columns - 3 - k));
    for (const col of colsInRow) {
      map[row][col] = "dirt_path";
      pathCells.push({ row, column: col });
    }
    // Vertical connector down to the next row, at whichever end this row finished on.
    if (i < interiorRowCount - 1) {
      const connectorCol = leftToRight ? columns - 2 : 1;
      map[row + 1][connectorCol] = "dirt_path";
    }
  }

  // 3. Place one landmark per scene, evenly spaced along the path in order,
  //    so walking the path visits scenes in their real sequence.
  const landmarks: ChapterWorldLandmark[] = scenes.map((scene, idx) => {
    const pathIdx = sceneCount === 1
      ? 0
      : Math.round((idx * (pathCells.length - 1)) / (sceneCount - 1));
    const cell = pathCells[Math.min(pathIdx, pathCells.length - 1)] ?? pathCells[0];
    map[cell.row][cell.column] = SCENE_TILE[scene.type];
    return {
      sceneNumber: scene.sceneNumber,
      row: cell.row,
      column: cell.column,
      title: scene.title,
      type: scene.type,
      placeId: scene.placeId,
    };
  });

  const spawn = pathCells[0] ?? { row: 1, column: 1 };

  return { map, landmarks, spawn, rows, columns };
}

export function isChapterWorldPositionWalkable(
  layout: ChapterWorldLayout,
  position: ChapterWorldPosition,
): boolean {
  const tile = layout.map[position.row]?.[position.column];
  return tile !== undefined && !BLOCKED.has(tile);
}

export function getChapterWorldLandmarkAt(
  layout: ChapterWorldLayout,
  position: ChapterWorldPosition,
): ChapterWorldLandmark | null {
  return layout.landmarks.find(
    (landmark) => landmark.row === position.row && landmark.column === position.column,
  ) ?? null;
}
