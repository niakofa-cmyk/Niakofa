import type { EventBus } from "../core/EventBus.js";
import type { WorldEvents } from "../core/events.js";
import type { ActorStateName } from "./types.js";

/**
 * Legal transitions, matching the design doc's state diagram:
 *
 *   IDLE -> WALK -> {ATTACK, DODGE, INTERACT} -> RECOVERY -> IDLE
 *   (any actionable state) -> HURT -> STAGGER -> RECOVERY -> IDLE
 *   any -> DEFEATED (terminal)
 *
 * "Hurt" can interrupt almost anything except another hurt/stagger/defeat -
 * that's what makes hit reactions feel responsive instead of queued.
 */
const TRANSITIONS: Record<ActorStateName, ActorStateName[]> = {
  idle: ["walk", "attack", "dodge", "interact", "hurt", "defeated"],
  walk: ["idle", "attack", "dodge", "interact", "hurt", "defeated"],
  attack: ["recovery", "hurt", "defeated"],
  dodge: ["idle", "walk", "hurt", "defeated"],
  interact: ["idle", "hurt", "defeated"],
  hurt: ["stagger", "recovery", "defeated"],
  stagger: ["recovery", "hurt", "defeated"],
  recovery: ["idle", "walk", "defeated"],
  defeated: [],
};

export class ActorState {
  readonly actorId: string;
  private current: ActorStateName = "idle";
  private readonly bus: EventBus<WorldEvents>;

  constructor(actorId: string, bus: EventBus<WorldEvents>) {
    this.actorId = actorId;
    this.bus = bus;
  }

  get value(): ActorStateName {
    return this.current;
  }

  canTransition(to: ActorStateName): boolean {
    return TRANSITIONS[this.current].includes(to);
  }

  /**
   * @param force Bypass the legality check. Used sparingly (e.g. scripted
   *              cinematic states) - prefer canTransition() gating instead.
   */
  transition(to: ActorStateName, force = false): boolean {
    if (this.current === to) return true;
    if (!force && !this.canTransition(to)) return false;
    const from = this.current;
    this.current = to;
    this.bus.emit("actor:stateChanged", { actorId: this.actorId, from, to });
    if (to === "defeated") {
      this.bus.emit("actor:defeated", { actorId: this.actorId });
    }
    return true;
  }
}
