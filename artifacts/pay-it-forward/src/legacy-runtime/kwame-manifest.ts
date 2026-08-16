/**
 * Kwame's character manifest, built from the actual filenames in
 * Kwame_Mensah_Full_HandDrawn_Build_v2.zip's extracted frame folders.
 * row0/row1 = idle/walk for the atlas's primary direction; row2/row3 =
 * idle/walk for its secondary direction, per the down-left-master and
 * up-direction/right-direction extraction pattern confirmed in that pack.
 *
 * Copy the referenced PNG folders to `environmentBaseUrl`-sibling path
 * `/legacy-character-assets/hand-drawn/kwame/` per ATLAS_INTEGRATION_GUIDE.md
 * before this manifest will actually load anything in a browser.
 */

import type { CharacterManifest } from "./legacy-asset-loader";

function row(prefix: string, row: number, count = 8) {
  return Array.from({ length: count }, (_, c) => `${prefix}_r${row}_c${c}.png`);
}

export const kwameHandDrawnManifest: CharacterManifest = {
  characterId: "kwame-mensah",
  baseUrl: "/legacy-character-assets/hand-drawn/kwame/",
  frames: [
    // Movement -- full hand-drawn coverage per Kwame_Mensah_Full_HandDrawn_Build_v2
    { animState: "idle", facing: "down", frameFiles: row("down-left-master/down-left-master", 0) },
    { animState: "walk", facing: "down", frameFiles: row("down-left-master/down-left-master", 1) },
    { animState: "idle", facing: "left", frameFiles: row("down-left-master/down-left-master", 2) },
    { animState: "walk", facing: "left", frameFiles: row("down-left-master/down-left-master", 3) },
    { animState: "idle", facing: "up", frameFiles: row("up-direction/up-direction", 0) },
    { animState: "walk", facing: "up", frameFiles: row("up-direction/up-direction", 1) },
    { animState: "idle", facing: "right", frameFiles: row("right-direction/right-direction", 0) },
    { animState: "walk", facing: "right", frameFiles: row("right-direction/right-direction", 1) },
    { animState: "run", facing: "up", frameFiles: row("run-up-right/run-up-right", 0) },
    { animState: "run", facing: "right", frameFiles: row("run-up-right/run-up-right", 1) },
    { animState: "run", facing: "down", frameFiles: row("run-down-left/run-down-left", 0) },
    { animState: "run", facing: "left", frameFiles: row("run-down-left/run-down-left", 1) },
    { animState: "talk", facing: "down", frameFiles: row("talk/talk", 0) },
    { animState: "talk", facing: "up", frameFiles: row("talk/talk", 1) },
    { animState: "talk", facing: "left", frameFiles: row("talk/talk", 2) },
    { animState: "talk", facing: "right", frameFiles: row("talk/talk", 3) },
    { animState: "interact", facing: "down", frameFiles: row("interact/interact", 0) },
    { animState: "interact", facing: "up", frameFiles: row("interact/interact", 1) },
    { animState: "interact", facing: "left", frameFiles: row("interact/interact", 2) },
    { animState: "interact", facing: "right", frameFiles: row("interact/interact", 3) },
    { animState: "knockback", facing: "down", frameFiles: row("hurt/hurt", 0) },
    { animState: "knockback", facing: "up", frameFiles: row("hurt/hurt", 1) },
    { animState: "knockback", facing: "left", frameFiles: row("hurt/hurt", 2) },
    { animState: "knockback", facing: "right", frameFiles: row("hurt/hurt", 3) },

    // Combat -- NOT covered by any hand-drawn upload yet (confirmed gap,
    // see COMBAT_SYSTEM.md / Kwame_Mensah_Full_HandDrawn_Build_v2 README).
    // Left unregistered on purpose: resolveFrames() in legacy-asset-loader.ts
    // will fall back to idle + log a warning rather than silently rendering
    // nothing or the wrong art tier. Register these the moment attack/dash/
    // jump/guard frames exist:
    // { animState: "lightAttack1", facing: "down", frameFiles: [...] },
    // { animState: "dash", facing: "down", frameFiles: [...] },
    // { animState: "jump", facing: "down", frameFiles: [...] },
    // { animState: "guard", facing: "down", frameFiles: [...] },
  ],
};
