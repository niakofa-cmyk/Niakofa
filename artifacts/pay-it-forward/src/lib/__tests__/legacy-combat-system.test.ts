import { describe, it } from "node:test";
import { expect } from "expect";
import {
  createCombatant,
  stepCombat,
  resolveHit,
  applyHit,
  limbBoxToWorld,
  DEFAULT_HURTBOXES,
  GROUND_ACTIONS,
  AERIAL_ACTIONS,
  NO_INPUT,
  GRAVITY,
  JUMP_IMPULSE,
  type CombatInput,
} from "../legacy-combat-system";

function input(overrides: Partial<CombatInput> = {}): CombatInput {
  return { ...NO_INPUT, ...overrides };
}

describe("Legacy combat system — grounded actions", () => {
  it("stays idle with no input", () => {
    const c = createCombatant("kwame");
    const next = stepCombat(c, input(), 16);
    expect(next.action).toBe("idle");
  });

  it("transitions to walk on movement input, run when run is held", () => {
    const c = createCombatant("kwame");
    const walking = stepCombat(c, input({ moveX: 1 }), 16);
    expect(walking.action).toBe("walk");
    const running = stepCombat(c, input({ moveX: 1, run: true }), 16);
    expect(running.action).toBe("run");
  });

  it("faces the direction of movement", () => {
    const c = createCombatant("kwame", { facing: 1 });
    const next = stepCombat(c, input({ moveX: -1 }), 16);
    expect(next.facing).toBe(-1);
  });

  it("enters light-attack on input and locks the action until cancelable", () => {
    const c = createCombatant("kwame");
    const attacking = stepCombat(c, input({ lightAttackPressed: true }), 16);
    expect(attacking.action).toBe("light-attack");

    // Mid-attack, before the cancel window: further input is ignored, action stays locked.
    const stillAttacking = stepCombat(attacking, input({ moveX: 1 }), 50);
    expect(stillAttacking.action).toBe("light-attack");
  });

  it("light-attack becomes cancelable and returns to idle/walk after its cancel window", () => {
    let c = createCombatant("kwame");
    c = stepCombat(c, input({ lightAttackPressed: true }), 16);
    // cancelableAfterMs is 220; advance well past durationMs (320) with no input.
    c = stepCombat(c, input(), 320);
    expect(c.action).toBe("idle");
  });

  it("dodge grants invulnerability for its duration", () => {
    let c = createCombatant("kwame");
    c = stepCombat(c, input({ dodgePressed: true }), 16);
    expect(c.action).toBe("dodge");
    expect(c.invulnerable).toBe(true);
  });

  it("guard holds while the input is held and releases to idle when not", () => {
    let c = createCombatant("kwame");
    c = stepCombat(c, input({ guardHeld: true }), 16);
    expect(c.action).toBe("guard");
    c = stepCombat(c, input(), 16);
    expect(c.action).toBe("idle");
  });
});

describe("Legacy combat system — aerial actions", () => {
  it("jump leaves the ground and applies upward velocity", () => {
    const c = createCombatant("kwame");
    const jumped = stepCombat(c, input({ jumpPressed: true }), 16);
    expect(jumped.grounded).toBe(false);
    expect(jumped.vy).toBe(JUMP_IMPULSE);
    expect(jumped.action).toBe("jump-start");
  });

  it("gravity pulls a jumping combatant back down and re-grounds them", () => {
    let c = createCombatant("kwame");
    c = stepCombat(c, input({ jumpPressed: true }), 16);
    // Simulate ~2 seconds of airtime in large steps — enough for a full arc
    // at GRAVITY=1400/JUMP_IMPULSE=520 (time to apex + fall well under 2s).
    for (let i = 0; i < 40 && c.grounded === false; i++) {
      c = stepCombat(c, input(), 50);
    }
    expect(c.grounded).toBe(true);
    expect(c.y).toBe(0);
  });

  it("rising then falling states track vertical velocity sign", () => {
    let c = createCombatant("kwame");
    c = stepCombat(c, input({ jumpPressed: true }), 16);
    // past jump-start's 140ms duration, unlocked and moving upward
    c = stepCombat(c, input(), 200);
    expect(c.action).toBe("rising");
    // step forward until velocity flips negative (falling)
    let steps = 0;
    while (c.vy > 0 && steps < 100) {
      c = stepCombat(c, input(), 16);
      steps++;
    }
    c = stepCombat(c, input(), 16);
    expect(c.action).toBe("falling");
  });

  it("allows an aerial-attack while airborne", () => {
    let c = createCombatant("kwame");
    c = stepCombat(c, input({ jumpPressed: true }), 16);
    c = stepCombat(c, input(), 200); // clear jump-start lock
    c = stepCombat(c, input({ lightAttackPressed: true }), 16);
    expect(c.action).toBe("aerial-attack");
    expect(c.grounded).toBe(false);
  });

  it("terminal fall speed is clamped to MAX_FALL_SPEED", () => {
    let c = createCombatant("kwame", { grounded: false, y: 5000, vy: 0 });
    for (let i = 0; i < 200; i++) {
      c = stepCombat(c, input(), 100);
      if (c.grounded) break;
    }
    // vy should never have exceeded the clamp at any settled point; re-derive
    // by checking a mid-fall sample explicitly.
    let mid = createCombatant("kwame", { grounded: false, y: 5000, vy: 0 });
    for (let i = 0; i < 20; i++) mid = stepCombat(mid, input(), 100);
    expect(Math.abs(mid.vy)).toBeLessThanOrEqual(900);
  });
});

describe("Legacy combat system — limb-based hit resolution", () => {
  it("does not register a hit outside the attack's active window", () => {
    const attacker = createCombatant("kwame", { action: "light-attack", actionElapsedMs: 10, x: 0 });
    const defender = createCombatant("npc", { x: 5 });
    const hit = resolveHit(attacker, DEFAULT_HURTBOXES, defender);
    expect(hit).toBeNull();
  });

  it("registers a torso hit when the attacking limb overlaps an unguarded defender", () => {
    const attacker = createCombatant("kwame", {
      action: "light-attack",
      actionElapsedMs: 120, // inside [90,180) active window
      x: 0,
      facing: 1,
    });
    const defender = createCombatant("npc", { x: 5 });
    const hit = resolveHit(attacker, DEFAULT_HURTBOXES, defender, DEFAULT_HURTBOXES);
    expect(hit).not.toBeNull();
  });

  it("a raised guard blocks a torso-height light attack", () => {
    const attacker = createCombatant("kwame", {
      action: "light-attack",
      actionElapsedMs: 120,
      x: 0,
      facing: 1,
    });
    const defender = createCombatant("npc", { x: 5, action: "guard" });
    const hit = resolveHit(attacker, DEFAULT_HURTBOXES, defender, DEFAULT_HURTBOXES);
    expect(hit).toBeNull();
  });

  it("a guard does NOT block an aerial-attack (stomp bypasses standing guard)", () => {
    const attacker = createCombatant("kwame", {
      action: "aerial-attack",
      actionElapsedMs: 150, // inside [100,220)
      x: 0,
      y: 40,
      facing: 1,
    });
    const defender = createCombatant("npc", { x: 5, action: "guard" });
    const hit = resolveHit(attacker, DEFAULT_HURTBOXES, defender, DEFAULT_HURTBOXES);
    expect(hit).not.toBeNull();
  });

  it("invulnerable defenders (e.g. mid-dodge) cannot be hit", () => {
    const attacker = createCombatant("kwame", {
      action: "light-attack",
      actionElapsedMs: 120,
      x: 0,
      facing: 1,
    });
    const defender = createCombatant("npc", { x: 5, action: "dodge", invulnerable: true });
    const hit = resolveHit(attacker, DEFAULT_HURTBOXES, defender, DEFAULT_HURTBOXES);
    expect(hit).toBeNull();
  });

  it("no hit registers when the attacker's limb box does not reach the defender", () => {
    const attacker = createCombatant("kwame", {
      action: "light-attack",
      actionElapsedMs: 120,
      x: 0,
      facing: 1,
    });
    const farDefender = createCombatant("npc", { x: 500 });
    const hit = resolveHit(attacker, DEFAULT_HURTBOXES, farDefender, DEFAULT_HURTBOXES);
    expect(hit).toBeNull();
  });
});

describe("Legacy combat system — damage & knockback", () => {
  it("applyHit reduces defender health by the attack's damage value", () => {
    const attacker = createCombatant("kwame", { action: "heavy-attack", facing: 1 });
    const defender = createCombatant("npc", { health: 100 });
    const result = applyHit(defender, attacker);
    expect(result.health).toBe(100 - GROUND_ACTIONS["heavy-attack"].damage!);
  });

  it("applyHit sets knockdown when health reaches zero", () => {
    const attacker = createCombatant("kwame", { action: "heavy-attack", facing: 1 });
    const defender = createCombatant("npc", { health: 5 });
    const result = applyHit(defender, attacker);
    expect(result.health).toBe(0);
    expect(result.action).toBe("knockdown");
  });

  it("applyHit knocks the defender in the attacker's facing direction", () => {
    const attackerRight = createCombatant("kwame", { action: "light-attack", facing: 1 });
    const defender = createCombatant("npc", { health: 100 });
    const knockedRight = applyHit(defender, attackerRight);
    expect(knockedRight.vx).toBeGreaterThan(0);

    const attackerLeft = createCombatant("kwame", { action: "light-attack", facing: -1 });
    const knockedLeft = applyHit(defender, attackerLeft);
    expect(knockedLeft.vx).toBeLessThan(0);
  });

  it("applyHit records lastHitBy for host-side reaction (VFX, sound, combo tracking)", () => {
    const attacker = createCombatant("kwame", { action: "light-attack" });
    const defender = createCombatant("npc");
    const result = applyHit(defender, attacker);
    expect(result.lastHitBy).toBe("kwame");
  });
});

describe("Legacy combat system — limb box geometry", () => {
  it("mirrors limb boxes across facing direction", () => {
    const rightFacing = createCombatant("kwame", { x: 100, facing: 1 });
    const leftFacing = createCombatant("kwame", { x: 100, facing: -1 });
    const box = DEFAULT_HURTBOXES.find((b) => b.limb === "leadArm")!;
    const worldRight = limbBoxToWorld(box, rightFacing);
    const worldLeft = limbBoxToWorld(box, leftFacing);
    // Mirrored around x=100: the two boxes should not occupy the same space.
    expect(worldRight.left).not.toBe(worldLeft.left);
  });

  it("every ground and aerial action referenced by name resolves to a defined ActionDef", () => {
    for (const key of Object.keys(GROUND_ACTIONS)) {
      expect(GROUND_ACTIONS[key as keyof typeof GROUND_ACTIONS].state).toBe(key);
    }
    for (const key of Object.keys(AERIAL_ACTIONS)) {
      expect(AERIAL_ACTIONS[key as keyof typeof AERIAL_ACTIONS].state).toBe(key);
    }
  });
});
