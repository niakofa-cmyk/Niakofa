import { readFile } from "node:fs/promises";
import { describe, expect, it } from "@jest/globals";
import {
  MOMENT_COMPOSE_MAX_DURATION_MS,
  withinMomentDurationLimit,
  withinMomentTotalVideoDurationLimit,
} from "../lib/moment-video-compose";

describe("shared video duration policy", () => {
  it("allows any positive Moment video through 180 seconds, but no longer", () => {
    expect(MOMENT_COMPOSE_MAX_DURATION_MS).toBe(180_000);
    expect(withinMomentTotalVideoDurationLimit([1])).toBe(true);
    expect(withinMomentTotalVideoDurationLimit([180_000])).toBe(true);
    expect(withinMomentTotalVideoDurationLimit([180_001])).toBe(false);
    expect(withinMomentTotalVideoDurationLimit([100_000, 80_000])).toBe(true);
    expect(withinMomentTotalVideoDurationLimit([100_001, 80_000])).toBe(false);
  });

  it("applies the same three-minute total to stitched camera reels", () => {
    expect(withinMomentDurationLimit([1])).toBe(true);
    expect(withinMomentDurationLimit([])).toBe(false);
    expect(withinMomentDurationLimit([180_000])).toBe(true);
    expect(withinMomentDurationLimit([180_001])).toBe(false);
    expect(withinMomentDurationLimit([90_000, 90_000])).toBe(true);
    expect(withinMomentDurationLimit([90_001, 90_000])).toBe(false);
  });

  it("keeps Family Story duration uncapped while the Moment API enforces the total", async () => {
    const [familyRoute, momentRoute] = await Promise.all([
      readFile(new URL("../routes/family.ts", import.meta.url), "utf8"),
      readFile(new URL("../routes/community-stories.ts", import.meta.url), "utf8"),
    ]);
    expect(familyRoute).toMatch(/duration_seconds:\s*z\.number\(\)\.int\(\)\.positive\(\)\.optional\(\)/);
    expect(familyRoute).not.toMatch(/duration_seconds:\s*z\.number\(\)[^\n]*\.max\(/);
    expect(momentRoute).toMatch(/withinMomentTotalVideoDurationLimit\(/);
    expect(momentRoute.match(/withinMomentTotalVideoDurationLimit\(/g)).toHaveLength(2);
    expect(momentRoute).toMatch(/videoDurationsMs\.reduce\(/);
    expect(momentRoute).toMatch(/duration_ms: z\.number\(\)\.int\(\)\.positive\(\)\.max\(MOMENT_COMPOSE_MAX_DURATION_MS\)/);
  });

  it("keeps the worker's composed-output duration bound aligned with the three-minute policy", async () => {
    const worker = await readFile(new URL("../workers/media-process-worker.ts", import.meta.url), "utf8");
    expect(worker).toMatch(/outputProbe\.durationMs > MOMENT_COMPOSE_MAX_DURATION_MS/);
  });
});