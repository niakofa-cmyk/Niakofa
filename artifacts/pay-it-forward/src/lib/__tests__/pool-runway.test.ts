import { describe, it } from "node:test";
import { expect } from "expect";
import { getPoolRunwayDisplay } from "../pool-runway";

describe("getPoolRunwayDisplay", () => {
  it("does not describe zero recent outflow as infinite runway", () => {
    expect(getPoolRunwayDisplay(null)).toEqual({
      label: "Not estimated",
      level: "neutral",
      warning: null,
    });
  });

  it("distinguishes a missing estimate from a null estimate", () => {
    expect(getPoolRunwayDisplay(undefined)).toEqual({
      label: "Unavailable",
      level: "neutral",
      warning: null,
    });
  });

  it("warns below seven estimated days", () => {
    const result = getPoolRunwayDisplay(6);
    expect(result.label).toBe("6 days");
    expect(result.level).toBe("critical");
    expect(result.warning).toContain("less than 7 days");
  });

  it("does not show the under-seven-day warning at the boundary", () => {
    const result = getPoolRunwayDisplay(7);
    expect(result.label).toBe("7 days");
    expect(result.level).toBe("caution");
    expect(result.warning).toBeNull();
  });

  it("marks a month or more as healthy and caps very large labels", () => {
    expect(getPoolRunwayDisplay(30)).toMatchObject({
      label: "30 days",
      level: "healthy",
      warning: null,
    });
    expect(getPoolRunwayDisplay(1_200).label).toBe("999+ days");
  });
});