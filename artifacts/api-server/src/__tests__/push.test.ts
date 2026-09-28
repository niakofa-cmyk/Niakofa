import { jest, describe, it, expect, beforeAll, beforeEach } from "@jest/globals";
import type { deliverToSubs as DeliverToSubs } from "../routes/push.js";

process.env.VAPID_PUBLIC_KEY = "test-public-key";
process.env.VAPID_PRIVATE_KEY = "test-private-key";

const deleteWhere = jest.fn().mockResolvedValue(undefined);
const mockDb = {
  delete: jest.fn().mockReturnValue({ where: deleteWhere }),
};
const mockEq = jest.fn((column: unknown, value: unknown) => ({ column, value }));
const mockAnd = jest.fn((...conditions: unknown[]) => ({ conditions }));
const sendNotification = jest.fn();

jest.unstable_mockModule("@workspace/db", () => ({
  db: mockDb,
  pushSubscriptionsTable: { endpoint: "endpoint", user_id: "user_id" },
  usersTable: {},
  userSettingsTable: {},
}));

jest.unstable_mockModule("drizzle-orm", () => ({
  eq: mockEq,
  and: mockAnd,
  sql: jest.fn(),
}));

jest.unstable_mockModule("web-push", () => ({
  default: {
    setVapidDetails: jest.fn(),
    sendNotification,
  },
}));

jest.unstable_mockModule("../lib/logger.js", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule("../lib/mailer.js", () => ({
  sendAlertEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule("../middlewares/auth.js", () => ({
  requireAuth: jest.fn((_req: unknown, _res: unknown, next: unknown) => (next as () => void)()),
}));

jest.unstable_mockModule("../middlewares/authz.js", () => ({
  requireOwnership: jest.fn(() => (_req: unknown, _res: unknown, next: unknown) => (next as () => void)()),
}));

let deliverToSubs: typeof DeliverToSubs;

beforeAll(async () => {
  ({ deliverToSubs } = await import("../routes/push.js"));
});

beforeEach(() => {
  sendNotification.mockReset();
  deleteWhere.mockClear();
  mockDb.delete.mockClear();
  mockEq.mockClear();
  mockAnd.mockClear();
});

describe("web-push subscription cleanup", () => {
  it.each([404, 410])("removes only the owner's subscription for invalid status %s", async (statusCode) => {
    const endpoint = `https://push.example/${statusCode}`;
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("endpoint unavailable"), { statusCode }));

    const delivered = await deliverToSubs(
      [{ endpoint } as never],
      { title: "Test", body: "Test body" },
      37,
    );

    expect(delivered).toBe(0);
    expect(mockDb.delete).toHaveBeenCalledTimes(1);
    expect(deleteWhere).toHaveBeenCalledTimes(1);
    expect(mockAnd).toHaveBeenCalledWith(
      { column: "user_id", value: 37 },
      { column: "endpoint", value: endpoint },
    );
  });

  it("does not delete a subscription for a transient delivery failure", async () => {
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("temporary failure"), { statusCode: 503 }));

    const delivered = await deliverToSubs(
      [{ endpoint: "https://push.example/transient" } as never],
      { title: "Test", body: "Test body" },
      37,
    );

    expect(delivered).toBe(0);
    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it("waits for owner-scoped cleanup before returning and ignores cleanup errors", async () => {
    let finishDelete!: (error?: Error) => void;
    deleteWhere.mockImplementationOnce(() => new Promise<void>((resolve, reject) => {
      finishDelete = (error) => error ? reject(error) : resolve();
    }));
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("endpoint unavailable"), { statusCode: 410 }));

    let settled = false;
    const delivery = deliverToSubs(
      [{ endpoint: "https://push.example/race" } as never],
      { title: "Test", body: "Test body" },
      82,
    ).then((count) => {
      settled = true;
      return count;
    });

    await new Promise((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);
    finishDelete(new Error("database cleanup failed"));
    await expect(delivery).resolves.toBe(0);
    expect(mockAnd).toHaveBeenCalledWith(
      { column: "user_id", value: 82 },
      { column: "endpoint", value: "https://push.example/race" },
    );
  });
});