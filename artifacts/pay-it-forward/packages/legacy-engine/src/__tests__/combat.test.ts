import { test } from "node:test";
import assert from "node:assert/strict";

import { EventBus } from "../core/EventBus.js";
import type { WorldEvents } from "../core/events.js";
import { SpriteAtlas } from "../animation/SpriteAtlas.js";
import { Actor } from "../actors/Actor.js";
import { CombatController } from "../combat/CombatController.js";
import type { SpriteAtlasDef } from "../animation/types.js";

function makeTestAtlas(): SpriteAtlas {
  const def: SpriteAtlasDef = {
    characterId: "test",
    pixelsPerUnit: 32,
    clips: {
      idle: { id: "idle", frameCount: 2, frameDurationMs: 100, loop: true },
      walk: { id: "walk", frameCount: 2, frameDurationMs: 100, loop: true },
      attack: {
        id: "attack",
        frameCount: 6,
        frameDurationMs: 50, // 50ms/frame
        loop: false,
        hitFrames: [3, 4],
        hitbox: { x: 20, y: 0, width: 20, height: 20, damage: 10, knockback: 100 },
      },
      hurt: { id: "hurt", frameCount: 3, frameDurationMs: 50, loop: false },
      stagger: { id: "stagger", frameCount: 3, frameDurationMs: 50, loop: false },
      recovery: { id: "recovery", frameCount: 2, frameDurationMs: 50, loop: false },
    },
  };
  return SpriteAtlas.fromJSON(def);
}

function makeActor(id: string, bus: EventBus<WorldEvents>, atlas: SpriteAtlas): Actor {
  return new Actor(
    {
      id,
      maxHealth: 50,
      clipForState: { idle: "idle", walk: "walk", attack: "attack", hurt: "hurt", stagger: "stagger", recovery: "recovery" },
    },
    atlas,
    bus,
    { width: 20, height: 20, offsetX: 0, offsetY: 0 }
  );
}

test("hitbox is only active on authored hit frames", () => {
  const bus = new EventBus<WorldEvents>();
  const atlas = makeTestAtlas();
  const attacker = makeActor("attacker", bus, atlas);
  attacker.requestState("attack");

  assert.equal(attacker.animation.frame, 1);
  assert.equal(attacker.animation.isHitboxActive, false);

  attacker.tickAnimation(0.05); // -> frame 2
  attacker.tickAnimation(0.05); // -> frame 3 (hit frame)
  assert.equal(attacker.animation.frame, 3);
  assert.equal(attacker.animation.isHitboxActive, true);

  attacker.tickAnimation(0.05); // -> frame 4 (still hit frame)
  assert.equal(attacker.animation.isHitboxActive, true);

  attacker.tickAnimation(0.05); // -> frame 5 (recovery, no longer active)
  assert.equal(attacker.animation.isHitboxActive, false);
});

test("a swing hits an overlapping target exactly once, deals damage, and applies knockback", () => {
  const bus = new EventBus<WorldEvents>();
  const atlas = makeTestAtlas();
  const combat = new CombatController(bus);

  const attacker = makeActor("attacker", bus, atlas);
  const target = makeActor("target", bus, atlas);
  attacker.position = { x: 0, y: 0 };
  target.position = { x: 25, y: 0 }; // inside the attack's 20x20 hitbox centered at x=20

  combat.addActor(attacker);
  combat.addActor(target);

  let damageEvents = 0;
  bus.on("combat:damage", () => { damageEvents += 1; });

  const started = combat.requestAttack("attacker");
  assert.equal(started, true);
  assert.equal(attacker.state.value, "attack");

  // Tick through the full swing including recovery frames.
  for (let i = 0; i < 12; i++) combat.tick(0.05);

  assert.equal(damageEvents, 1, "target should be hit exactly once per swing");
  assert.equal(target.health, 40);
  assert.notEqual(target.velocity.x, 0, "knockback should have been applied at the moment of the hit");
});

test("a target outside the hitbox never takes damage", () => {
  const bus = new EventBus<WorldEvents>();
  const atlas = makeTestAtlas();
  const combat = new CombatController(bus);

  const attacker = makeActor("attacker", bus, atlas);
  const target = makeActor("target", bus, atlas);
  attacker.position = { x: 0, y: 0 };
  target.position = { x: 500, y: 0 }; // far outside range

  combat.addActor(attacker);
  combat.addActor(target);
  combat.requestAttack("attacker");

  for (let i = 0; i < 12; i++) combat.tick(0.05);

  assert.equal(target.health, 50, "target out of range should be untouched");
});

test("attack -> recovery -> idle happens automatically when the clip finishes", () => {
  const bus = new EventBus<WorldEvents>();
  const atlas = makeTestAtlas();
  const combat = new CombatController(bus);
  const attacker = makeActor("attacker", bus, atlas);
  combat.addActor(attacker);

  combat.requestAttack("attacker");
  assert.equal(attacker.state.value, "attack");

  for (let i = 0; i < 8; i++) combat.tick(0.05); // 6 frames * 50ms = 300ms, run well past that

  assert.equal(attacker.state.value, "idle", "should auto-return to idle after attack + recovery clips finish");
});

test("lethal damage transitions the target to defeated and removes it from further hits", () => {
  const bus = new EventBus<WorldEvents>();
  const atlas = makeTestAtlas();
  const combat = new CombatController(bus);

  const attacker = makeActor("attacker", bus, atlas);
  const target = makeActor("target", bus, atlas);
  target.health = 5; // one hit (10 damage) is lethal
  attacker.position = { x: 0, y: 0 };
  target.position = { x: 25, y: 0 };

  combat.addActor(attacker);
  combat.addActor(target);
  combat.requestAttack("attacker");

  for (let i = 0; i < 12; i++) combat.tick(0.05);

  assert.equal(target.health, 0);
  assert.equal(target.state.value, "defeated");
  assert.equal(target.isAlive, false);
});

test("cannot start a new attack while already mid-recovery lockout window is respected by state machine", () => {
  const bus = new EventBus<WorldEvents>();
  const atlas = makeTestAtlas();
  const combat = new CombatController(bus);
  const attacker = makeActor("attacker", bus, atlas);
  combat.addActor(attacker);

  combat.requestAttack("attacker");
  // Immediately try to attack again mid-swing - must be rejected.
  const secondAttempt = combat.requestAttack("attacker");
  assert.equal(secondAttempt, false);
});
