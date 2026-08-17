/**
 * Headless simulation
 * -------------------
 * Runs the engine with no PixiJS, no browser, nothing - proof that
 * WorldState, TimeManager, WeatherManager, and the full combat pipeline
 * (input -> animation -> hitbox -> collision -> damage -> knockback ->
 * recovery) work as pure game logic. Run with:
 *
 *   npm run demo:headless
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { LivingWorld } from "../LivingWorld.js";
import { SpriteAtlas } from "../animation/SpriteAtlas.js";
import { Actor } from "../actors/Actor.js";
import { PlayerController } from "../actors/PlayerController.js";
import { EnemyController } from "../actors/EnemyController.js";
import type { SpriteAtlasDef } from "../animation/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadAtlas(fileName: string): SpriteAtlas {
  const raw = readFileSync(join(__dirname, "..", "data", fileName), "utf-8");
  return SpriteAtlas.fromJSON(JSON.parse(raw) as SpriteAtlasDef);
}

function main() {
  // 300 in-game minutes per real second so a 12s demo covers many hours of clock time.
  const world = new LivingWorld({ season: "wet", weather: "clear", day: 1, time: 6 * 60 }, { minutesPerRealSecond: 300 });

  world.bus.on("time:phaseChanged", ({ phase, day, time }) => {
    const hh = String(Math.floor(time / 60)).padStart(2, "0");
    const mm = String(time % 60).padStart(2, "0");
    console.log(`[time] day ${day} ${hh}:${mm} -> phase "${phase}"`);
  });
  world.bus.on("weather:changed", ({ from, to }) => {
    console.log(`[weather] ${from} -> ${to}`);
  });
  world.bus.on("actor:stateChanged", ({ actorId, from, to }) => {
    console.log(`[actor:${actorId}] ${from} -> ${to}`);
  });
  world.bus.on("combat:damage", (dmg) => {
    console.log(
      `[damage] ${dmg.targetId} took ${dmg.amount} (hp=${dmg.remainingHealth}${dmg.lethal ? ", DEFEATED" : ""})`
    );
  });

  const kwameAtlas = loadAtlas("kwame-animations.json");
  const hostileAtlas = loadAtlas("hostile-generic-animations.json");

  const kwame = new Actor(
    {
      id: "kwame",
      maxHealth: 100,
      clipForState: {
        idle: "kwame_idle",
        walk: "kwame_walk",
        attack: "kwame_attack_01",
        hurt: "kwame_hurt",
        stagger: "kwame_stagger",
        recovery: "kwame_recovery",
        dodge: "kwame_dodge",
      },
    },
    kwameAtlas,
    world.bus,
    { width: 28, height: 48, offsetX: 0, offsetY: -24 }
  );
  kwame.position = { x: 0, y: 0 };

  const bandit = new Actor(
    {
      id: "bandit_1",
      maxHealth: 30,
      clipForState: {
        idle: "hostile_idle",
        walk: "hostile_walk",
        attack: "hostile_attack",
        hurt: "hostile_hurt",
        stagger: "hostile_stagger",
        recovery: "hostile_recovery",
      },
    },
    hostileAtlas,
    world.bus,
    { width: 26, height: 44, offsetX: 0, offsetY: -22 }
  );
  bandit.position = { x: 220, y: 0 };
  bandit.facing = -1;

  world.combat.addActor(kwame);
  world.combat.addActor(bandit);

  const player = new PlayerController(kwame, world.combat);
  const enemyAI = new EnemyController(bandit, kwame, world.combat, { detectRadius: 260, attackRadius: 50 });
  world.loop.register(player);
  world.loop.register(enemyAI);

  // Scripted input: walk toward the bandit for 2s, then hold attack.
  const dt = 1 / 60;
  const totalSeconds = 12;
  const steps = Math.round(totalSeconds / dt);

  for (let i = 0; i < steps; i++) {
    const elapsed = i * dt;
    if (elapsed < 2.2) {
      player.setInput({ moveX: 1, moveY: 0, attackPressed: false });
    } else if (kwame.isAlive && bandit.isAlive) {
      player.setInput({ moveX: 0, moveY: 0, attackPressed: true });
    } else {
      player.setInput({ moveX: 0, moveY: 0, attackPressed: false });
    }

    world.tick(dt);

    if (!bandit.isAlive) break;
  }

  console.log("\n--- final state ---");
  console.log("kwame hp:", kwame.health, "state:", kwame.state.value, "pos:", kwame.position);
  console.log("bandit hp:", bandit.health, "state:", bandit.state.value, "pos:", bandit.position);
  console.log("world version:", world.world.version);
}

main();
