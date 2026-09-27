import { jest, describe, it, expect, beforeAll, beforeEach } from "@jest/globals";
import type { deliverToSubs as DeliverToSubs } from "../routes/push.js";

process.env.VAPID_PUBLIC_KEY = "test-public-key";
process.env.VAPID_PRIVATE_KEY = "test-private-key";

const deleteWhere = jest.fn().mockResolvedValue(undefined);
const mockDb = {
  delete: jest.fn().mockReturnValue({ where: deleteWhere }),
};
const sendNotification = jest.fn();

jest.unstable_mockModule("@workspace/db", () => ({
  db: mockDb,
  pushSubscriptionsTable: { endpoint: "endpoint" },
  usersTable: {},
  userSettingsTable: {},
}));

jest.unstable_mockModule("drizzle-orm", () => ({
  eq: jest.fn((column: unknown, value: unknown) => ({ column, value })),
  and: jest.fn(),
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
});

describe("web-push subscription cleanup", () => {
  it.each([404, 410])("removes subscriptions for invalid endpoint status %s", async (statusCode) => {
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("endpoint unavailable"), { statusCode }));

    const delivered = await deliverToSubs(
      [{ endpoint: `https://push.example/${statusCode}` } as never],
      { title: "Test", body: "Test body" },
    );

    expect(delivered).toBe(0);
    expect(mockDb.delete).toHaveBeenCalledTimes(1);
    expect(deleteWhere).toHaveBeenCalledTimes(1);
  });

  it("does not delete a subscription for a transient delivery failure", async () => {
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("temporary failure"), { statusCode: 503 }));

    const delivered = await deliverToSubs(
      [{ endpoint: "https://push.example/transient" } as never],
      { title: "Test", body: "Test body" },
    );

    expect(delivered).toBe(0);
    expect(mockDb.delete).not.toHaveBeenCalled();
  });
});