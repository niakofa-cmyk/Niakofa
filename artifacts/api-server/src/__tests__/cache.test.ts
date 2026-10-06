import { afterEach, describe, expect, it, jest } from "@jest/globals";

type RedisMock = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, mode: "EX", ttl: number) => Promise<unknown>;
  del: (key: string) => Promise<number>;
};

const redisState: { client: RedisMock | null } = { client: null };
const mockWarn = jest.fn();
const mockError = jest.fn();

jest.unstable_mockModule("../lib/queue.js", () => ({
  getRedisConnection: () => redisState.client,
}));

jest.unstable_mockModule("../lib/logger.js", () => ({
  logger: {
    warn: mockWarn,
    error: mockError,
    info: jest.fn(),
    debug: jest.fn(),
    child: () => ({ warn: mockWarn, error: mockError, info: jest.fn(), debug: jest.fn() }),
  },
}));

const { cacheDel, cacheGet, cacheSet } = await import("../lib/cache.js");

describe("response cache Redis degradation", () => {
  afterEach(() => {
    redisState.client = null;
    mockWarn.mockClear();
    mockError.mockClear();
  });

  it("falls back to local memory when Redis writes fail and reports the failure", async () => {
    const key = `cache:set-failure:${Date.now()}`;
    const error = new Error("redis unavailable");
    redisState.client = {
      get: async () => null,
      set: async () => {
        throw error;
      },
      del: async () => 0,
    };

    await cacheSet(key, { ready: true }, 60);

    expect(mockWarn).toHaveBeenCalledWith(
      { operation: "cache.redis-write", error_type: "Error" },
      "Handled non-fatal failure",
    );
    expect(JSON.stringify(mockWarn.mock.calls)).not.toContain("redis unavailable");
    redisState.client = null;
    await expect(cacheGet<{ ready: boolean }>(key)).resolves.toEqual({ ready: true });
  });

  it("falls back to local memory when Redis reads fail and reports the failure", async () => {
    const key = `cache:get-failure:${Date.now()}`;
    await cacheSet(key, { ready: true }, 60);
    const error = new Error("redis unavailable");
    redisState.client = {
      get: async () => {
        throw error;
      },
      set: async () => "OK",
      del: async () => 0,
    };

    await expect(cacheGet<{ ready: boolean }>(key)).resolves.toEqual({ ready: true });
    expect(mockWarn).toHaveBeenCalledWith(
      { operation: "cache.redis-read", error_type: "Error" },
      "Handled non-fatal failure",
    );
    expect(JSON.stringify(mockWarn.mock.calls)).not.toContain("redis unavailable");
  });

  it("logs failed Redis invalidation and still clears the local fallback", async () => {
    const key = `cache:delete-failure:${Date.now()}`;
    await cacheSet(key, { ready: true }, 60);
    const error = new Error("redis unavailable");
    redisState.client = {
      get: async () => null,
      set: async () => "OK",
      del: async () => {
        throw error;
      },
    };

    await cacheDel(key);

    expect(mockError).toHaveBeenCalledWith(
      { operation: "cache.redis-delete", error_type: "Error" },
      "Handled non-fatal failure",
    );
    expect(JSON.stringify(mockError.mock.calls)).not.toContain("redis unavailable");
    redisState.client = null;
    await expect(cacheGet(key)).resolves.toBeNull();
  });
});
