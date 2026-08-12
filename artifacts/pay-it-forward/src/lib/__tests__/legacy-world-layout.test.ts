import { describe, it } from "node:test";
import { expect } from "expect";
import { getLegacyWorldLayout } from "../legacy-world-layout";

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
});