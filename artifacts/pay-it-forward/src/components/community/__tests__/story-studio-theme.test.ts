import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const styles = readFileSync(new URL("../community-story-visual.css", import.meta.url), "utf8");

test("Spark audience uses brand actions while playback keeps its dark surface", () => {
  assert.match(
    styles,
    /\.nia-story-composer,\s*\.nia-story-gallery\s*\{[^}]*--nia-story-viewer:\s*#08182b;[^}]*--nia-story-surface:\s*#0f243b;[^}]*--nia-story-surface-raised:\s*#1a334e;/,
  );
  assert.match(styles, /\.nia-story-viewer\s*\{[^}]*background:var\(--nia-story-viewer\)/);
  assert.match(styles, /\.nia-story-composer \.nia-story-publish:focus-visible\s*\{[^}]*background:\s*hsl\(var\(--primary\)\);[^}]*color:\s*hsl\(var\(--primary-foreground\)\);/);
  assert.doesNotMatch(
    styles,
    /html:not\(\.dark\)[^{]*(?:nia-story-composer|nia-story-composer-shell|nia-story-viewer|nia-story-gallery)/,
  );
});