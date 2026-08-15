/**
 * Niakofa Legacy — Real-Time Action Combat System
 *
 * A pure, framework-agnostic combat state machine for canonical hero
 * characters (starting with Kwame Mensah). Ground combat, aerial combat, and
 * a limb-based hit system: attacks and incoming hits are resolved against
 * named limb hitboxes/hurtboxes (fist, foot, torso, head) rather than one
 * whole-body box, so a punch can be blocked by a raised guard while a low
 * kick still connects, and aerial attacks can be dodged by ground-only guards.
 *
 * This module owns simulation only — no rendering, no input polling, no
 * canvas/DOM. A host game loop calls `stepCombat` every frame with elapsed
 * time and the current input, and reads back the resulting state to decide
 * which animation clip to play (see kwame-sprite-atlas.ts for clip names —
 * every CombatActionState below maps 1:1 to a clip key).
 *
 * Promoted from the Visual + Runtime Bible's P2 ("combat", lowest priority,
 * not yet started) to an active, implemented system per product direction.
 * The Bible's own Animation Contract already anticipated this: "Combat pass:
 * light attack, heavy attack, dodge, guard, jump attack" was listed as a
 * planned next pass — this module and the paired art spec (see
 * NIAKOFA_LEGACY_RPG_VISUAL_RUNTIME_BIBLE_v1.md, "Real-Time & Aerial Combat")
 * deliver it.
 */

// ---------------------------------------------------------------------------
// Limbs & hit geometry
// ---------------------------------------------------------------------------

/** Named limb regions used for both attack hitboxes and defense hurtboxes. */
export type LimbId = "head" | "torso" | "leadArm" | "rearArm" | "leadLeg" | "rearLeg";

export const ALL_LIMBS: LimbId[] = ["head", "torso", "leadArm", "rearArm", "leadLeg", "rearLeg"];

/**
 * A single limb's collision box in local character space. Origin (0,0) is
 * the character's ground contact point (feet), +y is up, +x is facing
 * direction. Units are world pixels, consistent with the production spec's
 * 32x48 collision footprint and 64px world tile.
 */
export interface LimbBox {
  limb: LimbId;
  /** Offset of the box's near-bottom-facing corner from the origin. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Default standing hurtbox layout for Kwame's body proportions (160px world
 * height per the production spec, 32x48 collision footprint). A real
 * per-frame hitbox authoring pass (driven by the final slice-ready atlas)
 * should override these per animation frame; this is the static fallback
 * used whenever no frame-specific data is supplied.
 */
export const DEFAULT_HURTBOXES: LimbBox[] = [
  { limb: "head", x: -8, y: 128, width: 16, height: 24 },
  { limb: "torso", x: -12, y: 80, width: 24, height: 48 },
  { limb: "leadArm", x: 4, y: 88, width: 10, height: 32 },
  { limb: "rearArm", x: -14, y: 88, width: 10, height: 32 },
  { limb: "leadLeg", x: 2, y: 0, width: 10, height: 80 },
  { limb: "rearLeg", x: -12, y: 0, width: 10, height: 80 },
];

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export type GroundActionState =
  | "idle"
  | "walk"
  | "run"
  | "light-attack"
  | "heavy-attack"
  | "dodge"
  | "guard"
  | "hurt"
  | "knockdown";

export type AerialActionState =
  | "jump-start"
  | "rising"
  | "falling"
  | "aerial-attack"
  | "aerial-hurt"
  | "land";

export type CombatActionState = GroundActionState | AerialActionState;

/** Every action state must have a matching sprite clip — see kwame-sprite-atlas.ts. */
export interface ActionDef {
  state: CombatActionState;
  /** Total duration in ms, including any recovery. */
  durationMs: number;
  /**
   * [startMs, endMs) window, relative to action start, during which the
   * attack's limb hitbox is live and can register a hit. Empty for
   * non-attack actions.
   */
  activeWindowMs?: [number, number];
  /** Which limb throws the hit, for attack actions. */
  attackingLimb?: LimbId;
  damage?: number;
  /** Outward knockback impulse in px/s applied to the target on hit. */
  knockback?: number;
  /** Vertical knockback impulse in px/s (negative = upward pop). */
  knockbackY?: number;
  /** Frames where the actor is invulnerable (used for dodge i-frames). */
  invulnerable?: boolean;
  /** Can this action be canceled early into another action (e.g. combo)? */
  cancelableAfterMs?: number;
}

export const GROUND_ACTIONS: Record<GroundActionState, ActionDef> = {
  idle: { state: "idle", durationMs: 0 },
  walk: { state: "walk", durationMs: 0 },
  run: { state: "run", durationMs: 0 },
  "light-attack": {
    state: "light-attack",
    durationMs: 320,
    activeWindowMs: [90, 180],
    attackingLimb: "leadArm",
    damage: 8,
    knockback: 60,
    knockbackY: -20,
    cancelableAfterMs: 220,
  },
  "heavy-attack": {
    state: "heavy-attack",
    durationMs: 560,
    activeWindowMs: [220, 340],
    attackingLimb: "rearArm",
    damage: 18,
    knockback: 160,
    knockbackY: -40,
    cancelableAfterMs: 420,
  },
  dodge: {
    state: "dodge",
    durationMs: 260,
    invulnerable: true,
    cancelableAfterMs: 260,
  },
  guard: { state: "guard", durationMs: 0 },
  hurt: { state: "hurt", durationMs: 300 },
  knockdown: { state: "knockdown", durationMs: 700 },
};

export const AERIAL_ACTIONS: Record<AerialActionState, ActionDef> = {
  "jump-start": { state: "jump-start", durationMs: 140 },
  rising: { state: "rising", durationMs: 0 },
  falling: { state: "falling", durationMs: 0 },
  "aerial-attack": {
    state: "aerial-attack",
    durationMs: 380,
    activeWindowMs: [100, 220],
    attackingLimb: "leadLeg",
    damage: 14,
    knockback: 90,
    knockbackY: 30, // stomps the target downward
    cancelableAfterMs: 380,
  },
  "aerial-hurt": { state: "aerial-hurt", durationMs: 260 },
  land: { state: "land", durationMs: 120 },
};

export const ALL_ACTIONS: Record<CombatActionState, ActionDef> = {
  ...GROUND_ACTIONS,
  ...AERIAL_ACTIONS,
};

// ---------------------------------------------------------------------------
// Physics constants (aerial combat)
// ---------------------------------------------------------------------------

/** px/s^2, tuned so a full jump arc reads clearly at the 64px world tile scale. */
export const GRAVITY = 1400;
/** px/s upward impulse on jump start. */
export const JUMP_IMPULSE = 520;
/** Terminal fall speed clamp, px/s. */
export const MAX_FALL_SPEED = 900;
/** Walk / run / air-drift horizontal speeds, px/s. */
export const WALK_SPEED = 90;
export const RUN_SPEED = 190;
export const AIR_DRIFT_SPEED = 130;

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface CombatInput {
  moveX: number; // -1..1
  run: boolean;
  jumpPressed: boolean; // edge-triggered (true only on the frame the key was pressed)
  lightAttackPressed: boolean;
  heavyAttackPressed: boolean;
  dodgePressed: boolean;
  guardHeld: boolean;
}

export const NO_INPUT: CombatInput = {
  moveX: 0,
  run: false,
  jumpPressed: false,
  lightAttackPressed: false,
  heavyAttackPressed: false,
  dodgePressed: false,
  guardHeld: false,
};

// ---------------------------------------------------------------------------
// Combatant state
// ---------------------------------------------------------------------------

export interface CombatantState {
  id: string;
  x: number;
  y: number; // height above ground, 0 = grounded
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  action: CombatActionState;
  actionElapsedMs: number;
  health: number;
  maxHealth: number;
  invulnerable: boolean;
  /** Set for one step only, the step a hit connects — host reads and clears it. */
  lastHitBy?: string;
}

export function createCombatant(id: string, opts?: Partial<CombatantState>): CombatantState {
  return {
    id,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    facing: 1,
    grounded: true,
    action: "idle",
    actionElapsedMs: 0,
    health: 100,
    maxHealth: 100,
    invulnerable: false,
    ...opts,
  };
}

// ---------------------------------------------------------------------------
// World-space limb boxes
// ---------------------------------------------------------------------------

export interface WorldBox {
  limb: LimbId;
  left: number;
  right: number;
  bottom: number;
  top: number;
}

export function limbBoxToWorld(box: LimbBox, actor: CombatantState): WorldBox {
  const dir = actor.facing;
  const localLeft = dir === 1 ? box.x : -box.x - box.width;
  return {
    limb: box.limb,
    left: actor.x + localLeft,
    right: actor.x + localLeft + box.width,
    bottom: actor.y + box.y,
    top: actor.y + box.y + box.height,
  };
}

function boxesOverlap(a: WorldBox, b: WorldBox): boolean {
  return a.left < b.right && a.right > b.left && a.bottom < b.top && a.top > b.bottom;
}

/**
 * Resolves the attacking limb's hitbox against every hurtbox of the defender
 * that isn't behind an active guard. Returns the first limb hit, or null.
 * A raised guard (action === "guard") blocks torso/head/arm hits from the
 * front but not leg sweeps or aerial stomps — this is the "limbs as a
 * real-time combat system" behavior: which limb attacks, and which limb
 * would be hit, both matter, not just "did any box touch any box."
 */
export function resolveHit(
  attacker: CombatantState,
  attackerBoxes: LimbBox[],
  defender: CombatantState,
  defenderBoxes: LimbBox[] = DEFAULT_HURTBOXES
): LimbId | null {
  const action = ALL_ACTIONS[attacker.action];
  if (!action.activeWindowMs || !action.attackingLimb) return null;
  const [start, end] = action.activeWindowMs;
  if (attacker.actionElapsedMs < start || attacker.actionElapsedMs >= end) return null;
  if (defender.invulnerable) return null;

  const attackBox = attackerBoxes.find((b) => b.limb === action.attackingLimb);
  if (!attackBox) return null;
  const attackWorld = limbBoxToWorld(attackBox, attacker);

  const guarding = defender.action === "guard";
  const isAerialAttack = attacker.action === "aerial-attack";

  for (const hb of defenderBoxes) {
    // A standing guard blocks upper-body hits but not leg sweeps, and does
    // not block aerial attacks (you can't guard a stomp from above with a
    // forward-facing block stance) — this is deliberate combat design, not
    // an oversight: it gives aerial combat a reason to exist tactically.
    if (guarding && !isAerialAttack && hb.limb !== "leadLeg" && hb.limb !== "rearLeg") {
      continue;
    }
    const defWorld = limbBoxToWorld(hb, defender);
    if (boxesOverlap(attackWorld, defWorld)) {
      return hb.limb;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Step function
// ---------------------------------------------------------------------------

export interface StepResult {
  state: CombatantState;
  /** Non-null the frame an attack from this combatant connects. */
  hitLanded?: { targetId: string; limb: LimbId; action: CombatActionState };
}

function isAttack(state: CombatActionState): boolean {
  return state === "light-attack" || state === "heavy-attack" || state === "aerial-attack";
}

function isLocked(state: CombatActionState): boolean {
  return (
    isAttack(state) ||
    state === "dodge" ||
    state === "hurt" ||
    state === "aerial-hurt" ||
    state === "knockdown" ||
    state === "jump-start" ||
    state === "land"
  );
}

/**
 * Advances one combatant by dtMs. Call once per combatant per frame from the
 * host game loop, then call resolveHit for each attacker/defender pair
 * whose action just became active this frame.
 */
export function stepCombat(state: CombatantState, input: CombatInput, dtMs: number): CombatantState {
  const dt = dtMs / 1000;
  const def = ALL_ACTIONS[state.action];
  let { x, y, vx, vy, action, actionElapsedMs, grounded } = state;

  actionElapsedMs += dtMs;

  const actionDone = def.durationMs > 0 && actionElapsedMs >= def.durationMs;
  const cancelable = def.cancelableAfterMs !== undefined && actionElapsedMs >= def.cancelableAfterMs;
  const locked = isLocked(action) && !actionDone && !cancelable;

  // --- Aerial physics: always integrated, even mid-attack, so jump arcs
  // read naturally through an aerial attack instead of freezing in the air.
  if (!grounded) {
    vy -= GRAVITY * dt;
    if (vy < -MAX_FALL_SPEED) vy = -MAX_FALL_SPEED;
    y += vy * dt;
    if (y <= 0) {
      y = 0;
      grounded = true;
      vy = 0;
      if (action !== "aerial-hurt") {
        action = "land";
        actionElapsedMs = 0;
      }
    }
  }

  // --- Action resolution (only when not locked into an uninterruptible action) ---
  if (!locked) {
    if (actionDone && (action === "hurt" || action === "knockdown" || action === "land")) {
      action = "idle";
      actionElapsedMs = 0;
    }

    if (grounded) {
      if (input.dodgePressed && action !== "dodge") {
        action = "dodge";
        actionElapsedMs = 0;
      } else if (input.heavyAttackPressed) {
        action = "heavy-attack";
        actionElapsedMs = 0;
      } else if (input.lightAttackPressed) {
        action = "light-attack";
        actionElapsedMs = 0;
      } else if (input.jumpPressed) {
        action = "jump-start";
        actionElapsedMs = 0;
        grounded = false;
        vy = JUMP_IMPULSE;
      } else if (input.guardHeld) {
        action = "guard";
        actionElapsedMs = 0;
      } else {
        const moving = Math.abs(input.moveX) > 0.05;
        if (moving) {
          vx = input.moveX * (input.run ? RUN_SPEED : WALK_SPEED);
          action = input.run ? "run" : "walk";
        } else {
          vx = 0;
          action = "idle";
        }
      }
    } else {
      // Airborne, unlocked: allow one aerial attack and horizontal drift.
      if (input.lightAttackPressed || input.heavyAttackPressed) {
        action = "aerial-attack";
        actionElapsedMs = 0;
      } else {
        vx = input.moveX * AIR_DRIFT_SPEED;
        action = vy > 0 ? "rising" : "falling";
      }
    }
  } else if (action === "jump-start" && actionDone) {
    action = "rising";
    actionElapsedMs = 0;
  }

  if (Math.abs(vx) > 0.01) {
    x += vx * dt;
  }
  if (Math.abs(input.moveX) > 0.05) {
    state = { ...state, facing: input.moveX > 0 ? 1 : -1 };
  }

  return {
    ...state,
    x,
    y,
    vx: grounded && !["walk", "run"].includes(action) ? 0 : vx,
    vy,
    action,
    actionElapsedMs,
    grounded,
    invulnerable: !!ALL_ACTIONS[action].invulnerable,
  };
}

/** Applies a landed hit's damage/knockback/hitstun to the defender. */
export function applyHit(defender: CombatantState, attacker: CombatantState): CombatantState {
  const action = ALL_ACTIONS[attacker.action];
  const damage = action.damage ?? 0;
  const knockback = (action.knockback ?? 0) * attacker.facing;
  const knockbackY = action.knockbackY ?? 0;
  const health = Math.max(0, defender.health - damage);
  const knockedDown = health === 0;
  return {
    ...defender,
    health,
    vx: knockback,
    vy: defender.grounded ? Math.max(0, -knockbackY) : -knockbackY,
    grounded: knockbackY >= 0 ? defender.grounded : false,
    action: knockedDown ? "knockdown" : defender.grounded ? "hurt" : "aerial-hurt",
    actionElapsedMs: 0,
    lastHitBy: attacker.id,
  };
}
