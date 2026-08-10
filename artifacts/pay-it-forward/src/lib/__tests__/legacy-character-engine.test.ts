import { describe, it } from "node:test";
import { expect } from "expect";
import {
  deriveLifeStage,
  inferAppearance,
  resolveCharacterAppearance,
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

  it("selects a deterministic curated variant for a character's life stage and era", () => {
    const input = {
      characterId: "kwame-mensah",
      ageGroup: "adult" as const,
      gender: "male" as const,
      lifeStage: "mature" as const,
      era: "1910s",
      appearanceSeed: "house-of-mensah",
    };
    const first = resolveCharacterAppearance(input);
    const second = resolveCharacterAppearance(input);
    expect(first).toEqual(second);
    expect(first?.layers.map((layer) => layer.assetId)).toEqual([
      "tv_body_male_base",
      expect.stringMatching(/^tv_clothing_male_p0[234]$/),
      expect.stringMatching(/^tv_rear_hair_male_p0[234]$/),
      expect.stringMatching(/^tv_front_hair_male_p0[234]$/),
    ]);
  });

  it("keeps different life stages visually addressable without changing identity", () => {
    const youth = inferAppearance({
      characterId: "kwame-mensah",
      role: "Grandfather",
      birthYear: 1900,
      currentYear: 1916,
      era: "1910s",
      appearanceSeed: "kwame",
    });
    const elder = inferAppearance({
      characterId: "kwame-mensah",
      role: "Grandfather",
      birthYear: 1900,
      currentYear: 1970,
      era: "1970s",
      appearanceSeed: "kwame",
    });
    expect(youth?.characterId).toBe("kwame-mensah");
    expect(youth?.lifeStage).toBe("youth");
    expect(elder?.lifeStage).toBe("elder");
    expect(resolveWalkingAppearance(youth!)?.layers[1].assetId).toMatch(/^tv_clothing_kid_p0[234]$/);
    expect(resolveWalkingAppearance(elder!)?.layers[1].assetId).toMatch(/^tv_clothing_male_p0[234]$/);
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

  it("keeps deceased youth profiles on the kid asset when the death year is wired through", () => {
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

  it("does not select a kid profile for a future birth year", () => {
    expect(deriveLifeStage({ birthYear: 2027, currentYear: 2026 })).toMatchObject({
      id: "unknown",
      age: null,
    });
    expect(inferAppearance({
      role: "Child",
      birthYear: 2027,
      currentYear: 2026,
    })).toBeNull();
  });

  it("ignores contradictory future death dates", () => {
    expect(deriveLifeStage({
      birthYear: 2000,
      deathYear: 2030,
      currentYear: 2026,
    })).toMatchObject({
      id: "adult",
      age: 26,
    });
  });

  it("does not invent a life stage when the birth year is missing", () => {
    expect(deriveLifeStage({ birthYear: null, currentYear: 2026 })).toMatchObject({
      id: "unknown",
      age: null,
    });
  });
});