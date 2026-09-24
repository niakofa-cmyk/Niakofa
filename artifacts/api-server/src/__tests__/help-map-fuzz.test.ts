/**
 * Help-map coordinate privacy regression test.
 *
 * The public help map must never leak a requester's exact address to
 * browsing (non-owner, non-assigned, non-admin) users — `fuzzCoordinates`
 * in routes/requests.ts is what enforces that ~100m jitter. This suite
 * locks the behavior under Jest ESM.
 *
 * NOTE: this suite runs under Jest's native ESM support
 * (--experimental-vm-modules). Under native ESM, `jest.mock()` does NOT
 * intercept dynamic `await import()` calls — only `jest.unstable_mockModule()`
 * does. All mocked modules are registered below BEFORE any dynamic import,
 * and everything that might transitively touch "@workspace/db" (including
 * dynamic imports that routes/requests.ts transitively performs).
 */
import * as drizzleOrmActual from "drizzle-orm";
import { jest, describe, it, expect, beforeAll } from "@jest/globals";

// ── Minimal DB mock ───────────────────────────────────────────────────────────
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
    limit: jest.fn().mockResolvedValue([]),
    returning: jest.fn().mockResolvedValue([]),
    groupBy: jest.fn().mockReturnValue([]),
    catch: jest.fn().mockResolvedValue([null]),
  };

  return {
    db: mockDb,
    requestsTable: { id: "id", status: "status", helper_id: "helper_id", requester_id: "requester_id", lat: "lat", lng: "lng", urgency: "urgency", category: "category" },
    reportsTable: { id: "id", type: "type", reported_request_id: "reported_request_id", reporter_id: "reporter_id", status: "status", created_at: "created_at" },
    hubCommunityLeadersTable: { id: "id", user_id: "user_id", hub_id: "hub_id", approved: "approved", approved_at: "approved_at" },
    usersTable: { id: "id", name: "name", email: "email", help_count: "help_count", trust_score: "trust_score", goodwill_score: "goodwill_score", benevolence_wallet: "benevolence_wallet", helper_mode_active: "helper_mode_active", lat: "lat", lng: "lng" },
    userSettingsTable: { id: "id", user_id: "user_id", max_travel_miles: "max_travel_miles" },
    transactionsTable: { id: "id" },
    stripeAccountsTable: { id: "id", user_id: "user_id", payouts_enabled: "payouts_enabled", stripe_account_id: "stripe_account_id" },
    paymentTransactionsTable: { id: "id" },
    requestHelpersTable: { id: "id", request_id: "request_id", helper_id: "helper_id" },
    helperAvailabilityTable: { id: "id", user_id: "user_id" },
    businessesTable: { id: "id" },
    businessMembersTable: { id: "id", business_id: "business_id", user_id: "user_id" },
    systemSettingsTable: { key: "key", value: "value" },
    diasporaHubsTable: { id: "id", community_id: "community_id", name: "name", status: "status", is_seed: "is_seed", reserved_balance: "reserved_balance" },
    chatMessagesTable: { id: "id", request_id: "request_id", sender_id: "sender_id", content: "content", sent_at: "sent_at", read_at: "read_at" },
    communityPoolLedgerTable: { id: "id", amount: "amount", request_id: "request_id", created_at: "created_at" },
    communityPoolFinancialEventsTable: {},
    poolPendingMinimumsTable: { id: "id", request_id: "request_id" },
    communitiesTable: { id: "id", name: "name", target_reserve_amount: "target_reserve_amount", created_at: "created_at" },
    ratingsTable: { id: "id", request_id: "request_id", rater_id: "rater_id", ratee_id: "ratee_id", stars: "stars", role: "role" },
    mediaAssetsTable: { id: "id", owner_user_id: "owner_user_id", context_kind: "context_kind", context_id: "context_id", media_type: "media_type", mime_type: "mime_type", original_key: "original_key", status: "status", byte_size: "byte_size" },
    mediaProcessingJobsTable: { id: "id", media_asset_id: "media_asset_id", job_type: "job_type", status: "status" },
    requestMessageAttachmentsTable: { id: "id", message_id: "message_id", media_asset_id: "media_asset_id", storage_key: "storage_key", mime_type: "mime_type" },
  };
});

jest.unstable_mockModule("drizzle-orm", () => ({
  ...drizzleOrmActual,
  eq: jest.fn(),
  and: jest.fn(),
  or: jest.fn(),
  not: jest.fn(),
  sql: Object.assign(jest.fn().mockReturnValue({}), {
    join: jest.fn().mockReturnValue({}),
    raw: jest.fn().mockReturnValue({}),
    empty: jest.fn().mockReturnValue({}),
  }),
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
  getRedisConnection: jest.fn().mockReturnValue(null),
  isRedisConfigured: jest.fn().mockReturnValue(false),
  getRedisUrlStatus: jest.fn().mockReturnValue("not_set"),
  mediaProcessingQueue: null,
}));

jest.unstable_mockModule("../lib/mediaProcessingQueue.js", () => ({
  enqueueMediaAssetProcessing: jest.fn().mockResolvedValue(false),
}));

jest.unstable_mockModule("../lib/media-platform.js", () => ({
  MEDIA_PLATFORM_FLAG: "MEDIA_PLATFORM_V21",
  isMediaPlatformV21Enabled: jest.fn().mockReturnValue(false),
  mediaJobsForType: jest.fn().mockReturnValue(["probe"]),
  assertSupportedMediaJob: jest.fn(),
}));

jest.unstable_mockModule("../routes/push.js", () => ({
  sendPushToNearbyHelpers: jest.fn().mockResolvedValue(undefined),
  sendPushToAllHelpers: jest.fn().mockResolvedValue(undefined),
  sendPushToUser: jest.fn().mockResolvedValue(undefined),
  sendPushToUsers: jest.fn().mockResolvedValue(undefined),
  default: { get: jest.fn(), post: jest.fn(), use: jest.fn() },
}));

jest.unstable_mockModule("../routes/leaderboard.js", () => ({
  broadcastLeaderboardUpdate: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule("../lib/mailer.js", () => ({
  sendReceipt: jest.fn().mockResolvedValue(undefined),
  sendAlertEmail: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule("../lib/logger.js", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

let fuzzCoordinates: (
  lat: number,
  lng: number,
  requestId: number,
  urgency: string,
) => { lat: number; lng: number };

beforeAll(async () => {
  ({ fuzzCoordinates } = await import("../routes/requests"));
});

describe("fuzzCoordinates — help-map privacy", () => {
  it("returns coordinates within ~0.001 degrees (~100m) of the input", () => {
    const lat = 32.7767;
    const lng = -96.797;
    for (let i = 0; i < 50; i++) {
      const out = fuzzCoordinates(lat, lng, i + 1, "low");
      expect(Math.abs(out.lat - lat)).toBeLessThanOrEqual(0.0015);
      expect(Math.abs(out.lng - lng)).toBeLessThanOrEqual(0.0015);
    }
  });

  it("does not return the exact input coordinates (jitter is applied)", () => {
    const lat = 40.7128;
    const lng = -74.006;
    let anyDifferent = false;
    for (let i = 0; i < 20; i++) {
      const out = fuzzCoordinates(lat, lng, i + 1, "low");
      if (out.lat !== lat || out.lng !== lng) {
        anyDifferent = true;
        break;
      }
    }
    expect(anyDifferent).toBe(true);
  });

  it("preserves hemisphere signs", () => {
    const out = fuzzCoordinates(-33.8688, 151.2093, 42, "low");
    expect(out.lat).toBeLessThan(0);
    expect(out.lng).toBeGreaterThan(0);
  });

  it("preserves exact coordinates for emergency requests", () => {
    const lat = 32.7767;
    const lng = -96.797;
    expect(fuzzCoordinates(lat, lng, 42, "emergency")).toEqual({ lat, lng });
  });
});
