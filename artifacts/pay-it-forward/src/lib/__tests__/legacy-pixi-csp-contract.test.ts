import { describe, it } from "node:test";
import { expect } from "expect";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "../../..");

const pixiRuntimeFiles = [
  "src/legacy-runtime/LegacyGameCanvas.tsx",
  "src/components/legacy-chapter-world.tsx",
  "src/components/legacy-battle-scene.tsx",
  "src/legacy-runtime/legacy-scene-renderer.ts",
  "src/legacy-runtime/legacy-asset-loader.ts",
  "src/legacy-runtime/legacy-actor-sprite.ts",
];

describe("Legacy PixiJS CSP boundary", () => {
  it("loads the CSP-safe Pixi module before every direct Pixi import", () => {
    for (const relativePath of pixiRuntimeFiles) {
      const source = readFileSync(resolve(projectRoot, relativePath), "utf8");
      const cspImport = source.indexOf('import "pixi.js/unsafe-eval"');
      const pixiImport = source.indexOf('from "pixi.js"');

      expect(cspImport).toBeGreaterThanOrEqual(0);
      expect(pixiImport).toBeGreaterThan(cspImport);
    }
  });

  it("pins every live Application renderer to WebGL", () => {
    for (const relativePath of pixiRuntimeFiles.slice(0, 3)) {
      const source = readFileSync(resolve(projectRoot, relativePath), "utf8");
      expect(source).toContain("preference: \"webgl\"");
    }
  });
});