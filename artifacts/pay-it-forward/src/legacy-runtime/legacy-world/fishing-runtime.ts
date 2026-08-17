/**
 * In-world fishing activity. Confirmed source of the uploaded reference
 * material: FishSettings.xls is a parameter-string generator for "Galv's MV
 * Fishing Mini Game" (an RPG Maker MV plugin); fishing.zip is that plugin's
 * graphic assets (rod, bait, splash, chest, surface/underwater fish sprites).
 *
 * Same rule applied everywhere else in this project (LMBS, RPG Maker
 * character generator): useful as a MECHANICS reference, never imported as
 * code. What's actually reused here is Galv's own fish-parameter shape
 * (graphic / speed / pull / moveType / level / detectRange / takeRange /
 * baits), reimplemented as native TypeScript data -- not the plugin.
 *
 * Per the design doc's Phase 2 (highest priority): this runs INSIDE the
 * PixiJS world (runtime: "focused" in WorldActivity), never a separate
 * route or full-screen React page.
 */

import type { WorldActivity, ActivityContext, WorldMutation } from "./types";

export interface FishSpecies {
  id: string;
  name: string;
  /** 0 stationary .. higher = faster swim, mirrors Galv's "Speed" param */
  speed: number;
  /** resistance while reeling, mirrors Galv's "Pull" param */
  pull: number;
  /** -1 unmovable, 0 inanimate, 1 passive, 2 erratic -- Galv's "Move Type" */
  moveType: -1 | 0 | 1 | 2;
  /** 0 = surface .. 10 = bottom, mirrors Galv's "Level" (low|high) */
  levelRange: [number, number];
  itemId: string;
  rarity: "common" | "uncommon" | "rare";
}

/** Starter table -- replace itemId with real Family Vault/inventory item ids as they exist. */
export const RIVER_FISH: FishSpecies[] = [
  { id: "tilapia", name: "Tilapia", speed: 2, pull: 3, moveType: 1, levelRange: [3, 8], itemId: "fish-tilapia", rarity: "common" },
  { id: "catfish", name: "Catfish", speed: 1, pull: 5, moveType: 1, levelRange: [7, 10], itemId: "fish-catfish", rarity: "uncommon" },
  { id: "barracuda", name: "Barracuda", speed: 4, pull: 7, moveType: 2, levelRange: [0, 4], itemId: "fish-barracuda", rarity: "rare" },
];

export interface FishingResult {
  success: boolean;
  fishId?: string;
  fishName?: string;
  isMemoryCatch?: boolean;
  memoryId?: string;
  memoryText?: string;
  itemId?: string;
  giftForNpc?: string;
  tensionPeak?: number;
  durationMs?: number;
}

export type FishingPhase = "idle" | "entering" | "casting" | "waiting" | "bite" | "reeling" | "catch" | "fail" | "exiting";

export interface FishingRuntimeState {
  phase: FishingPhase;
  activity: WorldActivity;
  ctx: ActivityContext;
  waitTimerMs: number;
  biteWindowMs: number;
  tension: number;
  tensionDirection: 1 | -1;
  result: FishingResult | null;
  startedAtMs: number;
}

const CONFIG = {
  castDurationMs: 600,
  minWaitMs: 1200,
  maxWaitMs: 3200,
  biteWindowMs: 900,
  reelTensionSpeed: 1.8,
  successTensionMin: 25,
  successTensionMax: 85,
  memoryCatchChance: 0.18,
};

let current: FishingRuntimeState | null = null;
let onFinishedCallback: ((result: FishingResult, mutations: WorldMutation[]) => void) | null = null;
const timers: ReturnType<typeof setTimeout>[] = [];

function scheduleTimeout(fn: () => void, ms: number) {
  const t = setTimeout(fn, ms);
  timers.push(t);
  return t;
}

function clearAllTimers() {
  timers.forEach(clearTimeout);
  timers.length = 0;
}

export function startFishingRuntime(
  activity: WorldActivity,
  ctx: ActivityContext,
  onFinished?: (result: FishingResult, mutations: WorldMutation[]) => void
) {
  if (activity.type !== "fishing") {
    console.warn("startFishingRuntime called with non-fishing activity", activity.id);
    return;
  }
  clearAllTimers();
  onFinishedCallback = onFinished ?? null;
  current = {
    phase: "entering",
    activity,
    ctx,
    waitTimerMs: 0,
    biteWindowMs: 0,
    tension: 50,
    tensionDirection: 1,
    result: null,
    startedAtMs: performance.now(),
  };

  scheduleTimeout(() => {
    if (current?.phase !== "entering") return;
    current.phase = "casting";
    scheduleTimeout(() => {
      if (current?.phase === "casting") beginWaiting();
    }, CONFIG.castDurationMs);
  }, 300);
}

/** Call every frame from the PixiJS ticker while phase !== "idle". */
export function updateFishingRuntime(dtMs: number) {
  if (!current) return;
  switch (current.phase) {
    case "waiting":
      current.waitTimerMs -= dtMs;
      if (current.waitTimerMs <= 0) {
        current.phase = "bite";
        current.biteWindowMs = CONFIG.biteWindowMs;
      }
      break;
    case "bite":
      current.biteWindowMs -= dtMs;
      if (current.biteWindowMs <= 0) finishFishing(false);
      break;
    case "reeling":
      current.tension += current.tensionDirection * CONFIG.reelTensionSpeed * (dtMs / 16);
      if (current.tension >= 100) { current.tension = 100; current.tensionDirection = -1; }
      else if (current.tension <= 0) { current.tension = 0; current.tensionDirection = 1; }
      break;
  }
}

export function fishingHook() {
  if (!current || current.phase !== "bite") return;
  current.phase = "reeling";
  current.tension = 40 + Math.random() * 20;
}

export function fishingLand() {
  if (!current || current.phase !== "reeling") return;
  const t = current.tension;
  finishFishing(t >= CONFIG.successTensionMin && t <= CONFIG.successTensionMax, t);
}

export function cancelFishing() {
  if (!current) return;
  finishFishing(false);
}

export function getFishingState(): FishingRuntimeState | null {
  return current;
}

function beginWaiting() {
  if (!current) return;
  current.phase = "waiting";
  current.waitTimerMs = CONFIG.minWaitMs + Math.random() * (CONFIG.maxWaitMs - CONFIG.minWaitMs);
}

function pickFish(): FishSpecies {
  const roll = Math.random();
  const commonPool = RIVER_FISH.filter((f) => f.rarity === "common");
  const uncommonPool = RIVER_FISH.filter((f) => f.rarity === "uncommon");
  const rarePool = RIVER_FISH.filter((f) => f.rarity === "rare");
  const pool = roll < 0.55 ? commonPool : roll < 0.85 ? uncommonPool : rarePool;
  const finalPool = pool.length ? pool : RIVER_FISH;
  return finalPool[Math.floor(Math.random() * finalPool.length)];
}

function finishFishing(success: boolean, tensionPeak?: number) {
  if (!current) return;
  const durationMs = performance.now() - current.startedAtMs;
  const result: FishingResult = { success, durationMs, tensionPeak };

  if (success) {
    const fish = pickFish();
    result.fishId = fish.id;
    result.fishName = fish.name;
    result.itemId = fish.itemId;

    if (Math.random() < CONFIG.memoryCatchChance) {
      result.isMemoryCatch = true;
      result.memoryId = "river-memory-kwame-youth";
      result.memoryText = "As the fish breaks the surface, a memory surfaces with it -- your grandmother once told you this was the old fishing ground.";
    }
  }

  current.result = result;
  current.phase = success ? "catch" : "fail";

  const mutations = current.activity.onComplete(result as unknown as Record<string, unknown>, current.ctx);
  onFinishedCallback?.(result, mutations);

  current.phase = "exiting";
  scheduleTimeout(() => {
    current = null;
    onFinishedCallback = null;
  }, 800);
}
