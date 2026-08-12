import { describe, it } from "node:test";
import { expect } from "expect";
import { getLegacyWorldLandmarkAt, getLegacyWorldLayout } from "../legacy-world-layout";

describe("Legacy regenerated world layout", () => {
  it("returns a deterministic but materially different layout for regenerated worlds", () => {
    const original = getLegacyWorldLayout(1);
    const regenerated = getLegacyWorldLayout(2);

    expect(regenerated).toBe(getLegacyWorldLayout(99));
    expect(regenerated.map).not.toEqual(original.map);
    expect(regenerated.landmarks.map(landmark => `${landmark.artifactId}:${landmark.row},${landmark.column}`))
      .not.toEqual(original.landmarks.map(landmark => `${landmark.artifactId}:${landmark.row},${landmark.column}`));
  });

  it("keeps every restored artifact discoverable after regeneration", () => {
    const artifactIds = getLegacyWorldLayout(2).landmarks.map(landmark => landmark.artifactId).sort();
    expect(artifactIds).toEqual(["certificate", "medal", "photo", "recipe"]);
  });

  it("resolves a memory marker at the player's exact position", () => {
    const layout = getLegacyWorldLayout(2);

    expect(getLegacyWorldLandmarkAt(layout, { row: 2, column: 4 })?.artifactId).toBe("recipe");
    expect(getLegacyWorldLandmarkAt(layout, { row: 5, column: 3 })).toBeNull();
  });
});