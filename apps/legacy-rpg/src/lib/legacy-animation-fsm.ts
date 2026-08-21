/**
 * Character movement/animation state machine.
 *
 * Shape borrowed conceptually from LMBS (Linear Motion Battle System, an
 * RPG Maker MV plugin bundle) per docs/ARCHITECTURE_PLAN.md §4 — the loop
 * Character → Movement → Animation → Action → Collision → World response.
 *
 * Zero LMBS/RPG-Maker code is used here. This is a plain, framework-agnostic
 * TypeScript state machine that can drive DOM sprites (current
 * LegacyCharacterSprite approach), a <canvas>, or PixiJS later without
 * rewriting the state logic — only the render step changes.
 *
 * Aug 2026 extension: `state.anim` is now `string` (not the narrow
 * `LegacyAnimState` union) so that combat extensions (LegacyCombatController
 * in legacy-combat-fsm.ts) can inject their own animation names without a
 * type cast. The `actionPlaying` flag prevents `tick()` from overwriting
 * a mid-play action animation with a movement state, which was a real bug
 * before this fix.
 */

export type LegacyAnimState =
  | "idle"
  | "walk"
  | "run"
  | "interact"
  | "talk"
  | "examine"
  | "emote"
  | "attack"
  | "hurt"
  | "pick_up"    // Hand-drawn PICK_UP atlas: 8 frames × 4 directions
  | "inspect";   // Hand-drawn INSPECT atlas:  6 frames × 4 directions

/**
 * Widened to six directions to match the real Kwame sprite atlas —
 * the extracted art covers down/left/right/up plus two "up" diagonals
 * (up_left/up_right). facingFromInput() below still only ever produces
 * the four cardinal values; up_left/up_right are set by the game canvas
 * via directionFromVector(). Kept as one shared type so both producers
 * write into the same field without a cast.
 */
export type LegacyFacing = "up" | "down" | "left" | "right" | "up_left" | "up_right";

export interface LegacyActorState {
  x: number;
  y: number;
  facing: LegacyFacing;
  /**
   * Current animation name. Typed as `string` so combat/extension state
   * machines can inject names beyond `LegacyAnimState` without casting.
   * Renderers that switch on this value should always have a default branch.
   */
  anim: string;
  animFrame: number;
  animElapsedMs: number;
  speedTilesPerSec: number;
  /**
   * True while `playAction` is running a non-looping clip.
   * `tick()` will not override the current animation when this is true —
   * movement can still update `facing`, but the rendered clip stays locked
   * until the action completes or `interruptAction()` is called.
   */
  actionPlaying: boolean;
}

/** Per docs/calibration-sheet.json animationSet.recommendedFrameCounts / recommendedFps */
export const ANIM_SPEC: Record<
  LegacyAnimState,
  { frameCount: number; fps: number; loops: boolean }
> = {
  idle:     { frameCount: 8,  fps: 8,  loops: true  },
  walk:     { frameCount: 8,  fps: 10, loops: true  },
  run:      { frameCount: 7,  fps: 14, loops: true  },
  interact: { frameCount: 8,  fps: 10, loops: false },
  talk:     { frameCount: 4,  fps: 6,  loops: true  },
  examine:  { frameCount: 5,  fps: 8,  loops: false },
  emote:    { frameCount: 4,  fps: 6,  loops: false },
  attack:   { frameCount: 10, fps: 14, loops: false },
  hurt:     { frameCount: 6,  fps: 10, loops: false },
  pick_up:  { frameCount: 8,  fps: 10, loops: false },
  inspect:  { frameCount: 6,  fps: 8,  loops: false },
};

export interface LegacyCollisionQuery {
  canOccupy(x: number, y: number): boolean;
}

export interface LegacyInteractable {
  id: string;
  x: number;
  y: number;
  radiusTiles: number;
  onInteract: () => void;
}

/** Spec used when `playAction` is called with an unknown (extension) animation name. */
const FALLBACK_ACTION_SPEC = { frameCount: 6, fps: 12, loops: false };

/**
 * One actor's movement + animation state, advanced per tick. Doesn't know
 * about rendering — a component like LegacyCharacterSprite reads `anim` +
 * `animFrame` + `facing` and picks the right frame to draw.
 */
export class LegacyActorController {
  state: LegacyActorState;

  constructor(initial: Pick<LegacyActorState, "x" | "y" | "facing">) {
    this.state = {
      ...initial,
      anim: "idle",
      animFrame: 0,
      animElapsedMs: 0,
      speedTilesPerSec: 3,
      actionPlaying: false,
    };
  }

  /** Call once per frame with elapsed ms and desired movement input. */
  tick(
    deltaMs: number,
    input: { dx: number; dy: number; running: boolean },
    collision: LegacyCollisionQuery
  ) {
    const moving = input.dx !== 0 || input.dy !== 0;

    if (moving) {
      // Facing updates even during an action clip (player can change direction mid-attack)
      this.state.facing = this.facingFromInput(input);
      const speed = this.state.speedTilesPerSec * (input.running ? 1.6 : 1);
      const nextX = this.state.x + input.dx * speed * (deltaMs / 1000);
      const nextY = this.state.y + input.dy * speed * (deltaMs / 1000);
      if (collision.canOccupy(nextX, this.state.y)) this.state.x = nextX;
      if (collision.canOccupy(this.state.x, nextY)) this.state.y = nextY;
    }

    if (this.state.actionPlaying) {
      // An action clip is running — advance its frame timer and do NOT override
      // with a movement animation. This was a bug before Aug 2026.
      this.advanceActionAnim(deltaMs);
    } else {
      const nextAnim: LegacyAnimState = moving
        ? input.running ? "run" : "walk"
        : "idle";
      this.setMovementAnim(nextAnim, deltaMs);
    }
  }

  /**
   * Play a non-movement action (talk/interact/attack/hurt/combat…).
   * Accepts any animation name string so that LegacyCombatController can
   * inject combat state names without a type cast.
   *
   * @param anim     - Animation name to play.
   * @param onComplete - Called once when a non-looping clip finishes.
   * @param spec     - Optional frame spec. Falls back to ANIM_SPEC[anim], then
   *                   FALLBACK_ACTION_SPEC. Pass the combat module's own spec
   *                   for correct frame counts on combat animations.
   */
  playAction(
    anim: string,
    onComplete?: () => void,
    spec?: { frameCount: number; fps: number; loops: boolean }
  ) {
    this.state.anim = anim;
    this.state.animFrame = 0;
    this.state.animElapsedMs = 0;
    const resolved =
      spec ??
      ANIM_SPEC[anim as LegacyAnimState] ??
      FALLBACK_ACTION_SPEC;

    if (!resolved.loops) {
      this.state.actionPlaying = true;
      this._activeActionSpec = resolved;
      if (onComplete) {
        this._pendingActionComplete = onComplete;
      }
    }
  }

  /**
   * Immediately cancels any running action and returns to idle.
   * Use when a hit interrupts an attack, or when exiting combat.
   */
  interruptAction() {
    this.state.actionPlaying = false;
    this._pendingActionComplete = undefined;
    this._activeActionSpec = undefined;
    this.state.anim = "idle";
    this.state.animFrame = 0;
    this.state.animElapsedMs = 0;
  }

  /** World-response hook: find the nearest interactable in range and trigger it. */
  tryInteract(candidates: LegacyInteractable[]): LegacyInteractable | null {
    const target = candidates.find(
      (c) => Math.hypot(c.x - this.state.x, c.y - this.state.y) <= c.radiusTiles
    );
    if (target) {
      this.playAction("interact", () => target.onInteract());
      return target;
    }
    return null;
  }

  private _pendingActionComplete?: () => void;
  private _activeActionSpec?: { frameCount: number; fps: number; loops: boolean };

  private facingFromInput(input: { dx: number; dy: number }): LegacyFacing {
    if (Math.abs(input.dx) > Math.abs(input.dy)) {
      return input.dx > 0 ? "right" : "left";
    }
    return input.dy > 0 ? "down" : "up";
  }

  /** Advances a non-looping action clip and fires onComplete when done. */
  private advanceActionAnim(deltaMs: number) {
    const spec =
      this._activeActionSpec ??
      ANIM_SPEC[this.state.anim as LegacyAnimState] ??
      FALLBACK_ACTION_SPEC;
    this.state.animElapsedMs += deltaMs;
    const msPerFrame = 1000 / spec.fps;
    if (this.state.animElapsedMs >= msPerFrame) {
      this.state.animElapsedMs -= msPerFrame;
      const next = this.state.animFrame + 1;
      if (next >= spec.frameCount) {
        // Action finished
        this.state.animFrame = spec.frameCount - 1;
        this.state.actionPlaying = false;
        this._activeActionSpec = undefined;
        this._pendingActionComplete?.();
        this._pendingActionComplete = undefined;
      } else {
        this.state.animFrame = next;
      }
    }
  }

  /** Drives looping movement animations (idle / walk / run). */
  private setMovementAnim(anim: LegacyAnimState, deltaMs: number) {
    const spec = ANIM_SPEC[anim];
    if (this.state.anim !== anim) {
      this.state.anim = anim;
      this.state.animFrame = 0;
      this.state.animElapsedMs = 0;
    }
    this.state.animElapsedMs += deltaMs;
    const msPerFrame = 1000 / spec.fps;
    if (this.state.animElapsedMs >= msPerFrame) {
      this.state.animElapsedMs -= msPerFrame;
      const next = this.state.animFrame + 1;
      this.state.animFrame = next >= spec.frameCount ? 0 : next;
    }
  }
}
