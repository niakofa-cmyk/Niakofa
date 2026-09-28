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
const uploader = fs.readFileSync(path.join(appRoot, "components/community/CommunityMomentsUploader.tsx"), "utf8");
const momentsView = fs.readFileSync(path.join(appRoot, "components/community/CommunityMomentsView.tsx"), "utf8");
const exchange = fs.readFileSync(path.join(appRoot, "components/community/CommunityExchangeSparks.tsx"), "utf8");
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
    assert.match(moments, /if \(!activeMedia\)/);
    assert.match(moments, /playback-grant/);
    assert.match(moments, /method: "POST"/);
    assert.match(moments, /credentials: "same-origin"/);
    assert.match(moments, /reference\.origin !== window\.location\.origin/);
    assert.match(moments, /playback\.origin !== window\.location\.origin/);
    assert.match(moments, /URL\.revokeObjectURL/);
    assert.match(moments, /muted playsInline controls/);
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

  test("exported Moments uploader waits for processing and posts asset ids to the Stories API", () => {
    assert.match(momentsMigration, /export \{ CommunityMomentsUploader \}/);
    assert.match(moments, /CommunityMomentsUploader/);
    assert.match(moments, /onComplete=\{publishMoment\}/);
    assert.match(moments, /moment-media-status/);
    assert.match(moments, /asset\.status === "ready"/);
    assert.match(moments, /media_asset_ids: mediaAssetIds/);
    assert.match(moments, /contextKind=\{hubId === null \? "community_moment" : "hub_moment"\}/);
    assert.match(uploader, /onComplete\(\{ caption: caption\.trim\(\), mediaAssetIds \}\)/);
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