/**
 * Nia AI kill-switch regression test.
 *
 * Nia must be DISABLED by default for every user and page. `isNiaEnabled()`
 * in routes/nia-proxy.ts is the single source of truth the whole app relies
 * on for that fail-closed posture. This suite locks down its contract:
 *   - No system_settings row (fresh DB) → disabled
 *   - Explicit "false" → disabled
 *   - Any value other than the literal string "true" → disabled
 *   - DB error while checking → disabled (never fail open)
 *   - Only the literal string "true" → enabled
 *
 * NOTE: native ESM — jest.unstable_mockModule() (not jest.mock()) is
 * required to intercept the dynamic imports nia-proxy.ts performs, matching
 * the convention in lifecycle.test.ts.
 */
import { jest, describe, it, expect, beforeEach } from "@jest/globals";

const whereMock = jest.fn();
const limitMock = jest.fn();

const mockDbRef: any = {
  select: (...args: unknown[]) => mockDbRef,
  from: (...args: unknown[]) => mockDbRef,
  where: (...args: unknown[]) => {
    whereMock(...args);
    return { limit: limitMock };
  },
};

jest.unstable_mockModule("@workspace/db", () => ({
  db: mockDbRef,
  systemSettingsTable: { key: "key", value: "value" },
}));

jest.unstable_mockModule("drizzle-orm", () => ({
  eq: jest.fn(),
}));

jest.unstable_mockModule("../middlewares/auth.js", () => ({
  parseAuth: jest.fn(),
  requireAuth: jest.fn((_req: any, _res: any, next: any) => next()),
}));

jest.unstable_mockModule("../middlewares/authz.js", () => ({
  requireAdmin: () => (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule("../middlewares/rate-limit.js", () => ({
  crisisAwareChatLimiter: (_req: any, _res: any, next: any) => next(),
  niaChatHistoryLimiter: (_req: any, _res: any, next: any) => next(),
  adminLimiter: (_req: any, _res: any, next: any) => next(),
}));

jest.unstable_mockModule("../lib/ws-hub.js", () => ({
  sendNiaEventToUser: jest.fn(),
  broadcastNiaEvent: jest.fn(),
}));

let isNiaEnabled: () => Promise<boolean>;

beforeEach(async () => {
  // NOTE: must be resetAllMocks(), not clearAllMocks() — clearAllMocks()
  // does not drain queued mockResolvedValueOnce() implementations, so a
  // leftover queued value from a prior test silently answers the next
  // test's first call. See niakofa-mock-reset-pattern memory.
  jest.resetAllMocks();
  ({ isNiaEnabled } = await import("../routes/nia-proxy"));
});

describe("isNiaEnabled (Nia kill-switch)", () => {
  it("is disabled when there is no system_settings row (fresh DB default)", async () => {
    limitMock.mockResolvedValueOnce([]);
    await expect(isNiaEnabled()).resolves.toBe(false);
  });

  it("is disabled when the stored value is the string \"false\"", async () => {
    limitMock.mockResolvedValueOnce([{ value: "false" }]);
    await expect(isNiaEnabled()).resolves.toBe(false);
  });

  it("is disabled for any non-\"true\" value (defensive fail-closed, not just false)", async () => {
    limitMock.mockResolvedValueOnce([{ value: "" }]);
    await expect(isNiaEnabled()).resolves.toBe(false);

    limitMock.mockResolvedValueOnce([{ value: "TRUE" }]);
    await expect(isNiaEnabled()).resolves.toBe(false);

    limitMock.mockResolvedValueOnce([{ value: "1" }]);
    await expect(isNiaEnabled()).resolves.toBe(false);
  });

  it("fails closed (disabled) when the DB query throws", async () => {
    limitMock.mockRejectedValueOnce(new Error("connection refused"));
    await expect(isNiaEnabled()).resolves.toBe(false);
  });

  it("is enabled only when the stored value is the exact literal string \"true\"", async () => {
    limitMock.mockResolvedValueOnce([{ value: "true" }]);
    const result = await isNiaEnabled();
    expect(result).toBe(true);
  });
});
