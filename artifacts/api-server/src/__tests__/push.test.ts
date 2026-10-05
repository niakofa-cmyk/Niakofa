import { jest, describe, it, expect, beforeAll, beforeEach } from "@jest/globals";
import type {
  deliverToSubs as DeliverToSubs,
  PushPayload,
  sendPushToAllHelpers as SendPushToAllHelpers,
  sendPushToUser as SendPushToUser,
} from "../routes/push.js";

process.env.VAPID_PUBLIC_KEY = "test-public-key";
process.env.VAPID_PRIVATE_KEY = "test-private-key";

const deleteWhere = jest.fn().mockResolvedValue(undefined);
const pushSubscriptionsTable = { endpoint: "endpoint", user_id: "user_id" };
const selectFrom = jest.fn();
const mockDb = {
  select: jest.fn(() => ({ from: selectFrom })),
  delete: jest.fn().mockReturnValue({ where: deleteWhere }),
};
const mockEq = jest.fn((column: unknown, value: unknown) => ({ column, value }));
const mockAnd = jest.fn((...conditions: unknown[]) => ({ conditions }));
const sendNotification = jest.fn();

jest.unstable_mockModule("@workspace/db", () => ({
  db: mockDb,
  pushSubscriptionsTable,
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
let sendPushToUser: typeof SendPushToUser;
let sendPushToAllHelpers: typeof SendPushToAllHelpers;

beforeAll(async () => {
  ({ deliverToSubs, sendPushToUser, sendPushToAllHelpers } = await import("../routes/push.js"));
});

beforeEach(() => {
  sendNotification.mockReset();
  deleteWhere.mockClear();
  mockDb.delete.mockClear();
  mockDb.select.mockReset().mockReturnValue({ from: selectFrom });
  selectFrom.mockReset();
  mockEq.mockClear();
  mockAnd.mockClear();
});

describe("web-push subscription cleanup", () => {
  it.each([404, 410])("removes only the owner's subscription for invalid status %s", async (statusCode) => {
    const endpoint = `https://push.example/${statusCode}`;
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("endpoint unavailable"), { statusCode }));

    const delivered = await deliverToSubs(
      [{ endpoint } as never],
      { title: "Test", body: "Test body", notifType: "nearby_requests" },
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
      { title: "Test", body: "Test body", notifType: "nearby_requests" },
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
      { title: "Test", body: "Test body", notifType: "nearby_requests" },
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

  it("skips delivery when a runtime caller omits the required notification type", async () => {
    const result = await sendPushToUser(
      37,
      { title: "Unclassified", body: "This must not bypass preferences" } as PushPayload,
    );

    expect(result.status).toBe("skipped");
    expect(mockDb.select).not.toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("respects community notification preferences in the all-helpers path", async () => {
    const endpoint = "https://push.example/community";
    selectFrom.mockImplementation((table: unknown) => {
      if (table === pushSubscriptionsTable) {
        return Promise.resolve([{ user_id: 37, subscription: { endpoint } }]);
      }
      return {
        where: jest.fn(() => ({
          limit: jest.fn().mockResolvedValue([{ notif_community_activity: false }]),
        })),
      };
    });

    await sendPushToAllHelpers({
      title: "Community update",
      body: "A community update",
      notifType: "community",
    });

    expect(sendNotification).not.toHaveBeenCalled();
  });
});