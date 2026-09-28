import { describe, test } from "node:test";
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const componentPath = path.resolve(__dirname, "../../components/community/CommunityExchangeSparks.tsx");
const viewer = fs.readFileSync(componentPath, "utf8");

describe("Exchange Sparks viewer reliability", () => {
  test("pauses playback when the viewer leaves the viewport or the document is hidden", () => {
    assert.match(viewer, /new IntersectionObserver\(\(\[entry\]\) => setViewerVisible\(Boolean\(entry\?\.isIntersecting\)\)/);
    assert.match(viewer, /document\.addEventListener\("visibilitychange", updatePageVisibility\)/);
    assert.match(viewer, /const shouldPlay = viewerVisible && pageVisible && activeCardVisible/);
    assert.match(viewer, /if \(!shouldPlay\) \{\s*video\.pause\(\)/);
  });

  test("starts muted and exposes an accessible sound toggle", () => {
    assert.match(viewer, /useState\(true\);\s*const \[viewerVisible/);
    assert.match(viewer, /muted=\{muted\}/);
    assert.match(viewer, /aria-label=\{muted \? "Unmute Exchange Spark" : "Mute Exchange Spark"\}/);
    assert.match(viewer, /aria-pressed=\{!muted\}/);
  });

  test("limits preview preloading to the single next Spark", () => {
    assert.match(viewer, /const nextSpark = sparks\[activeIndex \+ 1\] \?\? null/);
    assert.match(viewer, /if \(!shouldPlay \|\| !nextSpark\?\.thumbnail_url\)/);
    assert.match(viewer, /index === activeIndex \+ 1 && nextThumbnailUrl/);
    assert.doesNotMatch(viewer, /preload="auto"/);
  });

  test("aborts stale playback grants and preserves the viewer position across listing navigation", () => {
    assert.match(viewer, /const controller = new AbortController\(\);\s*setPlaybackUrl\(null\)/);
    assert.match(viewer, /signal: controller\.signal/);
    assert.match(viewer, /return \(\) => controller\.abort\(\)/);
    assert.match(viewer, /sessionStorage\.setItem\("exchange-sparks-viewer-position"/);
    assert.match(viewer, /sessionStorage\.getItem\("exchange-sparks-viewer-position"/);
    assert.match(viewer, /savePosition\(`\$\{spark\.durable \? "durable" : "legacy"\}:\$\{spark\.id\}`\); onOpenListing/);
  });

  test("keeps explicit loading, empty, retry, deleted-media, and playback-error states", () => {
    assert.match(viewer, /Loading nearby Exchange Sparks/);
    assert.match(viewer, /No nearby Exchange videos yet/);
    assert.match(viewer, /role="alert"/);
    assert.match(viewer, /This Spark video is no longer available/);
    assert.match(viewer, /Loading video…/);
    assert.match(viewer, /handlePlaybackError/);
    assert.match(viewer, /Retry video/);
  });
});