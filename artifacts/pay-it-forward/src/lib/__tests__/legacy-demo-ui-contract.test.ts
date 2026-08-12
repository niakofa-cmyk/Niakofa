import { describe, it } from "node:test";
import { expect } from "expect";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("Legacy demo navigation contract", () => {
  it("keeps every phase in the accessible progress indicator", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../pages/legacy-demo.tsx", import.meta.url)),
      "utf8",
    );

    expect(source).toContain('role="progressbar"');
    expect(source).toContain("DEMO_PHASE_ORDER.map((p, i) =>");
    expect(source).toContain("aria-valuenow={phaseIdx + 1}");
    expect(source).toContain('aria-label="Reset demo progress"');
  });

  it("starts new demo journeys at the Living Baobab before the prologue", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../pages/legacy-demo.tsx", import.meta.url)),
      "utf8",
    );
    const baobabSource = readFileSync(
      fileURLToPath(new URL("../../components/legacy-living-baobab.tsx", import.meta.url)),
      "utf8",
    );

    expect(source).toContain("showBaobab");
    expect(source).toContain("LegacyLivingBaobab");
    expect(source).toContain("state.baobabEntered");
    expect(source).toContain("enterLivingBaobab");
    expect(baobabSource).toContain("The Living Baobab");
    expect(baobabSource).toContain("Live Their Story");
    expect(baobabSource).toContain('aria-labelledby="living-baobab-title"');
  });

  it("announces restored-memory discoveries from the playable map", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../components/legacy-living-world.tsx", import.meta.url)),
      "utf8",
    );

    expect(source).toContain("getLegacyWorldLandmarkAt");
    expect(source).toContain('role="status"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain("Memory discovered");
    expect(source).toContain("Inspect memory");
    const spriteSource = readFileSync(
      fileURLToPath(new URL("../../components/legacy-character-sprite.tsx", import.meta.url)),
      "utf8",
    );
    expect(spriteSource).toContain("legacy-sprite-walk");
  });

  it("keeps the authenticated house panel on the canonical demo state key", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../components/legacy-house-demo.tsx", import.meta.url)),
      "utf8",
    );

    expect(source).toContain("readDemoState");
    expect(source).toContain("placeDemoArtifact");
    expect(source).toContain("writeDemoState");
    expect(source).not.toContain("niakofa:legacy-house-demo:v1");
  });
});