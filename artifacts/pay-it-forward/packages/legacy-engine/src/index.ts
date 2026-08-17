export { EventBus } from "./core/EventBus.js";
export type { WorldEvents } from "./core/events.js";
export { WorldState } from "./core/WorldState.js";
export { TimeManager, phaseForMinute } from "./core/TimeManager.js";
export { GameLoop } from "./core/GameLoop.js";
export type { System } from "./core/GameLoop.js";

export { WeatherManager } from "./world/WeatherManager.js";
export type {
  Weather,
  Season,
  TimeOfDayPhase,
  WorldStateData,
  QuestState,
  NPCState,
  LandmarkState,
} from "./world/types.js";
export { createDefaultWorldState } from "./world/types.js";

export { SpriteAtlas } from "./animation/SpriteAtlas.js";
export { AnimationController } from "./animation/AnimationController.js";
export type { AnimationClip, HitboxDef, SpriteAtlasDef } from "./animation/types.js";
export { clipPhaseAtFrame } from "./animation/types.js";
export { directionFromVector, clipIdFor } from "./animation/direction.js";
export type { Direction6 } from "./animation/direction.js";

export { Actor } from "./actors/Actor.js";
export type { HurtboxDef } from "./actors/Actor.js";
export { ActorState } from "./actors/ActorState.js";
export type { ActorStateName, ActorConfig, Vector2 } from "./actors/types.js";
export { PlayerController } from "./actors/PlayerController.js";
export type { PlayerInput } from "./actors/PlayerController.js";
export { EnemyController } from "./actors/EnemyController.js";
export type { EnemyAIState, EnemyControllerOptions } from "./actors/EnemyController.js";

export { HitboxSystem } from "./combat/HitboxSystem.js";
export { DamageSystem } from "./combat/DamageSystem.js";
export { CombatController } from "./combat/CombatController.js";
export type { AABB, HitEvent, DamageEvent } from "./combat/types.js";
export { intersectsAABB } from "./combat/types.js";

export { LivingWorld } from "./LivingWorld.js";

// Animation data ships as plain .json files under src/data/ rather than a
// static import here, so both bundler consumers (import x from "*.json")
// and plain Node/tsx consumers (JSON.parse(readFileSync(...))) work without
// fighting each other's module resolution rules. See README "Loading clip data".
