/**
 * Fresh-location Community Pool resolution -- resolveCommunityFromFreshLocation().
 *
 * Covers the registration/location-ping bug: getDefaultCommunityId() has no
 * geography awareness, so every new signup landed in whichever single
 * community an admin configured as default, regardless of where the person
 * actually is. A Kansas City requester who never claims a job sat on Fort
 * Worth's pool forever.
 *
 * This proves the fix's specific guarantee: Fort Worth and Kansas City
 * coordinates resolve to *different* outcomes, and an unmatched city fails
 * closed to the NULL/global bucket -- never silently to the admin default.
 *
 * NOTE: runs under Jest's native ESM support (--experimental-vm-modules);
 * jest.unstable_mockModule is required here for the same reason as the
 * other community-pool.ts suites (see community-pool-claim-scope.test.ts).
 */
import { jest, describe, it, expect, beforeAll, beforeEach } from "@jest/globals";

const mockDb: Record<string, jest.Mock> = {
  select: jest.fn().mockReturnThis(),
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
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

let db: unknown;
let resolveCommunityFromFreshLocation: (params: {
  currentCommunityId: number | null;
  lat: number | null;
  lng: number | null;
}) => Promise<number | null>;
let isUnresolvedCommunityAssignment: (
  communityId: number | null,
  defaultCommunityId: number | null,
) => boolean;

// Real coordinates -- not stand-ins -- so a regression that swaps them or
// collapses the geocode mock to a constant would be caught by inspection.
const FORT_WORTH = { lat: 32.7555, lng: -97.3308 };
const KANSAS_CITY = { lat: 39.0997, lng: -94.5786 };

beforeAll(async () => {
  ({ db } = await import("@workspace/db"));
  ({ resolveCommunityFromFreshLocation, isUnresolvedCommunityAssignment } = await import(
    "../src/lib/community-pool.js"
  ));
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

describe("isUnresolvedCommunityAssignment", () => {
  it("treats a null community_id as unresolved", () => {
    expect(isUnresolvedCommunityAssignment(null, 1)).toBe(true);
  });

  it("treats a community_id equal to the untouched default as unresolved", () => {
    expect(isUnresolvedCommunityAssignment(1, 1)).toBe(true);
  });

  it("treats any other community_id as resolved", () => {
    expect(isUnresolvedCommunityAssignment(7, 1)).toBe(false);
  });
});

describe("resolveCommunityFromFreshLocation", () => {
  it("does nothing when coordinates are missing", async () => {
    const result = await resolveCommunityFromFreshLocation({
      currentCommunityId: null,
      lat: null,
      lng: null,
    });
    expect(result).toBeNull();
    expect(db.select).not.toHaveBeenCalled();
    expect(reverseGeocodeMock).not.toHaveBeenCalled();
  });

  it("skips the Mapbox lookup entirely when the user is already resolved to a real community", async () => {
    (db.limit as jest.Mock).mockImplementationOnce(() => Promise.resolve([{ value: "1" }])); // default = 1
    const result = await resolveCommunityFromFreshLocation({
      currentCommunityId: 7, // already resolved, and not the default
      ...FORT_WORTH,
    });
    expect(result).toBeNull();
    expect(reverseGeocodeMock).not.toHaveBeenCalled();
  });

  it("resolves a Fort Worth fix to the seeded Tarrant County community", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ value: "1" }])) // default_community_id = 1
      .mockImplementationOnce(() => Promise.resolve([{ id: 1 }])); // default resolves to community 1
    reverseGeocodeMock.mockResolvedValueOnce({ county: "Tarrant", state: "Texas" });
    (db.execute as jest.Mock).mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 1 }] }));

    const result = await resolveCommunityFromFreshLocation({
      currentCommunityId: null, // brand-new signup, nothing set yet
      ...FORT_WORTH,
    });

    expect(result).toBe(1);
    expect(reverseGeocodeMock).toHaveBeenCalledWith(FORT_WORTH.lat, FORT_WORTH.lng);
  });

  it("fails closed to null for Kansas City rather than inheriting the Fort Worth default", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ value: "1" }])) // default_community_id = 1 (Fort Worth)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1 }])); // that default community exists
    reverseGeocodeMock.mockResolvedValueOnce({ county: "Jackson", state: "Missouri" });
    // No community row for Jackson County, MO exists yet.
    (db.execute as jest.Mock).mockImplementationOnce(() => Promise.resolve({ rows: [] }));

    const result = await resolveCommunityFromFreshLocation({
      currentCommunityId: null, // a Kansas City requester who never claims a job
      ...KANSAS_CITY,
    });

    // The critical assertion: this must be null (unscoped global bucket),
    // never 1 (the Fort Worth admin default).
    expect(result).toBeNull();
    expect(result).not.toBe(1);
    expect(reverseGeocodeMock).toHaveBeenCalledWith(KANSAS_CITY.lat, KANSAS_CITY.lng);
  });

  it("proves Fort Worth and Kansas City resolve differently from the same starting state", async () => {
    // Fort Worth run.
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ value: "1" }]))
      .mockImplementationOnce(() => Promise.resolve([{ id: 1 }]));
    reverseGeocodeMock.mockResolvedValueOnce({ county: "Tarrant", state: "Texas" });
    (db.execute as jest.Mock).mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 1 }] }));
    const fortWorthResult = await resolveCommunityFromFreshLocation({
      currentCommunityId: null,
      ...FORT_WORTH,
    });

    // Reset mocks to the identical starting state, then run Kansas City.
    (db.limit as jest.Mock)
      .mockReset()
      .mockImplementationOnce(() => Promise.resolve([{ value: "1" }]))
      .mockImplementationOnce(() => Promise.resolve([{ id: 1 }]));
    reverseGeocodeMock.mockReset().mockResolvedValueOnce({ county: "Jackson", state: "Missouri" });
    (db.execute as jest.Mock).mockReset().mockImplementationOnce(() => Promise.resolve({ rows: [] }));
    const kansasCityResult = await resolveCommunityFromFreshLocation({
      currentCommunityId: null,
      ...KANSAS_CITY,
    });

    expect(fortWorthResult).toBe(1);
    expect(kansasCityResult).toBeNull();
    expect(fortWorthResult).not.toBe(kansasCityResult);
  });
});