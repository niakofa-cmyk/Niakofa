/**
 * Help-map coordinate privacy regression test.
 *
 * The public help map must never leak a requester's exact address to
 * browsing (non-owner, non-assigned, non-admin) users — `fuzzCoordinates`
 * in routes/requests.ts is what enforces that ~100m jitter. This suite
 * locks down its contract so a future refactor can't silently widen or
 * remove the privacy fuzzing without a test failing.
 *
 * NOTE: this suite runs under Jest's native ESM support
 * (--experimental-vm-modules), matching the convention in lifecycle.test.ts —
 * jest.unstable_mockModule() (not jest.mock()) is required to intercept the
 * dynamic imports that routes/requests.ts transitively performs.
 */
import { jest, describe, it, expect, beforeAll } from "@jest/globals";

jest.unstable_mockModule("@workspace/db", () => {
  const mockDb: Record<string, unknown> = {
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    limit: jest.fn().mockImplementation(() => Promise.resolve([])),
    returning: jest.fn().mockImplementation(() => Promise.resolve([])),
    groupBy: jest.fn().mockReturnValue([]),
    onConflictDoNothing: jest.fn().mockResolvedValue([]),
    onConflictDoUpdate: jest.fn().mockResolvedValue([]),
    transaction: jest.fn().mockImplementation(async (cb: (tx: unknown) => Promise<any>) => cb(mockDb)),
    then: jest.fn().mockImplementation((resolve: unknown, reject: any) =>
      Promise.resolve([]).then(resolve, reject)
    ),
    execute: jest.fn().mockResolvedValue({ rows: [] }),
  };

  return {
    db: mockDb,
    requestsTable: { id: "id", status: "status", helper_id: "helper_id", requester_id: "requester_id", lat: "lat", lng: "lng", urgency: "urgency", category: "category" },
    reportsTable: { id: "id", type: "type", reported_request_id: "reported_request_id", reporter_id: "reporter_id", status: "status", created_at: "created_at" },
    hubCommunityLeadersTable: { id: "id", user_id: "user_id", hub_id: "hub_id", approved: "approved", approved_at: "approved_at" },
    usersTable: { id: "id", name: "name", email: "email", help_count: "help_count", trust_score: "trust_score", goodwill_score: "goodwill_score", benevolence_wallet: "benevolence_wallet", helper_mode_active: "helper_mode_active", lat: "lat", lng: "lng", is_admin: "is_admin" },
    userSettingsTable: { id: "id", user_id: "user_id", max_travel_miles: "max_travel_miles" },
    transactionsTable: { id: "id" },
    stripeAccountsTable: { id: "id", user_id: "user_id", payouts_enabled: "payouts_enabled", stripe_account_id: "stripe_account_id" },
    paymentTransactionsTable: { id: "id", request_id: "request_id", state: "state" },
    requestHelpersTable: { id: "id", request_id: "request_id", helper_id: "helper_id" },
    helperAvailabilityTable: { id: "id", user_id: "user_id" },
    businessesTable: { id: "id" },
    businessMembersTable: { id: "id", business_id: "business_id", user_id: "user_id" },
    systemSettingsTable: { key: "key", value: "value" },
    scheduledPaymentsTable: { id: "id", user_id: "user_id", request_id: "request_id", amount: "amount", scheduled_date: "scheduled_date", status: "status", note: "note", plan_id: "plan_id" },
    diasporaHubsTable: { id: "id", community_id: "community_id", name: "name", status: "status", is_seed: "is_seed", reserved_balance: "reserved_balance" },
    chatMessagesTable: { id: "id", request_id: "request_id", sender_id: "sender_id", content: "content", sent_at: "sent_at", read_at: "read_at" },
    communityPoolLedgerTable: { id: "id", amount: "amount", request_id: "request_id", created_at: "created_at" },
    ratingsTable: { id: "id", request_id: "request_id", rater_id: "rater_id", ratee_id: "ratee_id", stars: "stars", role: "role" },
  };
});

jest.unstable_mockModule("drizzle-orm", () => ({
  eq: jest.fn(),
  and: jest.fn(),
  or: jest.fn(),
  not: jest.fn(),
  sql: jest.fn(),
  inArray: jest.fn(),
  notInArray: jest.fn(),
  asc: jest.fn(),
  desc: jest.fn(),
  gte: jest.fn(),
  gt: jest.fn(),
  lte: jest.fn(),
  lt: jest.fn(),
  ne: jest.fn(),
  isNull: jest.fn(),
  isNotNull: jest.fn(),
}));

jest.unstable_mockModule("../lib/ws-hub.js", () => ({
  broadcast: jest.fn(),
  broadcastRequestEvent: jest.fn(),
  sendToUser: jest.fn(),
  sendToRequestParticipants: jest.fn(),
  sendToUsers: jest.fn(),
  isUserOnline: jest.fn().mockReturnValue(false),
  getConnectedUserIds: jest.fn().mockReturnValue([]),
  getHubMetrics: jest.fn().mockReturnValue({}),
}));

jest.unstable_mockModule("../lib/queue.js", () => ({
  enqueuePayoutRetry: jest.fn().mockResolvedValue(undefined),
  isRedisConfigured: jest.fn().mockReturnValue(false),
  getRedisUrlStatus: jest.fn().mockReturnValue("not_set"),
}));

jest.unstable_mockModule("../routes/push.js", () => ({
  sendPushToNearbyHelpers: jest.fn().mockResolvedValue(undefined),
  sendPushToAllHelpers: jest.fn().mockResolvedValue(undefined),
  sendPushToUser: jest.fn().mockResolvedValue(undefined),
  sendPushToUsers: jest.fn().mockResolvedValue(undefined),
  default: { get: jest.fn(), post: jest.fn(), use: jest.fn() },
}));

jest.unstable_mockModule("../routes/leaderboard.js", () => ({
  broadcastLeaderboardUpdate: jest.fn(),
  default: { get: jest.fn(), post: jest.fn(), use: jest.fn() },
}));

jest.unstable_mockModule("../lib/community-pool.js", () => ({
  payHelperFromPool: jest.fn(),
  payHelpersFromPool: jest.fn(),
  getGuaranteedMinimum: jest.fn(),
  isPoolEnabled: jest.fn().mockResolvedValue(false),
  queuePendingMinimum: jest.fn(),
  maybeAlertLowBalance: jest.fn(),
  getHourlyMinimumRate: jest.fn(),
  roundMoney: jest.fn((n: number) => Math.round(n * 100) / 100),
}));

jest.unstable_mockModule("@workspace/trust-tiers", () => ({
  getTrustTier: jest.fn(),
  getEffectiveTier: jest.fn(),
  meetsQualityGate: jest.fn().mockReturnValue(true),
  TIER_RANK: {},
  tierAtLeast: jest.fn().mockReturnValue(true),
  isSensitiveCategory: jest.fn().mockReturnValue(false),
  getHubLeadershipTrustBonus: jest.fn().mockReturnValue(0),
}));

jest.unstable_mockModule("../lib/mailer.js", () => ({
  sendReceipt: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule("../lib/post-moderation.js", () => ({
  moderateRequestText: jest.fn().mockReturnValue({ blocked: false }),
  moderatePostText: jest.fn().mockReturnValue({ blocked: false }),
}));

let fuzzCoordinates: (lat: number, lng: number, requestId: number, urgency: string) => { lat: number; lng: number };

beforeAll(async () => {
  ({ fuzzCoordinates } = await import("../routes/requests"));
});

describe("fuzzCoordinates (help-map privacy)", () => {
  it("does NOT fuzz emergency requests — exact coordinates pass through", () => {
    const result = fuzzCoordinates(32.7555, -97.3308, 42, "emergency");
    expect(result).toEqual({ lat: 32.7555, lng: -97.3308 });
  });

  it("fuzzes non-emergency requests within a bounded ~100m radius", () => {
    const lat = 32.7555;
    const lng = -97.3308;
    const result = fuzzCoordinates(lat, lng, 42, "routine");

    expect(result).not.toEqual({ lat, lng });

    // ±0.001° lat/lng ≈ ±111m; assert the jitter never exceeds that bound.
    expect(Math.abs(result.lat - lat)).toBeLessThanOrEqual(0.001 + 1e-9);
    expect(Math.abs(result.lng - lng) * Math.cos(lat * (Math.PI / 180))).toBeLessThanOrEqual(0.001 + 1e-9);
  });

  it("is deterministic for the same request id (map pins don't jump on refresh)", () => {
    const a = fuzzCoordinates(32.7555, -97.3308, 99, "urgent");
    const b = fuzzCoordinates(32.7555, -97.3308, 99, "urgent");
    expect(a).toEqual(b);
  });

  it("produces different jitter for different request ids", () => {
    const a = fuzzCoordinates(32.7555, -97.3308, 1, "routine");
    const b = fuzzCoordinates(32.7555, -97.3308, 2, "routine");
    expect(a).not.toEqual(b);
  });
});
