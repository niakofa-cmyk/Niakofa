import type { Actor } from "../actors/Actor.js";
import type { AABB, HitEvent } from "./types.js";
import { intersectsAABB } from "./types.js";

/**
 * HitboxSystem
 * ------------
 * Reads AnimationController.isHitboxActive / .hitbox (frame-authored data)
 * off the attacker, converts it to a world-space AABB using the attacker's
 * position + facing, and tests it against every other living actor's
 * hurtbox. Pure geometry - no damage math here (see DamageSystem).
 */
export class HitboxSystem {
  /** Compute the attacker's current live hitbox in world space, or null if not active this frame. */
  worldHitboxFor(attacker: Actor): AABB | null {
    const hb = attacker.animation.hitbox;
    if (!hb) return null;
    return {
      x: attacker.position.x + hb.x * attacker.facing - hb.width / 2,
      y: attacker.position.y + hb.y - hb.height / 2,
      width: hb.width,
      height: hb.height,
    };
  }

  /**
   * Check `attacker`'s current active hitbox against every candidate
   * target, returning HitEvents for new (not-yet-hit-this-swing) collisions.
   * Does not mutate anything - caller (CombatController) applies results.
   */
  resolveHits(attacker: Actor, candidates: Actor[]): HitEvent[] {
    if (!attacker.animation.isHitboxActive) return [];
    const worldBox = this.worldHitboxFor(attacker);
    if (!worldBox) return [];
    const hitboxDef = attacker.animation.hitbox!;

    const events: HitEvent[] = [];
    for (const target of candidates) {
      if (target.id === attacker.id) continue;
      if (!target.isAlive) continue;
      if (attacker.hasAlreadyHit(target.id)) continue;
      if (!intersectsAABB(worldBox, target.worldHurtbox())) continue;

      attacker.markHit(target.id);
      events.push({
        attackerId: attacker.id,
        targetId: target.id,
        clip: attacker.animation.clipId,
        frame: attacker.animation.frame,
        damage: hitboxDef.damage,
        knockback: hitboxDef.knockback,
        stagger: !!hitboxDef.stagger,
      });
    }
    return events;
  }
}
