import type { EventBus } from "../core/EventBus.js";
import type { WorldEvents } from "../core/events.js";
import type { WorldState } from "../core/WorldState.js";
import type { Weather, Season } from "./types.js";
import type { System } from "../core/GameLoop.js";

/** Weighted transition table per season. Rows must sum to <= 1 (remainder = stay). */
const TRANSITIONS: Record<Season, Partial<Record<Weather, Partial<Record<Weather, number>>>>> = {
  dry: {
    clear: { cloudy: 0.15 },
    cloudy: { clear: 0.4, light_rain: 0.05 },
    light_rain: { cloudy: 0.6 },
    heavy_rain: { light_rain: 0.7 },
    storm: { heavy_rain: 0.8 },
    harmattan_fog: { clear: 0.3 },
  },
  wet: {
    clear: { cloudy: 0.3 },
    cloudy: { light_rain: 0.35, clear: 0.15 },
    light_rain: { heavy_rain: 0.25, cloudy: 0.2 },
    heavy_rain: { storm: 0.15, light_rain: 0.35 },
    storm: { heavy_rain: 0.5 },
    harmattan_fog: { clear: 0.5 },
  },
  harmattan: {
    clear: { harmattan_fog: 0.25 },
    cloudy: { harmattan_fog: 0.2, clear: 0.3 },
    light_rain: { cloudy: 0.6 },
    heavy_rain: { light_rain: 0.7 },
    storm: { heavy_rain: 0.8 },
    harmattan_fog: { clear: 0.2 },
  },
};

export interface WeatherManagerOptions {
  /** How often (in-game minutes) the transition table is rolled. */
  rollIntervalMinutes: number;
  rng: () => number;
}

/**
 * WeatherManager
 * --------------
 * Rolls weather transitions on an in-game timer rather than being told
 * "play rain" by a quest. World-effect hooks (road washouts, buried-item
 * reveals) are exposed as callbacks so the quest layer can subscribe
 * without WeatherManager knowing quests exist.
 */
export class WeatherManager implements System {
  private readonly world: WorldState;
  private readonly bus: EventBus<WorldEvents>;
  private readonly opts: WeatherManagerOptions;
  private minutesSinceLastRoll = 0;
  private lastSeenGameMinute: number;

  constructor(world: WorldState, bus: EventBus<WorldEvents>, opts: Partial<WeatherManagerOptions> = {}) {
    this.world = world;
    this.bus = bus;
    this.opts = {
      rollIntervalMinutes: opts.rollIntervalMinutes ?? 60,
      rng: opts.rng ?? Math.random,
    };
    this.lastSeenGameMinute = world.snapshot.time + world.snapshot.day * 1440;
  }

  tick(_dtSeconds: number): void {
    const nowGameMinute = this.world.snapshot.time + this.world.snapshot.day * 1440;
    const delta = nowGameMinute - this.lastSeenGameMinute;
    this.lastSeenGameMinute = nowGameMinute;
    if (delta <= 0) return; // clock hasn't advanced a whole minute yet, or wrapped

    this.minutesSinceLastRoll += delta;
    if (this.minutesSinceLastRoll < this.opts.rollIntervalMinutes) return;
    this.minutesSinceLastRoll = 0;
    this.roll();
  }

  /** Force-roll a transition attempt now (also usable by tests / debug tools). */
  roll(): void {
    const { season, weather } = this.world.snapshot;
    const table = TRANSITIONS[season][weather];
    if (!table) return;

    const roll = this.opts.rng();
    let cumulative = 0;
    for (const [next, probability] of Object.entries(table) as Array<[Weather, number]>) {
      cumulative += probability;
      if (roll < cumulative) {
        this.transitionTo(next);
        return;
      }
    }
    // remainder: stay in current weather, no event needed.
  }

  private transitionTo(next: Weather): void {
    const from = this.world.snapshot.weather;
    if (next === from) return;
    this.bus.emit("weather:transitionStart", { from, to: next, durationMs: 8000 });
    this.world.setWeather(next);
  }
}
