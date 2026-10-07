import { describe, expect, it } from "@jest/globals";
import { getCommunityPoolReadiness } from "../lib/community-pool-readiness.js";

describe("getCommunityPoolReadiness", () => {
  const classify = (overrides: Partial<Parameters<typeof getCommunityPoolReadiness>[0]> = {}) =>
    getCommunityPoolReadiness({
      isCountyPool: true,
      activeUserCount: 4,
      balance: 2500,
      targetReserveAmount: 10000,
      pendingMinimumCount: 0,
      ...overrides,
    });

  it("treats queued unpaid minimums as urgent before other statuses", () => {
    expect(classify({ pendingMinimumCount: 1, balance: 0 })).toBe("unpaid_minimums_queued");
    expect(classify({ isCountyPool: false, pendingMinimumCount: 1 })).toBe("unpaid_minimums_queued");
  });

  it("marks an active county pool with no funds red", () => {
    expect(classify({ balance: 0 })).toBe("empty");
  });

  it("keeps a positive balance below target amber", () => {
    expect(classify({ balance: 9999.99 })).toBe("below_target");
  });

  it("marks a pool at or above its target green", () => {
    expect(classify({ balance: 10000 })).toBe("ready");
    expect(classify({ balance: 15000 })).toBe("ready");
  });

  it("does not count active users in an unscoped community as county readiness", () => {
    expect(classify({ isCountyPool: false })).toBe("unscoped");
  });

  it("marks a county with no active users as inactive", () => {
    expect(classify({ activeUserCount: 0, balance: 0 })).toBe("inactive");
  });
});
