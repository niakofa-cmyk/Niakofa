import type { EventBus } from "../core/EventBus.js";
import type { WorldEvents } from "../core/events.js";
import { ActorState } from "./ActorState.js";
import { AnimationController } from "../animation/AnimationController.js";
import type { SpriteAtlas } from "../animation/SpriteAtlas.js";
import type { ActorConfig, ActorStateName, Vector2 } from "./types.js";

export interface HurtboxDef {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Actor
 * -----
 * The runtime object CombatController, EnemyController, and
 * PlayerController all operate on. Deliberately owns no rendering state -
 * a PixiJS adapter reads position/facing/animation.frame to update a
 * Sprite/AnimatedSprite each frame (see examples/PixiAdapter.ts).
 */
export class Actor {
  readonly id: string;
  readonly config: ActorConfig;
  readonly state: ActorState;
  readonly animation: AnimationController;

  position: Vector2 = { x: 0, y: 0 };
  facing: 1 | -1 = 1;
  velocity: Vector2 = { x: 0, y: 0 };

  health: number;
  hurtbox: HurtboxDef;

  /** Ids already hit by the *current* attack activation, to prevent multi-hit in one swing. */
  private hitTargetsThisActivation = new Set<string>();
  private wasHitboxActiveLastFrame = false;

  constructor(config: ActorConfig, atlas: SpriteAtlas, bus: EventBus<WorldEvents>, hurtbox: HurtboxDef) {
    this.id = config.id;
    this.config = config;
    this.state = new ActorState(config.id, bus);
    const idleClip = config.clipForState.idle ?? atlas.listClips()[0];
    if (!idleClip) throw new Error(`Actor ${config.id}: atlas has no clips`);
    this.animation = new AnimationController(atlas, idleClip);
    this.health = config.maxHealth;
    this.hurtbox = hurtbox;
  }

  get isAlive(): boolean {
    return this.state.value !== "defeated";
  }

  /** Call once per fixed tick, before combat/AI systems run. */
  tickAnimation(dtSeconds: number): void {
    this.animation.tick(dtSeconds);

    // Clear the per-swing hit set the instant the hitbox window closes,
    // so the *next* activation (next attack) can hit the same target again.
    const activeNow = this.animation.isHitboxActive;
    if (this.wasHitboxActiveLastFrame && !activeNow) {
      this.hitTargetsThisActivation.clear();
    }
    this.wasHitboxActiveLastFrame = activeNow;
  }

  hasAlreadyHit(targetId: string): boolean {
    return this.hitTargetsThisActivation.has(targetId);
  }

  markHit(targetId: string): void {
    this.hitTargetsThisActivation.add(targetId);
  }

  requestState(next: ActorStateName): boolean {
    const ok = this.state.transition(next);
    if (ok) {
      const clip = this.config.clipForState[next];
      if (clip) this.animation.play(clip, { restartIfSame: next === "attack" || next === "hurt" });
    }
    return ok;
  }

  /** World-space hurtbox AABB for collision tests. */
  worldHurtbox(): { x: number; y: number; width: number; height: number } {
    return {
      x: this.position.x + this.hurtbox.offsetX * this.facing - this.hurtbox.width / 2,
      y: this.position.y + this.hurtbox.offsetY - this.hurtbox.height / 2,
      width: this.hurtbox.width,
      height: this.hurtbox.height,
    };
  }
}
