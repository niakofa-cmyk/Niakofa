import type { Actor } from "./Actor.js";
import type { CombatController } from "../combat/CombatController.js";
import type { System } from "../core/GameLoop.js";

export interface PlayerInput {
  moveX: number; // -1..1
  moveY: number; // -1..1
  attackPressed: boolean;
  dodgePressed: boolean;
}

const WALK_SPEED = 120; // world units / second

/**
 * PlayerController
 * -----------------
 * Input -> Movement Controller -> Combat Controller, exactly the pipeline
 * from the design doc. Movement only happens in idle/walk; anything
 * actionable (attack/hurt/stagger/dodge) locks movement out until the
 * animation-driven state machine returns to idle/walk, which is what
 * gives hits real weight instead of being a strafe-and-poke.
 */
export class PlayerController implements System {
  private readonly actor: Actor;
  private readonly combat: CombatController;
  private input: PlayerInput = { moveX: 0, moveY: 0, attackPressed: false, dodgePressed: false };

  constructor(actor: Actor, combat: CombatController) {
    this.actor = actor;
    this.combat = combat;
  }

  setInput(input: Partial<PlayerInput>): void {
    this.input = { ...this.input, ...input };
  }

  private get canMove(): boolean {
    return this.actor.state.value === "idle" || this.actor.state.value === "walk";
  }

  tick(dtSeconds: number): void {
    if (this.input.attackPressed) {
      this.combat.requestAttack(this.actor.id);
    } else if (this.input.dodgePressed && this.canMove) {
      this.combat.requestDodge(this.actor.id);
    } else if (this.canMove) {
      const { moveX, moveY } = this.input;
      const moving = moveX !== 0 || moveY !== 0;
      if (moving) {
        this.actor.facing = moveX >= 0 ? 1 : -1;
        this.actor.position.x += moveX * WALK_SPEED * dtSeconds;
        this.actor.position.y += moveY * WALK_SPEED * dtSeconds;
        this.actor.requestState("walk");
      } else {
        this.actor.requestState("idle");
      }
    }
  }
}
