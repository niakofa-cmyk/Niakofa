/**
 * Real-time combat extension of legacy-animation-fsm.ts's LegacyActorController.
 * See docs/COMBAT_SYSTEM.md for the full design and the LMBS concept-mapping
 * table this implements natively (zero LMBS/RPG-Maker code).
 *
 * Aug 2026: no longer needs an `as unknown` type cast to inject combat animation
 * names into the base actor. LegacyActorController.playAction() now accepts
 * `string` and the `actionPlaying` flag prevents movement ticks from
 * overriding a mid-play combat clip. COMBAT_ANIM_SPEC is passed through as the
 * `spec` argument so frame counts / FPS are always correct.
 */

import { LegacyActorController, LegacyAnimState, ANIM_SPEC } from "./legacy-animation-fsm";

export type LegacyCombatAnimState =
  | "lightAttack1"
  | "lightAttack2"
  | "heavyAttack"
  | "aerialAttack"
  | "dash"
  | "airDash"
  | "jump"
  | "doubleJump"
  | "fall"
  | "guard"
  | "parry"
  | "knockback";

export type LegacyFullAnimState = LegacyAnimState | LegacyCombatAnimState;

/** Placeholder-safe: art may not exist yet for every state (see COMBAT_SYSTEM.md). */
export const COMBAT_ANIM_SPEC: Record<
  LegacyCombatAnimState,
  { frameCount: number; fps: number; loops: boolean; artStatus: "handDrawn" | "placeholder" }
> = {
  lightAttack1: { frameCount: 5,  fps: 14, loops: false, artStatus: "placeholder" },
  lightAttack2: { frameCount: 6,  fps: 14, loops: false, artStatus: "placeholder" },
  heavyAttack:  { frameCount: 9,  fps: 12, loops: false, artStatus: "placeholder" },
  aerialAttack: { frameCount: 6,  fps: 14, loops: false, artStatus: "placeholder" },
  dash:         { frameCount: 4,  fps: 16, loops: false, artStatus: "placeholder" },
  airDash:      { frameCount: 4,  fps: 16, loops: false, artStatus: "placeholder" },
  jump:         { frameCount: 3,  fps: 10, loops: false, artStatus: "placeholder" },
  doubleJump:   { frameCount: 3,  fps: 10, loops: false, artStatus: "placeholder" },
  fall:         { frameCount: 2,  fps: 8,  loops: true,  artStatus: "placeholder" },
  guard:        { frameCount: 2,  fps: 6,  loops: true,  artStatus: "placeholder" },
  parry:        { frameCount: 3,  fps: 16, loops: false, artStatus: "placeholder" },
  // Reuses the real hurt/* frames already extracted from the atlas — the
  // one combat state with actual hand-drawn art today.
  knockback:    { frameCount: 5,  fps: 10, loops: false, artStatus: "handDrawn" },
};

/** Unified spec lookup: checks base ANIM_SPEC first, then COMBAT_ANIM_SPEC. */
export function getAnimSpec(
  anim: string
): { frameCount: number; fps: number; loops: boolean } | undefined {
  return (
    ANIM_SPEC[anim as LegacyAnimState] ??
    COMBAT_ANIM_SPEC[anim as LegacyCombatAnimState]
  );
}

const SP_COSTS = { dash: 15, airDash: 20, heavyAttack: 25 };
const COMBO_WINDOW_MS = 450;
const DASH_INVULN_MS = 180;
const PARRY_WINDOW_MS = 150;
const GRAVITY = 22; // world units/sec^2, tune against calibration-sheet.json worldUnit
const GROUND_Y = 0;

export interface LegacyCombatTarget {
  id: string;
  x: number;
  y: number;
  hp: number;
  applyDamage(amount: number, knockback: { dx: number; dy: number }): void;
}

export class LegacyCombatController {
  actor: LegacyActorController;
  sp = 100;
  maxSp = 100;
  airborne = false;
  velocityY = 0;
  canDoubleJump = false;
  invulnerableUntilMs = 0;
  private comboStage: 0 | 1 = 0;
  private comboExpiresAtMs = 0;
  private guardHeld = false;
  private guardStartedAtMs = 0;
  private nowMs = 0;

  constructor(actor: LegacyActorController) {
    this.actor = actor;
  }

  tick(deltaMs: number) {
    this.nowMs += deltaMs;
    if (this.airborne) {
      this.velocityY += GRAVITY * (deltaMs / 1000);
      this.actor.state.y += this.velocityY * (deltaMs / 1000);
      if (this.actor.state.y >= GROUND_Y) {
        this.actor.state.y = GROUND_Y;
        this.airborne = false;
        this.velocityY = 0;
        this.canDoubleJump = false;
      }
    }
  }

  private spend(cost: number): boolean {
    if (this.sp < cost) return false;
    this.sp -= cost;
    return true;
  }

  private isInvulnerable(): boolean {
    return this.nowMs < this.invulnerableUntilMs;
  }

  lightAttack(targets: LegacyCombatTarget[]) {
    const withinCombo = this.nowMs < this.comboExpiresAtMs;
    this.comboStage = withinCombo && this.comboStage === 0 ? 1 : 0;
    const anim: LegacyCombatAnimState =
      this.comboStage === 1 ? "lightAttack2" : "lightAttack1";
    this.comboExpiresAtMs = this.nowMs + COMBO_WINDOW_MS;
    this.playCombatAnim(anim, () =>
      this.resolveHit(targets, this.comboStage === 1 ? 12 : 8)
    );
  }

  heavyAttack(targets: LegacyCombatTarget[]) {
    if (!this.spend(SP_COSTS.heavyAttack)) return;
    this.comboStage = 0;
    this.playCombatAnim("heavyAttack", () => this.resolveHit(targets, 28));
  }

  aerialAttack(targets: LegacyCombatTarget[]) {
    if (!this.airborne) return;
    this.playCombatAnim("aerialAttack", () =>
      this.resolveHit(targets, 14, { dy: -6 }) // pop target up — enables a juggle follow-up
    );
  }

  dash(dx: number, dy: number) {
    if (!this.spend(SP_COSTS.dash)) return;
    this.invulnerableUntilMs = this.nowMs + DASH_INVULN_MS;
    this.actor.state.x += dx * 2.5;
    this.actor.state.y += dy * 2.5;
    this.playCombatAnim("dash");
  }

  airDash(dx: number) {
    if (!this.airborne || !this.spend(SP_COSTS.airDash)) return;
    this.invulnerableUntilMs = this.nowMs + DASH_INVULN_MS;
    this.actor.state.x += dx * 3;
    this.velocityY = Math.min(this.velocityY, 2); // flatten arc briefly, LMBS "Air Dash" feel
    this.playCombatAnim("airDash");
  }

  jump() {
    if (this.airborne) {
      if (!this.canDoubleJump) return;
      this.canDoubleJump = false;
      this.velocityY = -9;
      this.playCombatAnim("doubleJump");
      return;
    }
    this.airborne = true;
    this.canDoubleJump = true;
    this.velocityY = -11;
    this.playCombatAnim("jump");
  }

  startGuard() {
    this.guardHeld = true;
    this.guardStartedAtMs = this.nowMs;
    this.playCombatAnim("guard");
  }

  releaseGuard() {
    this.guardHeld = false;
    // Return to idle if guard was the active anim
    if (this.actor.state.anim === "guard") {
      this.actor.interruptAction();
    }
  }

  /** Call when an incoming hit is about to land, before applying damage. */
  onIncomingHit(rawDamage: number): { damage: number; parried: boolean } {
    if (this.isInvulnerable()) return { damage: 0, parried: false };
    if (this.guardHeld && this.nowMs - this.guardStartedAtMs <= PARRY_WINDOW_MS) {
      this.playCombatAnim("parry");
      return { damage: 0, parried: true };
    }
    if (this.guardHeld) return { damage: Math.round(rawDamage * 0.35), parried: false };
    this.playCombatAnim("knockback");
    return { damage: rawDamage, parried: false };
  }

  private resolveHit(
    targets: LegacyCombatTarget[],
    damage: number,
    popUp?: { dy: number }
  ) {
    const range = 1.2; // world units
    for (const t of targets) {
      const dist = Math.hypot(t.x - this.actor.state.x, t.y - this.actor.state.y);
      if (dist <= range) {
        const dir = t.x >= this.actor.state.x ? 1 : -1;
        t.applyDamage(damage, { dx: dir * 3, dy: popUp?.dy ?? 0 });
      }
    }
  }

  /**
   * Inject a combat animation into the base actor.
   * Uses COMBAT_ANIM_SPEC so the actor advances frames at the correct speed —
   * no type cast needed since LegacyActorController.playAction() accepts string.
   */
  private playCombatAnim(anim: LegacyCombatAnimState, onComplete?: () => void) {
    const spec = COMBAT_ANIM_SPEC[anim];
    this.actor.playAction(anim, onComplete, spec);
  }
}
