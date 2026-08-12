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

  it("announces restored-memory discoveries from the playable map", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../components/legacy-living-world.tsx", import.meta.url)),
      "utf8",
    );

    expect(source).toContain("getLegacyWorldLandmarkAt");
    expect(source).toContain('role="status"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain("Memory discovered");
  });
});