import { describe, it } from "node:test";
import { expect } from "expect";
import {
  deriveLifeStage,
  inferAppearance,
  resolveWalkingAppearance,
  resolveWalkingAsset,
} from "../legacy-character-engine";

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

  it("uses a verified death year when selecting a deceased character profile", () => {
    expect(inferAppearance({
      role: "Grandfather",
      birthYear: 1900,
      deathYear: 1916,
      currentYear: 2026,
    })).toEqual({
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

  it("derives life stages without changing the explicit appearance contract", () => {
    expect(deriveLifeStage({ birthYear: 2010, currentYear: 2026 })).toMatchObject({
      id: "youth",
      label: "Youth",
      age: 16,
    });
    expect(deriveLifeStage({ birthYear: 2000, currentYear: 2026 })).toMatchObject({
      id: "adult",
      age: 26,
    });
    expect(deriveLifeStage({ birthYear: 1980, currentYear: 2026 })).toMatchObject({
      id: "mature",
      age: 46,
    });
    expect(deriveLifeStage({ birthYear: 1940, currentYear: 2026 })).toMatchObject({
      id: "elder",
      age: 86,
    });
  });

  it("anchors a deceased character to their recorded death year", () => {
    expect(deriveLifeStage({ birthYear: 1874, deathYear: 1910, currentYear: 2026 })).toMatchObject({
      id: "mature",
      age: 36,
    });
  });

  it("does not invent a life stage when the birth year is missing", () => {
    expect(deriveLifeStage({ birthYear: null, currentYear: 2026 })).toMatchObject({
      id: "unknown",
      age: null,
    });
  });
});