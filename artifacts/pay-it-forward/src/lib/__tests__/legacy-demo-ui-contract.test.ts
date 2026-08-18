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
    expect(baobabSource).toContain("LIVING_BRANCHES");
    expect(baobabSource).toContain('aria-label={`Focus ${branch.label}: ${branch.member}`}');
    expect(baobabSource).toContain("aria-pressed={isSelected}");
    expect(baobabSource).toContain("Select a branch to see what it remembers");
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

  it("explains how preserved artifacts become world updates", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../pages/legacy-demo.tsx", import.meta.url)),
      "utf8",
    );

    expect(source).toContain("Memory Chain");
    expect(source).toContain("Family Vault → Living World");
    expect(source).toContain("getDemoMemoryChain");
    expect(source).toContain("The chain is complete");
  });

  it("keeps the RPG command vocabulary grounded in a persisted memory encounter", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../pages/legacy-demo.tsx", import.meta.url)),
      "utf8",
    );
    const encounterSource = readFileSync(
      fileURLToPath(new URL("../../components/legacy-memory-encounter.tsx", import.meta.url)),
      "utf8",
    );
    const stateSource = readFileSync(
      fileURLToPath(new URL("../legacy-demo-state.ts", import.meta.url)),
      "utf8",
    );

    expect(source).toContain("LegacyMemoryEncounter");
    expect(encounterSource).toContain("The ledger remembers");
    expect(encounterSource).toContain("Listen to the memory");
    expect(encounterSource).toContain("Preserve this discovery");
    expect(encounterSource).toContain("/legacy-world-assets/tiles/grass_01.png");
    expect(encounterSource).toContain("/legacy-world-assets/tiles/red_earth.png");
    expect(stateSource).toContain("completeMemoryEncounter");
    expect(stateSource).toContain("memoryEncounterCompleted");
  });

  it("discloses the curated-art and provenance boundary in the satchel", () => {
    const satchelSource = readFileSync(
      fileURLToPath(new URL("../../components/legacy-satchel.tsx", import.meta.url)),
      "utf8",
    );

    expect(satchelSource).toContain("About the visual archive");
    expect(satchelSource).toContain("Family Vault evidence supplies the facts");
    expect(satchelSource).toContain("Licensing review is required");
  });

  it("renders regenerated memory echoes from explicit artifact progress", () => {
    const worldSource = readFileSync(
      fileURLToPath(new URL("../../components/legacy-living-world.tsx", import.meta.url)),
      "utf8",
    );

    expect(worldSource).toContain("WORLD_MEMORY_ECHOES");
    expect(worldSource).toContain('worldVersion > 1');
    expect(worldSource).toContain('libraryId="niakofa-original-art-demo-v1"');
    expect(worldSource).toContain("tap a blue echo to hear what changed");
    expect(worldSource).toContain("memory-echo:");
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

  it("keeps the Satchel as a projection of canonical artifact progress", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../pages/legacy-demo.tsx", import.meta.url)),
      "utf8",
    );
    const satchelSource = readFileSync(
      fileURLToPath(new URL("../../components/legacy-satchel.tsx", import.meta.url)),
      "utf8",
    );

    expect(source).toContain("SATCHEL_ITEMS");
    expect(source).toContain("<LegacySatchel");
    expect(source).toContain("placedArtifacts={state.placedArtifacts}");
    expect(satchelSource).toContain("Legacy Satchel");
    expect(satchelSource).toContain("/legacy-rpg-assets/inventory/Inventory_Slot.png");
    expect(satchelSource).toContain("canonical demo state");
    expect(satchelSource).toContain('aria-label="Close Legacy Satchel"');
  });
});