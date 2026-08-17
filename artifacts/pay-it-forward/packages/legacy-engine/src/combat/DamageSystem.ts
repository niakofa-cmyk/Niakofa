import type { EventBus } from "../core/EventBus.js";
import type { WorldEvents } from "../core/events.js";
import type { Actor } from "../actors/Actor.js";
import type { HitEvent, DamageEvent } from "./types.js";

/**
 * DamageSystem
 * ------------
 * Turns a geometric HitEvent into actual game state change: health loss,
 * knockback velocity, and the HURT -> STAGGER -> RECOVERY -> IDLE state
 * transition sequence. Emits actor:hurt / combat:damage so UI (health
 * bars, screen shake, journal) can react without coupling to combat code.
 */
export class DamageSystem {
  private readonly bus: EventBus<WorldEvents>;

  constructor(bus: EventBus<WorldEvents>) {
    this.bus = bus;
  }

  apply(hit: HitEvent, target: Actor): DamageEvent {
    target.health = Math.max(0, target.health - hit.damage);
    const lethal = target.health <= 0;

    const knockDirection = target.facing === 1 ? -1 : 1; // pushed away from the attacker
    const damageEvent: DamageEvent = {
      targetId: target.id,
      amount: hit.damage,
      remainingHealth: target.health,
      lethal,
      knockbackX: hit.knockback * knockDirection,
      knockbackY: 0,
    };

    target.velocity.x = damageEvent.knockbackX;
    target.velocity.y = damageEvent.knockbackY;

    this.bus.emit("combat:hit", hit);
    this.bus.emit("actor:hurt", hit);
    this.bus.emit("combat:damage", damageEvent);

    if (lethal) {
      target.requestState("defeated");
    } else {
      target.requestState("hurt");
      if (hit.stagger) {
        // Advance hurt -> stagger immediately for a heavy hit; a light hit
        // just plays the hurt clip and CombatController returns it to
        // recovery once that clip completes.
        target.requestState("stagger");
      }
    }
    return damageEvent;
  }
}
