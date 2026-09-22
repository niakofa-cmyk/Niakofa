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
  insert: jest.fn().mockReturnThis(),
  values: jest.fn().mockReturnThis(),
  onConflictDoNothing: jest.fn().mockReturnThis(),
  returning: jest.fn().mockResolvedValue([]),
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
  (db.insert as jest.Mock).mockReset().mockReturnThis();
  (db.values as jest.Mock).mockReset().mockReturnThis();
  (db.onConflictDoNothing as jest.Mock).mockReset().mockReturnThis();
  (db.returning as jest.Mock).mockReset().mockResolvedValue([]);
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

  it("re-resolves a previously assigned user after they travel", async () => {
    reverseGeocodeMock.mockResolvedValueOnce({ county: "Jackson", state: "Missouri" });
    (db.execute as jest.Mock).mockImplementationOnce(() => Promise.resolve({ rows: [{ id: 7 }] }));
    const result = await resolveCommunityFromFreshLocation({
      currentCommunityId: 7, // already resolved, and not the default
      ...FORT_WORTH,
    });
    expect(result).toBe(7);
    expect(reverseGeocodeMock).toHaveBeenCalledWith(FORT_WORTH.lat, FORT_WORTH.lng);
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

  it("creates a dedicated Kansas City community rather than inheriting the Fort Worth default", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ value: "1" }])) // default_community_id = 1 (Fort Worth)
      .mockImplementationOnce(() => Promise.resolve([{ id: 1 }])); // that default community exists
    reverseGeocodeMock.mockResolvedValueOnce({ county: "Jackson", state: "Missouri" });
    // No community row for Jackson County, MO exists yet, so this fresh
    // location provisions that county's isolated pool.
    (db.execute as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
      .mockImplementationOnce(() => Promise.resolve({ rows: [] }));
    (db.returning as jest.Mock).mockResolvedValueOnce([{
      id: 2,
      name: "Jackson County, MO",
      county: "Jackson",
      state: "MO",
    }]);

    const result = await resolveCommunityFromFreshLocation({
      currentCommunityId: null, // a Kansas City requester who never claims a job
      ...KANSAS_CITY,
    });

    // The critical assertion: this must be a new county pool, never 1
    // (the Fort Worth admin default).
    expect(result).toBe(2);
    expect(result).not.toBe(1);
    expect(reverseGeocodeMock).toHaveBeenCalledWith(KANSAS_CITY.lat, KANSAS_CITY.lng);
  });

  it("returns the winning county pool when two first visits race to create it", async () => {
    reverseGeocodeMock.mockResolvedValueOnce({ county: "Jackson County", state: "Missouri" });
    (db.execute as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
      .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
      .mockImplementationOnce(() => Promise.resolve({
        rows: [{ id: 9, name: "Jackson County, MO", county: "Jackson", state: "MO" }],
      }));
    (db.returning as jest.Mock).mockResolvedValueOnce([]);

    const result = await resolveCommunityFromFreshLocation({
      currentCommunityId: null,
      ...KANSAS_CITY,
    });

    expect(result).toBe(9);
    expect(db.onConflictDoNothing).toHaveBeenCalledTimes(1);
  });

  it("propagates geocoder outages so location callers can preserve the current assignment", async () => {
    reverseGeocodeMock.mockRejectedValueOnce(new Error("Mapbox timeout"));

    await expect(resolveCommunityFromFreshLocation({
      currentCommunityId: 1,
      ...FORT_WORTH,
    })).rejects.toThrow("Mapbox timeout");
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
    reverseGeocodeMock.mockReset().mockResolvedValueOnce({ county: "Jackson", state: "Missouri" });
    (db.execute as jest.Mock)
      .mockReset()
      .mockImplementationOnce(() => Promise.resolve({ rows: [] }))
      .mockImplementationOnce(() => Promise.resolve({ rows: [] }));
    (db.returning as jest.Mock).mockResolvedValueOnce([{
      id: 2,
      name: "Jackson County, MO",
      county: "Jackson",
      state: "MO",
    }]);
    const kansasCityResult = await resolveCommunityFromFreshLocation({
      currentCommunityId: null,
      ...KANSAS_CITY,
    });

    expect(fortWorthResult).toBe(1);
    expect(kansasCityResult).toBe(2);
    expect(fortWorthResult).not.toBe(kansasCityResult);
  });
});