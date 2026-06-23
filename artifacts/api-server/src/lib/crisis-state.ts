/**
 * Shared crisis-mode active flag, backed by Redis so it's consistent across
 * all server instances (CRIT-002). Falls back to an in-process boolean when
 * Redis isn't configured, matching the rest of the codebase's degradation
 * pattern.
 */
import { getRedisConnection } from "./queue";
import { logger } from "./logger";

const REDIS_KEY = "niakofa:crisis-mode-active";

let _memoryFallback = false;

export async function setCrisisModeActive(active: boolean): Promise<void> {
  const redis = getRedisConnection();
  if (!redis) {
    _memoryFallback = active;
    return;
  }
  try {
    if (active) {
      await redis.set(REDIS_KEY, "true");
    } else {
      await redis.del(REDIS_KEY);
    }
  } catch (err) {
    logger.warn({ err }, "crisis-state: redis write failed, using memory fallback");
    _memoryFallback = active;
  }
}

export async function isCrisisModeActive(): Promise<boolean> {
  const redis = getRedisConnection();
  if (!redis) return _memoryFallback;
  try {
    const val = await redis.get(REDIS_KEY);
    return val === "true";
  } catch (err) {
    logger.warn({ err }, "crisis-state: redis read failed, using memory fallback");
    return _memoryFallback;
  }
}
