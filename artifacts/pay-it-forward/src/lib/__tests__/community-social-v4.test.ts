import { describe, test } from "node:test";
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const page = fs.readFileSync(path.join(__dirname, "../../pages/community.tsx"), "utf8");
const shell = fs.readFileSync(path.join(__dirname, "../../components/community/CommunitySocialShell.tsx"), "utf8");
const more = fs.readFileSync(path.join(__dirname, "../../components/community/CommunityMoreDirectory.tsx"), "utf8");
const feed = fs.readFileSync(path.join(__dirname, "../../components/community/HubCommunityFeedPanel.tsx"), "utf8");
const storyVisual = fs.readFileSync(path.join(__dirname, "../../components/community/CommunityStoryVisual.tsx"), "utf8");
const storyStyles = fs.readFileSync(path.join(__dirname, "../../components/community/community-story-visual.css"), "utf8");

describe("Community Social V4 view boundaries", () => {
  test("Community routes delegate primary destinations to dedicated views", () => {
    assert.match(page, /<CommunityHomeView/);
    assert.match(page, /<CommunityPeopleView/);
    assert.match(page, /<CommunityHubsView/);
    assert.match(page, /<CommunityStoriesView/);
    assert.match(page, /<CommunityRequestsView/);
  });

  test("Community keeps feed and Requests implementations behind their boundaries", () => {
    assert.doesNotMatch(page, /<HubCommunityFeedPanel/);
    assert.doesNotMatch(page, /<RequestsCenter embedded/);
    assert.match(page, /CommunityMoreDirectory/);
    assert.match(page, /CommunitySpiralsTab/);
  });

  test("focused social navigation promotes Messages and keeps systems secondary", () => {
    assert.match(shell, /key: "messages" as const, label: "Messages", icon: MessageCircle/);
    assert.match(shell, /if \(key === "messages"\) \{\s+onRoute\("\/messages"\)/);
    assert.doesNotMatch(shell, /key: "hubs" as const, label: "Hubs"/);
    for (const path of [
      "/community/hubs",
      "/community/requests",
      "/community/services",
      "/community/circles",
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

  test("legacy Community Messages path normalizes to the canonical Messages route", () => {
    assert.match(page, /if \(requestedSection === "messages"\) \{\s+setLocation\("\/messages"\)/);
    assert.match(page, /const compatibleSection = requestedSection === "spirals" \? "circles" : requestedSection/);
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

  test("Story gallery previews uploaded video files as video thumbnails", () => {
    assert.match(storyVisual, /item\.type === "video" \? \(/);
    assert.match(storyVisual, /<video src=\{item\.src\} muted playsInline preload="metadata"/);
    assert.match(storyStyles, /\.nia-story-gallery__item img, \.nia-story-gallery__item video/);
  });
});