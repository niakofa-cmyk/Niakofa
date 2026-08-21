/**
 * Production atlas manifest for the hand-drawn Kwame Mensah source sheets.
 *
 * The supplied art contract is a 2048×1024 sheet containing 8 columns ×
 * 4 rows of 256×256 cells. Each row is a labeled direction/action sequence.
 * Keeping the source sheets intact for provenance while serving derived
 * runtime sheets avoids the 429-prone exploded-frame tree.
 */

import type { SheetBasedCharacterManifest, SheetManifestEntry } from "./legacy-asset-loader";

const CELL = 256;

function row(
  sheetFile: string,
  animState: SheetManifestEntry["animState"],
  facing: SheetManifestEntry["facing"],
  startFrame: number,
  frameCount: number,
): SheetManifestEntry {
  return {
    animState,
    facing,
    sheetFile,
    frameWidth: CELL,
    frameHeight: CELL,
    frameCount,
    startFrame,
  };
}

const SOURCE_BASE = "Kwame_Mensah_";
const MAIN = `${SOURCE_BASE}32-Frame_Hand-Drawn_Animation_Atlas.png`;
const RIGHT = `${SOURCE_BASE}RIGHT_Direction_32-Frame_Animation_Atlas.png`;
const UP = `${SOURCE_BASE}UP_Direction_32-Frame_Animation_Atlas.png`;
const RUN_DOWN_LEFT = `${SOURCE_BASE}RUN_DOWN_LEFT_32-Frame_Animation_Atlas.png`;
const RUN_UP_RIGHT = `${SOURCE_BASE}RUN_UP_RIGHT_32-Frame_Animation_Atlas.png`;
const INTERACT = `${SOURCE_BASE}INTERACT_32-Frame_Animation_Atlas.png`;
const PICK_UP = `${SOURCE_BASE}PICK_UP_32-Frame_Animation_Atlas.png`;
const INSPECT = `${SOURCE_BASE}INSPECT_32-Frame_Animation_Atlas.png`;
const HURT = `${SOURCE_BASE}HURT_32-Frame_Animation_Atlas.png`;
const TALK = `${SOURCE_BASE}TALK_32-Frame_Animation_Atlas.png`;
const TALK_DOWN_LEFT = `${SOURCE_BASE}TALK_DOWN_LEFT_32-Frame_Animation_Atlas.png`;
const TALK_UP_RIGHT = `${SOURCE_BASE}TALK_UP_RIGHT_32-Frame_Animation_Atlas.png`;

export const KWAME_SHEET_MANIFEST: SheetBasedCharacterManifest = {
  characterId: "kwame-mensah",
  baseUrl: "/legacy-character-assets/kwame-mensah/runtime-sheets/",
  sheets: [
    // Main atlas: idle/walk down and left.
    row(MAIN, "idle", "down", 0, 8),
    row(MAIN, "walk", "down", 8, 8),
    row(MAIN, "idle", "left", 16, 8),
    row(MAIN, "walk", "left", 24, 8),

    // Direction expansions.
    row(RIGHT, "idle", "right", 0, 8),
    row(RIGHT, "walk", "right", 8, 8),
    row(RIGHT, "idle", "up_right", 16, 8),
    row(RIGHT, "walk", "up_right", 24, 8),
    row(UP, "idle", "up", 0, 8),
    row(UP, "walk", "up", 8, 8),
    row(UP, "idle", "up_left", 16, 8),
    row(UP, "walk", "up_left", 24, 8),

    // Run sheets: each atlas row is a direction-specific eight-frame clip.
    row(RUN_DOWN_LEFT, "run", "down", 0, 8),
    row(RUN_DOWN_LEFT, "run", "left", 8, 8),
    row(RUN_UP_RIGHT, "run", "right", 0, 8),
    row(RUN_UP_RIGHT, "run", "up", 8, 8),
    row(RUN_UP_RIGHT, "run", "up_right", 16, 8),

    // Action sheets: down, left, right, up rows.
    row(INTERACT, "interact", "down", 0, 8),
    row(INTERACT, "interact", "left", 8, 8),
    row(INTERACT, "interact", "right", 16, 8),
    row(INTERACT, "interact", "up", 24, 8),
    row(PICK_UP, "pick_up", "down", 0, 8),
    row(PICK_UP, "pick_up", "left", 8, 8),
    row(PICK_UP, "pick_up", "right", 16, 8),
    row(PICK_UP, "pick_up", "up", 24, 8),
    row(INSPECT, "inspect", "down", 0, 8),
    row(INSPECT, "inspect", "left", 8, 8),
    row(INSPECT, "inspect", "right", 16, 8),
    row(INSPECT, "inspect", "up", 24, 8),
    row(HURT, "hurt", "down", 0, 6),
    row(HURT, "hurt", "left", 8, 6),
    row(HURT, "hurt", "right", 16, 6),
    row(HURT, "hurt", "up", 24, 6),
    row(HURT, "knockback", "down", 0, 6),
    row(HURT, "knockback", "left", 8, 6),
    row(HURT, "knockback", "right", 16, 6),
    row(HURT, "knockback", "up", 24, 6),
    row(TALK, "talk", "down", 0, 4),
    row(TALK, "talk", "left", 8, 4),
    row(TALK, "talk", "right", 16, 4),
    row(TALK, "talk", "up", 24, 4),
    row(TALK_DOWN_LEFT, "talk", "up_left", 24, 4),
    row(TALK_UP_RIGHT, "talk", "up_right", 16, 4),
  ],
};