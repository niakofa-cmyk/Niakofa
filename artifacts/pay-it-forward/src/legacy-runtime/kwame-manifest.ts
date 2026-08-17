/**
 * kwame-manifest.ts — Kwame Mensah's character animation manifest.
 *
 * Updated to use the real sprite directories extracted from
 * Hand_Drawn_Kwame_Mensah_2.zip / niakofa-legacy-engine-2/assets/kwame/.
 * All 136 PNGs live at:
 *   public/legacy-character-assets/hand-drawn/kwame/{clipDir}/{clipDir}_{n}.png
 *
 * Six directions are covered (down, left, right, up, up_left, up_right).
 * The source pack did not include down_left/down_right idle+walk atlases —
 * direction.ts folds those at runtime to the nearest drawn direction
 * (right for down-right, left for down-left) so no frames are fabricated.
 *
 * Verified frame counts per animation dir:
 *   idle/walk (6 directions) — 8 frames each
 *   hurt (4 directions)       — 6 frames each
 *   talk (4 directions)       — 4 frames each
 *
 * Combat frames (lightAttack, heavyAttack, dash, guard, jump, aerial) are
 * deliberately left unregistered — no hand-drawn art exists for them yet.
 * legacy-asset-loader.ts will fall back to the idle clip and log a warning
 * rather than silently rendering nothing. Register them the moment the art ships.
 */

import type { CharacterManifest } from "./legacy-asset-loader";

/** Generate per-frame file list for an animation directory. */
function frames(dir: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${dir}/${dir}_${i + 1}.png`);
}

export const kwameHandDrawnManifest: CharacterManifest = {
  characterId: "kwame-mensah",
  baseUrl: "/legacy-character-assets/hand-drawn/kwame/",
  frames: [
    // ── Idle: 8 frames × 6 directions ──────────────────────────────────
    { animState: "idle", facing: "down",     frameFiles: frames("kwame_idle_down",     8) },
    { animState: "idle", facing: "left",     frameFiles: frames("kwame_idle_left",     8) },
    { animState: "idle", facing: "right",    frameFiles: frames("kwame_idle_right",    8) },
    { animState: "idle", facing: "up",       frameFiles: frames("kwame_idle_up",       8) },
    { animState: "idle", facing: "up_left",  frameFiles: frames("kwame_idle_up_left",  8) },
    { animState: "idle", facing: "up_right", frameFiles: frames("kwame_idle_up_right", 8) },

    // ── Walk: 8 frames × 6 directions ──────────────────────────────────
    { animState: "walk", facing: "down",     frameFiles: frames("kwame_walk_down",     8) },
    { animState: "walk", facing: "left",     frameFiles: frames("kwame_walk_left",     8) },
    { animState: "walk", facing: "right",    frameFiles: frames("kwame_walk_right",    8) },
    { animState: "walk", facing: "up",       frameFiles: frames("kwame_walk_up",       8) },
    { animState: "walk", facing: "up_left",  frameFiles: frames("kwame_walk_up_left",  8) },
    { animState: "walk", facing: "up_right", frameFiles: frames("kwame_walk_up_right", 8) },

    // ── Hurt / knockback: 6 frames × 4 directions ──────────────────────
    // (no up_left / up_right hurt art — direction.ts folds those to "up")
    { animState: "knockback", facing: "down",  frameFiles: frames("kwame_hurt_down",  6) },
    { animState: "knockback", facing: "left",  frameFiles: frames("kwame_hurt_left",  6) },
    { animState: "knockback", facing: "right", frameFiles: frames("kwame_hurt_right", 6) },
    { animState: "knockback", facing: "up",    frameFiles: frames("kwame_hurt_up",    6) },

    // ── Talk: 4 frames × 4 directions ──────────────────────────────────
    // (no up_left / up_right talk art — direction.ts folds those to "up")
    { animState: "talk", facing: "down",  frameFiles: frames("kwame_talk_down",  4) },
    { animState: "talk", facing: "left",  frameFiles: frames("kwame_talk_left",  4) },
    { animState: "talk", facing: "right", frameFiles: frames("kwame_talk_right", 4) },
    { animState: "talk", facing: "up",    frameFiles: frames("kwame_talk_up",    4) },

    // ── Combat frames: NOT REGISTERED — no hand-drawn art yet ──────────
    // Register these the moment attack/dash/jump/guard frames exist:
    // { animState: "lightAttack1", facing: "down", frameFiles: frames("kwame_attack_01_down", 12) },
    // { animState: "dash",         facing: "down", frameFiles: frames("kwame_dash_down",      6)  },
    // { animState: "jump",         facing: "down", frameFiles: frames("kwame_jump_down",       8)  },
    // { animState: "guard",        facing: "down", frameFiles: frames("kwame_guard_down",      4)  },
  ],
};
