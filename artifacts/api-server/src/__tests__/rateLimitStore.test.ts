import { describe, expect, it } from "@jest/globals";
import {
  RateLimitStoreUnavailableError,
  RedisRateLimitStore,
  type RedisRateLimitClient,
} from "../lib/rateLimitStore.js";

describe("RedisRateLimitStore local fallback", () => {
  it("increments keys independently within a window", async () => {
    const store = new RedisRateLimitStore(60_000, "test:", null);
    expect((await store.increment("a")).totalHits).toBe(1);
    expect((await store.increment("a")).totalHits).toBe(2);
    expect((await store.increment("b")).totalHits).toBe(1);
  });

  it("fails closed when Redis is missing on a critical limiter", async () => {
    const store = new RedisRateLimitStore(60_000, "strict:", null, true);

    await expect(store.increment("key")).rejects.toBeInstanceOf(RateLimitStoreUnavailableError);
  });

  it("does not fall back to a local counter when Redis errors on a critical limiter", async () => {
    const redis: RedisRateLimitClient = {
      async incr() {
        throw new Error("redis unavailable");
      },
      async decr() {
        return 0;
      },
      async pexpire() {
        return 0;
      },
      async pttl() {
        return -1;
      },
      async del() {
        return 0;
      },
    };
    const store = new RedisRateLimitStore(60_000, "strict:", redis, true);

    await expect(store.increment("key")).rejects.toBeInstanceOf(RateLimitStoreUnavailableError);
  });

  it("decrement reduces the count", async () => {
    const store = new RedisRateLimitStore(60_000, "test:", null);
    await store.increment("key");
    await store.increment("key");
    await store.decrement("key");
    expect((await store.increment("key")).totalHits).toBe(2);
  });

  it("resetKey clears the counter", async () => {
    const store = new RedisRateLimitStore(60_000, "test:", null);
    await store.increment("key");
    await store.increment("key");
    await store.resetKey("key");
    expect((await store.increment("key")).totalHits).toBe(1);
  });

  it("resets after the fixed window expires", async () => {
    const store = new RedisRateLimitStore(20, "test:", null);
    await store.increment("key");
    await store.increment("key");
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect((await store.increment("key")).totalHits).toBe(1);
  });

  it("uses the shared Redis contract when a connection is available", async () => {
    const values = new Map<string, number>();
    const redis: RedisRateLimitClient = {
      async incr(key) {
        const next = (values.get(key) ?? 0) + 1;
        values.set(key, next);
        return next;
      },
      async decr(key) {
        const next = Math.max(0, (values.get(key) ?? 0) - 1);
        values.set(key, next);
        return next;
      },
      async pexpire() {
        return 1;
      },
      async pttl() {
        return 60_000;
      },
      async del(...keys) {
        keys.forEach((key) => values.delete(key));
        return keys.length;
      },
    };
    const store = new RedisRateLimitStore(60_000, "redis:", redis);

    expect((await store.increment("key")).totalHits).toBe(1);
    expect((await store.increment("key")).totalHits).toBe(2);
    await store.decrement("key");
    expect((await store.increment("key")).totalHits).toBe(2);
    await store.resetKey("key");
    expect((await store.increment("key")).totalHits).toBe(1);
  });
});