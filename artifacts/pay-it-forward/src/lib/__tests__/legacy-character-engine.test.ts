import { describe, it } from "node:test";
import { expect } from "expect";
import { inferAppearance, resolveWalkingAsset } from "../legacy-character-engine";

describe("Legacy character engine", () => {
  it("resolves stable runtime asset IDs instead of raw generator paths", () => {
    expect(resolveWalkingAsset({ ageGroup: "adult", gender: "female" })).toMatchObject({
      assetId: "tv_body_female_base",
      file: "/legacy-character-assets/tv/TV_Body_p01-female.png",
      width: 144,
      height: 192,
    });
  });

  it("keeps unknown adult gender unrendered rather than guessing a likeness", () => {
    expect(resolveWalkingAsset({ ageGroup: "adult", gender: "unspecified" })).toBeNull();
  });

  it("uses kid assets without inventing gender", () => {
    expect(inferAppearance({ role: "Child", birthYear: 2015, currentYear: 2026 })).toEqual({
      ageGroup: "kid",
      gender: "unspecified",
    });
  });

  it("only applies adult gender hints from explicit family-role language", () => {
    expect(inferAppearance({ role: "Grandmother", birthYear: 1940, currentYear: 2026 })).toEqual({
      ageGroup: "adult",
      gender: "female",
    });
    expect(inferAppearance({ role: "Ancestor", birthYear: 1880, currentYear: 2026 })).toBeNull();
  });
});