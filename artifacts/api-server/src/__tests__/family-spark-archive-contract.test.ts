import { promises as fs } from "node:fs";
import { describe, expect, it } from "@jest/globals";

const familyRoutePath = new URL("../routes/family.ts", import.meta.url);

describe("private Spark Family Story archive contract", () => {
  it("keeps uploads owner-private, validated, and retry-safe", async () => {
    const route = await fs.readFile(familyRoutePath, "utf8");
    expect(route).toContain('"/family/:id/memories/:memoryId/assets/upload-spark"');
    expect(route).toContain("requireAuth");
    expect(route).toContain('access.memory.author_id !== userId || access.memory.visibility !== "private"');
    expect(route).toContain("validateMediaBuffer(buffer, assetType, normalizedMime)");
    expect(route).toContain("createHash(\"sha256\")");
    expect(route).toContain('status: "uploaded"');
    expect(route).toContain("streamAssetSameOrigin(rel, res)");
  });

  it("creates one private story for the selected private memory", async () => {
    const route = await fs.readFile(familyRoutePath, "utf8");
    expect(route).toContain('"/family/:id/stories/spark-copy"');
    expect(route).toContain('parsed.data.audience !== "private"');
    expect(route).toContain('eq(familyStoriesTable.audience, "private")');
    expect(route).toContain("eq(familyStoriesTable.memory_id, memory_id)");
  });
});