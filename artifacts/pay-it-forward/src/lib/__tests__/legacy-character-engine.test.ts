import { describe, it } from "node:test";
import { expect } from "expect";
import { inferAppearance, resolveWalkingAppearance, resolveWalkingAsset } from "../legacy-character-engine";

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

  it("resolves an explicit multi-layer walking appearance from stable asset IDs", () => {
    expect(resolveWalkingAppearance({ ageGroup: "adult", gender: "female" })).toMatchObject({
      width: 144,
      height: 192,
      layers: [
        { assetId: "tv_body_female_base", layer: "body" },
        { assetId: "tv_clothing_female_default", layer: "clothing" },
        { assetId: "tv_rear_hair_female_default", layer: "rearHair" },
        { assetId: "tv_front_hair_female_default", layer: "frontHair" },
      ],
    });
  });

  it("ignores unknown or catalog-only selections instead of constructing raw paths", () => {
    expect(resolveWalkingAppearance({
      ageGroup: "adult",
      gender: "male",
      layers: { clothing: "not-a-real-asset" },
    })?.layers.map((layer) => layer.assetId)).toContain("tv_clothing_male_default");
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