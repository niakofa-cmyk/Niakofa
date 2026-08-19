import { describe, it } from "node:test";
import { expect } from "expect";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("Canonical Legacy demo navigation contract", () => {
  it("enters the Pixi world from the public Baobab launcher", () => {
    const launcherSource = readFileSync(
      fileURLToPath(new URL("../../pages/legacy-demo-launcher.tsx", import.meta.url)),
      "utf8",
    );

    expect(launcherSource).toContain("LegacyLivingBaobab");
    expect(launcherSource).toContain('navigate(`/legacy/world?branch=${branchId}`)');
    expect(launcherSource).toContain("canonical PixiJS world");
  });

  it("mounts one canonical LegacyGameCanvas runtime for the public world", () => {
    const worldSource = readFileSync(
      fileURLToPath(new URL("../../pages/legacy-public-world.tsx", import.meta.url)),
      "utf8",
    );
    const canvasSource = readFileSync(
      fileURLToPath(new URL("../../legacy-runtime/LegacyGameCanvas.tsx", import.meta.url)),
      "utf8",
    );

    expect(worldSource).toContain("LegacyGameCanvas");
    expect(worldSource).toContain("capeCoastCompoundScene");
    expect(worldSource).toContain("KWAME_SHEET_MANIFEST");
    expect(canvasSource).toContain("renderStaticLayers(scene, layerContainers, envTextures)");
    expect(canvasSource).toContain("loadEnvironmentTextures(environmentBaseUrl, environmentAssets)");
  });

  it("keeps keyboard and touch movement on the same runtime input path", () => {
    const canvasSource = readFileSync(
      fileURLToPath(new URL("../../legacy-runtime/LegacyGameCanvas.tsx", import.meta.url)),
      "utf8",
    );

    expect(canvasSource).toContain("KEY_TO_VECTOR");
    expect(canvasSource).toContain("touchDirectionRef");
    expect(canvasSource).toContain('aria-label="Touch movement controls"');
    expect(canvasSource).toContain('Move up');
    expect(canvasSource).toContain("touchAction: \"none\"");
  });
});