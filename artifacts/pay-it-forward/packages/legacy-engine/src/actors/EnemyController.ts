import type { Actor } from "./Actor.js";
import type { CombatController } from "../combat/CombatController.js";
import type { System } from "../core/GameLoop.js";

export type EnemyAIState = "idle" | "patrol" | "detect" | "chase" | "attack" | "recover";

export interface EnemyControllerOptions {
  detectRadius: number;
  attackRadius: number;
  patrolPoints: { x: number; y: number }[];
  chaseSpeed: number;
  patrolSpeed: number;
}

/**
 * EnemyController
 * ----------------
 * Idle -> Patrol -> Detect -> Chase -> Attack -> Hit -> Stagger -> Recover
 * from the design doc, layered on top of the same Actor/CombatController
 * used by the player - enemies and the player share one combat pipeline,
 * so a hostile NPC and Kwame play by identical rules.
 */
export class EnemyController implements System {
  private readonly actor: Actor;
  private readonly target: Actor;
  private readonly combat: CombatController;
  private readonly opts: EnemyControllerOptions;

  private aiState: EnemyAIState = "idle";
  private patrolIndex = 0;

  constructor(actor: Actor, target: Actor, combat: CombatController, opts: Partial<EnemyControllerOptions> = {}) {
    this.actor = actor;
    this.target = target;
    this.combat = combat;
    this.opts = {
      detectRadius: opts.detectRadius ?? 220,
      attackRadius: opts.attackRadius ?? 48,
      patrolPoints: opts.patrolPoints ?? [],
      chaseSpeed: opts.chaseSpeed ?? 90,
      patrolSpeed: opts.patrolSpeed ?? 40,
    };
  }

  get state(): EnemyAIState {
    return this.aiState;
  }

  private distanceToTarget(): number {
    const dx = this.target.position.x - this.actor.position.x;
    const dy = this.target.position.y - this.actor.position.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  tick(dtSeconds: number): void {
    if (!this.actor.isAlive) {
      this.aiState = "recover";
      return;
    }

    // Combat state machine (hurt/stagger/attack) takes priority over AI intent.
    const actorState = this.actor.state.value;
    if (actorState === "hurt" || actorState === "stagger" || actorState === "attack") {
      return;
    }

    const distance = this.distanceToTarget();

    switch (this.aiState) {
      case "idle":
      case "patrol":
        this.runPatrol(dtSeconds);
        if (distance <= this.opts.detectRadius) this.aiState = "detect";
        break;

      case "detect":
        // One-frame transition state, gives room for a future "!" reaction anim.
        this.aiState = "chase";
        break;

      case "chase":
        if (distance <= this.opts.attackRadius) {
          this.aiState = "attack";
        } else if (distance > this.opts.detectRadius * 1.5) {
          this.aiState = "patrol"; // lost the target, go back to patrolling
        } else {
          this.moveToward(this.target.position, this.opts.chaseSpeed, dtSeconds);
        }
        break;

      case "attack":
        this.actor.facing = this.target.position.x >= this.actor.position.x ? 1 : -1;
        if (this.combat.requestAttack(this.actor.id)) {
          this.aiState = "recover";
        }
        break;

      case "recover":
        if (actorState === "idle" || actorState === "recovery") {
          this.aiState = distance <= this.opts.attackRadius ? "attack" : "chase";
        }
        break;
    }
  }

  private moveToward(point: { x: number; y: number }, speed: number, dtSeconds: number): void {
    const dx = point.x - this.actor.position.x;
    const dy = point.y - this.actor.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    this.actor.facing = dx >= 0 ? 1 : -1;
    this.actor.position.x += (dx / dist) * speed * dtSeconds;
    this.actor.position.y += (dy / dist) * speed * dtSeconds;
    this.actor.requestState("walk");
  }

  private runPatrol(dtSeconds: number): void {
    const points = this.opts.patrolPoints;
    if (points.length === 0) {
      this.actor.requestState("idle");
      return;
    }
    const targetPoint = points[this.patrolIndex]!;
    const dx = targetPoint.x - this.actor.position.x;
    const dy = targetPoint.y - this.actor.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 4) {
      this.patrolIndex = (this.patrolIndex + 1) % points.length;
      this.actor.requestState("idle");
      return;
    }
    this.moveToward(targetPoint, this.opts.patrolSpeed, dtSeconds);
  }
}
