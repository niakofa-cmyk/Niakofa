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
  | "hurt";

export type LegacyFacing = "up" | "down" | "left" | "right";

export interface LegacyActorState {
  x: number;
  y: number;
  facing: LegacyFacing;
  anim: LegacyAnimState;
  animFrame: number;
  animElapsedMs: number;
  speedTilesPerSec: number;
}

/** Per docs/calibration-sheet.json animationSet.recommendedFrameCounts / recommendedFps */
export const ANIM_SPEC: Record<
  LegacyAnimState,
  { frameCount: number; fps: number; loops: boolean }
> = {
  idle: { frameCount: 6, fps: 8, loops: true },
  walk: { frameCount: 8, fps: 10, loops: true },
  run: { frameCount: 8, fps: 12, loops: true },
  interact: { frameCount: 6, fps: 8, loops: false },
  talk: { frameCount: 4, fps: 6, loops: true },
  examine: { frameCount: 5, fps: 8, loops: false },
  emote: { frameCount: 4, fps: 6, loops: false },
  attack: { frameCount: 10, fps: 14, loops: false },
  hurt: { frameCount: 5, fps: 10, loops: false },
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
    };
  }

  /** Call once per frame with elapsed ms and desired movement input. */
  tick(
    deltaMs: number,
    input: { dx: number; dy: number; running: boolean },
    collision: LegacyCollisionQuery
  ) {
    const moving = input.dx !== 0 || input.dy !== 0;
    const nextAnim: LegacyAnimState = moving ? (input.running ? "run" : "walk") : "idle";

    if (moving) {
      this.state.facing = this.facingFromInput(input);
      const speed = this.state.speedTilesPerSec * (input.running ? 1.6 : 1);
      const nextX = this.state.x + input.dx * speed * (deltaMs / 1000);
      const nextY = this.state.y + input.dy * speed * (deltaMs / 1000);
      if (collision.canOccupy(nextX, this.state.y)) this.state.x = nextX;
      if (collision.canOccupy(this.state.x, nextY)) this.state.y = nextY;
    }

    this.setAnim(nextAnim, deltaMs);
  }

  /** Non-movement actions (talk/interact/attack/etc) interrupt the movement anim. */
  playAction(anim: LegacyAnimState, onComplete?: () => void) {
    this.state.anim = anim;
    this.state.animFrame = 0;
    this.state.animElapsedMs = 0;
    if (!ANIM_SPEC[anim].loops && onComplete) {
      this._pendingActionComplete = onComplete;
    }
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

  private facingFromInput(input: { dx: number; dy: number }): LegacyFacing {
    if (Math.abs(input.dx) > Math.abs(input.dy)) {
      return input.dx > 0 ? "right" : "left";
    }
    return input.dy > 0 ? "down" : "up";
  }

  private setAnim(anim: LegacyAnimState, deltaMs: number) {
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
      if (next >= spec.frameCount) {
        if (spec.loops) {
          this.state.animFrame = 0;
        } else {
          this.state.animFrame = spec.frameCount - 1;
          this._pendingActionComplete?.();
          this._pendingActionComplete = undefined;
        }
      } else {
        this.state.animFrame = next;
      }
    }
  }
}
