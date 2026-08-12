import { describe, it } from "node:test";
import { expect } from "expect";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type CatalogAsset = {
  id: string;
  file: string;
  role: string;
  sourceArchive: string;
  sourceEntry: string;
  sha256: string;
  runtime: string;
};

type AssetCatalog = {
  schemaVersion: number;
  runtime: string;
  licenseStatus: string;
  historicalEvidence: boolean;
  familyLikeness: string;
  assets: CatalogAsset[];
};

const publicRoot = fileURLToPath(
  new URL("../../../public", import.meta.url),
);
const catalogPath = `${publicRoot}/legacy-rpg-assets/catalog.json`;

describe("Legacy RPG presentation asset catalog", () => {
  it("keeps exactly the approved, non-likeness encounter subset", () => {
    const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as AssetCatalog;

    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.runtime).toBe("react-presentation-only");
    expect(catalog.licenseStatus).toBe("review-required");
    expect(catalog.historicalEvidence).toBe(false);
    expect(catalog.familyLikeness).toBe("prohibited");
    expect(catalog.assets).toHaveLength(6);
    expect(catalog.assets.map(asset => asset.id)).toEqual([
      "encounter-grassland",
      "encounter-brick",
      "encounter-face-3",
      "encounter-command-item",
      "encounter-command-summon",
      "encounter-cursor",
    ]);
  });

  it("ships every catalog file at a browser-resolvable path", () => {
    const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as AssetCatalog;

    for (const asset of catalog.assets) {
      expect(asset.file.startsWith("/legacy-rpg-assets/")).toBe(true);
      expect(existsSync(`${publicRoot}${asset.file}`)).toBe(true);
      expect(createHash("sha256").update(readFileSync(`${publicRoot}${asset.file}`)).digest("hex"))
        .toBe(asset.sha256);
      expect(asset.sourceArchive).not.toContain("rpg_core");
      expect(asset.sourceArchive).not.toContain("rpg_objects");
      expect(asset.sourceEntry).not.toMatch(/(?:rpg_core|rpg_objects|\.js$)/);
      expect(asset.runtime).toBe("approved");
    }
  });

  it("rejects accidental promotion of runtime or identity-bearing metadata", () => {
    const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as AssetCatalog;

    for (const asset of catalog.assets) {
      expect(asset.role).not.toBe("family-portrait");
      expect(asset.file).not.toMatch(/(?:rpg_core|rpg_objects|LinearMotionBattleSystem)/i);
    }
  });
});