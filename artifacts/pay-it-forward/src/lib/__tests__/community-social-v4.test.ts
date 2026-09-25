import { describe, test } from "node:test";
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LEGACY_MOMENTS_ROUTE,
  LEGACY_SPIRALS_ROUTE,
  MOMENTS_ROUTE,
  normalizeCommunitySection,
  SPIRALS_ROUTE,
} from "../../components/community/CommunityMomentsMigration";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const page = fs.readFileSync(path.join(__dirname, "../../pages/community.tsx"), "utf8");
const shell = fs.readFileSync(path.join(__dirname, "../../components/community/CommunitySocialShell.tsx"), "utf8");
const moments = fs.readFileSync(path.join(__dirname, "../../components/community/CommunityMomentsView.tsx"), "utf8");
const migration = fs.readFileSync(path.join(__dirname, "../../components/community/CommunityMomentsMigration.ts"), "utf8");
const more = fs.readFileSync(path.join(__dirname, "../../components/community/CommunityMoreDirectory.tsx"), "utf8");
const feed = fs.readFileSync(path.join(__dirname, "../../components/community/HubCommunityFeedPanel.tsx"), "utf8");
const storyVisual = fs.readFileSync(path.join(__dirname, "../../components/community/CommunityStoryVisual.tsx"), "utf8");
const storyRail = fs.readFileSync(path.join(__dirname, "../../components/community/CommunityStoryRail.tsx"), "utf8");
const storyStyles = fs.readFileSync(path.join(__dirname, "../../components/community/community-story-visual.css"), "utf8");
const profile = fs.readFileSync(path.join(__dirname, "../../pages/profile.tsx"), "utf8");
const localeUtils = fs.readFileSync(path.join(__dirname, "../locale-utils.ts"), "utf8");

describe("Community Social V4 view boundaries", () => {
  test("canonical Community experience contract preserves the migration architecture", () => {
    const contract = fs.readFileSync(
      path.join(__dirname, "../../components/community/CommunityExperienceContract.ts"),
      "utf8",
    );
    assert.match(contract, /destination: "Moments"/);
    assert.match(contract, /itemSingular: "Spark"/);
    assert.match(contract, /community: "Spirals"/);
    assert.match(contract, /durableNarrative: "Stories"/);
    assert.match(contract, /preservedMemory: "Legacy"/);
    assert.match(contract, /preserveStoryApi: true/);
    assert.match(contract, /preserveAuthenticatedMedia: true/);
    assert.match(contract, /preserveDeepLinks: true/);
    assert.match(contract, /separateNiaAi: true/);
    assert.match(migration, /COMMUNITY_EXPERIENCE/);
  });

  test("Community routes delegate primary destinations to dedicated views", () => {
    assert.match(page, /<CommunityHomeView/);
    assert.match(page, /<CommunityPeopleView/);
    assert.match(page, /<CommunityExchangeView/);
    assert.match(page, /<CommunityHubsView/);
    assert.match(page, /<CommunityMomentsView/);
    assert.match(page, /<CommunityRequestsView/);
  });

  test("Community keeps feed and Requests implementations behind their boundaries", () => {
    assert.doesNotMatch(page, /<HubCommunityFeedPanel/);
    assert.doesNotMatch(page, /<RequestsCenter embedded/);
    assert.match(page, /CommunityMoreDirectory/);
    assert.match(page, /CommunitySpiralsTab/);
  });

  test("six-tab social navigation promotes Exchange and Profile, with Messages in the header", () => {
    const nav = shell.match(/const primaryNav = \[([\s\S]*?)\];/)?.[1] ?? "";
    assert.deepEqual(
      [...nav.matchAll(/label: "([^"]+)"/g)].map((match) => match[1]),
      ["Home", "Moments", "People", "Exchange", "Notifications", "Profile"],
    );
    assert.match(shell, /<button[^>]*aria-label="Open Messages"[^>]*onClick=\{\(\) => onRoute\("\/messages"\)\}/);
    assert.doesNotMatch(shell, /key: "messages" as const/);
    assert.doesNotMatch(shell, /key: "hubs" as const, label: "Hubs"/);
    assert.doesNotMatch(shell, /href: "\/community\/exchange", label: "Exchange"/);
    for (const path of [
      "/community/hubs",
      "/community/requests",
      "/community/services",
      "/community/spirals",
      "/community/media",
      "/diaspora",
      "/diaspora/family",
      "/diaspora/timeline",
    ]) {
      assert.match(shell, new RegExp(`href: "${path.replaceAll("/", "\\/")}"`));
    }
  });

  test("secondary directory excludes the focused primary destinations", () => {
    assert.match(more, /label: "Hubs"/);
    assert.match(more, /label: "Spirals"/);
    assert.match(more, /label: "Family"/);
    assert.match(more, /label: "Legacy"/);
    assert.doesNotMatch(more, /href: "\/community\/people"/);
    assert.doesNotMatch(more, /href: "\/community\/stories"/);
  });

  test("legacy short-form and circle routes normalize without dropping deep-link parameters", () => {
    assert.match(page, /if \(requestedSection === "messages"\) \{\s+setLocation\("\/messages"\)/);
    assert.equal(normalizeCommunitySection("stories"), "moments");
    assert.equal(normalizeCommunitySection("circles"), "spirals");
    assert.equal(MOMENTS_ROUTE, "/community/moments");
    assert.equal(LEGACY_MOMENTS_ROUTE, "/community/stories");
    assert.equal(SPIRALS_ROUTE, "/community/spirals");
    assert.equal(LEGACY_SPIRALS_ROUTE, "/community/circles");
    assert.match(page, /requestedSection === "stories" \|\| requestedSection === "circles"/);
    assert.match(page, /new URLSearchParams\(search\)\.toString\(\)/);
    assert.match(page, /query\.get\("sparkId"\) \?\? query\.get\("storyId"\)/);
    assert.match(moments, /openSparkId/);
  });

  test("short-form display language is Sparks inside the Moments destination", () => {
    const contract = fs.readFileSync(
      path.join(__dirname, "../../components/community/CommunityExperienceContract.ts"),
      "utf8",
    );
    assert.match(contract, /destination: "Moments"/);
    assert.match(contract, /itemSingular: "Spark"/);
    assert.match(contract, /durableNarrative: "Stories"/);
    assert.match(feed, /Create a Spark/);
    assert.match(storyVisual, /Create a Spark/);
    assert.match(storyVisual, /Post Spark/);
    assert.match(storyVisual, /aria-label="Community Moments"/);
  });

  test("Moments keeps the existing immersive viewer controls and reduced-motion support", () => {
    assert.match(storyRail, /const advanceFrame = useCallback/);
    assert.match(storyRail, /const moveToAuthor = useCallback/);
    assert.match(storyRail, /window\.addEventListener\("keydown", onKeyDown\)/);
    assert.match(storyRail, /onHoldChange=\{setStoryPaused\}/);
    assert.match(storyRail, /onSwipe=\{\(direction\) =>/);
    assert.match(storyVisual, /onPointerDown=/);
    assert.match(storyVisual, /window\.addEventListener\("pointerup", up\)/);
    assert.match(storyStyles, /prefers-reduced-motion: reduce/);
  });

  test("story API remains the compatible persistence and media boundary", () => {
    assert.match(page, /storyId/);
    assert.match(fs.readFileSync(path.join(__dirname, "../../components/community/CommunityStoryRail.tsx"), "utf8"), /\/api\/community\/stories/);
    assert.match(fs.readFileSync(path.join(__dirname, "../../lib/storyMediaPipeline.ts"), "utf8"), /validateStoryMedia/);
  });

  test("shared Community posts preserve a deep link to the conversation card", () => {
    const home = fs.readFileSync(path.join(__dirname, "../../components/community/CommunityHomeView.tsx"), "utf8");
    assert.match(page, /postId/);
    assert.match(home, /openPostId/);
    assert.match(feed, /searchParams\.set\("postId"/);
    assert.match(feed, /community-post-\$\{item\.id\}/);
  });

  test("Community feed videos use viewport-aware autoplay without bypassing authenticated media", () => {
    assert.match(feed, /IntersectionObserver/);
    assert.match(feed, /prefers-reduced-motion/);
    assert.match(feed, /video\.play\(\)/);
    assert.match(feed, /video\.pause\(\)/);
    assert.match(feed, /headers: authHeaders\(\)/);
  });

  test("authenticated profile activity fetches do not create background auth failures", () => {
    assert.match(
      profile,
      /fetch\(`\$\{base\}\/api\/requests\?requester_id=\$\{userId\}&status=completed&limit=6`,\s*\{\s*headers: authHeaders\(\),\s*\}\)/,
    );
  });

  test("IP locale fallback uses a CORS-capable provider and accepts zero coordinates", () => {
    assert.match(localeUtils, /https:\/\/ipwho\.is\//);
    assert.doesNotMatch(localeUtils, /https:\/\/ipapi\.co\//);
    assert.match(localeUtils, /Number\.isFinite\(json\.latitude\)/);
    assert.match(localeUtils, /Number\.isFinite\(json\.longitude\)/);
  });

  test("Story gallery previews uploaded video files as video thumbnails", () => {
    assert.match(storyVisual, /item\.type === "video" \? \(/);
    assert.match(storyVisual, /<video src=\{item\.src\} muted playsInline preload="metadata"/);
    assert.match(storyStyles, /\.nia-story-gallery__item img, \.nia-story-gallery__item video/);
  });
});