import { describe, it } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect } from "expect";
import {
  deriveLifeStage,
  inferAppearance,
  resolveCharacterAppearance,
  resolveWalkingAppearance,
  resolveWalkingAsset,
} from "../legacy-character-engine";

describe("Legacy character engine", () => {
  it("resolves stable original-art asset IDs instead of raw generator paths", () => {
    expect(resolveWalkingAsset({ ageGroup: "adult", gender: "female" })).toMatchObject({
      assetId: "tv_body_adult_female_base",
      file: "/legacy-world-assets/tv/TV_Body_p01-adult_female.png",
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
        { assetId: "tv_body_adult_female_base", layer: "body" },
        { assetId: "tv_clothing_adult_female_p01", layer: "clothing" },
        { assetId: "tv_rear_hair_adult_female_p01_afro", layer: "rearHair" },
        { assetId: "tv_front_hair_adult_female_p01_afro", layer: "frontHair" },
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
      "tv_body_adult_male_base",
      expect.stringMatching(/^tv_clothing_adult_male_p0[123]$/),
      expect.stringMatching(/^tv_rear_hair_adult_male_p0[1-5]_(afro|coils|braids|bun|locs)$/),
      expect.stringMatching(/^tv_front_hair_adult_male_p0[1-5]_(afro|coils|braids|bun|locs)$/),
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
    expect(resolveWalkingAppearance(youth!)?.layers[1].assetId).toMatch(/^tv_clothing_kid_p0[123]$/);
    expect(resolveWalkingAppearance(elder!)?.layers[1].assetId).toMatch(/^tv_clothing_adult_male_p0[123]$/);
  });

  it("ignores unknown or catalog-only selections instead of constructing raw paths", () => {
    expect(resolveWalkingAppearance({
      ageGroup: "adult",
      gender: "male",
      layers: { clothing: "not-a-real-asset" },
    })?.layers.map((layer) => layer.assetId)).toContain("tv_clothing_adult_male_p01");
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

describe("Original-art library (niakofa-original-art-demo-v1)", () => {
  it("ships every catalog entry that the browser renderer can resolve", () => {
    const catalogPath = fileURLToPath(
      new URL("../../../public/legacy-world-assets/catalog-original.json", import.meta.url),
    );
    const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as {
      runtimeAssets: Array<{ file: string; runtime?: string }>;
    };

    expect(catalog.runtimeAssets.length).toBeGreaterThan(0);
    for (const asset of catalog.runtimeAssets) {
      expect(
        existsSync(fileURLToPath(new URL(`../../../public${asset.file}`, import.meta.url))),
      ).toBe(true);
    }
  });

  it("ships every documented original-art world tile", () => {
    const catalogPath = fileURLToPath(
      new URL("../../../public/legacy-world-assets/catalog-original.json", import.meta.url),
    );
    const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as {
      worldTiles?: { path: string; tiles: string[] };
    };

    expect(catalog.worldTiles?.tiles).toHaveLength(13);
    for (const tile of catalog.worldTiles?.tiles ?? []) {
      expect(
        existsSync(fileURLToPath(new URL(
          `../../../public${catalog.worldTiles?.path}${tile}.png`,
          import.meta.url,
        ))),
      ).toBe(true);
    }
  });

  it("uses the license-clean original-art library by default", () => {
    expect(resolveWalkingAsset({ ageGroup: "adult", gender: "female" })?.file)
      .toBe("/legacy-world-assets/tv/TV_Body_p01-adult_female.png");
  });

  it("resolves a full layered appearance from the original-art library", () => {
    const result = resolveWalkingAppearance({
      ageGroup: "adult",
      gender: "male",
      libraryId: "niakofa-original-art-demo-v1",
    });
    expect(result?.libraryId).toBe("niakofa-original-art-demo-v1");
    expect(result?.layers.map((layer) => layer.assetId)).toEqual([
      "tv_body_adult_male_base",
      "tv_clothing_adult_male_p01",
      "tv_rear_hair_adult_male_p01_afro",
      "tv_front_hair_adult_male_p01_afro",
    ]);
    expect(result?.layers.every((layer) => layer.file.startsWith("/legacy-world-assets/tv/"))).toBe(true);
  });

  it("honors an explicit named hairstyle instead of the deterministic default", () => {
    const result = resolveCharacterAppearance({
      characterId: "ama-mensah",
      ageGroup: "adult",
      gender: "female",
      lifeStage: "adult",
      era: "1890s",
      libraryId: "niakofa-original-art-demo-v1",
      hairStyle: "locs",
    });
    const rear = result?.layers.find((layer) => layer.layer === "rearHair");
    const front = result?.layers.find((layer) => layer.layer === "frontHair");
    expect(rear?.assetId).toBe("tv_rear_hair_adult_female_p05_locs");
    expect(front?.assetId).toBe("tv_front_hair_adult_female_p05_locs");
  });

  it("stays deterministic for the same character/era/seed without an explicit hairstyle", () => {
    const input = {
      characterId: "kwame-mensah",
      ageGroup: "adult" as const,
      gender: "male" as const,
      lifeStage: "mature" as const,
      era: "1910s",
      appearanceSeed: "house-of-mensah",
      libraryId: "niakofa-original-art-demo-v1" as const,
    };
    const first = resolveCharacterAppearance(input);
    const second = resolveCharacterAppearance(input);
    expect(first).toEqual(second);
    expect(first?.layers.map((layer) => layer.assetId)).toEqual([
      "tv_body_adult_male_base",
      expect.stringMatching(/^tv_clothing_adult_male_p0[123]$/),
      expect.stringMatching(/^tv_rear_hair_adult_male_p0[1-5]_(afro|coils|braids|bun|locs)$/),
      expect.stringMatching(/^tv_front_hair_adult_male_p0[1-5]_(afro|coils|braids|bun|locs)$/),
    ]);
  });

  it("uses appearanceSeed for every generated layer, including original-art hair", () => {
    const base = {
      characterId: "kwame-mensah",
      ageGroup: "adult" as const,
      gender: "male" as const,
      lifeStage: "mature" as const,
      era: "1910s",
      libraryId: "niakofa-original-art-demo-v1" as const,
    };
    const first = resolveCharacterAppearance({ ...base, appearanceSeed: "ledger-a" });
    const second = resolveCharacterAppearance({ ...base, appearanceSeed: "ledger-d" });

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first).toEqual(resolveCharacterAppearance({ ...base, appearanceSeed: "ledger-a" }));
    expect(second).toEqual(resolveCharacterAppearance({ ...base, appearanceSeed: "ledger-d" }));
    expect(first?.appearanceSeed).toBe("ledger-a");
    expect(second?.appearanceSeed).toBe("ledger-d");

    const firstHair = first?.layers.find(layer => layer.layer === "rearHair")?.assetId;
    const secondHair = second?.layers.find(layer => layer.layer === "rearHair")?.assetId;
    expect(firstHair).not.toBe(secondHair);
  });

  it("resolves kid appearances in the original-art library too", () => {
    const result = resolveWalkingAppearance({
      ageGroup: "kid",
      gender: "unspecified",
      libraryId: "niakofa-original-art-demo-v1",
    });
    expect(result?.layers[0].assetId).toBe("tv_body_kid_base");
  });
});