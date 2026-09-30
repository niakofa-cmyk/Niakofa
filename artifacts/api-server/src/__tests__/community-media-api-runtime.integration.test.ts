import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import { pool } from "@workspace/db";
import { parseAuth, signTokenById } from "../middlewares/auth";
import communityExchangeRouter from "../routes/community-exchange";
import communityStoriesRouter from "../routes/community-stories";
import familyRouter from "../routes/family";
import mediaAssetsRouter from "../routes/media-assets-v21";

const integrationEnabled = process.env.COMMUNITY_MEDIA_API_RUNTIME_TEST === "1";
const suite = integrationEnabled ? describe : describe.skip;

suite("isolated Community, Media Studio, Exchange Spark, and Family Story API regression", () => {
  const app = express();
  app.use(express.json());
  app.use(parseAuth);
  app.use(communityStoriesRouter);
  app.use(communityExchangeRouter);
  app.use(mediaAssetsRouter);
  app.use(familyRouter);

  let authorId: number | undefined;
  let readerId: number | undefined;
  let authorCommunityId: number | undefined;
  let readerCommunityId: number | undefined;
  let communityStoryId: number | undefined;
  let familyId: number | undefined;
  let exchangeListingId: number | undefined;
  let sparkId: number | undefined;
  const mediaAssetIds: number[] = [];
  let authorToken = "";
  let readerToken = "";

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
      "0150_community_stories.sql",
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
           ('community_stories', 'audience'),
           ('community_stories', 'community_id'),
           ('exchange_sparks', 'community_id'),
           ('media_assets', 'context_kind'),
           ('family_stories', 'author_id'),
           ('family_stories', 'audience'),
           ('family_members', 'status')
         )`,
    );
    expect(new Set(requiredColumns.map((row) => `${row.table_name}.${row.column_name}`))).toEqual(
      new Set([
        "users.community_id",
        "community_stories.audience",
        "community_stories.community_id",
        "exchange_sparks.community_id",
        "media_assets.context_kind",
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
  });

  afterAll(async () => {
    try {
      await cleanup();
    } finally {
      await pool.end();
    }
  });

  it("enforces separate community, media-read, Exchange Spark, and family-membership policies", async () => {
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
    const forbiddenMediaRead = await request(app)
      .get(`/media-assets/${assets[0].id}`)
      .set("Authorization", `Bearer ${readerToken}`);
    expect(forbiddenMediaRead.status).toBe(404);
    const forbiddenMediaUpload = await request(app)
      .post("/media-assets/uploads")
      .set("Authorization", `Bearer ${readerToken}`)
      .send({
        contextKind: "story",
        contextId: communityStoryId,
        mediaType: "photo",
        mimeType: "image/jpeg",
        byteSize: 1,
      });
    expect(forbiddenMediaUpload.status).toBe(404);
    if (forbiddenMediaUpload.body.error_code === "MEDIA_PLATFORM_DISABLED") {
      // The read authorization above still ran; an environment with V21
      // enabled additionally exercises the write-context denial below.
      expect(forbiddenMediaUpload.body.error_code).toBe("MEDIA_PLATFORM_DISABLED");
    } else {
      expect(forbiddenMediaUpload.body.error).toBe("Media context not found.");
    }

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