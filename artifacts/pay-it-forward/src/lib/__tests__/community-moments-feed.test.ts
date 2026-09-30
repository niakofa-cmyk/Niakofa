import { describe, test } from "node:test";
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "../..");
const apiRoot = path.resolve(appRoot, "../../api-server/src/routes");
const momentsMigration = fs.readFileSync(path.join(appRoot, "components/community/CommunityMomentsMigration.ts"), "utf8");
const moments = fs.readFileSync(path.join(appRoot, "components/community/CommunityMomentsExperience.tsx"), "utf8");
const studio = fs.readFileSync(path.join(appRoot, "components/community/CommunityStoryRail.tsx"), "utf8");
const studioPublish = fs.readFileSync(path.join(appRoot, "components/community/story-studio-publish.ts"), "utf8");
const uploader = fs.readFileSync(path.join(appRoot, "components/community/CommunityMomentsUploader.tsx"), "utf8");
const momentsView = fs.readFileSync(path.join(appRoot, "components/community/CommunityMomentsView.tsx"), "utf8");
const exchange = fs.readFileSync(path.join(appRoot, "components/community/CommunityExchangeSparks.tsx"), "utf8");
const communityPage = fs.readFileSync(path.join(appRoot, "pages/community.tsx"), "utf8");
const exchangeView = fs.readFileSync(path.join(appRoot, "components/community/CommunityExchangeView.tsx"), "utf8");
const exchangeComposer = fs.readFileSync(path.join(appRoot, "components/community/CommunityExchangeSparkComposer.tsx"), "utf8");
const storiesRoute = fs.readFileSync(path.join(apiRoot, "community-stories.ts"), "utf8");
const mediaRoute = fs.readFileSync(path.join(apiRoot, "media-assets-v21.ts"), "utf8");

describe("authorized Community Moments browsing feed", () => {
  test("Community and Hub contexts use the authenticated Sparks endpoint and cursor pagination", () => {
    assert.match(moments, /hubId !== null\) query\.set\("hubId", String\(hubId\)\)/);
    assert.match(moments, /new URLSearchParams\(\{ limit: String\(MOMENTS_PAGE_SIZE\) \}\)/);
    assert.match(moments, /query\.set\("cursor", cursor\)/);
    assert.match(moments, /headers: authHeaders\(\)/);
    assert.match(moments, /button-load-more-moments/);
    assert.match(storiesRoute, /router\.get\("\/community\/stories", requireAuth, requireApproved/);
    assert.match(storiesRoute, /requestedLimit \+ 1/);
    assert.match(storiesRoute, /next_cursor:/);
    assert.match(storiesRoute, /lt\(communityStoriesTable\.created_at, cursor\.createdAt\)/);
    assert.match(storiesRoute, /approvedHubMember\(userId, requestedHubId\)/);
    assert.match(storiesRoute, /inArray\(communityStoriesTable\.hub_id, approvedHubIds\)/);
  });

  test("feed offers accessible vertical browsing and loading, empty, and retry states", () => {
    assert.match(moments, /role="feed"/);
    assert.match(moments, /snap-y snap-mandatory/);
    assert.match(moments, /aria-posinset=\{index \+ 1\}/);
    assert.match(moments, /status-loading-moments/);
    assert.match(moments, /status-empty-moments/);
    assert.match(moments, /role="alert"/);
    assert.match(moments, /button-previous-spark/);
    assert.match(moments, /button-next-spark/);
    assert.match(moments, /openSparkId/);
    assert.match(momentsView, /hub_id: hubId/);
  });

  test("active media is authorized and only fetched for the current Spark", () => {
    assert.match(moments, /if \(!activeMedia \|\| !playbackAllowed\)/);
    assert.match(moments, /playback-grant/);
    assert.match(moments, /method: "POST"/);
    assert.match(moments, /credentials: "same-origin"/);
    assert.match(moments, /reference\.origin !== window\.location\.origin/);
    assert.match(moments, /playback\.origin !== window\.location\.origin/);
    assert.match(moments, /URL\.revokeObjectURL/);
    assert.match(moments, /muted=\{videoMuted\} playsInline controls/);
    assert.match(moments, /Turn Spark sound on/);
    assert.match(moments, /<track kind="captions"/);
    assert.match(moments, /media\.alt_text/);
  });

  test("camera reel feed treats the derivative as one frame and preserves original accessibility metadata", () => {
    assert.match(moments, /moment_video\?:/);
    assert.match(moments, /activeSpark\?\.moment_video && activeMomentVideoState\?\.status === "ready"/);
    assert.match(moments, /moment-composition\/playback-grant/);
    assert.match(moments, /moment-composition\/play/);
    assert.match(moments, /validateMomentCompositionPlaybackUrl\(grant\.playback_url/);
    assert.doesNotMatch(moments, /fetch\(playback\.pathname/);
    assert.match(moments, /spark\.moment_video && activeMomentVideoState\?\.status !== "ready"/);
    assert.match(moments, /!showReel && spark\.media\.length > 1/);
    assert.match(moments, /Original clip descriptions and captions/);
    assert.match(studio, /story\.moment_video\?\.status === "ready"/);
    assert.match(studio, /validateMomentCompositionPlaybackUrl\(grant\.playback_url/);
    assert.doesNotMatch(studio, /playbackResponse\.blob\(\)/);
    assert.match(studio, /button-retry-camera-reel/);
  });

  test("Moments discovery sends search, tag and author filters to the authenticated feed endpoint", () => {
    assert.match(moments, /query\.set\("search", filters\.search\)/);
    assert.match(moments, /query\.set\("tag", filters\.tag\)/);
    assert.match(moments, /query\.set\("authorId", filters\.authorId\)/);
    assert.match(moments, /aria-label="Discover Moments"/);
    assert.match(storiesRoute, /hasDiscoveryFilter \? isNull\(communityStoriesTable\.exchange_listing_id\)/);
    assert.match(storiesRoute, /escapeMomentSearchTerm\(search\)/);
  });

  test("Moments uses persisted composition elements and renders text-only Story backgrounds", () => {
    assert.match(moments, /composition_manifest\?:/);
    assert.match(moments, /composition_manifest\?\.elements/);
    assert.match(moments, /activeSpark\?\.elements/);
    assert.match(moments, /<StoryElementLayer elements=\{visualElements\} \/>/);
    assert.match(moments, /backgroundColor \? \{ backgroundColor \}/);
    assert.match(moments, /StoryElementLayer, storyEffectFilter/);
  });

  test("text-only Moments show the standalone caption only without a persisted caption overlay", () => {
    assert.match(moments, /function hasCaptionOverlay\(spark: MomentSpark\)/);
    assert.match(moments, /spark\.caption && !hasCaptionOverlay\(spark\)/);
    assert.match(moments, /spark\.caption && media &&/);
  });

  test("Moments cancels active playback grants and pauses media when hidden or offscreen", () => {
    assert.match(moments, /playbackAllowed = feedInViewport && documentVisible/);
    assert.match(moments, /document\.addEventListener\("visibilitychange"/);
    assert.match(moments, /new IntersectionObserver\(\(\[entry\]\)/);
    assert.match(moments, /if \(!activeMedia \|\| !playbackAllowed\)/);
    assert.match(moments, /\[activeMedia, activeMomentVideoState\?\.status, activeSpark\?\.id, flushCurrentWatchContribution, mediaRetry, playbackAllowed\]/);
    assert.match(moments, /controller\.abort\(\)/);
    assert.match(moments, /video\.pause\(\)/);
    assert.match(moments, /moreControllerRef\.current\?\.abort\(\)/);
  });

  test("every attachment on a multi-media Moment can be browsed", () => {
    assert.match(moments, /activeSpark\?\.media\[Math\.min\(activeMediaIndex/);
    assert.match(moments, /spark\.media\.length > 1/);
    assert.match(moments, /button-moment-media-previous-/);
    assert.match(moments, /button-moment-media-next-/);
    assert.match(moments, /itemIndex \+ 1\} of \{spark\.media\.length/);
  });

  test("Exchange Sparks retains its own accessible mobile browse feed", () => {
    assert.match(exchange, /role="feed"/);
    assert.match(exchange, /overscroll-contain/);
    assert.match(exchange, /button-load-more-exchange-sparks/);
    assert.match(exchange, /button-previous-exchange-spark/);
  });

  test("Exchange creation defaults to the unified Studio and keeps legacy draft recovery available", () => {
    assert.match(exchange, /href="\/community\/moments\?composer=1"/);
    assert.match(exchange, /Create in Studio/);
    assert.match(communityPage, /composerValues\.length === 1 && composerValues\[0\] === "1"/);
    assert.match(communityPage, /openComposerSignal=\{openMomentsComposerSignal \+ scopedSparkComposerSignal\}/);
    assert.match(momentsView, /openComposerSignal=\{openComposerSignal\}/);
    assert.match(moments, /openComposerSignal=\{openComposerSignal\}/);
    assert.match(exchangeComposer, /listExchangeSparkDrafts\(controller\.signal\)/);
    assert.match(exchangeComposer, /if \(!draftEntryVisible\) return null/);
    assert.match(exchangeComposer, /Resume saved video draft/);
    assert.match(exchangeView, /Post to Exchange/);
  });

  test("Create a Spark uses a tab-scoped signal and clears one-shot composer links on close", () => {
    assert.match(communityPage, /if \(normalizedSection === "home" \|\| normalizedSection === "moments"\)/);
    assert.match(communityPage, /setSparkComposerSection\(normalizedSection\)/);
    assert.match(communityPage, /sparkComposerSection === normalizedSection \? sparkComposerSignal : 0/);
    assert.match(communityPage, /useEffect\(\(\) => \{\s*setSparkComposerSignal\(0\);\s*\}, \[normalizedSection\]\)/);
    assert.match(studio, /location === "\/community\/moments"[\s\S]*query\.getAll\("composer"\)\.length === 1/);
    assert.match(studio, /query\.delete\("composer"\)/);
  });

  test("Studio publishes processed staged assets while preserving the legacy uploader export", () => {
    assert.match(momentsMigration, /export \{ CommunityMomentsUploader \}/);
    assert.match(moments, /<CommunityStoryRail/);
    assert.doesNotMatch(moments, /<CommunityMomentsUploader/);
    assert.match(studio, /publishStudioMoment\(/);
    assert.match(studioPublish, /moment-media-status/);
    assert.match(studioPublish, /asset\.status === "ready"/);
    assert.match(studioPublish, /media_asset_ids: ids/);
    assert.match(studioPublish, /"hub_moment" : "community_moment"/);
    assert.match(uploader, /mediaAccessibility: mediaAssetIds\.flatMap/);
    assert.match(mediaRoute, /if \(contextKind === "community_moment" \|\| contextKind === "hub_moment"\) return false/);
  });

  test("Stories atomically associates only ready, owned, context-matching staged assets", () => {
    assert.match(storiesRoute, /media_asset_ids: z\.array/);
    assert.match(storiesRoute, /eq\(mediaAssetsTable\.owner_user_id, userId\)/);
    assert.match(storiesRoute, /eq\(mediaAssetsTable\.context_kind, stagedContextKind\)/);
    assert.match(storiesRoute, /asset\.status !== "ready"/);
    assert.match(storiesRoute, /media_asset_id: asset\.id/);
    assert.match(storiesRoute, /context_kind: "story"/);
    assert.match(storiesRoute, /MOMENT_MEDIA_NOT_READY/);
    assert.match(mediaRoute, /contextId === userId && await isApprovedUser\(userId\)/);
    assert.match(mediaRoute, /if \(contextKind === "community_moment" \|\| contextKind === "hub_moment"\) return false/);
  });
});