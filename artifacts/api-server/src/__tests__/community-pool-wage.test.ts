/**
 * Per-county guaranteed-minimum wage payout tests.
 *
 * Verifies the county livable-wage override actually changes the dollar
 * amount a helper is paid — not just that the DB column exists.
 *
 * Resolution order under test (community-pool.ts):
 *   getHourlyMinimumRate(communityId):
 *     1. communities.hourly_rate for communityId, if set and > 0
 *     2. system_settings.pool_minimum_hourly_rate (global default)
 *     3. hard-coded $15/hr fallback
 *   getGuaranteedMinimum(estimatedHours, helperId):
 *     base = max(flatFloor, estimatedHours * hourlyRate for helper's county)
 *     final = base * tierMultiplier * poolHealthRatio
 *
 * NOTE: this suite runs under Jest's native ESM support
 * (--experimental-vm-modules). See lifecycle.test.ts for the rationale on
 * why jest.unstable_mockModule (not jest.mock) is required here.
 */
import { jest, describe, it, expect, beforeAll, beforeEach } from "@jest/globals";

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
    limit: jest.fn(),
    returning: jest.fn(),
    transaction: jest.fn().mockImplementation(async (cb: (tx: unknown) => Promise<any>) => cb(mockDb)),
    then: jest.fn().mockImplementation((resolve: unknown, reject: any) =>
      Promise.resolve([]).then(resolve, reject)
    ),
  };
  (mockDb.limit as jest.Mock).mockImplementation(() => Promise.resolve([]));
  (mockDb.returning as jest.Mock).mockImplementation(() => Promise.resolve([]));

  return {
    db: mockDb,
    communitiesTable: { id: "id", name: "name", hourly_rate: "hourly_rate", target_reserve_amount: "target_reserve_amount" },
    systemSettingsTable: { key: "key", value: "value" },
    usersTable: {
      id: "id", community_id: "community_id", trust_score: "trust_score",
      help_count: "help_count", highest_tier_reached: "highest_tier_reached",
    },
    communityPoolLedgerTable: { id: "id", amount: "amount", community_id: "community_id" },
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

jest.unstable_mockModule("../lib/ws-hub.js", () => ({
  broadcast: jest.fn(),
}));

let db: unknown;
let getHourlyMinimumRate: (communityId?: number | null) => Promise<number>;
let getGuaranteedMinimum: (estimatedHours?: number | null, helperId?: number | null) => Promise<number>;

beforeAll(async () => {
  ({ db } = await import("@workspace/db"));
  ({ getHourlyMinimumRate, getGuaranteedMinimum } = await import("../lib/community-pool.js"));
});

beforeEach(() => {
  (db.select as jest.Mock).mockReset().mockReturnThis();
  (db.from as jest.Mock).mockReset().mockReturnThis();
  (db.where as jest.Mock).mockReset().mockReturnThis();
  (db.limit as jest.Mock).mockReset().mockImplementation(() => Promise.resolve([]));
  (db.then as jest.Mock).mockReset().mockImplementation((resolve: unknown, reject: any) =>
    Promise.resolve([]).then(resolve, reject)
  );
});

describe("getHourlyMinimumRate — per-county resolution", () => {
  it("uses the county's own hourly_rate when set and > 0", async () => {
    (db.limit as jest.Mock).mockImplementationOnce(() => Promise.resolve([{ hourly_rate: 22.5 }]));
    const rate = await getHourlyMinimumRate(7);
    expect(rate).toBe(22.5);
  });

  it("falls back to the global system setting when the county has no override", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ hourly_rate: null }])) // community row, no override
      .mockImplementationOnce(() => Promise.resolve([{ value: "18" }])); // global setting
    const rate = await getHourlyMinimumRate(7);
    expect(rate).toBe(18);
  });

  it("falls back to the global setting when no communityId is given", async () => {
    (db.limit as jest.Mock).mockImplementationOnce(() => Promise.resolve([{ value: "16.25" }]));
    const rate = await getHourlyMinimumRate(null);
    expect(rate).toBe(16.25);
  });

  it("defaults to $15/hr when neither a county override nor a global setting exists", async () => {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([])) // no community row
      .mockImplementationOnce(() => Promise.resolve([])); // no global setting row
    const rate = await getHourlyMinimumRate(7);
    expect(rate).toBe(15);
  });
});

describe("getGuaranteedMinimum — payout actually scales with per-county wage", () => {
  /**
   * Drives one full getGuaranteedMinimum(hours, helperId) call through the
   * exact query sequence the implementation issues, with a neutral tier
   * (member, 1.0x) and a fully-healthy pool (ratio 1.0x) so the ONLY
   * variable affecting the payout is the county's hourly_rate.
   */
  async function payoutForCountyRate(hourlyRate: number, hours: number, flatFloor = 5) {
    (db.limit as jest.Mock)
      .mockImplementationOnce(() => Promise.resolve([{ value: String(flatFloor) }])) // pool_guaranteed_minimum
      .mockImplementationOnce(() => Promise.resolve([{ community_id: 99 }])) // helper's community_id
      .mockImplementationOnce(() => Promise.resolve([{ hourly_rate: hourlyRate }])) // county's hourly_rate
      .mockImplementationOnce(() => Promise.resolve([{ // helper tier lookup: neutral "member" tier
        trust_score: 0, help_count: 0, highest_tier_reached: null, community_id: 99,
      }]))
      .mockImplementationOnce(() => Promise.resolve([{ target_reserve_amount: 100 }])); // pool 100% funded
    (db.then as jest.Mock).mockImplementationOnce((resolve: unknown, reject: any) =>
      Promise.resolve([{ balance: 100 }]).then(resolve, reject) // balance == target -> health ratio 1.0
    );
    return getGuaranteedMinimum(hours, 1);
  }

  it("pays more in a county with a higher livable-wage rate for the same hours", async () => {
    const higherWageCounty = await payoutForCountyRate(20, 2); // 2h * $20/hr
    const lowerWageCounty = await payoutForCountyRate(15, 2); // 2h * $15/hr
    expect(higherWageCounty).toBe(40);
    expect(lowerWageCounty).toBe(30);
    expect(higherWageCounty).toBeGreaterThan(lowerWageCounty);
  });

  it("never pays less than the flat guaranteed-minimum floor even in a low-wage county", async () => {
    // 0.5h * $10/hr = $5.00, which equals the $5 floor here — bump the floor
    // above the hours-scaled amount to prove the floor wins.
    const payout = await payoutForCountyRate(10, 0.5, /* flatFloor */ 8);
    expect(payout).toBe(8);
  });
});
