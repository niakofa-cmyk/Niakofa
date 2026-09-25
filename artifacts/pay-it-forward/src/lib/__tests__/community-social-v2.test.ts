import { describe, test } from "node:test";
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Community Social legacy behavior coverage", () => {
  const communityFile = fs.readFileSync(
    path.join(__dirname, "../../pages/community.tsx"),
    "utf8"
  );

  const shellFile = fs.readFileSync(
    path.join(__dirname, "../../components/community/CommunitySocialShell.tsx"),
    "utf8"
  );

  const discoveryFile = fs.readFileSync(
    path.join(__dirname, "../../components/community/CommunityDiscoveryViews.tsx"),
    "utf8"
  );

  const moreFile = fs.readFileSync(
    path.join(__dirname, "../../components/community/CommunityMoreDirectory.tsx"),
    "utf8"
  );

  const appFile = fs.readFileSync(
    path.join(__dirname, "../../App.tsx"),
    "utf8"
  );

  const feedFile = fs.readFileSync(
    path.join(__dirname, "../../components/community/HubCommunityFeedPanel.tsx"),
    "utf8"
  );

  const homeViewFile = fs.readFileSync(
    path.join(__dirname, "../../components/community/CommunityHomeView.tsx"),
    "utf8"
  );

  const shellCss = fs.readFileSync(
    path.join(__dirname, "../../components/community/community-social-v4.css"),
    "utf8"
  );

  test("V4 owns the Community primary navigation and secondary menu", () => {
    assert.doesNotMatch(shellFile, /contentNavItems/);
    assert.match(shellFile, /const primaryNav =/);
    assert.match(shellCss, /grid-template-columns: repeat\(6/);
    assert.match(shellFile, /menuItems/);
    assert.match(shellFile, /onRoute\("\/profile"\)/);
    assert.match(shellFile, /key: "profile" as const/);
    assert.match(shellFile, /key: "exchange" as const/);
  });

  test("Home places compact Moments before its composer and feed", () => {
    assert.match(homeViewFile, /<HubCommunityFeedPanel/);
    assert.match(homeViewFile, /socialHomeMode/);
    assert.match(homeViewFile, /homeInterstitial={\(/);
    assert.match(homeViewFile, /<CommunityMomentsExperience[\s\S]*?compact/);
    assert.match(feedFile, /socialHomeMode && homeInterstitial/);
    assert.match(feedFile, /socialHomeMode && homeInterstitial[\s\S]*?hub-post-composer/);
  });

  test("Home composer starts as a dedicated collapsed social bar", () => {
    assert.match(feedFile, /id="hub-post-composer-trigger"/);
    assert.match(feedFile, /What's on your mind\?/);
    assert.match(feedFile, /composerExpanded &&/);
  });

  test("Community search filters real Hub feed items", () => {
    assert.match(homeViewFile, /searchQuery={searchQuery}/);
    assert.match(feedFile, /const visibleItems = useMemo/);
    assert.match(feedFile, /visibleItems\.map/);
    assert.match(feedFile, /No Hub posts, gratitude, or requests match this search/);
  });

  test("Hub feed refreshes when a connected member changes a post", () => {
    assert.match(feedFile, /hub_community_post_updated/);
    assert.match(feedFile, /handleFeedRealtime/);
  });

  test("Compact Moments remain mounted while the Hub feed loads or fails", () => {
    assert.doesNotMatch(feedFile, /if \(error\) return/);
    assert.match(feedFile, /socialHomeMode && homeInterstitial[\s\S]*?\{!feed \? \(/);
  });

  test("Creation is contextual instead of a global Community header action", () => {
    assert.doesNotMatch(shellFile, /aria-label="Create"/);
    assert.doesNotMatch(communityFile, /createSheetOpen/);
    assert.match(homeViewFile, /onOpenSparkComposer/);
  });

  test("Moments section and Home use the shared Moments experience", () => {
    assert.match(communityFile, /<CommunityMomentsView/);
    assert.match(homeViewFile, /<CommunityMomentsExperience[\s\S]*?compact/);
  });

  test("More directory does not contain fake links like /impact or /civic-resources", () => {
    assert.doesNotMatch(moreFile, /href: "\/impact"/);
    assert.doesNotMatch(moreFile, /href: "\/civic-resources"/);
  });

  test("Default Hub fetch uses /api/community/my-hub", () => {
    assert.match(communityFile, /fetch\(\`\$\{base\}\/api\/community\/my-hub\`/);
  });

  test("MediaDiscoveryView fetches media with authHeaders", () => {
    assert.match(discoveryFile, /fetch\(url, \{ headers: authHeaders\(\)/);
  });

  test("Community owns one social chrome instead of stacking global navigation", () => {
    assert.match(appFile, /hideGlobalAppNav = isMessages \|\| isDiasporaMessages \|\| isCommunitySurface \|\| isCommunityHome/);
    assert.match(appFile, /showShell && !hideGlobalAppNav && <BottomNav \/>/);
    assert.match(appFile, /showShell && !hideGlobalAppNav && <DesktopSidebar \/>/);
    assert.doesNotMatch(shellFile, /More Community destinations/);
  });
});
