import { describe, expect, it } from "@jest/globals";
import {
  buildHostSignal,
  normalizeCityKey,
  verifyCircleStartLocation,
} from "../lib/circleLocationPolicy";

describe("Spiral host policy", () => {
  it("is location-independent", async () => {
    const result = await verifyCircleStartLocation("fort_worth");
    expect(result).toMatchObject({
      ok: true,
      cityKey: "fort_worth",
      cityDisplay: "Fort Worth",
      canHost: true,
      accuracyBucket: "not_applicable",
    });
  });

  it("accepts the legacy optional location payload without using it", async () => {
    const result = await verifyCircleStartLocation("fort_worth", {
      latitude: 32.7555,
      longitude: -97.3308,
      accuracy_meters: 25,
      captured_at: "2026-09-05T20:00:00.000Z",
    });
    expect(result.ok).toBe(true);
  });

  it("builds a non-GPS ready Host Signal", () => {
    expect(
      buildHostSignal({
        canHost: true,
        spiralCityDisplay: "Fort Worth",
        spiralNeighborhood: "Downtown",
      }),
    ).toMatchObject({
      status: "ready",
      neighborhoodGeofenceStatus: null,
    });
  });

  it("keeps city normalization deterministic", () => {
    expect(normalizeCityKey("Fort Worth, TX")).toBe("fort_worth_tx");
  });
});
