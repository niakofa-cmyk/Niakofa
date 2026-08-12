import { describe, it } from "node:test";
import { expect } from "expect";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type VillageAssetCatalog = {
  schemaVersion: number;
  runtime: string;
  licenseStatus: string;
  historicalEvidence: boolean;
  familyLikeness: string;
  assets: Array<{
    id: string;
    file: string;
    sourceArchive: string;
    sourceEntry: string;
    sha256: string;
    runtime: string;
  }>;
};

const publicRoot = fileURLToPath(new URL("../../../public", import.meta.url));
const catalogPath = `${publicRoot}/legacy-village-assets/catalog.json`;

describe("Legacy village presentation asset catalog", () => {
  it("keeps the uploaded village layer curated and non-identity-bearing", () => {
    const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as VillageAssetCatalog;

    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.runtime).toBe("react-presentation-only");
    expect(catalog.licenseStatus).toBe("review-required");
    expect(catalog.historicalEvidence).toBe(false);
    expect(catalog.familyLikeness).toBe("prohibited");
    expect(catalog.assets.map(asset => asset.id)).toEqual([
      "village-field-grass",
      "village-tree",
      "house-prosperous",
      "house-ravaged",
      "train-station",
      "elder-idle",
      "villager-spritesheet",
      "tree-bark-study",
    ]);
  });

  it("ships every promoted asset with a verified browser path and digest", () => {
    const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as VillageAssetCatalog;

    for (const asset of catalog.assets) {
      expect(asset.file.startsWith("/legacy-village-assets/")).toBe(true);
      expect(existsSync(`${publicRoot}${asset.file}`)).toBe(true);
      expect(createHash("sha256").update(readFileSync(`${publicRoot}${asset.file}`)).digest("hex"))
        .toBe(asset.sha256);
      expect(asset.sourceEntry).not.toMatch(/(?:rpg_core|rpg_objects|\.js$)/);
      expect(asset.runtime).toBe("approved");
    }
  });
});