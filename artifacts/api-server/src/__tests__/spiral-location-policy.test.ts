import {
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

  afterEach(() => {
    jest.restoreAllMocks();
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
    expect(resolved).toEqual({
      cityKey: "fort_worth",
      cityDisplay: "Fort Worth",
      countyDisplay: "Tarrant County",
      stateCode: "TX",
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
    });
  });

  it("fails closed when Mapbox is unavailable", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("Mapbox unavailable"));

    await expect(
      verifyCircleStartLocation("fort_worth", location, {
        nowMs: Date.parse("2026-09-05T20:00:30.000Z"),
      }),
    ).resolves.toEqual({
      ok: false,
      code: "CIRCLE_START_LOCATION_UNVERIFIED",
      reason: "Niakofa could not verify your current location. Refresh GPS and try again.",
    });
  });
});
