import express from "express";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";

const db = {
  execute: jest.fn(),
};

const workerHealth = [
  {
    name: "payout-worker",
    label: "Payout Worker",
    status: "running",
    redisRequired: true,
    successCount: 2,
    failureCount: 0,
  },
];

const requireAuth = jest.fn((req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.headers.authorization === "Bearer admin-token") {
    req.authenticatedUserId = 7;
    next();
    return;
  }
  res.status(401).json({ error: "Unauthorized" });
});

const requireAdmin = jest.fn(() => (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.authenticatedUserId === 7) {
    next();
    return;
  }
  res.status(403).json({ error: "Admin access required" });
});

jest.unstable_mockModule("@workspace/db", () => ({ db }));
jest.unstable_mockModule("drizzle-orm", () => ({
  sql: jest.fn(),
}));
jest.unstable_mockModule("../middlewares/auth.js", () => ({ requireAuth }));
jest.unstable_mockModule("../middlewares/authz.js", () => ({ requireAdmin }));
jest.unstable_mockModule("../middlewares/rate-limit.js", () => ({
  adminLimiter: (_req: unknown, _res: unknown, next: express.NextFunction) => next(),
}));
jest.unstable_mockModule("../lib/logger.js", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.unstable_mockModule("../lib/stripe-config.js", () => ({
  getStripeSecretKey: jest.fn(() => "sk_test"),
  getStripeWebhookSecret: jest.fn(() => "whsec_test"),
}));
jest.unstable_mockModule("../lib/worker-registry.js", () => ({
  getWorkerHealth: jest.fn(() => workerHealth),
  areAllCriticalWorkersRunning: jest.fn(() => true),
}));
jest.unstable_mockModule("../lib/queue.js", () => ({
  isRedisConfigured: jest.fn(() => true),
  getRedisUrlStatus: jest.fn(() => "ready"),
  getRedisConnection: jest.fn(() => ({ status: "ready" })),
}));
jest.unstable_mockModule("../lib/ws-hub.js", () => ({
  getHubMetrics: jest.fn(() => ({ connected_clients: 0 })),
}));
jest.unstable_mockModule("../lib/db-helpers.js", () => ({
  getSystemSetting: jest.fn(async (key: string) => (key === "nia_enabled" ? "false" : null)),
}));
jest.unstable_mockModule("../routes/navigation.js", () => ({
  getNavigationCircuitBreakerStatus: jest.fn(() => ({ state: "closed" })),
}));
jest.unstable_mockModule("../lib/storage.js", () => ({
  getStorageDescription: jest.fn(() => "local filesystem"),
}));
jest.unstable_mockModule("../lib/circleMediaConfig.js", () => ({
  isValidLiveKitUrl: jest.fn(() => true),
}));
jest.unstable_mockModule("../lib/nia-client.js", () => ({
  getNiaServiceUrl: jest.fn(() => "http://nia.test"),
}));

let healthRouter: express.Router;

beforeAll(async () => {
  ({ default: healthRouter } = await import("../routes/health.js"));
});

beforeEach(() => {
  jest.clearAllMocks();
});

function app() {
  return express().use(express.json()).use(healthRouter);
}

describe("Admin 2.0 operations API wiring", () => {
  it("rejects unauthenticated worker health requests", async () => {
    const response = await request(app()).get("/admin/worker-health");
    expect(response.status).toBe(401);
  });

  it("allows an authenticated admin to load worker health", async () => {
    const response = await request(app())
      .get("/admin/worker-health")
      .set("Authorization", "Bearer admin-token");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      all_critical_ok: true,
      workers: workerHealth,
      redis: { configured: true },
    });
  });

  it("allows an authenticated admin to load the global operations snapshot", async () => {
    const response = await request(app())
      .get("/admin/global-ops")
      .set("Authorization", "Bearer admin-token");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      workers: { all_critical_ok: true, list: workerHealth },
      redis: { configured: true, required: false, ready: true, status: "ready" },
      navigation_circuit_breaker: { state: "closed" },
      storage: "local filesystem",
      process: { commit: "unknown" },
    });
  });

  it("invokes the real admin guard for the region mapping endpoint", async () => {
    const response = await request(app())
      .get("/admin/region-map?lat=32.75&lng=-97.33")
      .set("Authorization", "Bearer admin-token");

    expect(response.status).toBe(200);
    expect(response.body.region).toBe("North America");
  });
});