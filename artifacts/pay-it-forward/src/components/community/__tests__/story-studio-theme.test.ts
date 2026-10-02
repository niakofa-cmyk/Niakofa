import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const styles = readFileSync(new URL("../community-story-visual.css", import.meta.url), "utf8");

test("Spark studio and playback retain the dark palette in light app mode", () => {
  assert.match(
    styles,
    /\.nia-story-composer,\s*\.nia-story-composer-shell,\s*\.nia-story-viewer,\s*\.nia-story-composer__canvas,\s*\.nia-story-source,\s*\.nia-story-gallery\s*\{\s*background-color:\s*#08182b;\s*color:\s*#ffffff;/,
  );
  assert.doesNotMatch(
    styles,
    /html:not\(\.dark\)[^{]*(?:nia-story-composer|nia-story-composer-shell|nia-story-viewer|nia-story-gallery)/,
  );
});