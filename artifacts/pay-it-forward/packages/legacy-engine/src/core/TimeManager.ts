import type { EventBus } from "./EventBus.js";
import type { WorldEvents } from "./events.js";
import type { WorldState } from "./WorldState.js";
import type { TimeOfDayPhase } from "../world/types.js";

const MINUTES_PER_DAY = 24 * 60;

/** Phase boundaries lifted straight from the design doc's clock. */
const PHASE_BOUNDARIES: Array<{ startMinute: number; phase: TimeOfDayPhase }> = [
  { startMinute: 0, phase: "night" },
  { startMinute: 5 * 60 + 30, phase: "dawn" }, // 05:30
  { startMinute: 7 * 60, phase: "morning" }, // 07:00
  { startMinute: 11 * 60, phase: "midday" }, // 11:00
  { startMinute: 13 * 60, phase: "afternoon" }, // 13:00
  { startMinute: 18 * 60, phase: "sunset" }, // 18:00
  { startMinute: 20 * 60, phase: "evening" }, // 20:00
  { startMinute: 23 * 60, phase: "night" }, // 23:00
];

export function phaseForMinute(minute: number): TimeOfDayPhase {
  const m = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  let current: TimeOfDayPhase = "night";
  for (const boundary of PHASE_BOUNDARIES) {
    if (m >= boundary.startMinute) current = boundary.phase;
  }
  return current;
}

export interface TimeManagerOptions {
  /** How many in-game minutes pass per real second. Default: 1 real second = 1 game minute. */
  minutesPerRealSecond: number;
}

/**
 * TimeManager
 * -----------
 * Owns the game clock. Every tick(dtSeconds) advances WorldState.time by
 * minutesPerRealSecond * dtSeconds, rolls the day over at midnight, and
 * emits time:tick / time:phaseChanged / time:dayChanged so lighting,
 * weather, and NPC schedules can react without polling.
 */
export class TimeManager {
  private readonly world: WorldState;
  private readonly bus: EventBus<WorldEvents>;
  private readonly opts: TimeManagerOptions;
  private lastPhase: TimeOfDayPhase;
  private accumulatedMinutes = 0;

  constructor(world: WorldState, bus: EventBus<WorldEvents>, opts: Partial<TimeManagerOptions> = {}) {
    this.world = world;
    this.bus = bus;
    this.opts = { minutesPerRealSecond: opts.minutesPerRealSecond ?? 1 };
    this.lastPhase = phaseForMinute(world.snapshot.time);
  }

  get phase(): TimeOfDayPhase {
    return phaseForMinute(this.world.snapshot.time);
  }

  /** Advance the clock by a real-time delta (seconds). */
  tick(dtSeconds: number): void {
    const deltaGameMinutes = dtSeconds * this.opts.minutesPerRealSecond;
    this.accumulatedMinutes += deltaGameMinutes;

    // Only mutate WorldState on whole-minute boundaries to avoid spamming
    // version bumps every animation frame - fractional time still accrues
    // in accumulatedMinutes so nothing is lost, just batched.
    if (this.accumulatedMinutes < 1) {
      this.bus.emit("time:tick", { day: this.world.snapshot.day, time: this.world.snapshot.time, deltaGameMinutes });
      return;
    }

    const wholeMinutes = Math.floor(this.accumulatedMinutes);
    this.accumulatedMinutes -= wholeMinutes;

    let { day, time, year } = this.world.snapshot;
    time += wholeMinutes;
    while (time >= MINUTES_PER_DAY) {
      time -= MINUTES_PER_DAY;
      day += 1;
      this.bus.emit("time:dayChanged", { day, year });
    }

    this.world.setTime(day, time, year);
    this.bus.emit("time:tick", { day, time, deltaGameMinutes });

    const newPhase = phaseForMinute(time);
    if (newPhase !== this.lastPhase) {
      this.lastPhase = newPhase;
      this.bus.emit("time:phaseChanged", { phase: newPhase, day, time });
    }
  }

  /** Jump directly to a time (e.g. "sleep until morning"), still firing events. */
  setTo(day: number, time: number): void {
    this.world.setTime(day, time, this.world.snapshot.year);
    this.bus.emit("time:tick", { day, time, deltaGameMinutes: 0 });
    const newPhase = phaseForMinute(time);
    if (newPhase !== this.lastPhase) {
      this.lastPhase = newPhase;
      this.bus.emit("time:phaseChanged", { phase: newPhase, day, time });
    }
  }
}
