/**
 * Niakofa — Lightweight in-process response cache
 *
 * Uses Redis when available (via the shared connection), otherwise falls back
 * to a plain Map so the server always works without Redis.
 *
 * Usage:
 *   const cached = await cacheGet<T>("key");
 *   if (cached) return res.json(cached);
 *   const fresh = await expensiveQuery();
 *   await cacheSet("key", fresh, 60); // TTL in seconds
 *   return res.json(fresh);
 */

import { getRedisConnection } from "./queue";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const memoryCache = new Map<string, CacheEntry<unknown>>();

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedisConnection();

  if (redis) {
    try {
      const raw = await redis.get(key);
      if (raw) return JSON.parse(raw) as T;
      return null;
    } catch {
      return null;
    }
  }

  const entry = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry.value;
}

export async function cacheSet<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const redis = getRedisConnection();

  if (redis) {
    try {
      await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch {}
    return;
  }

  memoryCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });

  if (memoryCache.size > 500) {
    const now = Date.now();
    for (const [k, v] of memoryCache) {
      if (now > v.expiresAt) memoryCache.delete(k);
    }
  }
}

export async function cacheDel(key: string): Promise<void> {
  const redis = getRedisConnection();
  if (redis) {
    try { await redis.del(key); } catch {}
    return;
  }
  memoryCache.delete(key);
}

/**
 * Delete every cache entry whose key starts with the given prefix — for
 * cases like "civic:loc:*" where individual exact keys can't be known in
 * advance (they're generated per rounded lat/lng on demand). Uses Redis
 * SCAN (non-blocking, safe for production) when available, otherwise
 * iterates the in-memory fallback map directly.
 */
export async function cacheDelPrefix(prefix: string): Promise<void> {
  const redis = getRedisConnection();
  if (redis) {
    try {
      let cursor = "0";
      do {
        const [nextCursor, keys] = await redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 100);
        cursor = nextCursor;
        if (keys.length > 0) await redis.del(...keys);
      } while (cursor !== "0");
    } catch {}
    return;
  }
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) memoryCache.delete(key);
  }
}
