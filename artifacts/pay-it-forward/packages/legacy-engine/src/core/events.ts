import type { Weather, Season, TimeOfDayPhase } from "../world/types.js";
import type { DamageEvent, HitEvent } from "../combat/types.js";
import type { ActorStateName } from "../actors/types.js";

export interface WorldEvents {
  "world:versionChanged": { version: number; reason: string };
  "world:flagChanged": { flag: string; value: boolean | number | string };

  "time:tick": { day: number; time: number; deltaGameMinutes: number };
  "time:phaseChanged": { phase: TimeOfDayPhase; day: number; time: number };
  "time:dayChanged": { day: number; year: number };

  "weather:changed": { from: Weather; to: Weather; season: Season };
  "weather:transitionStart": { from: Weather; to: Weather; durationMs: number };

  "actor:stateChanged": { actorId: string; from: ActorStateName; to: ActorStateName };
  "actor:hurt": HitEvent;
  "actor:defeated": { actorId: string };

  "combat:hitboxActive": { actorId: string; clip: string; frame: number };
  "combat:hit": HitEvent;
  "combat:damage": DamageEvent;

  "quest:unlocked": { questId: string; reason: string };
  "quest:completed": { questId: string };
  "quest:failed": { questId: string };

  "npc:scheduleChanged": { npcId: string; location: string };
}

export type WorldEventBus = import("./EventBus.js").EventBus<WorldEvents>;
