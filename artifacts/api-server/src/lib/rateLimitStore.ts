/**
 * Shared rate-limit store for Niakofa.
 *
 * Redis is used whenever the existing queue connection is configured. The
 * in-process fixed-window counter is a deliberate development/test fallback.
 * The Redis decision is made per request, because the connection may become
 * ready after middleware construction during server startup.
 */
import {
  rateLimit,
  type ClientRateLimitInfo,
  type Options,
  type Store,
} from "express-rate-limit";
import type { Request } from "express";
import { getRedisConnection } from "./queue";

export type RedisRateLimitClient = {
  incr(key: string): Promise<number>;
  decr(key: string): Promise<number>;
  pexpire(key: string, ms: number): Promise<number>;
  pttl(key: string): Promise<number>;
  del(...keys: string[]): Promise<number>;
};

function redisClient(): RedisRateLimitClient | null {
  return getRedisConnection() as unknown as RedisRateLimitClient | null;
}

export class RedisRateLimitStore implements Store {
  prefix: string;
  windowMs: number;
  private localCounts = new Map<string, { count: number; resetAt: number }>();
  private readonly redisOverride?: RedisRateLimitClient;

  constructor(windowMs: number, prefix = "rl:", redisOverride?: RedisRateLimitClient) {
    this.windowMs = windowMs;
    this.prefix = prefix;
    this.redisOverride = redisOverride;
  }

  private getRedis(): RedisRateLimitClient | null {
    return this.redisOverride ?? redisClient();
  }

  private incrementLocal(key: string): ClientRateLimitInfo {
    const now = Date.now();
    const existing = this.localCounts.get(key);
    if (!existing || existing.resetAt <= now) {
      const resetAt = now + this.windowMs;
      this.localCounts.set(key, { count: 1, resetAt });
      return { totalHits: 1, resetTime: new Date(resetAt) };
    }
    existing.count += 1;
    return { totalHits: existing.count, resetTime: new Date(existing.resetAt) };
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const redis = this.getRedis();
    if (!redis) return this.incrementLocal(key);

    const fullKey = `${this.prefix}${key}`;
    try {
      const totalHits = await redis.incr(fullKey);
      if (totalHits === 1) {
        await redis.pexpire(fullKey, this.windowMs);
      }
      let ttl = await redis.pttl(fullKey);
      if (ttl < 0) ttl = this.windowMs;
      return {
        totalHits,
        resetTime: new Date(Date.now() + ttl),
      };
    } catch {
      // A rate limiter should fail open during a Redis outage rather than
      // turning an infrastructure blip into a full application outage.
      return this.incrementLocal(key);
    }
  }

  async decrement(key: string): Promise<void> {
    const redis = this.getRedis();
    if (!redis) {
      const existing = this.localCounts.get(key);
      if (existing && existing.count > 0) existing.count -= 1;
      return;
    }

    try {
      await redis.decr(`${this.prefix}${key}`);
    } catch {
      // Best effort: the current window will expire naturally.
    }
  }

  async resetKey(key: string): Promise<void> {
    this.localCounts.delete(key);
    const redis = this.getRedis();
    if (!redis) return;

    try {
      await redis.del(`${this.prefix}${key}`);
    } catch {
      // Best effort: reset is administrative and must not take down a request.
    }
  }
}

export function skipLocalhostInDev(req: Request): boolean {
  if (process.env.NODE_ENV === "test") return true;
  if (process.env.NODE_ENV !== "development") return false;
  const ip = req.ip ?? "";
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

export function userOrIpKey(req: Request, prefix: string): string {
  const userId = (req as Request & { authenticatedUserId?: number }).authenticatedUserId;
  if (userId != null) return `${prefix}:u:${userId}`;
  return `${prefix}:ip:${req.ip ?? "unknown"}`;
}

export function makeLimiter(
  opts: Partial<Options> & {
    windowMs: number;
    limit: number | ((req: Request) => number | Promise<number>);
    prefix: string;
    message: object;
  },
) {
  const store = new RedisRateLimitStore(opts.windowMs, `niakofa:${opts.prefix}:`);

  return rateLimit({
    windowMs: opts.windowMs,
    limit: opts.limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: opts.skip ?? skipLocalhostInDev,
    keyGenerator: opts.keyGenerator ?? ((req) => userOrIpKey(req, opts.prefix)),
    message: opts.message,
    store,
  });
}