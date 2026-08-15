/**
 * Kwame Mensah — canonical hero sprite atlas manifest.
 *
 * Frame paths below were auto-extracted from the uploaded
 * "Kwame Mensah 32-frame hand-drawn atlas" reference/QA sheets
 * (see /public/legacy-character-assets/kwame-mensah/ATLAS_SOURCE_NOTES.md).
 * They are demo-quality: usable for a working preview today, but
 * NOT the final slice-ready production atlas the Visual + Runtime
 * Bible calls for. Some frames retain minor artifacts (a thin
 * gridline or a fragment of adjacent caption text) inherited from
 * the flattened source sheets. Replace this manifest's file paths
 * in place once true per-frame transparent exports exist — every
 * other module (legacy-combat-system.ts, KwameHeroSprite.tsx)
 * only depends on this manifest's shape, not on these specific files.
 */

export type KwameClipName =
    "hurt-down"
  | "hurt-left"
  | "hurt-right"
  | "hurt-up"
  | "idle-down"
  | "idle-left"
  | "idle-right"
  | "idle-up"
  | "idle-up-left"
  | "idle-up-right"
  | "inspect-down"
  | "inspect-left"
  | "inspect-right"
  | "inspect-up"
  | "interact-down"
  | "interact-left"
  | "interact-right"
  | "interact-up"
  | "pick-up-down"
  | "pick-up-left"
  | "pick-up-right"
  | "pick-up-up"
  | "run-down"
  | "run-down-left"
  | "run-down-right"
  | "run-left"
  | "run-right"
  | "run-up"
  | "run-up-right"
  | "talk-down"
  | "talk-down-alt"
  | "talk-down-left"
  | "talk-down-right"
  | "talk-left"
  | "talk-left-alt"
  | "talk-right"
  | "talk-right-alt"
  | "talk-up"
  | "talk-up-alt"
  | "talk-up-left"
  | "talk-up-right"
  | "walk-down"
  | "walk-left"
  | "walk-right"
  | "walk-up"
  | "walk-up-left"
  | "walk-up-right"
  // Combat clips: NOT YET DRAWN. Listed here so the state machine and
  // sprite player already know their names; see the Bible's new
  // "Required Combat Animation Clips" spec for the exact art to commission.
  | "light-attack-down"
  | "light-attack-left"
  | "light-attack-right"
  | "light-attack-up"
  | "heavy-attack-down"
  | "heavy-attack-left"
  | "heavy-attack-right"
  | "heavy-attack-up"
  | "dodge-down"
  | "dodge-left"
  | "dodge-right"
  | "dodge-up"
  | "guard-down"
  | "guard-left"
  | "guard-right"
  | "guard-up"
  | "jump-start-down"
  | "jump-start-left"
  | "jump-start-right"
  | "jump-start-up"
  | "rising-down"
  | "rising-left"
  | "rising-right"
  | "rising-up"
  | "falling-down"
  | "falling-left"
  | "falling-right"
  | "falling-up"
  | "aerial-attack-down"
  | "aerial-attack-left"
  | "aerial-attack-right"
  | "aerial-attack-up"
  | "land-down"
  | "land-left"
  | "land-right"
  | "land-up"
;

/** Which of the above clips have real extracted frames today. */
export const KWAME_ATLAS_FRAMES: Partial<Record<KwameClipName, string[]>> = {
  "hurt-down": ["/legacy-character-assets/kwame-mensah/atlas/HURT/hurt-down-1.png", "/legacy-character-assets/kwame-mensah/atlas/HURT/hurt-down-2.png", "/legacy-character-assets/kwame-mensah/atlas/HURT/hurt-down-3.png", "/legacy-character-assets/kwame-mensah/atlas/HURT/hurt-down-4.png", "/legacy-character-assets/kwame-mensah/atlas/HURT/hurt-down-5.png", "/legacy-character-assets/kwame-mensah/atlas/HURT/hurt-down-6.png"],
  "hurt-left": ["/legacy-character-assets/kwame-mensah/atlas/HURT/hurt-left-1.png", "/legacy-character-assets/kwame-mensah/atlas/HURT/hurt-left-2.png", "/legacy-character-assets/kwame-mensah/atlas/HURT/hurt-left-3.png", "/legacy-character-assets/kwame-mensah/atlas/HURT/hurt-left-4.png", "/legacy-character-assets/kwame-mensah/atlas/HURT/hurt-left-5.png", "/legacy-character-assets/kwame-mensah/atlas/HURT/hurt-left-6.png"],
  "hurt-right": ["/legacy-character-assets/kwame-mensah/atlas/HURT/hurt-right-1.png", "/legacy-character-assets/kwame-mensah/atlas/HURT/hurt-right-2.png", "/legacy-character-assets/kwame-mensah/atlas/HURT/hurt-right-3.png", "/legacy-character-assets/kwame-mensah/atlas/HURT/hurt-right-4.png", "/legacy-character-assets/kwame-mensah/atlas/HURT/hurt-right-5.png", "/legacy-character-assets/kwame-mensah/atlas/HURT/hurt-right-6.png"],
  "hurt-up": ["/legacy-character-assets/kwame-mensah/atlas/HURT/hurt-up-1.png", "/legacy-character-assets/kwame-mensah/atlas/HURT/hurt-up-2.png", "/legacy-character-assets/kwame-mensah/atlas/HURT/hurt-up-3.png", "/legacy-character-assets/kwame-mensah/atlas/HURT/hurt-up-4.png", "/legacy-character-assets/kwame-mensah/atlas/HURT/hurt-up-5.png", "/legacy-character-assets/kwame-mensah/atlas/HURT/hurt-up-6.png"],
  "idle-down": ["/legacy-character-assets/kwame-mensah/atlas/Hand-Drawn_Base/idle-down-1.png", "/legacy-character-assets/kwame-mensah/atlas/Hand-Drawn_Base/idle-down-2.png", "/legacy-character-assets/kwame-mensah/atlas/Hand-Drawn_Base/idle-down-3.png", "/legacy-character-assets/kwame-mensah/atlas/Hand-Drawn_Base/idle-down-4.png", "/legacy-character-assets/kwame-mensah/atlas/Hand-Drawn_Base/idle-down-5.png", "/legacy-character-assets/kwame-mensah/atlas/Hand-Drawn_Base/idle-down-6.png", "/legacy-character-assets/kwame-mensah/atlas/Hand-Drawn_Base/idle-down-7.png", "/legacy-character-assets/kwame-mensah/atlas/Hand-Drawn_Base/idle-down-8.png"],
  "idle-left": ["/legacy-character-assets/kwame-mensah/atlas/Hand-Drawn_Base/idle-left-1.png", "/legacy-character-assets/kwame-mensah/atlas/Hand-Drawn_Base/idle-left-2.png", "/legacy-character-assets/kwame-mensah/atlas/Hand-Drawn_Base/idle-left-3.png", "/legacy-character-assets/kwame-mensah/atlas/Hand-Drawn_Base/idle-left-4.png", "/legacy-character-assets/kwame-mensah/atlas/Hand-Drawn_Base/idle-left-5.png", "/legacy-character-assets/kwame-mensah/atlas/Hand-Drawn_Base/idle-left-6.png", "/legacy-character-assets/kwame-mensah/atlas/Hand-Drawn_Base/idle-left-7.png", "/legacy-character-assets/kwame-mensah/atlas/Hand-Drawn_Base/idle-left-8.png"],
  "idle-right": ["/legacy-character-assets/kwame-mensah/atlas/RIGHT_Direction/idle-right-1.png", "/legacy-character-assets/kwame-mensah/atlas/RIGHT_Direction/idle-right-2.png", "/legacy-character-assets/kwame-mensah/atlas/RIGHT_Direction/idle-right-3.png", "/legacy-character-assets/kwame-mensah/atlas/RIGHT_Direction/idle-right-4.png", "/legacy-character-assets/kwame-mensah/atlas/RIGHT_Direction/idle-right-5.png", "/legacy-character-assets/kwame-mensah/atlas/RIGHT_Direction/idle-right-6.png", "/legacy-character-assets/kwame-mensah/atlas/RIGHT_Direction/idle-right-7.png", "/legacy-character-assets/kwame-mensah/atlas/RIGHT_Direction/idle-right-8.png"],
  "idle-up": ["/legacy-character-assets/kwame-mensah/atlas/UP_Direction/idle-up-1.png", "/legacy-character-assets/kwame-mensah/atlas/UP_Direction/idle-up-2.png", "/legacy-character-assets/kwame-mensah/atlas/UP_Direction/idle-up-3.png", "/legacy-character-assets/kwame-mensah/atlas/UP_Direction/idle-up-4.png", "/legacy-character-assets/kwame-mensah/atlas/UP_Direction/idle-up-5.png", "/legacy-character-assets/kwame-mensah/atlas/UP_Direction/idle-up-6.png", "/legacy-character-assets/kwame-mensah/atlas/UP_Direction/idle-up-7.png", "/legacy-character-assets/kwame-mensah/atlas/UP_Direction/idle-up-8.png"],
  "idle-up-left": ["/legacy-character-assets/kwame-mensah/atlas/UP_Direction/idle-up-left-1.png", "/legacy-character-assets/kwame-mensah/atlas/UP_Direction/idle-up-left-2.png", "/legacy-character-assets/kwame-mensah/atlas/UP_Direction/idle-up-left-3.png", "/legacy-character-assets/kwame-mensah/atlas/UP_Direction/idle-up-left-4.png", "/legacy-character-assets/kwame-mensah/atlas/UP_Direction/idle-up-left-5.png", "/legacy-character-assets/kwame-mensah/atlas/UP_Direction/idle-up-left-6.png", "/legacy-character-assets/kwame-mensah/atlas/UP_Direction/idle-up-left-7.png", "/legacy-character-assets/kwame-mensah/atlas/UP_Direction/idle-up-left-8.png"],
  "idle-up-right": ["/legacy-character-assets/kwame-mensah/atlas/RIGHT_Direction/idle-up-right-1.png", "/legacy-character-assets/kwame-mensah/atlas/RIGHT_Direction/idle-up-right-2.png", "/legacy-character-assets/kwame-mensah/atlas/RIGHT_Direction/idle-up-right-3.png", "/legacy-character-assets/kwame-mensah/atlas/RIGHT_Direction/idle-up-right-4.png", "/legacy-character-assets/kwame-mensah/atlas/RIGHT_Direction/idle-up-right-5.png", "/legacy-character-assets/kwame-mensah/atlas/RIGHT_Direction/idle-up-right-6.png", "/legacy-character-assets/kwame-mensah/atlas/RIGHT_Direction/idle-up-right-7.png", "/legacy-character-assets/kwame-mensah/atlas/RIGHT_Direction/idle-up-right-8.png"],
  "inspect-down": ["/legacy-character-assets/kwame-mensah/atlas/INSPECT/inspect-down-1.png", "/legacy-character-assets/kwame-mensah/atlas/INSPECT/inspect-down-2.png", "/legacy-character-assets/kwame-mensah/atlas/INSPECT/inspect-down-3.png", "/legacy-character-assets/kwame-mensah/atlas/INSPECT/inspect-down-4.png", "/legacy-character-assets/kwame-mensah/atlas/INSPECT/inspect-down-5.png", "/legacy-character-assets/kwame-mensah/atlas/INSPECT/inspect-down-6.png"],
  "inspect-left": ["/legacy-character-assets/kwame-mensah/atlas/INSPECT/inspect-left-1.png", "/legacy-character-assets/kwame-mensah/atlas/INSPECT/inspect-left-2.png", "/legacy-character-assets/kwame-mensah/atlas/INSPECT/inspect-left-3.png", "/legacy-character-assets/kwame-mensah/atlas/INSPECT/inspect-left-4.png", "/legacy-character-assets/kwame-mensah/atlas/INSPECT/inspect-left-5.png", "/legacy-character-assets/kwame-mensah/atlas/INSPECT/inspect-left-6.png"],
  "inspect-right": ["/legacy-character-assets/kwame-mensah/atlas/INSPECT/inspect-right-1.png", "/legacy-character-assets/kwame-mensah/atlas/INSPECT/inspect-right-2.png", "/legacy-character-assets/kwame-mensah/atlas/INSPECT/inspect-right-3.png", "/legacy-character-assets/kwame-mensah/atlas/INSPECT/inspect-right-4.png", "/legacy-character-assets/kwame-mensah/atlas/INSPECT/inspect-right-5.png", "/legacy-character-assets/kwame-mensah/atlas/INSPECT/inspect-right-6.png"],
  "inspect-up": ["/legacy-character-assets/kwame-mensah/atlas/INSPECT/inspect-up-1.png", "/legacy-character-assets/kwame-mensah/atlas/INSPECT/inspect-up-2.png", "/legacy-character-assets/kwame-mensah/atlas/INSPECT/inspect-up-3.png", "/legacy-character-assets/kwame-mensah/atlas/INSPECT/inspect-up-4.png", "/legacy-character-assets/kwame-mensah/atlas/INSPECT/inspect-up-5.png", "/legacy-character-assets/kwame-mensah/atlas/INSPECT/inspect-up-6.png"],
  "interact-down": ["/legacy-character-assets/kwame-mensah/atlas/INTERACT/interact-down-1.png", "/legacy-character-assets/kwame-mensah/atlas/INTERACT/interact-down-2.png", "/legacy-character-assets/kwame-mensah/atlas/INTERACT/interact-down-3.png", "/legacy-character-assets/kwame-mensah/atlas/INTERACT/interact-down-4.png", "/legacy-character-assets/kwame-mensah/atlas/INTERACT/interact-down-5.png", "/legacy-character-assets/kwame-mensah/atlas/INTERACT/interact-down-6.png", "/legacy-character-assets/kwame-mensah/atlas/INTERACT/interact-down-7.png", "/legacy-character-assets/kwame-mensah/atlas/INTERACT/interact-down-8.png"],
  "interact-left": ["/legacy-character-assets/kwame-mensah/atlas/INTERACT/interact-left-1.png", "/legacy-character-assets/kwame-mensah/atlas/INTERACT/interact-left-2.png", "/legacy-character-assets/kwame-mensah/atlas/INTERACT/interact-left-3.png", "/legacy-character-assets/kwame-mensah/atlas/INTERACT/interact-left-4.png", "/legacy-character-assets/kwame-mensah/atlas/INTERACT/interact-left-5.png", "/legacy-character-assets/kwame-mensah/atlas/INTERACT/interact-left-6.png", "/legacy-character-assets/kwame-mensah/atlas/INTERACT/interact-left-7.png", "/legacy-character-assets/kwame-mensah/atlas/INTERACT/interact-left-8.png"],
  "interact-right": ["/legacy-character-assets/kwame-mensah/atlas/INTERACT/interact-right-1.png", "/legacy-character-assets/kwame-mensah/atlas/INTERACT/interact-right-2.png", "/legacy-character-assets/kwame-mensah/atlas/INTERACT/interact-right-3.png", "/legacy-character-assets/kwame-mensah/atlas/INTERACT/interact-right-4.png", "/legacy-character-assets/kwame-mensah/atlas/INTERACT/interact-right-5.png", "/legacy-character-assets/kwame-mensah/atlas/INTERACT/interact-right-6.png", "/legacy-character-assets/kwame-mensah/atlas/INTERACT/interact-right-7.png", "/legacy-character-assets/kwame-mensah/atlas/INTERACT/interact-right-8.png"],
  "interact-up": ["/legacy-character-assets/kwame-mensah/atlas/INTERACT/interact-up-1.png", "/legacy-character-assets/kwame-mensah/atlas/INTERACT/interact-up-2.png", "/legacy-character-assets/kwame-mensah/atlas/INTERACT/interact-up-3.png", "/legacy-character-assets/kwame-mensah/atlas/INTERACT/interact-up-4.png", "/legacy-character-assets/kwame-mensah/atlas/INTERACT/interact-up-5.png", "/legacy-character-assets/kwame-mensah/atlas/INTERACT/interact-up-6.png", "/legacy-character-assets/kwame-mensah/atlas/INTERACT/interact-up-7.png", "/legacy-character-assets/kwame-mensah/atlas/INTERACT/interact-up-8.png"],
  "pick-up-down": ["/legacy-character-assets/kwame-mensah/atlas/PICK_UP/pick-up-down-1.png", "/legacy-character-assets/kwame-mensah/atlas/PICK_UP/pick-up-down-2.png", "/legacy-character-assets/kwame-mensah/atlas/PICK_UP/pick-up-down-3.png", "/legacy-character-assets/kwame-mensah/atlas/PICK_UP/pick-up-down-4.png", "/legacy-character-assets/kwame-mensah/atlas/PICK_UP/pick-up-down-5.png", "/legacy-character-assets/kwame-mensah/atlas/PICK_UP/pick-up-down-6.png", "/legacy-character-assets/kwame-mensah/atlas/PICK_UP/pick-up-down-7.png", "/legacy-character-assets/kwame-mensah/atlas/PICK_UP/pick-up-down-8.png"],
  "pick-up-left": ["/legacy-character-assets/kwame-mensah/atlas/PICK_UP/pick-up-left-1.png", "/legacy-character-assets/kwame-mensah/atlas/PICK_UP/pick-up-left-2.png", "/legacy-character-assets/kwame-mensah/atlas/PICK_UP/pick-up-left-3.png", "/legacy-character-assets/kwame-mensah/atlas/PICK_UP/pick-up-left-4.png", "/legacy-character-assets/kwame-mensah/atlas/PICK_UP/pick-up-left-5.png", "/legacy-character-assets/kwame-mensah/atlas/PICK_UP/pick-up-left-6.png", "/legacy-character-assets/kwame-mensah/atlas/PICK_UP/pick-up-left-7.png", "/legacy-character-assets/kwame-mensah/atlas/PICK_UP/pick-up-left-8.png"],
  "pick-up-right": ["/legacy-character-assets/kwame-mensah/atlas/PICK_UP/pick-up-right-1.png", "/legacy-character-assets/kwame-mensah/atlas/PICK_UP/pick-up-right-2.png", "/legacy-character-assets/kwame-mensah/atlas/PICK_UP/pick-up-right-3.png", "/legacy-character-assets/kwame-mensah/atlas/PICK_UP/pick-up-right-4.png", "/legacy-character-assets/kwame-mensah/atlas/PICK_UP/pick-up-right-5.png", "/legacy-character-assets/kwame-mensah/atlas/PICK_UP/pick-up-right-6.png", "/legacy-character-assets/kwame-mensah/atlas/PICK_UP/pick-up-right-7.png", "/legacy-character-assets/kwame-mensah/atlas/PICK_UP/pick-up-right-8.png"],
  "pick-up-up": ["/legacy-character-assets/kwame-mensah/atlas/PICK_UP/pick-up-up-1.png", "/legacy-character-assets/kwame-mensah/atlas/PICK_UP/pick-up-up-2.png", "/legacy-character-assets/kwame-mensah/atlas/PICK_UP/pick-up-up-3.png", "/legacy-character-assets/kwame-mensah/atlas/PICK_UP/pick-up-up-4.png", "/legacy-character-assets/kwame-mensah/atlas/PICK_UP/pick-up-up-5.png", "/legacy-character-assets/kwame-mensah/atlas/PICK_UP/pick-up-up-6.png", "/legacy-character-assets/kwame-mensah/atlas/PICK_UP/pick-up-up-7.png", "/legacy-character-assets/kwame-mensah/atlas/PICK_UP/pick-up-up-8.png"],
  "run-down": ["/legacy-character-assets/kwame-mensah/atlas/RUN_DOWN_LEFT/run-down-1.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_DOWN_LEFT/run-down-2.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_DOWN_LEFT/run-down-3.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_DOWN_LEFT/run-down-4.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_DOWN_LEFT/run-down-5.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_DOWN_LEFT/run-down-6.png"],
  "run-down-left": ["/legacy-character-assets/kwame-mensah/atlas/RUN_DOWN_LEFT/run-down-left-1.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_DOWN_LEFT/run-down-left-2.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_DOWN_LEFT/run-down-left-3.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_DOWN_LEFT/run-down-left-4.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_DOWN_LEFT/run-down-left-5.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_DOWN_LEFT/run-down-left-6.png"],
  "run-down-right": ["/legacy-character-assets/kwame-mensah/atlas/RUN_UP_RIGHT/run-down-right-1.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_UP_RIGHT/run-down-right-2.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_UP_RIGHT/run-down-right-3.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_UP_RIGHT/run-down-right-4.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_UP_RIGHT/run-down-right-5.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_UP_RIGHT/run-down-right-6.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_UP_RIGHT/run-down-right-7.png"],
  "run-left": ["/legacy-character-assets/kwame-mensah/atlas/RUN_DOWN_LEFT/run-left-1.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_DOWN_LEFT/run-left-2.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_DOWN_LEFT/run-left-3.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_DOWN_LEFT/run-left-4.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_DOWN_LEFT/run-left-5.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_DOWN_LEFT/run-left-6.png"],
  "run-right": ["/legacy-character-assets/kwame-mensah/atlas/RUN_UP_RIGHT/run-right-1.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_UP_RIGHT/run-right-2.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_UP_RIGHT/run-right-3.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_UP_RIGHT/run-right-4.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_UP_RIGHT/run-right-5.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_UP_RIGHT/run-right-6.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_UP_RIGHT/run-right-7.png"],
  "run-up": ["/legacy-character-assets/kwame-mensah/atlas/RUN_UP_RIGHT/run-up-1.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_UP_RIGHT/run-up-2.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_UP_RIGHT/run-up-3.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_UP_RIGHT/run-up-4.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_UP_RIGHT/run-up-5.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_UP_RIGHT/run-up-6.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_UP_RIGHT/run-up-7.png"],
  "run-up-right": ["/legacy-character-assets/kwame-mensah/atlas/RUN_UP_RIGHT/run-up-right-1.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_UP_RIGHT/run-up-right-2.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_UP_RIGHT/run-up-right-3.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_UP_RIGHT/run-up-right-4.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_UP_RIGHT/run-up-right-5.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_UP_RIGHT/run-up-right-6.png", "/legacy-character-assets/kwame-mensah/atlas/RUN_UP_RIGHT/run-up-right-7.png"],
  "talk-down": ["/legacy-character-assets/kwame-mensah/atlas/TALK/talk-down-1.png", "/legacy-character-assets/kwame-mensah/atlas/TALK/talk-down-2.png", "/legacy-character-assets/kwame-mensah/atlas/TALK/talk-down-3.png", "/legacy-character-assets/kwame-mensah/atlas/TALK/talk-down-4.png"],
  "talk-down-alt": ["/legacy-character-assets/kwame-mensah/atlas/TALK_DOWN_LEFT/talk-down-alt-1.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_DOWN_LEFT/talk-down-alt-2.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_DOWN_LEFT/talk-down-alt-3.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_DOWN_LEFT/talk-down-alt-4.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_DOWN_LEFT/talk-down-alt-5.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_DOWN_LEFT/talk-down-alt-6.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_DOWN_LEFT/talk-down-alt-7.png"],
  "talk-down-left": ["/legacy-character-assets/kwame-mensah/atlas/TALK_DOWN_LEFT/talk-down-left-1.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_DOWN_LEFT/talk-down-left-2.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_DOWN_LEFT/talk-down-left-3.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_DOWN_LEFT/talk-down-left-4.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_DOWN_LEFT/talk-down-left-5.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_DOWN_LEFT/talk-down-left-6.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_DOWN_LEFT/talk-down-left-7.png"],
  "talk-down-right": ["/legacy-character-assets/kwame-mensah/atlas/TALK_UP_RIGHT/talk-down-right-1.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_UP_RIGHT/talk-down-right-2.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_UP_RIGHT/talk-down-right-3.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_UP_RIGHT/talk-down-right-4.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_UP_RIGHT/talk-down-right-5.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_UP_RIGHT/talk-down-right-6.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_UP_RIGHT/talk-down-right-7.png"],
  "talk-left": ["/legacy-character-assets/kwame-mensah/atlas/TALK/talk-left-1.png", "/legacy-character-assets/kwame-mensah/atlas/TALK/talk-left-2.png", "/legacy-character-assets/kwame-mensah/atlas/TALK/talk-left-3.png", "/legacy-character-assets/kwame-mensah/atlas/TALK/talk-left-4.png"],
  "talk-left-alt": ["/legacy-character-assets/kwame-mensah/atlas/TALK_DOWN_LEFT/talk-left-alt-1.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_DOWN_LEFT/talk-left-alt-2.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_DOWN_LEFT/talk-left-alt-3.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_DOWN_LEFT/talk-left-alt-4.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_DOWN_LEFT/talk-left-alt-5.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_DOWN_LEFT/talk-left-alt-6.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_DOWN_LEFT/talk-left-alt-7.png"],
  "talk-right": ["/legacy-character-assets/kwame-mensah/atlas/TALK/talk-right-1.png", "/legacy-character-assets/kwame-mensah/atlas/TALK/talk-right-2.png", "/legacy-character-assets/kwame-mensah/atlas/TALK/talk-right-3.png", "/legacy-character-assets/kwame-mensah/atlas/TALK/talk-right-4.png"],
  "talk-right-alt": ["/legacy-character-assets/kwame-mensah/atlas/TALK_UP_RIGHT/talk-right-alt-1.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_UP_RIGHT/talk-right-alt-2.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_UP_RIGHT/talk-right-alt-3.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_UP_RIGHT/talk-right-alt-4.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_UP_RIGHT/talk-right-alt-5.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_UP_RIGHT/talk-right-alt-6.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_UP_RIGHT/talk-right-alt-7.png"],
  "talk-up": ["/legacy-character-assets/kwame-mensah/atlas/TALK/talk-up-1.png", "/legacy-character-assets/kwame-mensah/atlas/TALK/talk-up-2.png", "/legacy-character-assets/kwame-mensah/atlas/TALK/talk-up-3.png", "/legacy-character-assets/kwame-mensah/atlas/TALK/talk-up-4.png"],
  "talk-up-alt": ["/legacy-character-assets/kwame-mensah/atlas/TALK_UP_RIGHT/talk-up-alt-1.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_UP_RIGHT/talk-up-alt-2.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_UP_RIGHT/talk-up-alt-3.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_UP_RIGHT/talk-up-alt-4.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_UP_RIGHT/talk-up-alt-5.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_UP_RIGHT/talk-up-alt-6.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_UP_RIGHT/talk-up-alt-7.png"],
  "talk-up-left": ["/legacy-character-assets/kwame-mensah/atlas/TALK_DOWN_LEFT/talk-up-left-1.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_DOWN_LEFT/talk-up-left-2.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_DOWN_LEFT/talk-up-left-3.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_DOWN_LEFT/talk-up-left-4.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_DOWN_LEFT/talk-up-left-5.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_DOWN_LEFT/talk-up-left-6.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_DOWN_LEFT/talk-up-left-7.png"],
  "talk-up-right": ["/legacy-character-assets/kwame-mensah/atlas/TALK_UP_RIGHT/talk-up-right-1.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_UP_RIGHT/talk-up-right-2.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_UP_RIGHT/talk-up-right-3.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_UP_RIGHT/talk-up-right-4.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_UP_RIGHT/talk-up-right-5.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_UP_RIGHT/talk-up-right-6.png", "/legacy-character-assets/kwame-mensah/atlas/TALK_UP_RIGHT/talk-up-right-7.png"],
  "walk-down": ["/legacy-character-assets/kwame-mensah/atlas/Hand-Drawn_Base/walk-down-1.png", "/legacy-character-assets/kwame-mensah/atlas/Hand-Drawn_Base/walk-down-2.png", "/legacy-character-assets/kwame-mensah/atlas/Hand-Drawn_Base/walk-down-3.png", "/legacy-character-assets/kwame-mensah/atlas/Hand-Drawn_Base/walk-down-4.png", "/legacy-character-assets/kwame-mensah/atlas/Hand-Drawn_Base/walk-down-5.png", "/legacy-character-assets/kwame-mensah/atlas/Hand-Drawn_Base/walk-down-6.png", "/legacy-character-assets/kwame-mensah/atlas/Hand-Drawn_Base/walk-down-7.png", "/legacy-character-assets/kwame-mensah/atlas/Hand-Drawn_Base/walk-down-8.png"],
  "walk-left": ["/legacy-character-assets/kwame-mensah/atlas/Hand-Drawn_Base/walk-left-1.png", "/legacy-character-assets/kwame-mensah/atlas/Hand-Drawn_Base/walk-left-2.png", "/legacy-character-assets/kwame-mensah/atlas/Hand-Drawn_Base/walk-left-3.png", "/legacy-character-assets/kwame-mensah/atlas/Hand-Drawn_Base/walk-left-4.png", "/legacy-character-assets/kwame-mensah/atlas/Hand-Drawn_Base/walk-left-5.png", "/legacy-character-assets/kwame-mensah/atlas/Hand-Drawn_Base/walk-left-6.png", "/legacy-character-assets/kwame-mensah/atlas/Hand-Drawn_Base/walk-left-7.png", "/legacy-character-assets/kwame-mensah/atlas/Hand-Drawn_Base/walk-left-8.png"],
  "walk-right": ["/legacy-character-assets/kwame-mensah/atlas/RIGHT_Direction/walk-right-1.png", "/legacy-character-assets/kwame-mensah/atlas/RIGHT_Direction/walk-right-2.png", "/legacy-character-assets/kwame-mensah/atlas/RIGHT_Direction/walk-right-3.png", "/legacy-character-assets/kwame-mensah/atlas/RIGHT_Direction/walk-right-4.png", "/legacy-character-assets/kwame-mensah/atlas/RIGHT_Direction/walk-right-5.png", "/legacy-character-assets/kwame-mensah/atlas/RIGHT_Direction/walk-right-6.png", "/legacy-character-assets/kwame-mensah/atlas/RIGHT_Direction/walk-right-7.png", "/legacy-character-assets/kwame-mensah/atlas/RIGHT_Direction/walk-right-8.png"],
  "walk-up": ["/legacy-character-assets/kwame-mensah/atlas/UP_Direction/walk-up-1.png", "/legacy-character-assets/kwame-mensah/atlas/UP_Direction/walk-up-2.png", "/legacy-character-assets/kwame-mensah/atlas/UP_Direction/walk-up-3.png", "/legacy-character-assets/kwame-mensah/atlas/UP_Direction/walk-up-4.png", "/legacy-character-assets/kwame-mensah/atlas/UP_Direction/walk-up-5.png", "/legacy-character-assets/kwame-mensah/atlas/UP_Direction/walk-up-6.png", "/legacy-character-assets/kwame-mensah/atlas/UP_Direction/walk-up-7.png", "/legacy-character-assets/kwame-mensah/atlas/UP_Direction/walk-up-8.png"],
  "walk-up-left": ["/legacy-character-assets/kwame-mensah/atlas/UP_Direction/walk-up-left-1.png", "/legacy-character-assets/kwame-mensah/atlas/UP_Direction/walk-up-left-2.png", "/legacy-character-assets/kwame-mensah/atlas/UP_Direction/walk-up-left-3.png", "/legacy-character-assets/kwame-mensah/atlas/UP_Direction/walk-up-left-4.png", "/legacy-character-assets/kwame-mensah/atlas/UP_Direction/walk-up-left-5.png", "/legacy-character-assets/kwame-mensah/atlas/UP_Direction/walk-up-left-6.png", "/legacy-character-assets/kwame-mensah/atlas/UP_Direction/walk-up-left-7.png", "/legacy-character-assets/kwame-mensah/atlas/UP_Direction/walk-up-left-8.png"],
  "walk-up-right": ["/legacy-character-assets/kwame-mensah/atlas/RIGHT_Direction/walk-up-right-1.png", "/legacy-character-assets/kwame-mensah/atlas/RIGHT_Direction/walk-up-right-2.png", "/legacy-character-assets/kwame-mensah/atlas/RIGHT_Direction/walk-up-right-3.png", "/legacy-character-assets/kwame-mensah/atlas/RIGHT_Direction/walk-up-right-4.png", "/legacy-character-assets/kwame-mensah/atlas/RIGHT_Direction/walk-up-right-5.png", "/legacy-character-assets/kwame-mensah/atlas/RIGHT_Direction/walk-up-right-6.png", "/legacy-character-assets/kwame-mensah/atlas/RIGHT_Direction/walk-up-right-7.png", "/legacy-character-assets/kwame-mensah/atlas/RIGHT_Direction/walk-up-right-8.png"],
};

/** Combat clips with no art yet — sprite player falls back to a placeholder. See KwameHeroSprite.tsx. */
export const KWAME_PENDING_ART_CLIPS: KwameClipName[] = [
  "light-attack-down",
  "light-attack-left",
  "light-attack-right",
  "light-attack-up",
  "heavy-attack-down",
  "heavy-attack-left",
  "heavy-attack-right",
  "heavy-attack-up",
  "dodge-down",
  "dodge-left",
  "dodge-right",
  "dodge-up",
  "guard-down",
  "guard-left",
  "guard-right",
  "guard-up",
  "jump-start-down",
  "jump-start-left",
  "jump-start-right",
  "jump-start-up",
  "rising-down",
  "rising-left",
  "rising-right",
  "rising-up",
  "falling-down",
  "falling-left",
  "falling-right",
  "falling-up",
  "aerial-attack-down",
  "aerial-attack-left",
  "aerial-attack-right",
  "aerial-attack-up",
  "land-down",
  "land-left",
  "land-right",
  "land-up",
];

export const KWAME_ATLAS_FPS = 12; // per production spec: authored at 12 FPS