import { describe, test } from "node:test";
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildMomentsSparkHref,
  hasExplicitCommunityMomentsAudience,
} from "../../components/community/CommunityExperienceContract";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "../..");
const apiRoot = path.resolve(appRoot, "../../api-server/src/routes");
const momentsMigration = fs.readFileSync(path.join(appRoot, "components/community/CommunityMomentsMigration.ts"), "utf8");
const moments = fs.readFileSync(path.join(appRoot, "components/community/CommunityMomentsExperience.tsx"), "utf8");
const momentsStyles = fs.readFileSync(path.join(appRoot, "components/community/community-moments-experience.css"), "utf8");
const studio = fs.readFileSync(path.join(appRoot, "components/community/CommunityStoryRail.tsx"), "utf8");
const studioPublish = fs.readFileSync(path.join(appRoot, "components/community/story-studio-publish.ts"), "utf8");
const uploader = fs.readFileSync(path.join(appRoot, "components/community/CommunityMomentsUploader.tsx"), "utf8");
const momentsView = fs.readFileSync(path.join(appRoot, "components/community/CommunityMomentsView.tsx"), "utf8");
const exchange = fs.readFileSync(path.join(appRoot, "components/community/CommunityExchangeSparks.tsx"), "utf8");
const communityPage = fs.readFileSync(path.join(appRoot, "pages/community.tsx"), "utf8");
const creatorMomentsPage = fs.readFileSync(path.join(appRoot, "pages/community-creator-moments.tsx"), "utf8");
const exchangeView = fs.readFileSync(path.join(appRoot, "components/community/CommunityExchangeView.tsx"), "utf8");
const exchangeComposer = fs.readFileSync(path.join(appRoot, "components/community/CommunityExchangeSparkComposer.tsx"), "utf8");
const storyShareSheet = fs.readFileSync(path.join(appRoot, "components/community/StoryShareSheet.tsx"), "utf8");
const storyRail = fs.readFileSync(path.join(appRoot, "components/community/CommunityStoryRail.tsx"), "utf8");
const hubFeed = fs.readFileSync(path.join(appRoot, "components/community/HubCommunityFeedPanel.tsx"), "utf8");
const storiesRoute = fs.readFileSync(path.join(apiRoot, "community-stories.ts"), "utf8");
const mediaRoute = fs.readFileSync(path.join(apiRoot, "media-assets-v21.ts"), "utf8");

describe("authorized Community Moments browsing feed", () => {
  test("published Sparks deep-link to their exact Moments item and preserve audience scope", () => {
    assert.equal(buildMomentsSparkHref(915, "community", null), "/community/moments?sparkId=915&audience=community");
    assert.equal(buildMomentsSparkHref(915, "hub", 41), "/community/moments?sparkId=915&hubId=41");
    assert.throws(() => buildMomentsSparkHref(0, "community", null), /valid ID/);
    assert.throws(() => buildMomentsSparkHref(915, "hub", null), /Hub ID/);
    assert.equal(hasExplicitCommunityMomentsAudience("?audience=community"), true);
    assert.equal(hasExplicitCommunityMomentsAudience("?audience=community&audience=hub"), false);
    assert.match(studio, /const publishedSparkId = await publishStudioMoment/);
    assert.match(studio, /navigate\(buildMomentsSparkHref\(publishedSparkId, audience, hubId\)\)/);
    assert.match(studio, /navigate\(buildMomentsSparkHref\(reason\.storyId, audience, hubId\)\)/);
    const pendingCatch = studio.match(/if \(reason instanceof CameraClipReelPendingError\) \{([\s\S]*?)\n      \} else \{/);
    assert.ok(pendingCatch, "camera-reel pending publishes should use the dedicated recovery path");
    assert.match(pendingCatch[1], /setComposerOpen\(false\)/);
    assert.match(communityPage, /communityMomentsAudience \? null : hubContextId \?\? defaultHubId/);
    assert.match(moments, /sparks\.findIndex\(\(spark\) => spark\.id === openSparkId\)/);
    assert.match(moments, /cardRefs\.current\.get\(index\)\?\.scrollIntoView/);
    assert.match(moments, /autoPlay muted=\{videoMuted\} playsInline controls/);
    assert.match(momentsView, /fullBleed/);
    assert.match(momentsStyles, /\.nia-moments--fullbleed\s*\{[^}]*height:\s*100dvh/s);
  });

  test("each Moment and Hub post exposes its own shareable link", () => {
    assert.match(storyShareSheet, /buildMomentsSparkHref\(storyId, audience, hubId\)/);
    assert.match(storyShareSheet, /navigator\.clipboard\.writeText\(sparkUrl\)/);
    assert.match(storyShareSheet, /navigator\.share\(\{ title: "Niakofa · Community Spark", url: sparkUrl \}\)/);
    assert.match(storyShareSheet, /data-testid="button-copy-spark-link"/);
    assert.match(moments, /storyId=\{shareSpark\.id\}/);
    assert.match(moments, /audience=\{shareSpark\.audience === "hub" \? "hub" : "community"\}/);
    assert.match(moments, /hubId=\{shareSpark\.hub_id\}/);
    assert.match(storyRail, /audience=\{selectedStory\.audience === "hub" \? "hub" : "community"\}/);
    assert.match(hubFeed, /shareUrl\.searchParams\.set\("postId", String\(postId\)\)/);
    assert.match(hubFeed, /navigator\.share/);
    assert.match(hubFeed, /navigator\.clipboard\.writeText\(url\)/);
  });

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

  test("owners can delete Moments from every collection and retain confirmation after cleanup failure", () => {
    assert.match(creatorMomentsPage, /\{owner && deleteConfirmId !== story\.id && <button/);
    assert.match(creatorMomentsPage, /data-testid=\{`button-delete-moment-\$\{story\.id\}`\}/);
    assert.match(creatorMomentsPage, />Delete Moment<\/button>/);
    assert.match(creatorMomentsPage, /\{owner && deleteConfirmId === story\.id && <div[^>]*aria-label=\{`Confirm deletion of Moment \$\{story\.id\}`\}/);
    assert.doesNotMatch(creatorMomentsPage, /owner && view === "archive" && deleteConfirmId/);
    assert.match(creatorMomentsPage, /Permanently delete this Moment and its stored media\? This cannot be undone\./);
    assert.match(creatorMomentsPage, /await deleteMoment\(story\.id\);[\s\S]*?setDeleteConfirmId\(null\);/);
    assert.match(creatorMomentsPage, /deleteError && <p[^>]*role="alert"[^>]*data-testid=\{`status-delete-moment-error-\$\{story\.id\}`\}/);
    assert.match(creatorMomentsPage, /runAction\(story\.id, async \(\) => \{[\s\S]*?\}, setDeleteError\)/);
    const actionRunner = creatorMomentsPage.match(/const runAction = async \([\s\S]*?\n  };/)?.[0];
    assert.ok(actionRunner, "collection actions should have a shared mutation handler");
    assert.match(actionRunner, /reportError\(reason instanceof Error \? reason\.message : "That Moment could not be updated\."\)/);
    assert.doesNotMatch(actionRunner, /setDeleteConfirmId/);
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
    assert.match(exchange, /Create Exchange Spark/);
    assert.match(exchange, /bg-\[#00cfff\]/);
    assert.match(exchange, /text-\[#08182b\]/);
    assert.match(exchange, /whitespace-nowrap/);
    assert.match(communityPage, /composerValues\.length === 1 && composerValues\[0\] === "1"/);
    assert.match(communityPage, /openComposerSignal=\{openMomentsComposerSignal \+ scopedSparkComposerSignal\}/);
    assert.match(momentsView, /openComposerSignal=\{openComposerSignal\}/);
    assert.match(moments, /openComposerSignal=\{openComposerSignal\}/);
    assert.match(exchangeComposer, /listExchangeSparkDrafts\(controller\.signal\)/);
    assert.match(exchangeComposer, /if \(!draftEntryVisible\) return null/);
    assert.match(exchangeComposer, /Resume saved video draft/);
    assert.match(exchangeView, /Post to Exchange/);
  });

  test("Studio mention suggestions display selected @usernames and avoid reopening after selection", () => {
    assert.match(studio, /Search by name or @username/);
    assert.match(studio, /candidate\.username \? `@\$\{candidate\.username\}` : candidate\.name/);
    assert.match(studio, /display_name: displayName, mention_user_id: candidate\.id/);
    assert.match(studio, /tool !== "mention" \|\| mentionUserId !== null/);
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