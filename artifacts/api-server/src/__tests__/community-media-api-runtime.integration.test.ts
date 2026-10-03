import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { pool } from "@workspace/db";
import { parseAuth, signTokenById } from "../middlewares/auth";
import communityExchangeRouter from "../routes/community-exchange";
import communityHubFeedRouter from "../routes/community-hub-feed";
import communityStoriesRouter from "../routes/community-stories";
import familyRouter from "../routes/family";
import gratitudeRouter from "../routes/gratitude";
import griotRouter from "../routes/griot";
import mediaAssetsRouter from "../routes/media-assets-v21";

const integrationEnabled = process.env.COMMUNITY_MEDIA_API_RUNTIME_TEST === "1";
const suite = integrationEnabled ? describe : describe.skip;

suite("isolated cross-community content and media access matrix", () => {
  const app = express();
  app.use(express.json());
  app.use(parseAuth);
  app.use(communityStoriesRouter);
  app.use(communityExchangeRouter);
  app.use(communityHubFeedRouter);
  app.use(gratitudeRouter);
  app.use(griotRouter);
  app.use(mediaAssetsRouter);
  app.use(familyRouter);

  let authorId: number | undefined;
  let readerId: number | undefined;
  let authorCommunityId: number | undefined;
  let readerCommunityId: number | undefined;
  let authorHubId: number | undefined;
  let readerHubId: number | undefined;
  let authorHubName = "";
  let readerHubName = "";
  let communityStoryId: number | undefined;
  let familyId: number | undefined;
  let exchangeListingId: number | undefined;
  let sparkId: number | undefined;
  let hubPostId: number | undefined;
  let hubCommunityMediaId: number | undefined;
  let gratitudePostId: number | undefined;
  const griotStoryIds: number[] = [];
  const mediaAssetIds: number[] = [];
  let authorToken = "";
  let readerToken = "";
  const originalMediaPlatformFlag = process.env.MEDIA_PLATFORM_V21;

  async function withMediaPlatformEnabled<T>(work: () => Promise<T>): Promise<T> {
    const previous = process.env.MEDIA_PLATFORM_V21;
    process.env.MEDIA_PLATFORM_V21 = "1";
    try {
      return await work();
    } finally {
      if (previous === undefined) delete process.env.MEDIA_PLATFORM_V21;
      else process.env.MEDIA_PLATFORM_V21 = previous;
    }
  }

  async function cleanup(): Promise<void> {
    const errors: unknown[] = [];
    const attempt = async (sql: string, values: unknown[]) => {
      try {
        await pool.query(sql, values);
      } catch (error) {
        errors.push(error);
      }
    };

    for (const mediaAssetId of mediaAssetIds) {
      await attempt("DELETE FROM media_assets WHERE id = $1", [mediaAssetId]);
    }
    if (griotStoryIds.length) {
      await attempt("DELETE FROM griot_stories WHERE id = ANY($1::integer[])", [griotStoryIds]);
    }
    if (gratitudePostId) {
      await attempt("DELETE FROM gratitude_posts WHERE id = $1", [gratitudePostId]);
    }
    if (hubPostId) {
      await attempt("DELETE FROM hub_community_posts WHERE id = $1", [hubPostId]);
    }
    const hubIds = [authorHubId, readerHubId].filter((id): id is number => id !== undefined);
    if (hubIds.length) {
      await attempt("DELETE FROM hub_memberships WHERE hub_id = ANY($1::integer[])", [hubIds]);
      await attempt("DELETE FROM diaspora_hubs WHERE id = ANY($1::integer[])", [hubIds]);
    }
    if (sparkId) {
      await attempt("DELETE FROM exchange_sparks WHERE id = $1", [sparkId]);
    }
    if (exchangeListingId) {
      await attempt("DELETE FROM exchange_listings WHERE id = $1", [exchangeListingId]);
    }
    if (familyId) {
      await attempt("DELETE FROM families WHERE id = $1", [familyId]);
    }
    if (communityStoryId) {
      await attempt("DELETE FROM community_stories WHERE id = $1", [communityStoryId]);
    }
    const userIds = [authorId, readerId].filter((id): id is number => id !== undefined);
    if (userIds.length) {
      await attempt("DELETE FROM users WHERE id = ANY($1::integer[])", [userIds]);
    }
    const communityIds = [authorCommunityId, readerCommunityId]
      .filter((id): id is number => id !== undefined);
    if (communityIds.length) {
      await attempt("DELETE FROM communities WHERE id = ANY($1::integer[])", [communityIds]);
    }
    if (errors.length) {
      throw new Error(`Isolated API regression fixture cleanup failed (${errors.length} scoped cleanup operation(s)).`);
    }
  }

  beforeAll(async () => {
    expect(process.env.NODE_ENV).toBe("test");
    const { rows: databaseRows } = await pool.query<{ database_name: string }>(
      "SELECT current_database() AS database_name",
    );
    // Requiring both an explicit opt-in and a recognizable dev/test database
    // prevents accidentally running destructive fixture cleanup on production.
    expect(databaseRows[0]?.database_name).toMatch(/(^|[-_])(dev|test)([-_]|$)/i);

    const requiredMigrations = [
      "0052_griot_stories.sql",
      "0053_griot_gratitude_diaspora.sql",
      "0139_diaspora_hub_geography_invariants.sql",
      "0141_hub_memberships.sql",
      "0145_hub_community_and_completion_retries.sql",
      "0150_community_stories.sql",
      "0155_media_assets.sql",
      "0158_community_media_saves.sql",
      "0176_durable_exchange_sparks.sql",
      "0186_family_story_experience.sql",
    ];
    const { rows: migrationRows } = await pool.query<{ filename: string }>(
      "SELECT filename FROM _migrations_applied WHERE filename = ANY($1::text[])",
      [requiredMigrations],
    );
    expect(new Set(migrationRows.map((row) => row.filename))).toEqual(new Set(requiredMigrations));

    const { rows: requiredColumns } = await pool.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND (table_name, column_name) IN (
           ('users', 'community_id'),
            ('users', 'diaspora_hub_id'),
            ('diaspora_hubs', 'status'),
            ('diaspora_hubs', 'primary_hub_id'),
            ('diaspora_hubs', 'country_code'),
            ('diaspora_hubs', 'hub_scope'),
            ('diaspora_hubs', 'community_id'),
            ('hub_memberships', 'status'),
            ('hub_memberships', 'approved_at'),
            ('hub_community_posts', 'moderation_status'),
            ('hub_community_post_media', 'media_asset_id'),
            ('gratitude_posts', 'moderation_status'),
            ('griot_stories', 'visibility'),
            ('griot_stories', 'hub_id'),
            ('griot_stories', 'community_id'),
           ('community_stories', 'audience'),
           ('community_stories', 'community_id'),
           ('exchange_sparks', 'community_id'),
           ('media_assets', 'context_kind'),
            ('media_assets', 'status'),
           ('family_stories', 'author_id'),
           ('family_stories', 'audience'),
           ('family_members', 'status')
         )`,
    );
    expect(new Set(requiredColumns.map((row) => `${row.table_name}.${row.column_name}`))).toEqual(
      new Set([
        "users.community_id",
        "users.diaspora_hub_id",
        "diaspora_hubs.status",
        "diaspora_hubs.primary_hub_id",
        "diaspora_hubs.country_code",
        "diaspora_hubs.hub_scope",
        "diaspora_hubs.community_id",
        "hub_memberships.status",
        "hub_memberships.approved_at",
        "hub_community_posts.moderation_status",
        "hub_community_post_media.media_asset_id",
        "gratitude_posts.moderation_status",
        "griot_stories.visibility",
        "griot_stories.hub_id",
        "griot_stories.community_id",
        "community_stories.audience",
        "community_stories.community_id",
        "exchange_sparks.community_id",
        "media_assets.context_kind",
        "media_assets.status",
        "family_stories.author_id",
        "family_stories.audience",
        "family_members.status",
      ]),
    );

    const unique = randomUUID();
    const { rows: authorCommunities } = await pool.query<{ id: number }>(
      "INSERT INTO communities (name) VALUES ($1) RETURNING id",
      [`Runtime fixture neighborhood author ${unique}`],
    );
    authorCommunityId = authorCommunities[0].id;
    const { rows: readerCommunities } = await pool.query<{ id: number }>(
      "INSERT INTO communities (name) VALUES ($1) RETURNING id",
      [`Runtime fixture neighborhood reader ${unique}`],
    );
    readerCommunityId = readerCommunities[0].id;
    expect(readerCommunityId).not.toBe(authorCommunityId);

    const { rows: authorRows } = await pool.query<{ id: number }>(
      `INSERT INTO users (name, email, approval_status, community_id)
       VALUES ('Isolated API Story Author', $1, 'approved', $2) RETURNING id`,
      [`community-api-author-${unique}@test.invalid`, authorCommunityId],
    );
    authorId = authorRows[0].id;
    const { rows: readerRows } = await pool.query<{ id: number }>(
      `INSERT INTO users (name, email, approval_status, community_id)
       VALUES ('Isolated API Story Reader', $1, 'approved', $2) RETURNING id`,
      [`community-api-reader-${unique}@test.invalid`, readerCommunityId],
    );
    readerId = readerRows[0].id;
    authorToken = signTokenById(authorId, 0);
    readerToken = signTokenById(readerId, 0);

    const candidateCountryCodes = ["XQ", "XR", "XS", "XT", "XU", "XV", "XW", "XX", "XY", "XZ"];
    const { rows: occupiedCodes } = await pool.query<{ country_code: string }>(
      `SELECT country_code FROM diaspora_hubs
       WHERE status = 'approved' AND primary_hub_id IS NULL AND hub_scope = 'country'
         AND country_code = ANY($1::text[])`,
      [candidateCountryCodes],
    );
    const occupied = new Set(occupiedCodes.map((row) => row.country_code));
    const availableCodes = candidateCountryCodes.filter((code) => !occupied.has(code));
    expect(availableCodes.length).toBeGreaterThanOrEqual(2);

    authorHubName = `Runtime fixture author Hub ${unique}`;
    const { rows: authorHubs } = await pool.query<{ id: number }>(
      `INSERT INTO diaspora_hubs
         (name, display_name, region_label, lat, lng, tag, hub_scope, country_code, community_id, status)
       VALUES ($1, $1, $2, 0, 0, 'country', 'country', $3, $4, 'approved')
       RETURNING id`,
      [authorHubName, `Runtime fixture region ${unique}`, availableCodes[0], authorCommunityId],
    );
    authorHubId = authorHubs[0].id;
    readerHubName = `Runtime fixture reader Hub ${unique}`;
    const { rows: readerHubs } = await pool.query<{ id: number }>(
      `INSERT INTO diaspora_hubs
         (name, display_name, region_label, lat, lng, tag, hub_scope, country_code, community_id, status)
       VALUES ($1, $1, $2, 0, 0, 'country', 'country', $3, $4, 'approved')
       RETURNING id`,
      [
        readerHubName,
        `Runtime fixture reader region ${unique}`,
        availableCodes[1],
        readerCommunityId,
      ],
    );
    readerHubId = readerHubs[0].id;
    await pool.query("UPDATE users SET diaspora_hub_id = $1 WHERE id = $2", [authorHubId, authorId]);
    await pool.query("UPDATE users SET diaspora_hub_id = $1 WHERE id = $2", [readerHubId, readerId]);
    await pool.query(
      `INSERT INTO hub_memberships (hub_id, user_id, status, role, requested_at, approved_at)
       VALUES ($1, $2, 'approved', 'member', NOW(), NOW())
       ON CONFLICT (user_id, hub_id) DO UPDATE
       SET status = 'approved', role = 'member', approved_at = NOW(), updated_at = NOW()`,
      [authorHubId, authorId],
    );
  });

  afterAll(async () => {
    try {
      await cleanup();
    } finally {
      if (originalMediaPlatformFlag === undefined) delete process.env.MEDIA_PLATFORM_V21;
      else process.env.MEDIA_PLATFORM_V21 = originalMediaPlatformFlag;
      await pool.end();
    }
  });

  it("preserves community, Hub, Diaspora, staging, Spark, and family visibility boundaries", async () => {
    const createdStory = await request(app)
      .post("/community/stories")
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ caption: "Isolated community visibility fixture", audience: "community" });
    expect(createdStory.status).toBe(201);
    communityStoryId = createdStory.body.story.id;
    expect(createdStory.body.story).toMatchObject({ id: communityStoryId });

    const authorFeed = await request(app)
      .get("/community/stories")
      .set("Authorization", `Bearer ${authorToken}`);
    expect(authorFeed.status).toBe(200);
    expect(authorFeed.body.stories.some((story: { id: number }) => story.id === communityStoryId)).toBe(true);

    const readerFeed = await request(app)
      .get("/community/stories")
      .set("Authorization", `Bearer ${readerToken}`);
    expect(readerFeed.status).toBe(200);
    expect(readerFeed.body.stories.some((story: { id: number }) => story.id === communityStoryId)).toBe(false);

    // This fixture has only metadata and a non-existent storage key: the API
    // authorization check must reject the other community's reader before any
    // object-store read, and this harness never writes media bytes externally.
    const { rows: assets } = await pool.query<{ id: number }>(
      `INSERT INTO media_assets
         (owner_user_id, context_kind, context_id, media_type, mime_type, original_key, byte_size)
       VALUES ($1, 'story', $2, 'photo', 'image/jpeg', $3, 1)
       RETURNING id`,
      [authorId, communityStoryId, `runtime-fixture/no-object/${randomUUID()}.jpg`],
    );
    mediaAssetIds.push(assets[0].id);
    const forbiddenMediaRead = await withMediaPlatformEnabled(() => request(app)
      .get(`/media-assets/${assets[0].id}`)
      .set("Authorization", `Bearer ${readerToken}`));
    expect(forbiddenMediaRead.status).toBe(404);
    const ownerStoryMedia = await withMediaPlatformEnabled(() => request(app)
      .get(`/media-assets/shared?contextKind=story&contextId=${communityStoryId}`)
      .set("Authorization", `Bearer ${authorToken}`));
    expect(ownerStoryMedia.status).toBe(200);
    const readerStoryMedia = await withMediaPlatformEnabled(() => request(app)
      .get(`/media-assets/shared?contextKind=story&contextId=${communityStoryId}`)
      .set("Authorization", `Bearer ${readerToken}`));
    expect(readerStoryMedia.status).toBe(404);
    const forbiddenMediaUpload = await withMediaPlatformEnabled(() => request(app)
      .post("/media-assets/uploads")
      .set("Authorization", `Bearer ${readerToken}`)
      .send({
        contextKind: "story",
        contextId: communityStoryId,
        mediaType: "photo",
        mimeType: "image/jpeg",
        byteSize: 1,
      }));
    expect(forbiddenMediaUpload.status).toBe(404);
    expect(forbiddenMediaUpload.body.error).toBe("Media context not found.");

    const { rows: listings } = await pool.query<{ id: number }>(
      `INSERT INTO exchange_listings (seller_id, title, description, neighborhood)
       VALUES ($1, 'Isolated Spark fixture', 'Metadata-only listing for visibility checks', $2)
       RETURNING id`,
      [authorId, `Runtime fixture ${randomUUID()}`],
    );
    exchangeListingId = listings[0].id;
    const { rows: sparks } = await pool.query<{ id: number }>(
      `INSERT INTO exchange_sparks (listing_id, author_user_id, community_id, caption, status)
       VALUES ($1, $2, $3, 'Isolated Exchange Spark fixture', 'draft')
       RETURNING id`,
      [exchangeListingId, authorId, authorCommunityId],
    );
    sparkId = sparks[0].id;
    const { rows: sparkAssets } = await pool.query(
      `INSERT INTO media_assets
         (owner_user_id, context_kind, context_id, media_type, mime_type, original_key,
          variant_key, byte_size, status)
       VALUES ($1, 'exchange_spark', $2, 'video', 'video/mp4',
               $3, $4, 1, 'ready')
       RETURNING id`,
      [
        authorId,
        sparkId,
        `runtime-fixture/no-object/${randomUUID()}.mp4`,
        `runtime-fixture/no-object/${randomUUID()}.variant.mp4`,
      ],
    );
    const sparkMediaAssetId = sparkAssets[0].id as number;
    mediaAssetIds.push(sparkMediaAssetId);
    await pool.query("UPDATE exchange_sparks SET status = 'published' WHERE id = $1", [sparkId]);

    const ownerSparkMedia = await withMediaPlatformEnabled(() => request(app)
      .get(`/media-assets/shared?contextKind=exchange_spark&contextId=${sparkId}`)
      .set("Authorization", `Bearer ${authorToken}`));
    expect(ownerSparkMedia.status).toBe(200);
    const readerSparkMedia = await withMediaPlatformEnabled(() => request(app)
      .get(`/media-assets/shared?contextKind=exchange_spark&contextId=${sparkId}`)
      .set("Authorization", `Bearer ${readerToken}`));
    expect(readerSparkMedia.status).toBe(404);

    const authorSparks = await request(app)
      .get("/community/exchange/sparks")
      .set("Authorization", `Bearer ${authorToken}`);
    expect(authorSparks.status).toBe(200);
    expect(authorSparks.body.sparks.some((spark: { spark_id: number }) => spark.spark_id === sparkId)).toBe(true);

    const readerSparks = await request(app)
      .get("/community/exchange/sparks")
      .set("Authorization", `Bearer ${readerToken}`);
    expect(readerSparks.status).toBe(200);
    expect(readerSparks.body.sparks.some((spark: { spark_id: number }) => spark.spark_id === sparkId)).toBe(false);

    const hubPost = await request(app)
      .post(`/community/hubs/${authorHubId}/posts`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ body: `Cross-community Hub post ${randomUUID()}` });
    expect(hubPost.status).toBe(201);
    hubPostId = hubPost.body.post.id;

    const hubAssetKey = `runtime-fixture/no-object/${randomUUID()}.jpg`;
    const { rows: hubAssets } = await pool.query<{ id: number }>(
      `INSERT INTO media_assets
         (owner_user_id, context_kind, context_id, media_type, mime_type, original_key,
          variant_key, byte_size, status)
       VALUES ($1, 'hub', $2, 'photo', 'image/jpeg', $3, $4, 1, 'ready')
       RETURNING id`,
      [authorId, authorHubId, hubAssetKey, `runtime-fixture/no-object/${randomUUID()}.variant.jpg`],
    );
    const hubMediaAssetId = hubAssets[0].id;
    mediaAssetIds.push(hubMediaAssetId);
    const { rows: stagingAssets } = await pool.query<{ id: number }>(
      `INSERT INTO media_assets
         (owner_user_id, context_kind, context_id, media_type, mime_type, original_key,
          variant_key, byte_size, status)
       VALUES ($1, 'community_moment', $2, 'photo', 'image/jpeg', $3, $4, 1, 'ready')
       RETURNING id`,
      [authorId, authorId, `runtime-fixture/no-object/${randomUUID()}.jpg`, `runtime-fixture/no-object/${randomUUID()}.variant.jpg`],
    );
    const communityMomentAssetId = stagingAssets[0].id;
    mediaAssetIds.push(communityMomentAssetId);
    const { rows: hubMomentAssets } = await pool.query<{ id: number }>(
      `INSERT INTO media_assets
         (owner_user_id, context_kind, context_id, media_type, mime_type, original_key,
          variant_key, byte_size, status)
       VALUES ($1, 'hub_moment', $2, 'photo', 'image/jpeg', $3, $4, 1, 'ready')
       RETURNING id`,
      [authorId, authorHubId, `runtime-fixture/no-object/${randomUUID()}.jpg`, `runtime-fixture/no-object/${randomUUID()}.variant.jpg`],
    );
    const hubMomentAssetId = hubMomentAssets[0].id;
    mediaAssetIds.push(hubMomentAssetId);

    const { rows: hubMediaRows } = await pool.query<{ id: number }>(
      `INSERT INTO hub_community_post_media
         (post_id, media_asset_id, storage_key, mime_type, byte_size, alt_text)
       VALUES ($1, $2, $3, 'image/jpeg', 1, 'Isolated cross-community fixture')
       RETURNING id`,
      [hubPostId, hubMediaAssetId, hubAssetKey],
    );
    hubCommunityMediaId = hubMediaRows[0].id;

    const { rows: gratitudeRows } = await pool.query<{ id: number }>(
      `INSERT INTO gratitude_posts (author_id, author_name, message, moderation_status)
       VALUES ($1, 'Isolated API Author', $2, 'approved')
       RETURNING id`,
      [authorId, `Public cross-community gratitude ${randomUUID()}`],
    );
    gratitudePostId = gratitudeRows[0].id;

    const { rows: publicGriotRows } = await pool.query<{ id: number }>(
      `INSERT INTO griot_stories
         (author_id, title, text_content, original_language, hub_location, hub_id,
          status, visibility, published_at)
       VALUES ($1, $2, 'Public Diaspora story fixture.', 'en', $3, $4, 'published', 'public', NOW())
       RETURNING id`,
      [authorId, `Public Griot fixture ${randomUUID()}`, authorHubName, authorHubId],
    );
    const publicGriotStoryId = publicGriotRows[0].id;
    griotStoryIds.push(publicGriotStoryId);
    const { rows: privateGriotRows } = await pool.query<{ id: number }>(
      `INSERT INTO griot_stories
         (author_id, title, text_content, original_language, hub_location, hub_id,
          status, visibility, published_at)
       VALUES ($1, $2, 'Private Diaspora story fixture.', 'en', $3, $4, 'published', 'private', NOW())
       RETURNING id`,
      [authorId, `Private Griot fixture ${randomUUID()}`, authorHubName, authorHubId],
    );
    const privateGriotStoryId = privateGriotRows[0].id;
    griotStoryIds.push(privateGriotStoryId);

    const communityMomentUpload = await withMediaPlatformEnabled(() => request(app)
      .post("/media-assets/uploads")
      .set("Authorization", `Bearer ${readerToken}`)
      .send({
        contextKind: "community_moment",
        contextId: authorId,
        mediaType: "photo",
        mimeType: "image/jpeg",
        byteSize: 1,
      }));
    expect(communityMomentUpload.status).toBe(404);

    const authorCommunityMomentRead = await withMediaPlatformEnabled(() => request(app)
      .get(`/media-assets/shared?contextKind=community_moment&contextId=${authorId}`)
      .set("Authorization", `Bearer ${authorToken}`));
    expect(authorCommunityMomentRead.status).toBe(404);
    const readerCommunityMomentRead = await withMediaPlatformEnabled(() => request(app)
      .get(`/media-assets/${communityMomentAssetId}`)
      .set("Authorization", `Bearer ${readerToken}`));
    expect(readerCommunityMomentRead.status).toBe(404);
    const readerHubMomentRead = await withMediaPlatformEnabled(() => request(app)
      .get(`/media-assets/${hubMomentAssetId}`)
      .set("Authorization", `Bearer ${readerToken}`));
    expect(readerHubMomentRead.status).toBe(404);

    const hubMediaBeforeMembership = await request(app)
      .get(`/community/hubs/${authorHubId}/media`)
      .set("Authorization", `Bearer ${readerToken}`);
    expect(hubMediaBeforeMembership.status).toBe(403);
    const hubFeedBeforeMembership = await request(app)
      .get(`/community/hubs/${authorHubId}/feed`)
      .set("Authorization", `Bearer ${readerToken}`);
    expect(hubFeedBeforeMembership.status).toBe(200);
    expect(hubFeedBeforeMembership.body.permissions.can_post).toBe(false);
    expect(hubFeedBeforeMembership.body.posts).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: hubPostId })]),
    );
    expect(hubFeedBeforeMembership.body.gratitude).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: gratitudePostId })]),
    );
    const hubContextBeforeMembership = await withMediaPlatformEnabled(() => request(app)
      .get(`/media-assets/shared?contextKind=hub&contextId=${authorHubId}`)
      .set("Authorization", `Bearer ${readerToken}`));
    expect(hubContextBeforeMembership.status).toBe(404);

    const diasporaGratitude = await request(app).get("/gratitude");
    expect(diasporaGratitude.status).toBe(200);
    expect(diasporaGratitude.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: gratitudePostId })]),
    );
    const otherHubGratitude = await request(app).get(`/gratitude?hub_id=${readerHubId}`);
    expect(otherHubGratitude.status).toBe(200);
    expect(otherHubGratitude.body.some((post: { id: number }) => post.id === gratitudePostId)).toBe(false);
    const authorHubGratitude = await request(app).get(`/gratitude?hub_id=${authorHubId}`);
    expect(authorHubGratitude.status).toBe(200);
    expect(authorHubGratitude.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: gratitudePostId })]),
    );

    const publicDiasporaFeed = await request(app).get("/griot/stories");
    expect(publicDiasporaFeed.status).toBe(200);
    expect(publicDiasporaFeed.body.stories.some((story: { id: number }) => story.id === publicGriotStoryId)).toBe(true);
    expect(publicDiasporaFeed.body.stories.some((story: { id: number }) => story.id === privateGriotStoryId)).toBe(false);
    const authorHubDiasporaFeed = await request(app).get(`/griot/stories?hub=${encodeURIComponent(authorHubName)}`);
    expect(authorHubDiasporaFeed.body.stories.some((story: { id: number }) => story.id === publicGriotStoryId)).toBe(true);
    const readerHubDiasporaFeed = await request(app).get(`/griot/stories?hub=${encodeURIComponent(readerHubName)}`);
    expect(readerHubDiasporaFeed.body.stories.some((story: { id: number }) => story.id === publicGriotStoryId)).toBe(false);
    const publicDiasporaDetail = await request(app)
      .get(`/griot/stories/${publicGriotStoryId}`)
      .set("Authorization", `Bearer ${readerToken}`);
    expect(publicDiasporaDetail.status).toBe(200);
    const privateDiasporaDetail = await request(app)
      .get(`/griot/stories/${privateGriotStoryId}`)
      .set("Authorization", `Bearer ${readerToken}`);
    expect(privateDiasporaDetail.status).toBe(403);

    await pool.query(
      `INSERT INTO hub_memberships (hub_id, user_id, status, role, requested_at, approved_at)
       VALUES ($1, $2, 'approved', 'member', NOW(), NOW())
       ON CONFLICT (user_id, hub_id) DO UPDATE
       SET status = 'approved', role = 'member', approved_at = NOW(), updated_at = NOW()`,
      [authorHubId, readerId],
    );
    const readerHubMediaAssetRead = await withMediaPlatformEnabled(() => request(app)
      .get(`/media-assets/shared?contextKind=hub&contextId=${authorHubId}`)
      .set("Authorization", `Bearer ${readerToken}`));
    expect(readerHubMediaAssetRead.status).toBe(200);
    const readerHubMedia = await request(app)
      .get(`/community/hubs/${authorHubId}/media`)
      .set("Authorization", `Bearer ${readerToken}`);
    expect(readerHubMedia.status).toBe(200);
    expect(readerHubMedia.body.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: hubCommunityMediaId })]),
    );
    const readerHubFeedAfterMembership = await request(app)
      .get(`/community/hubs/${authorHubId}/feed`)
      .set("Authorization", `Bearer ${readerToken}`);
    expect(readerHubFeedAfterMembership.status).toBe(200);
    expect(readerHubFeedAfterMembership.body.permissions.can_post).toBe(true);

    const { rows: families } = await pool.query<{ id: number }>(
      "INSERT INTO families (name, created_by) VALUES ($1, $2) RETURNING id",
      [`Isolated family policy ${randomUUID()}`, authorId],
    );
    familyId = families[0].id;
    await pool.query(
      `INSERT INTO family_members (family_id, user_id, display_name, role, status, joined_at)
       VALUES ($1, $2, 'Isolated API Author', 'contributor', 'active', NOW())`,
      [familyId, authorId],
    );

    const familyStory = await request(app)
      .post(`/family/${familyId}/stories`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({
        title: "Family-visible fixture",
        body: "Family membership grants access independently of community membership.",
        audience: "family",
        category: "oral",
      });
    expect(familyStory.status).toBe(201);

    const nonMemberFamilyRead = await request(app)
      .get(`/family/${familyId}/stories`)
      .set("Authorization", `Bearer ${readerToken}`);
    expect(nonMemberFamilyRead.status).toBe(403);

    await pool.query(
      `INSERT INTO family_members (family_id, user_id, display_name, role, status, joined_at)
       VALUES ($1, $2, 'Isolated API Reader', 'contributor', 'active', NOW())`,
      [familyId, readerId],
    );
    const familyReader = await request(app)
      .get(`/family/${familyId}/stories`)
      .set("Authorization", `Bearer ${readerToken}`);
    expect(familyReader.status).toBe(200);
    expect(familyReader.body.stories).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: familyStory.body.story.id })]),
    );

    const privateFamilyStory = await request(app)
      .post(`/family/${familyId}/stories`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({
        title: "Private family fixture",
        body: "A family member must not see another contributor's private story.",
        audience: "private",
        category: "oral",
      });
    expect(privateFamilyStory.status).toBe(201);
    const privateFamilyReader = await request(app)
      .get(`/family/${familyId}/stories`)
      .set("Authorization", `Bearer ${readerToken}`);
    expect(privateFamilyReader.status).toBe(200);
    expect(privateFamilyReader.body.stories.some(
      (story: { id: number }) => story.id === privateFamilyStory.body.story.id,
    )).toBe(false);
  });
});