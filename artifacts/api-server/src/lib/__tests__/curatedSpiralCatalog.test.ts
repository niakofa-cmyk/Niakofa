import { describe, expect, it } from "@jest/globals";
import {
  CURATED_SPIRAL_CATALOG,
  canonicalizeCuratedCityKey,
  getCuratedSpiralCity,
} from "../curatedSpiralCatalog";

describe("curated Spiral catalog", () => {
  it("keeps Fort Worth's canonical nine neighborhoods in product order", () => {
    expect(CURATED_SPIRAL_CATALOG.fort_worth.neighborhoods.map((n) => n.neighborhood_id)).toEqual([
      "southside",
      "near_southside",
      "polytechnic",
      "riverside",
      "downtown",
      "east_fort_worth",
      "north_fort_worth",
      "stop_six",
      "wedgwood",
    ]);
  });

  it("provides nine curated neighborhoods for every supported city", () => {
    for (const city of Object.values(CURATED_SPIRAL_CATALOG)) {
      expect(city.neighborhoods).toHaveLength(9);
      expect(new Set(city.neighborhoods.map((n) => n.neighborhood_id)).size).toBe(9);
    }
  });

  it("canonicalizes common city-with-state searches", () => {
    expect(canonicalizeCuratedCityKey("fort_worth_tx")).toBe("fort_worth");
    expect(getCuratedSpiralCity("dallas_tx")?.city_display).toBe("Dallas");
    expect(getCuratedSpiralCity("unknown_city")).toBeNull();
  });
});