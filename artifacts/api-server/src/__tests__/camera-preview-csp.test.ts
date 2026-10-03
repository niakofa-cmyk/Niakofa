import { promises as fs } from "node:fs";
import { describe, expect, it } from "@jest/globals";

const appPath = new URL("../app.ts", import.meta.url);

describe("recorded camera preview security policy", () => {
  it("allows same-origin Blob URLs for video playback", async () => {
    const app = await fs.readFile(appPath, "utf8");
    expect(app).toMatch(/mediaSrc:\s*\[\s*"'self'"\s*,\s*"blob:"\s*\]/);
  });
});