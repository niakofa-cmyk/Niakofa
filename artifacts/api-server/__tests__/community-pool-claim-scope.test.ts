/**
 * Claim-time Community Pool scope resolution -- resolveHelperClaimScope().
 *
 * Covers the decision that gates /requests/:id/claim: a helper's eventual
 * payout is scoped by community_id or hub_id, and a community_id that's
 * merely the untouched system default is treated as unresolved, not valid.
 * See requests.ts for how the route acts on this decision.
 *
 * NOTE: runs under Jest's native ESM support (--experimental-vm-modules);
 * jest.unstable_mockModule is required here for the same reason as the
 * other community-pool.ts suites (see lifecycle.test.ts).
 */
import { jest, describe, it, expect, beforeAll, beforeEach } from "@jest/globals";

const mockDb: Record<string, jest.Mock> = {
  select: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  set: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockResolvedValue([]),
  execute: jest.fn().mockResolvedValue({ rows: [] }),
};

jest.unstable_mockModule("@workspace/db", () => {
  return {
    db: mockDb,
    communitiesTable: { id: "id", county: "county", state: "state" },
    systemSettingsTable: { key: "key", value: "value" },
    usersTable: { id: "id", community_id: "community_id", lat: "lat", lng: "lng" },
    communityPoolLedgerTable: { id: "id", amount: "amount", community_id: "community_id" },
    communityPoolFinancialEventsTable: {},
    poolPendingMinimumsTable: { id: "id" },
    transactionsTable: { id: "id" },
    diasporaHubsTable: { id: "id" },
  };
});

jest.unstable_mockModule("drizzle-orm", () => ({
  eq: jest.fn(),
  and: jest.fn(),
  or: jest.fn(),
  sql: jest.fn((strings: TemplateStringsArray, ...vals: unknown[]) => ({ strings, vals })),
  asc: jest.fn(),
}));

jest.unstable_mockModule("../src/lib/ws-hub.js", () => ({
  broadcast: jest.fn(),
}));

const reverseGeocodeMock = jest.fn<(lat: number, lng: number) => Promise<unknown>>();
jest.unstable_mockModule("../src/routes/civic.js", () => ({
  reverseGeocode: reverseGeocodeMock,
}));

const db = mockDb;
let resolveHelperClaimScope: (params: {
  requestHubId: number | null;
  claimerCommunityId: number | null;
  claimerLat: number | null;
  claimerLng: number | null;
}) => Promise<
  | { ok: true; resolvedCommunityId?: number }
  | { ok: false; reason: "community_unresolved" }
>;

beforeAll(async () => {
  ({ resolveHelperClaimScope } = await import("../src/lib/community-pool.js"));
});

beforeEach(() => {
  (db.select as jest.Mock).mockReset().mockReturnThis();
  (db.from as jest.Mock).mockReset().mockReturnThis();
  (db.where as jest.Mock).mockReset().mockReturnThis();
  (db.orderBy as jest.Mock).mockReset().mockReturnThis();
  (db.limit as jest.Mock).mockReset().mockImplementation(() => Promise.resolve([]));
  (db.execute as jest.Mock).mockReset().mockImplementation(() => Promise.resolve({ rows: [] }));
  reverseGeocodeMock.mockReset();
});

describe("resolveHelperClaimScope", () => {
  it("allows the claim without any lookup when the request is hub-scoped", async () => {
    const decision = await resolveHelperClaimScope({
      requestHubId: 42,
      claimerCommunityId: null,
      claimerLat: null,
      claimerLng: null,
    });
    expect(decision).toEqual({ ok: true });
    expect(db.select).not.toHaveBeenCalled();
  });

  it("allows the claim when the helper's community_id is set and isn't the system default", async () => {
    (db.limit as jest.Mock).mockImplementationOnce(() => Promise.resolve([{ value: "1" }])); // default_community_id = 1
    const decision = await resolveHelperClaimScope({
      requestHubId: null,
      claimerCommunityId: 7,
      claimerLat: null,
      claimerLng: null,
    });
    expect(decision).toEqual({ ok: true });
    expect(reverseGeocodeMock).not.toHaveBeenCalled();
  });

  it("blocks the claim when community_id is null and no coordinates are on file", async () => {
    (db.limit as jest.Mock).mockImplementationOnce(() => Promise.resolve([])); // no default_community_id row
    const decision = await resolveHelperClaimScope({
      requestHubId: null,
      claimerCommunityId: null,
      claimerLat: null,
      claimerLng: null,
    });
    expect(decision).toEqual({ ok: false, reason: "community_unresolved" });
  });

  it("blocks the claim when community_id merely matches the untouched system default", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ value: "1" }])) // default_community_id setting = 1
      .mockImplementationOnce(() => Promise.resolve([{ id: 1 }])); // that community row exists -> default resolves to 1
    const decision = await resolveHelperClaimScope({
      requestHubId: null,
      claimerCommunityId: 1, // same as default -> treated as never actually resolved
      claimerLat: null,
      claimerLng: null,
    });
    expect(decision).toEqual({ ok: false, reason: "community_unresolved" });
  });

  it("auto-resolves and allows the claim when coordinates match a real community", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ value: "1" }])) // default = 1
      .mockImplementationOnce(() => Promise.resolve([])); // unused in this path, but keep call count stable
    reverseGeocodeMock.mockResolvedValueOnce({ county: "Jackson", state: "Missouri" });
    (db.execute as jest.Mock).mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 99 }] }));
    const decision = await resolveHelperClaimScope({
      requestHubId: null,
      claimerCommunityId: null,
      claimerLat: 39.0997,
      claimerLng: -94.5786,
    });
    expect(decision).toEqual({ ok: true, resolvedCommunityId: 99 });
  });

  it("blocks the claim when coordinates don't resolve to any known community", async () => {
    (db.limit as jest.Mock).mockImplementationOnce(() => Promise.resolve([{ value: "1" }]));
    reverseGeocodeMock.mockResolvedValueOnce({ county: "Nowhere", state: "Unmapped" });
    (db.execute as jest.Mock).mockImplementationOnce(() => Promise.resolve({ rows: [] })); // no matching community row
    const decision = await resolveHelperClaimScope({
      requestHubId: null,
      claimerCommunityId: null,
      claimerLat: 1,
      claimerLng: 1,
    });
    expect(decision).toEqual({ ok: false, reason: "community_unresolved" });
  });

  it("blocks the claim (does not throw) when reverseGeocode itself fails", async () => {
    (db.limit as jest.Mock).mockImplementationOnce(() => Promise.resolve([{ value: "1" }]));
    reverseGeocodeMock.mockRejectedValueOnce(new Error("Mapbox timeout"));
    const decision = await resolveHelperClaimScope({
      requestHubId: null,
      claimerCommunityId: null,
      claimerLat: 1,
      claimerLng: 1,
    });
    expect(decision).toEqual({ ok: false, reason: "community_unresolved" });
  });
});
