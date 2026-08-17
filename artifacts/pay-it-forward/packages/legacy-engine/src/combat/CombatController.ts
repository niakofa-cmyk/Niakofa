import type { EventBus } from "../core/EventBus.js";
import type { WorldEvents } from "../core/events.js";
import type { System } from "../core/GameLoop.js";
import type { Actor } from "../actors/Actor.js";
import { HitboxSystem } from "./HitboxSystem.js";
import { DamageSystem } from "./DamageSystem.js";

/**
 * CombatController
 * -----------------
 * The full loop from the design doc:
 *   Input -> Movement/Combat state -> Attack -> Animation -> Hitbox ->
 *   Collision -> Damage -> Hit Reaction -> Knockback -> Recovery
 *
 * One controller manages every actor in a combat space (player + all
 * enemies currently engaged), because hit detection is inherently
 * many-vs-many, not per-actor.
 */
export class CombatController implements System {
  private readonly actors: Map<string, Actor> = new Map();
  private readonly bus: EventBus<WorldEvents>;
  private readonly hitboxSystem = new HitboxSystem();
  private readonly damageSystem: DamageSystem;

  constructor(bus: EventBus<WorldEvents>) {
    this.bus = bus;
    this.damageSystem = new DamageSystem(bus);
  }

  addActor(actor: Actor): void {
    this.actors.set(actor.id, actor);
    // Auto-chain animation-driven transitions: an attack/hurt/stagger clip
    // finishing playing is what moves the state machine forward, so combat
    // pacing always matches what's drawn on screen, never a fixed timer.
    actor.animation.onClipComplete(() => this.onClipComplete(actor));
  }

  removeActor(actorId: string): void {
    this.actors.delete(actorId);
  }

  /** Player/AI input entry point. Returns false if an attack can't start right now (e.g. mid-recovery). */
  requestAttack(actorId: string, clipId?: string): boolean {
    const actor = this.actors.get(actorId);
    if (!actor || !actor.isAlive) return false;
    if (!actor.state.canTransition("attack")) return false;
    if (clipId) actor.animation.play(clipId, { restartIfSame: true });
    return actor.requestState("attack");
  }

  requestDodge(actorId: string): boolean {
    const actor = this.actors.get(actorId);
    if (!actor || !actor.isAlive) return false;
    return actor.requestState("dodge");
  }

  private onClipComplete(actor: Actor): void {
    switch (actor.state.value) {
      case "attack":
        actor.requestState("recovery");
        actor.requestState("idle");
        break;
      case "hurt":
        // Only fall through to recovery if DamageSystem didn't already
        // escalate this hit to "stagger" (heavy hit) this frame.
        if (actor.state.value === "hurt") {
          actor.requestState("recovery");
          actor.requestState("idle");
        }
        break;
      case "stagger":
        actor.requestState("recovery");
        actor.requestState("idle");
        break;
      case "dodge":
        actor.requestState("idle");
        break;
      default:
        break;
    }
  }

  tick(dtSeconds: number): void {
    const living = Array.from(this.actors.values()).filter((a) => a.isAlive);

    // 1. advance every actor's animation clock
    for (const actor of living) actor.tickAnimation(dtSeconds);

    // 2. resolve hitbox collisions for anyone currently mid-attack
    for (const attacker of living) {
      if (attacker.state.value !== "attack") continue;
      const hits = this.hitboxSystem.resolveHits(attacker, living);
      for (const hit of hits) {
        const target = this.actors.get(hit.targetId);
        if (target) this.damageSystem.apply(hit, target);
      }
    }

    // 3. simple knockback decay so velocity doesn't run forever
    for (const actor of living) {
      actor.velocity.x *= 0.85;
      actor.velocity.y *= 0.85;
      if (Math.abs(actor.velocity.x) < 0.01) actor.velocity.x = 0;
      if (Math.abs(actor.velocity.y) < 0.01) actor.velocity.y = 0;
      actor.position.x += actor.velocity.x * dtSeconds;
      actor.position.y += actor.velocity.y * dtSeconds;
    }
  }
}
