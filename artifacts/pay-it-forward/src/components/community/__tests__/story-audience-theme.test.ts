import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("portalled audience surfaces define their own surfaces and readable options", () => {
  const css = read("../community-story-visual.css");
  assert.match(css, /\.nia-story-composer,\s*\.nia-story-gallery \{\s*--nia-story-viewer:/);
  assert.ok(css.includes(".nia-story-destination-card select option"));
  assert.ok(css.includes("color-scheme:light"));
  assert.match(css, /\.nia-story-composer--destination \.nia-story-composer__details \{\s*background:var\(--spark-paper\);\s*color:var\(--spark-ink\);/);
  assert.match(css, /\.nia-story-destination-card \{ flex-wrap:\s*wrap; \}/);
  // Inherit the application's actual primary pairing instead of overriding it.
  assert.doesNotMatch(css, /--primary(?:-foreground)?:/);
});

test("Studio inherits the brand primary and keeps dark native media controls", () => {
  const css = read("../../studio/media-studio.css");
  assert.ok(css.includes("--s-primary:hsl(var(--primary))"));
  assert.ok(css.includes("--s-primary-ink:hsl(var(--primary-foreground))"));
  assert.ok(css.includes(".nk-studio__modes button.is-on { background:var(--s-primary); color:var(--s-primary-ink); }"));
  assert.ok(css.includes("background:hsl(var(--primary) / .12)"));
  assert.ok(css.includes("color-scheme: dark"));
  assert.ok(css.includes(".nk-studio__listing select option"));
  assert.doesNotMatch(css, /--primary(?:-foreground)?:/);
});
