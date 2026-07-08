/**
 * Regression tests for parseRedisUrl (lib/queue.ts)
 *
 * These are pure unit tests — they import parseRedisUrl directly and
 * exercise it with a range of input values that have historically caused
 * silent failures in production (BullMQ jobs enqueued but never processed
 * because REDIS_URL was a placeholder, or an unqualified hostname).
 *
 * Why this file exists:
 *   A plain non-redis string (e.g. "${{Redis.REDIS_URL}}", "redis-url",
 *   "localhost") passes the non-empty check in the original code, causes
 *   `isRedisConfigured()` to return true, queues to "start", and IORedis to
 *   log repeated connection errors — all without any 500 or startup crash.
 *   Jobs pile up silently, workers never process them. Adding the format
 *   guard + this regression suite prevents that class of misconfiguration
 *   from ever reaching production undetected.
 */

import { parseRedisUrl } from "../lib/queue.js";

describe("parseRedisUrl", () => {
  it("returns undefined for an empty string", () => {
    expect(parseRedisUrl("")).toBeUndefined();
  });

  it("returns undefined for a blank/whitespace string", () => {
    expect(parseRedisUrl("   ")).toBeUndefined();
  });

  it("returns undefined for a placeholder like ${{Redis.REDIS_URL}}", () => {
    expect(parseRedisUrl("${{Redis.REDIS_URL}}")).toBeUndefined();
  });

  it("returns undefined for a bare hostname without scheme", () => {
    expect(parseRedisUrl("localhost:6379")).toBeUndefined();
  });

  it("returns undefined for the literal string 'redis-url'", () => {
    expect(parseRedisUrl("redis-url")).toBeUndefined();
  });

  it("passes through a valid redis:// URL unchanged (non-cloud host)", () => {
    expect(parseRedisUrl("redis://localhost:6379")).toBe("redis://localhost:6379");
  });

  it("passes through a valid rediss:// URL unchanged", () => {
    expect(parseRedisUrl("rediss://user:pass@host:6380")).toBe("rediss://user:pass@host:6380");
  });

  it("upgrades redis:// to rediss:// for Upstash hosts", () => {
    const input  = "redis://default:token@my-project.upstash.io:6379";
    const result = parseRedisUrl(input);
    expect(result).toBe("rediss://default:token@my-project.upstash.io:6379");
  });

  it("leaves rediss:// Upstash URLs unchanged", () => {
    const input = "rediss://default:token@my-project.upstash.io:6379";
    expect(parseRedisUrl(input)).toBe(input);
  });

  it("strips a CLI prefix and extracts the embedded redis:// URL", () => {
    const embedded = "redis://localhost:6379";
    expect(parseRedisUrl(`redis-cli --tls -u ${embedded}`)).toBe(embedded);
  });

  it("strips a CLI prefix and upgrades Upstash redis:// inside", () => {
    const raw = "redis-cli --tls -u redis://default:token@proj.upstash.io:6379";
    expect(parseRedisUrl(raw)).toBe("rediss://default:token@proj.upstash.io:6379");
  });

  it("returns undefined for a whitespace-padded placeholder", () => {
    expect(parseRedisUrl("  redis-url  ")).toBeUndefined();
  });

  it("returns undefined for a Railway template literal that was never substituted", () => {
    expect(parseRedisUrl("${{Redis.REDIS_PRIVATE_URL}}")).toBeUndefined();
  });

  it("returns undefined for a redis:// URL with an unresolved template placeholder as the host", () => {
    expect(parseRedisUrl("redis://${{Redis.REDIS_URL}}")).toBeUndefined();
  });

  it("returns undefined for a redis:// scheme with no hostname", () => {
    expect(parseRedisUrl("redis://")).toBeUndefined();
  });

  it("returns undefined for a redis:// scheme with only a port, no host", () => {
    expect(parseRedisUrl("redis://:6379")).toBeUndefined();
  });

  it("accepts a valid redis:// URL whose password contains a literal $ character", () => {
    const input = "redis://user:pa$word@host:6379";
    expect(parseRedisUrl(input)).toBe(input);
  });

  it("accepts a valid rediss:// URL whose password contains a literal $ character", () => {
    const input = "rediss://user:pa$word@host:6380";
    expect(parseRedisUrl(input)).toBe(input);
  });
});
