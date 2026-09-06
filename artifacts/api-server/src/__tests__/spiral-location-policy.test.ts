import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
  citiesMatchForHost,
  reverseGeocodeCircleStart,
  verifyCircleStartLocation,
} from "../lib/circleLocationPolicy";

describe("Spiral start location verification", () => {
  const location = {
    latitude: 32.7555,
    longitude: -97.3308,
    accuracy_meters: 25,
    captured_at: "2026-09-05T20:00:00.000Z",
  };
  const originalMapboxToken = process.env.MAPBOX_TOKEN;

  beforeEach(() => {
    process.env.MAPBOX_TOKEN = "test-mapbox-token";
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalMapboxToken === undefined) delete process.env.MAPBOX_TOKEN;
    else process.env.MAPBOX_TOKEN = originalMapboxToken;
  });

  it("uses Mapbox Geocoding v6 reverse without the invalid multi-type limit combination", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          features: [
            {
              feature_type: "place",
              text: "Fort Worth",
              context: {
                region: { name: "Texas", short_code: "US-TX" },
                district: { name: "Tarrant County" },
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const resolved = await reverseGeocodeCircleStart(location);
    expect(resolved).toMatchObject({
      cityKey: "fort_worth",
      cityDisplay: "Fort Worth",
      countyDisplay: "Tarrant County",
      stateCode: "TX",
      neighborhoodHint: null,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(requestUrl).toContain("https://api.mapbox.com/search/geocode/v6/reverse?");
    expect(requestUrl).toContain("longitude=-97.3308");
    expect(requestUrl).toContain("latitude=32.7555");
    expect(requestUrl).not.toContain("limit=");
    expect(requestUrl).not.toContain("types=place%2Clocality");
  });

  it("allows a Spiral when the fresh GPS fix resolves to the Spiral city", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          features: [
            {
              feature_type: "place",
              text: "Fort Worth",
              context: {
                region: { name: "Texas", short_code: "US-TX" },
                district: { name: "Tarrant County" },
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(
      verifyCircleStartLocation("fort_worth", location, {
        nowMs: Date.parse("2026-09-05T20:00:30.000Z"),
        userId: 42,
        circleId: 7,
      }),
    ).resolves.toMatchObject({
      ok: true,
      cityKey: "fort_worth",
      stateCode: "TX",
      canHost: true,
    });
  });

  it("allows known Fort Worth enclave names without weakening other city boundaries", () => {
    expect(citiesMatchForHost("fort_worth", "westworth_village")).toBe(true);
    expect(citiesMatchForHost("fort_worth", "river_oaks")).toBe(true);
    expect(citiesMatchForHost("fort_worth", "dallas")).toBe(false);
    expect(citiesMatchForHost("dallas", "highland_park")).toBe(false);
  });

  it("returns resolved city and neighborhood context on a wrong-city denial", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          features: [
            {
              feature_type: "neighborhood",
              text: "Crossroads",
              context: [
                { id: "place.kc", text: "Kansas City" },
                { id: "district.jackson", text: "Jackson County" },
                { id: "region.mo", text: "Missouri", short_code: "US-MO" },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(
      verifyCircleStartLocation("fort_worth", location, {
        nowMs: Date.parse("2026-09-05T20:00:30.000Z"),
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "CIRCLE_START_WRONG_CITY",
      spiralCityDisplay: "Fort Worth",
      resolvedCityDisplay: "Kansas City",
      neighborhoodHint: "Crossroads",
      canHost: false,
    });
  });

  it("fails closed when Mapbox is unavailable", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("Mapbox unavailable"));

    await expect(
      verifyCircleStartLocation("fort_worth", location, {
        nowMs: Date.parse("2026-09-05T20:00:30.000Z"),
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "CIRCLE_START_LOCATION_UNVERIFIED",
      reason: "Niakofa could not verify your current location. Refresh GPS and try again.",
      spiralCityKey: "fort_worth",
      spiralCityDisplay: "Fort Worth",
      canHost: false,
    });
  });
});
