import {
  parseRedisUrl,
  productionRedisRequirementError,
} from "../src/lib/queue";

describe("production Redis configuration", () => {
  test("accepts redis and rediss URLs", () => {
    expect(parseRedisUrl("redis://localhost:6379")).toBe("redis://localhost:6379");
    expect(parseRedisUrl("rediss://user:pass@example.com:6380")).toBe("rediss://user:pass@example.com:6380");
    expect(parseRedisUrl("redis://cache.upstash.io:6379")).toBe("rediss://cache.upstash.io:6379");
  });

  test("rejects unresolved deployment placeholders", () => {
    expect(parseRedisUrl("${{Redis.REDIS_URL}}")).toBeUndefined();
    expect(parseRedisUrl("redis://${{Redis.REDIS_URL}}")).toBeUndefined();
  });

  test("production fails closed without Redis", () => {
    expect(productionRedisRequirementError("production", "not_set")).toMatch(/REDIS_URL is required/);
    expect(productionRedisRequirementError("production", "invalid_format")).toMatch(/not a valid redis/);
    expect(productionRedisRequirementError("production", "valid")).toBeUndefined();
  });

  test("development remains allowed without Redis", () => {
    expect(productionRedisRequirementError("development", "not_set")).toBeUndefined();
  });
});