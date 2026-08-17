/**
 * kwame-manifest.ts — Kwame Mensah's character animation manifest.
 *
 * Aug 2026 — Full atlas registration pass.
 * All 784 extracted frames across 14 animation directories are now wired.
 *
 * baseUrl: "/legacy-character-assets/"  (common root for both source trees)
 *
 * Two asset trees are referenced:
 *
 *   hand-drawn/kwame/               — original idle/walk/hurt/talk frames
 *     kwame_idle_down/kwame_idle_down_1.png ... _N.png
 *
 *   kwame-mensah/atlas/<DIR>/       — expanded atlas (14 dirs, 784 frames)
 *     INTERACT/interact-down-1.png
 *     PICK_UP/pick-up-down-1.png
 *     INSPECT/inspect-down-1.png
 *     HURT/hurt-down-1.png           ← better quality than hand-drawn HURT
 *     TALK/talk-down-1.png           ← 4-frame talk per direction
 *     RUN_DOWN_LEFT/run-*.png        ← run down/left/down-left (6 frames each)
 *     RUN_UP_RIGHT/run-*.png         ← run right/up/up-right (7 frames each)
 *     RIGHT_Direction/               ← idle-right + walk-right (8 frames each)
 *     UP_Direction/                  ← idle-up + walk-up (9 frames each)
 *     TALK_DOWN_LEFT/talk-down-left-* (7 frames)
 *     TALK_UP_RIGHT/talk-up-right-*  (7 frames)
 *
 * Frame counts per animation (from actual directory listings):
 *   idle:     8 frames × 6 directions (up_left/up_right from RIGHT/UP dirs)
 *   walk:     8 frames × 6 directions
 *   run:      6-7 frames × 5 directions (no run-up-left art; folds to "left")
 *   interact: 8 frames × 4 directions
 *   pick_up:  8 frames × 4 directions
 *   inspect:  6 frames × 4 directions
 *   hurt:     6 frames × 4 directions
 *   knockback: 6 frames × 4 directions  (same art as hurt)
 *   talk:     4 frames × 4 directions + 7 frames for diagonals
 *
 * Combat frames (lightAttack, heavyAttack, dash, guard, jump, aerial) remain
 * unregistered — no hand-drawn art exists yet. Loader falls back to idle.
 */

import type { CharacterManifest } from "./legacy-asset-loader";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Old naming convention: dir/dir_N.png   e.g. kwame_idle_down/kwame_idle_down_1.png */
function legacyFrames(prefix: string, dir: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}${dir}/${dir}_${i + 1}.png`);
}

/** New naming convention: dir/stem-N.png   e.g. INTERACT/interact-down-1.png */
function atlasFrames(atlasDir: string, stem: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    `kwame-mensah/atlas/${atlasDir}/${stem}-${i + 1}.png`
  );
}

const LDK = "hand-drawn/kwame/"; // legacy dir prefix

// ─── Manifest ─────────────────────────────────────────────────────────────────

export const kwameHandDrawnManifest: CharacterManifest = {
  characterId: "kwame-mensah",
  baseUrl: "/legacy-character-assets/",
  frames: [
    // ── Idle: 8 frames × 6 directions ─────────────────────────────────────
    // Cardinal 4 from the original hand-drawn tree
    { animState: "idle", facing: "down",    frameFiles: legacyFrames(LDK, "kwame_idle_down",  8) },
    { animState: "idle", facing: "left",    frameFiles: legacyFrames(LDK, "kwame_idle_left",  8) },
    { animState: "idle", facing: "right",   frameFiles: legacyFrames(LDK, "kwame_idle_right", 8) },
    { animState: "idle", facing: "up",      frameFiles: legacyFrames(LDK, "kwame_idle_up",    8) },
    // Diagonals from RIGHT_Direction / UP_Direction dirs (8 frames each)
    { animState: "idle", facing: "up_right", frameFiles: atlasFrames("RIGHT_Direction", "idle-up-right", 8) },
    { animState: "idle", facing: "up_left",  frameFiles: atlasFrames("UP_Direction",    "idle-up-left",  9) },

    // ── Walk: 8 frames × 6 directions ─────────────────────────────────────
    { animState: "walk", facing: "down",    frameFiles: legacyFrames(LDK, "kwame_walk_down",  8) },
    { animState: "walk", facing: "left",    frameFiles: legacyFrames(LDK, "kwame_walk_left",  8) },
    { animState: "walk", facing: "right",   frameFiles: legacyFrames(LDK, "kwame_walk_right", 8) },
    { animState: "walk", facing: "up",      frameFiles: legacyFrames(LDK, "kwame_walk_up",    8) },
    // Diagonals from RIGHT_Direction / UP_Direction
    { animState: "walk", facing: "up_right", frameFiles: atlasFrames("RIGHT_Direction", "walk-up-right", 8) },
    { animState: "walk", facing: "up_left",  frameFiles: atlasFrames("UP_Direction",    "walk-up-left",  9) },

    // ── Run: 6-7 frames × 5 directions (no up_left run art; resolves to "left") ──
    { animState: "run", facing: "down",     frameFiles: atlasFrames("RUN_DOWN_LEFT", "run-down",      6) },
    { animState: "run", facing: "left",     frameFiles: atlasFrames("RUN_DOWN_LEFT", "run-left",      6) },
    { animState: "run", facing: "right",    frameFiles: atlasFrames("RUN_UP_RIGHT",  "run-right",     7) },
    { animState: "run", facing: "up",       frameFiles: atlasFrames("RUN_UP_RIGHT",  "run-up",        7) },
    { animState: "run", facing: "up_right", frameFiles: atlasFrames("RUN_UP_RIGHT",  "run-up-right",  7) },

    // ── Interact: 8 frames × 4 directions ─────────────────────────────────
    { animState: "interact", facing: "down",  frameFiles: atlasFrames("INTERACT", "interact-down",  8) },
    { animState: "interact", facing: "left",  frameFiles: atlasFrames("INTERACT", "interact-left",  8) },
    { animState: "interact", facing: "right", frameFiles: atlasFrames("INTERACT", "interact-right", 8) },
    { animState: "interact", facing: "up",    frameFiles: atlasFrames("INTERACT", "interact-up",    8) },

    // ── Pick Up: 8 frames × 4 directions ─────────────────────────────────
    { animState: "pick_up", facing: "down",  frameFiles: atlasFrames("PICK_UP", "pick-up-down",  8) },
    { animState: "pick_up", facing: "left",  frameFiles: atlasFrames("PICK_UP", "pick-up-left",  8) },
    { animState: "pick_up", facing: "right", frameFiles: atlasFrames("PICK_UP", "pick-up-right", 8) },
    { animState: "pick_up", facing: "up",    frameFiles: atlasFrames("PICK_UP", "pick-up-up",    8) },

    // ── Inspect: 6 frames × 4 directions ─────────────────────────────────
    { animState: "inspect", facing: "down",  frameFiles: atlasFrames("INSPECT", "inspect-down",  6) },
    { animState: "inspect", facing: "left",  frameFiles: atlasFrames("INSPECT", "inspect-left",  6) },
    { animState: "inspect", facing: "right", frameFiles: atlasFrames("INSPECT", "inspect-right", 6) },
    { animState: "inspect", facing: "up",    frameFiles: atlasFrames("INSPECT", "inspect-up",    6) },

    // ── Hurt: 6 frames × 4 directions (new atlas — higher quality than original) ──
    { animState: "hurt",      facing: "down",  frameFiles: atlasFrames("HURT", "hurt-down",  6) },
    { animState: "hurt",      facing: "left",  frameFiles: atlasFrames("HURT", "hurt-left",  6) },
    { animState: "hurt",      facing: "right", frameFiles: atlasFrames("HURT", "hurt-right", 6) },
    { animState: "hurt",      facing: "up",    frameFiles: atlasFrames("HURT", "hurt-up",    6) },
    // knockback (combat state) re-uses the same hurt art
    { animState: "knockback", facing: "down",  frameFiles: atlasFrames("HURT", "hurt-down",  6) },
    { animState: "knockback", facing: "left",  frameFiles: atlasFrames("HURT", "hurt-left",  6) },
    { animState: "knockback", facing: "right", frameFiles: atlasFrames("HURT", "hurt-right", 6) },
    { animState: "knockback", facing: "up",    frameFiles: atlasFrames("HURT", "hurt-up",    6) },

    // ── Talk: 4 frames × 4 cardinal + 7 frames × 2 diagonals ─────────────
    { animState: "talk", facing: "down",     frameFiles: atlasFrames("TALK", "talk-down",  4) },
    { animState: "talk", facing: "left",     frameFiles: atlasFrames("TALK", "talk-left",  4) },
    { animState: "talk", facing: "right",    frameFiles: atlasFrames("TALK", "talk-right", 4) },
    { animState: "talk", facing: "up",       frameFiles: atlasFrames("TALK", "talk-up",    4) },
    { animState: "talk", facing: "up_right", frameFiles: atlasFrames("TALK_UP_RIGHT",  "talk-up-right",  7) },
    { animState: "talk", facing: "up_left",  frameFiles: atlasFrames("TALK_DOWN_LEFT", "talk-up-left",   7) },

    // ── Combat frames: NOT REGISTERED — no hand-drawn art yet ────────────
    // Register the moment attack/dash/jump/guard art ships:
    // { animState: "lightAttack1", facing: "down", frameFiles: atlasFrames("ATTACK", "attack-down", 12) },
    // { animState: "dash",         facing: "down", frameFiles: atlasFrames("DASH",   "dash-down",    6) },
    // { animState: "jump",         facing: "down", frameFiles: atlasFrames("JUMP",   "jump-down",    8) },
    // { animState: "guard",        facing: "down", frameFiles: atlasFrames("GUARD",  "guard-down",   4) },
  ],
};
