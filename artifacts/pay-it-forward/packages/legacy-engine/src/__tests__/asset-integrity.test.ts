import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SpriteAtlas } from "../animation/SpriteAtlas.js";
import type { SpriteAtlasDef } from "../animation/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(__dirname, "..", "..", "assets", "kwame");

test("every kwame-locomotion.json clip has its declared frame files on disk", () => {
  const raw = readFileSync(join(__dirname, "..", "data", "kwame-locomotion.json"), "utf-8");
  const def = JSON.parse(raw) as SpriteAtlasDef;
  const atlas = SpriteAtlas.fromJSON(def);

  for (const clipId of atlas.listClips()) {
    const clip = atlas.getClip(clipId);
    for (let frame = 1; frame <= clip.frameCount; frame++) {
      const framePath = join(assetsDir, clipId, `${clipId}_${frame}.png`);
      assert.ok(existsSync(framePath), `missing frame file: ${framePath}`);
    }
  }
});
