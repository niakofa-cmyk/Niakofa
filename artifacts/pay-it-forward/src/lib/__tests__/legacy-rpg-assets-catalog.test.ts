import { describe, it } from "node:test";
import { expect } from "expect";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

type AssetCatalog = {
  schemaVersion: number;
  runtime: string;
  licenseStatus: string;
  historicalEvidence: boolean;
  familyLikeness: string;
  assets: unknown[];
};

const publicRoot = fileURLToPath(
  new URL("../../../public", import.meta.url),
);
const catalogPath = `${publicRoot}/legacy-rpg-assets/catalog.json`;

describe("Legacy RPG presentation asset catalog", () => {
  it("keeps unresolved RPG imports out of the shipped runtime", () => {
    const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as AssetCatalog;

    expect(catalog.schemaVersion).toBe(2);
    expect(catalog.runtime).toBe("catalog-only");
    expect(catalog.licenseStatus).toBe("blocked-pending-provenance");
    expect(catalog.historicalEvidence).toBe(false);
    expect(catalog.familyLikeness).toBe("prohibited");
    expect(catalog.assets).toHaveLength(0);
  });

  it("does not publish browser-resolvable files from the blocked catalog", () => {
    const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as AssetCatalog;

    expect(catalog.assets).toEqual([]);
  });

  it("rejects accidental promotion of runtime or identity-bearing metadata", () => {
    const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as AssetCatalog;

    expect(catalog.assets).toEqual([]);
  });
});