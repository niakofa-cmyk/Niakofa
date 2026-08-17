import { EventBus } from "./core/EventBus.js";
import type { WorldEvents } from "./core/events.js";
import { WorldState } from "./core/WorldState.js";
import { TimeManager } from "./core/TimeManager.js";
import { GameLoop } from "./core/GameLoop.js";
import { WeatherManager } from "./world/WeatherManager.js";
import { CombatController } from "./combat/CombatController.js";
import type { WorldStateData } from "./world/types.js";

/**
 * LivingWorld
 * -----------
 * Composition root. This is the "everything communicates through
 * WorldState" hub from the design doc - construct one of these per game
 * session, register actor controllers (Player/EnemyController) as
 * additional systems via .loop.register(), and drive it from your host
 * renderer's ticker.
 */
export class LivingWorld {
  readonly bus = new EventBus<WorldEvents>();
  readonly world: WorldState;
  readonly time: TimeManager;
  readonly weather: WeatherManager;
  readonly combat: CombatController;
  readonly loop = new GameLoop();

  constructor(initialState?: Partial<WorldStateData>, options: { minutesPerRealSecond?: number } = {}) {
    this.world = new WorldState(this.bus, initialState);
    this.time = new TimeManager(this.world, this.bus, { minutesPerRealSecond: options.minutesPerRealSecond });
    this.weather = new WeatherManager(this.world, this.bus);
    this.combat = new CombatController(this.bus);

    // Registration order matters: time -> weather (weather reacts to the
    // clock) -> combat (acts on whatever state the world is in this frame).
    this.loop.register(this.time);
    this.loop.register(this.weather);
    this.loop.register(this.combat);
    this.loop.start();
  }

  /** Convenience: call this from your renderer's per-frame ticker. */
  tick(dtSeconds: number): void {
    this.loop.tick(dtSeconds);
  }

  save(): string {
    return JSON.stringify(this.world.toJSON());
  }

  static load(json: string): LivingWorld {
    const data = JSON.parse(json) as WorldStateData;
    return new LivingWorld(data);
  }
}
