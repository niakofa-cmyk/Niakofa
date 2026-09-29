import { describe, expect, it } from "@jest/globals";
import {
  coarseExchangeCoordinate,
  exchangeDistanceMiles,
  isWithinExchangeRadius,
} from "../lib/exchange-location";

describe("Exchange coarse location matching", () => {
  it("rounds coordinates before they enter the matching layer", () => {
    expect(coarseExchangeCoordinate(32.7767123)).toBe(32.78);
    expect(coarseExchangeCoordinate(-96.7970456)).toBe(-96.8);
    expect(coarseExchangeCoordinate(Number.NaN)).toBeNull();
  });

  it("includes an exact radius boundary and excludes the next point", () => {
    const origin = { lat: 32.7767, lng: -96.797 };
    const boundary = { lat: 32.7767 + 15 / 69, lng: -96.797 };
    const outside = { lat: 32.7767 + 15.01 / 69, lng: -96.797 };
    const radius = exchangeDistanceMiles(origin, boundary);
    expect(isWithinExchangeRadius(origin, boundary, radius)).toBe(true);
    expect(isWithinExchangeRadius(origin, outside, radius)).toBe(false);
  });

  it("does not turn missing or invalid coordinates into a nearby match", () => {
    expect(isWithinExchangeRadius({ lat: 0, lng: 0 }, { lat: 0, lng: 0 }, -1)).toBe(false);
    expect(exchangeDistanceMiles({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeGreaterThan(60);
  });
});