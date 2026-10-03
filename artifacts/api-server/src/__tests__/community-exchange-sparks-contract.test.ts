import { promises as fs } from "node:fs";
import { describe, expect, it } from "@jest/globals";
import {
  canReadCommunityStoryAudience,
  canReadExchangeLinkedStory,
  isLinkedStoryVideoAssetReady,
  storyVideoStreamContentType,
} from "../lib/community-story-policy";

const storiesRoutePath = new URL("../routes/community-stories.ts", import.meta.url);
const exchangeRoutePath = new URL("../routes/community-exchange.ts", import.meta.url);
const exchangeLocationPath = new URL("../lib/exchange-location.ts", import.meta.url);
const interactionsRoutePath = new URL("../routes/community-story-interactions.ts", import.meta.url);
const linkageMigrationPath = new URL(
  "../../../../lib/db/migrations/0172_community_story_exchange_listing.sql",
  import.meta.url,
);
const cascadeMigrationPath = new URL(
  "../../../../lib/db/migrations/0173_community_story_exchange_listing_cascade.sql",
  import.meta.url,
);
const restrictMigrationPath = new URL(
  "../../../../lib/db/migrations/0174_community_story_exchange_listing_restrict.sql",
  import.meta.url,
);
const mediaUploadGuardMigrationPath = new URL(
  "../../../../lib/db/migrations/0175_media_assets_reject_deleting_story_context.sql",
  import.meta.url,
);
const storiesSchemaPath = new URL("../../../../lib/db/src/schema/community-stories.ts", import.meta.url);
const schedulerPath = new URL("../lib/scheduler.ts", import.meta.url);
const durableSparksMigrationPath = new URL(
  "../../../../lib/db/migrations/0176_durable_exchange_sparks.sql",
  import.meta.url,
);
const durableSparksSchemaPath = new URL("../../../../lib/db/src/schema/exchange-sparks.ts", import.meta.url);
const mediaCertificationStatesPath = new URL(
  "../../../../ops/build-media-certification-states.mjs",
  import.meta.url,
);
const authenticatedSparksAcceptancePath = new URL(
  "../../../../e2e/community-exchange-sparks-authenticated.spec.ts",
  import.meta.url,
);
const sparkCertificationRunnerPath = new URL(
  "../../../../ops/run-community-exchange-sparks-certification.sh",
  import.meta.url,
);

describe("Exchange Sparks authorization and discovery contract", () => {
  const visibleStory = {
    viewerUserId: 22,
    viewerCommunityId: 4,
    authorUserId: 11,
    authorCommunityId: 4,
    listingSellerId: 11,
    listingStatus: "active",
    listingModerationStatus: "approved",
    sellerApprovalStatus: "approved",
    sellerIsSuspended: false,
    audience: "community",
    blocks: [] as Array<{ blocker_id: number; blocked_id: number }>,
  };

  it("allows a visible linked Story only to its community, or its author", () => {
    expect(canReadExchangeLinkedStory(visibleStory)).toBe(true);
    expect(canReadExchangeLinkedStory({ ...visibleStory, viewerCommunityId: 5 })).toBe(false);
    expect(canReadExchangeLinkedStory({ ...visibleStory, viewerCommunityId: null })).toBe(false);
    expect(canReadExchangeLinkedStory({ ...visibleStory, authorCommunityId: null })).toBe(false);
    expect(canReadExchangeLinkedStory({
      ...visibleStory,
      viewerUserId: visibleStory.authorUserId,
      viewerCommunityId: 99,
    })).toBe(true);
  });

  it("denies access for a stale, moderated, unsafe, or blocked Exchange listing", () => {
    for (const listingStatus of ["paused", "reserved", "withdrawn", "archived"]) {
      expect(canReadExchangeLinkedStory({ ...visibleStory, listingStatus })).toBe(false);
    }
    expect(canReadExchangeLinkedStory({ ...visibleStory, listingModerationStatus: "held" })).toBe(false);
    expect(canReadExchangeLinkedStory({ ...visibleStory, listingModerationStatus: "rejected" })).toBe(false);
    expect(canReadExchangeLinkedStory({ ...visibleStory, sellerApprovalStatus: "pending" })).toBe(false);
    expect(canReadExchangeLinkedStory({ ...visibleStory, sellerIsSuspended: true })).toBe(false);
    expect(canReadExchangeLinkedStory({ ...visibleStory, listingSellerId: 999 })).toBe(false);
    expect(canReadExchangeLinkedStory({
      ...visibleStory,
      blocks: [{ blocker_id: visibleStory.viewerUserId, blocked_id: visibleStory.authorUserId }],
    })).toBe(false);
    expect(canReadExchangeLinkedStory({
      ...visibleStory,
      blocks: [{ blocker_id: visibleStory.authorUserId, blocked_id: visibleStory.viewerUserId }],
    })).toBe(false);
    expect(canReadExchangeLinkedStory({ ...visibleStory, audience: "hub" })).toBe(false);
  });

  it("matches null Community ids exactly and hides linked media until its MP4 variant is ready", () => {
    expect(canReadCommunityStoryAudience("community", null, null)).toBe(true);
    expect(canReadCommunityStoryAudience("community", null, 4)).toBe(false);
    expect(canReadCommunityStoryAudience("community", 4, null)).toBe(false);
    expect(canReadCommunityStoryAudience("community", 4, 4)).toBe(true);

    const linkedVideo = {
      linked: true,
      mediaType: "video",
      mediaAssetId: 12,
      assetStatus: "pending",
      variantKey: null,
    };
    expect(isLinkedStoryVideoAssetReady(linkedVideo)).toBe(false);
    expect(isLinkedStoryVideoAssetReady({ ...linkedVideo, assetStatus: "failed" })).toBe(false);
    expect(isLinkedStoryVideoAssetReady({ ...linkedVideo, assetStatus: "ready" })).toBe(false);
    expect(isLinkedStoryVideoAssetReady({ ...linkedVideo, assetStatus: "ready", variantKey: "variants/story.mp4" })).toBe(true);
    expect(isLinkedStoryVideoAssetReady({ ...linkedVideo, mediaAssetId: null })).toBe(true);
    expect(isLinkedStoryVideoAssetReady({ ...linkedVideo, mediaType: "photo", mediaAssetId: null })).toBe(false);
    expect(isLinkedStoryVideoAssetReady({ ...linkedVideo, linked: false })).toBe(false);
    expect(isLinkedStoryVideoAssetReady({ ...linkedVideo, linked: false, assetStatus: "ready" })).toBe(true);
    expect(isLinkedStoryVideoAssetReady({ ...linkedVideo, linked: false, mediaAssetId: null })).toBe(true);

    expect(storyVideoStreamContentType("variants/story.mp4", "video/webm")).toBe("video/mp4");
    expect(storyVideoStreamContentType(null, "video/webm")).toBe("video/webm");
  });

  it("only links owned active approved listings to one public video and expires Stories after 24 hours", async () => {
    const [route, migration, cascadeMigration, restrictMigration, uploadGuardMigration, schema] = await Promise.all([
      fs.readFile(storiesRoutePath, "utf8"),
      fs.readFile(linkageMigrationPath, "utf8"),
      fs.readFile(cascadeMigrationPath, "utf8"),
      fs.readFile(restrictMigrationPath, "utf8"),
      fs.readFile(mediaUploadGuardMigrationPath, "utf8"),
      fs.readFile(storiesSchemaPath, "utf8"),
    ]);

    expect(route).toMatch(/exchange_listing_id:\s*z\.number\(\)\.int\(\)\.positive\(\)\.optional\(\)/);
    expect(route).toMatch(/parsed\.data\.media\.length !== 1 \|\| parsed\.data\.media\[0\]\?\.media_type !== "video"/);
    expect(route).toMatch(/eq\(exchangeListingsTable\.seller_id, userId\)/);
    expect(route).toMatch(/eq\(exchangeListingsTable\.status, "active"\)/);
    expect(route).toMatch(/eq\(exchangeListingsTable\.moderation_status, "approved"\)/);
    expect(route).toMatch(/new Date\(Date\.now\(\) \+ 24 \* 60 \* 60 \* 1000\)/);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS exchange_listing_id integer/i);
    expect(cascadeMigration).toMatch(/ON DELETE CASCADE/i); // Historical migration, upgraded below.
    expect(restrictMigration).toMatch(/DROP CONSTRAINT IF EXISTS community_stories_exchange_listing_id_fkey/i);
    expect(restrictMigration).toMatch(/REFERENCES exchange_listings\(id\)[\s\S]*ON DELETE RESTRICT/i);
    expect(schema).toMatch(/exchange_listing_id: integer\("exchange_listing_id"\)\.references\(\(\) => exchangeListingsTable\.id, \{ onDelete: "restrict" \}\)/);
    expect(uploadGuardMigration).toMatch(/FOR SHARE/);
    expect(uploadGuardMigration).toMatch(/story_status = 'deletion_pending'/);
    expect(uploadGuardMigration).toMatch(/NEW\.status IS DISTINCT FROM 'processing'/);
  });

  it("applies linked Story access policy to lists, authenticated media, and interactions", async () => {
    const [storiesRoute, exchangeRoute, interactionsRoute] = await Promise.all([
      fs.readFile(storiesRoutePath, "utf8"),
      fs.readFile(exchangeRoutePath, "utf8"),
      fs.readFile(interactionsRoutePath, "utf8"),
    ]);

    expect(storiesRoute).toMatch(/linked_listing\.status = 'active'/);
    expect(storiesRoute).toMatch(/linked_listing\.moderation_status = 'approved'/);
    expect(storiesRoute).toMatch(/viewer\?\.community_id == null[\s\S]*isNull\(communityStoriesTable\.community_id\)/);
    expect(storiesRoute).toMatch(/communityStoriesTable\.community_id\} IS NOT DISTINCT FROM \$\{viewer\?\.community_id/);
    expect(storiesRoute).toMatch(/linked_asset\.status = 'ready' AND linked_asset\.variant_key IS NOT NULL/);
    expect(storiesRoute).toMatch(/isLinkedStoryVideoAssetReady\(\{/);
    expect(storiesRoute.match(/viewerCanReadRetainedStory\(req\.authenticatedUserId!, row\)/)?.length).toBe(1);
    expect(storiesRoute).toMatch(/if \(story\.author_user_id === userId && story\.archive_enabled\) return true;/);
    expect(storiesRoute).toMatch(/story\.featured_at !== null && story\.audience === "community"[\s\S]*await viewerCanReadStory\(userId, story\)/);
    expect(interactionsRoute).toMatch(/viewerCanReadStory\(userId, story\)/);
    expect(exchangeRoute).toMatch(/communityVisibility/);
    expect(exchangeRoute).toMatch(/spark_block\.blocker_id = \$\{userId\}[\s\S]*spark_block\.blocked_id = \$\{userId\}/);
  });

  it("serves protected videos with byte ranges and keeps Story deletion retryable", async () => {
    const [route, scheduler] = await Promise.all([
      fs.readFile(storiesRoutePath, "utf8"),
      fs.readFile(schedulerPath, "utf8"),
    ]);

    expect(route).toMatch(/storyVideoStreamContentType\(row\.variant_key, row\.mime_type\)/);
    expect(route).toMatch(/storyVideoStreamContentType\(media\.variant_key, media\.mime_type\)/);
    expect(route).toMatch(/Promise\.allSettled\(storageKeys\.map\(\(key\) => deleteAssetStrict\(key\)\)\)/);
    expect(route).toMatch(/STORY_MEDIA_CLEANUP_FAILED/);
    expect(route.indexOf("deleteAssetStrict(key)")).toBeLessThan(route.indexOf("db.delete(communityStoriesTable)"));
    expect(route).toMatch(/original_key: mediaAssetsTable\.original_key,[\s\S]*variant_key: mediaAssetsTable\.variant_key,[\s\S]*thumbnail_key: mediaAssetsTable\.thumbnail_key/);
    expect(route).toMatch(/eq\(mediaAssetsTable\.context_kind, "story"\),[\s\S]*eq\(mediaAssetsTable\.context_id, storyId\)/);
    expect(route).toMatch(/status: "deletion_pending"/);
    expect(route).toMatch(/mediaProcessingJobsTable\.status, \["queued", "failed"\]/);
    expect(route).toMatch(/error_code: "STORY_MEDIA_PROCESSING"/);
    expect(route).toMatch(/const universalAssets = await db\.select\(\{[\s\S]*?\.from\(mediaAssetsTable\)\.where\(and\([\s\S]*?eq\(mediaAssetsTable\.context_kind, "story"\)[\s\S]*?eq\(mediaAssetsTable\.context_id, storyId\)/);
    expect(route).toMatch(/Keep universal asset rows as short-lived tombstones/);
    expect(route).not.toMatch(/db\.delete\(mediaAssetsTable\)/);
    expect(scheduler).toMatch(/STORY_ORPHAN_MEDIA_RETENTION_MS/);
    expect(scheduler).toMatch(/status: "deletion_pending"/);
    expect(scheduler).toMatch(/mediaProcessingJobsTable\.status, \["queued", "failed"\]/);
  });

  it("locks the linked listing before locking the durable Spark for publication", async () => {
    const route = await fs.readFile(
      new URL("../routes/community-exchange-spark-drafts.ts", import.meta.url),
      "utf8",
    );
    const publishOffset = route.indexOf('"/community/exchange/sparks/drafts/:sparkId/publish"');
    const listingLockOffset = route.indexOf('.for("update")', publishOffset);
    const storyLockOffset = route.indexOf('.for("update")', listingLockOffset + 1);

    expect(publishOffset).toBeGreaterThanOrEqual(0);
    expect(listingLockOffset).toBeGreaterThan(publishOffset);
    expect(storyLockOffset).toBeGreaterThan(listingLockOffset);
    expect(route.slice(publishOffset, storyLockOffset)).toMatch(/sparkReference\.listing_id/);
  });

  it("provides bounded cursor discovery with PostGIS-backed nearby matching and same-origin media URLs", async () => {
    const [route, location] = await Promise.all([
      fs.readFile(exchangeRoutePath, "utf8"),
      fs.readFile(exchangeLocationPath, "utf8"),
    ]);

    expect(route).toMatch(/EXCHANGE_SPARK_MAX_PAGE_SIZE = 40/);
    expect(route).toMatch(/router\.get\("\/community\/exchange\/sparks"/);
    expect(route).toMatch(/exchangeNearbyCondition\(/);
    expect(route).toMatch(/await exchangeSpatialIndexReady\(\)/);
    expect(location).toMatch(/exchangeListingsTable\.geog/);
    expect(location).toMatch(/ST_DWithin/);
    expect(location).toMatch(/\$\{radiusMiles \* 1609\.344\}/);
    expect(location).toMatch(/3958\.8 \* 2 \* ASIN\(SQRT/);
    expect(route).toMatch(/locationCondition = sql`FALSE`/);
    expect(route).toMatch(/media_url: `\/api\/media-assets\/\$\{row\.media_asset_id\}`/);
    expect(route).toMatch(/thumbnail_url: row\.thumbnail_key[\s\S]*\/api\/media-assets\/\$\{row\.media_asset_id\}\/thumbnail/);
    expect(route).toMatch(/listingId: row\.listing_id,[\s\S]*sparkId: row\.source === "durable" \? row\.id : null/);
    expect(route).toMatch(/durable: row\.source === "durable"/);
    expect(route).toMatch(/legacyRows = await db\.select/);
    expect(route).toMatch(/communityStoriesTable\.expires_at} > NOW\(\)/);
    expect(route).toMatch(/encodeSparkCursor/);
    expect(route).toMatch(/next_cursor: hasMore/);
  });

  it("exposes durable Sparks and legacy Stories only while their linked listing is active and approved", async () => {
    const route = await fs.readFile(exchangeRoutePath, "utf8");
    const durableFeed = route.slice(route.indexOf("const durableRows ="), route.indexOf("// Old listing-linked Stories"));
    const legacyFeed = route.slice(route.indexOf("const legacyRows ="), route.indexOf("const items ="));

    for (const query of [durableFeed, legacyFeed]) {
      expect(query).toMatch(/eq\(exchangeListingsTable\.status, "active"\)/);
      expect(query).toMatch(/eq\(exchangeListingsTable\.moderation_status, "approved"\)/);
      expect(query).toMatch(/eq\(exchangeListingsTable\.seller_id,/);
      expect(query).toMatch(/eq\(usersTable\.approval_status, "approved"\)/);
      expect(query).toMatch(/eq\(usersTable\.is_suspended, false\)/);
    }

    expect(legacyFeed).toMatch(/communityStoriesTable\.expires_at\} > NOW\(\)/);
    expect(legacyFeed).toMatch(/expires_at: communityStoriesTable\.expires_at/);
    expect(route).toMatch(/expires_at: row\.expires_at\.toISOString\(\)/);
    expect(legacyFeed).not.toMatch(/communityStoriesTable\.status, "draft"/);
  });

  it("keeps durable Sparks separate from expiring Stories and retries media deletion", async () => {
    const [migration, schema, scheduler, usersRoute, mediaRoute] = await Promise.all([
      fs.readFile(durableSparksMigrationPath, "utf8"),
      fs.readFile(durableSparksSchemaPath, "utf8"),
      fs.readFile(schedulerPath, "utf8"),
      fs.readFile(new URL("../routes/users.ts", import.meta.url), "utf8"),
      fs.readFile(new URL("../routes/media-assets-v21.ts", import.meta.url), "utf8"),
    ]);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS exchange_sparks/);
    expect(migration).toMatch(/listing_id integer NOT NULL REFERENCES exchange_listings\(id\) ON DELETE CASCADE/);
    expect(schema).toMatch(/exchangeSparksTable = pgTable\("exchange_sparks"/);
    expect(schema).not.toMatch(/^\s*expires_at:/m);
    expect(mediaRoute).toMatch(/contextKind === "exchange_spark"/);
    expect(scheduler).toMatch(/exchange_sparks WHERE exchange_sparks\.id/);
    expect(scheduler).toMatch(/Exchange Spark cleanup: storage\/database cleanup will retry/);
    expect(usersRoute).toMatch(/update\(exchangeSparksTable\)\.set\(\{[\s\S]*status: "deletion_pending"/);
  });

  it("requires both production Spark test accounts to have distinct assigned communities", async () => {
    const [stateBuilder, acceptanceSpec] = await Promise.all([
      fs.readFile(mediaCertificationStatesPath, "utf8"),
      fs.readFile(authenticatedSparksAcceptancePath, "utf8"),
    ]);

    expect(stateBuilder).toMatch(/if \(communityId === null\) \{\s*throw new Error\(`account \$\{label\} must have an assigned community identity\.`\);/);
    expect(acceptanceSpec).toMatch(/ownerHasAssignedCommunity[\s\S]*?USER_A must belong to an assigned community/);
    expect(acceptanceSpec).toMatch(/viewerHasAssignedCommunity[\s\S]*?USER_B must belong to an assigned community/);
    expect(acceptanceSpec).toMatch(/owner\.communityId,[\s\S]*?USER_A and USER_B must belong to different communities\.[\s\S]*?not\.toBe\(viewer\.communityId\)/);
  });

  it("accepts private Spark recovery directories outside the checkout", async () => {
    const runner = await fs.readFile(sparkCertificationRunnerPath, "utf8");
    expect(runner).toMatch(/const isOutsideCheckout =[\s\S]*?relative === "\.\."\s*\|\|\s*relative\.startsWith\(`\.\.\$\{path\.sep\}`\)\s*\|\|\s*path\.isAbsolute\(relative\);[\s\S]*?if \(!isOutsideCheckout\) process\.exit\(1\);/);
  });
});