import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createServer as createTcpServer } from "node:net";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
import { pool } from "@workspace/db";
import { parseAuth, signTokenById } from "../middlewares/auth";
import { mediaUploadParser } from "../lib/media-upload-parser";
import { isCloudStorageConfigured, deleteAssetStrict, putAsset, UPLOADS_BASE } from "../lib/storage";
import { closeRedis, setMediaProcessingQueueForTest, waitForRedisReady } from "../lib/queue";
import audioCirclesRouter from "../routes/audio-circles";
import communityExchangeRouter from "../routes/community-exchange";
import communityHubFeedRouter from "../routes/community-hub-feed";
import communityStoriesRouter from "../routes/community-stories";
import circleMediaTokenRouter from "../routes/circle-media-token";
import familyRouter from "../routes/family";
import gratitudeRouter from "../routes/gratitude";
import griotRouter from "../routes/griot";
import mediaAssetsRouter from "../routes/media-assets-v21";
import { processMediaJob, type MediaJobData } from "../workers/media-process-worker";
import { startMediaProcessWorker } from "../workers/media-process-worker";

const integrationEnabled = process.env.COMMUNITY_MEDIA_API_RUNTIME_TEST === "1";
const suite = integrationEnabled ? describe : describe.skip;

async function createSyntheticVideo(): Promise<Buffer> {
  const directory = await mkdtemp(path.join(tmpdir(), "niakofa-cross-community-video-"));
  const outputPath = path.join(directory, "moment.mp4");
  try {
    execFileSync(process.env.FFMPEG_PATH?.trim() || "ffmpeg", [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=320x180:r=24",
      "-t",
      "1",
      "-an",
      "-c:v",
      "libx264",
      "-profile:v",
      "baseline",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-y",
      outputPath,
    ], { stdio: "ignore" });
    return await readFile(outputPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function createSyntheticImage(): Promise<Buffer> {
  const directory = await mkdtemp(path.join(tmpdir(), "niakofa-exchange-image-"));
  const outputPath = path.join(directory, "listing.png");
  try {
    execFileSync(process.env.FFMPEG_PATH?.trim() || "ffmpeg", [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=orange:s=320x240",
      "-frames:v",
      "1",
      "-y",
      outputPath,
    ], { stdio: "ignore" });
    return await readFile(outputPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function createSyntheticJpeg(): Promise<Buffer> {
  const directory = await mkdtemp(path.join(tmpdir(), "niakofa-moments-jpeg-"));
  const outputPath = path.join(directory, "moment.jpg");
  try {
    execFileSync(process.env.FFMPEG_PATH?.trim() || "ffmpeg", [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=orange:s=320x240",
      "-frames:v",
      "1",
      "-q:v",
      "2",
      "-y",
      outputPath,
    ], { stdio: "ignore" });
    return await readFile(outputPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

suite("isolated cross-community content and media access matrix", () => {
  const app = express();
  app.use(express.json());
  app.use(parseAuth);
  app.use("/media-assets/:id/upload", mediaUploadParser);
  app.use("/api/media-assets/:id/upload", mediaUploadParser);
  // Match the application-wide compatibility middleware so canonical Spiral
  // paths reach the existing Circle lifecycle and LiveKit token handlers.
  app.use((req, _res, next) => {
    req.url = req.url
      .replace(/^\/audio-spiral-sessions(?=\/|$)/, "/audio-circle-sessions")
      .replace(/^\/audio-spirals(?=\/|$)/, "/audio-circles");
    next();
  });
  app.use(communityStoriesRouter);
  app.use(communityExchangeRouter);
  app.use(communityHubFeedRouter);
  app.use(gratitudeRouter);
  app.use(griotRouter);
  app.use(audioCirclesRouter);
  app.use(circleMediaTokenRouter);
  app.use(mediaAssetsRouter);
  app.use(familyRouter);
  // The actual web app sends same-origin /api requests through Vite. Mount the
  // same production routers at that prefix as well as their direct test paths.
  app.use("/api", (req, _res, next) => {
    req.url = req.url
      .replace(/^\/audio-spiral-sessions(?=\/|$)/, "/audio-circle-sessions")
      .replace(/^\/audio-spirals(?=\/|$)/, "/audio-circles");
    next();
  });
  app.use("/api", communityStoriesRouter);
  app.use("/api", communityExchangeRouter);
  app.use("/api", communityHubFeedRouter);
  app.use("/api", gratitudeRouter);
  app.use("/api", griotRouter);
  app.use("/api", audioCirclesRouter);
  app.use("/api", circleMediaTokenRouter);
  app.use("/api", mediaAssetsRouter);
  app.use("/api", familyRouter);
  // The browser needs only the authenticated shell endpoints below; all
  // Moments, upload, storage, and playback requests continue to the real API
  // routers and real database-backed handlers.
  app.get("/users/me", async (req, res) => {
    const userId = req.authenticatedUserId;
    if (!userId) return res.status(401).json({ error: "Authentication required." });
    const { rows } = await pool.query(
      `SELECT id, name, email, approval_status, community_id
       FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ error: "User not found." });
    return res.json({
      ...user,
      username: null,
      avatar_url: null,
      panic_contacts: [],
      trust_score: 0,
      help_count: 0,
      is_helper: false,
      helper_status: null,
      helper_mode_active: false,
      is_suspended: false,
    });
  });
  app.get("/users/:id/settings", (_req, res) => res.json({}));
  app.get("/users/:id", async (req, res) => {
    const id = Number(req.params.id);
    const { rows } = await pool.query(
      `SELECT id, name, email, approval_status, community_id
       FROM users WHERE id = $1 LIMIT 1`,
      [id],
    );
    return rows[0] ? res.json(rows[0]) : res.status(404).json({ error: "User not found." });
  });
  app.get("/requests", (_req, res) => res.json({ requests: [] }));
  app.get("/stripe/connect/status/:id", (_req, res) => res.json({ connected: false }));
  app.get("/api/users/me", async (req, res) => {
    const userId = req.authenticatedUserId;
    if (!userId) return res.status(401).json({ error: "Authentication required." });
    const { rows } = await pool.query(
      `SELECT id, name, email, approval_status, community_id
       FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ error: "User not found." });
    return res.json({
      ...user,
      username: null,
      avatar_url: null,
      panic_contacts: [],
      trust_score: 0,
      help_count: 0,
      is_helper: false,
      helper_status: null,
      helper_mode_active: false,
      is_suspended: false,
    });
  });
  app.get("/api/users/:id/settings", (_req, res) => res.json({}));
  app.get("/api/users/:id", async (req, res) => {
    const id = Number(req.params.id);
    const { rows } = await pool.query(
      `SELECT id, name, email, approval_status, community_id
       FROM users WHERE id = $1 LIMIT 1`,
      [id],
    );
    return rows[0] ? res.json(rows[0]) : res.status(404).json({ error: "User not found." });
  });
  app.get("/api/requests", (_req, res) => res.json({ requests: [] }));
  app.get("/api/stripe/connect/status/:id", (_req, res) => res.json({ connected: false }));

  let authorId: number | undefined;
  let sameCommunityReaderId: number | undefined;
  let readerId: number | undefined;
  let authorCommunityId: number | undefined;
  let readerCommunityId: number | undefined;
  let spiralId: number | undefined;
  let spiralSessionId: number | undefined;
  let authorHubId: number | undefined;
  let readerHubId: number | undefined;
  let authorHubName = "";
  let readerHubName = "";
  let communityStoryId: number | undefined;
  let legacyMomentStoryId: number | undefined;
  let videoStoryId: number | undefined;
  let momentCompositionStoryId: number | undefined;
  let videoUploadMarker: string | undefined;
  let familyId: number | undefined;
  let exchangeListingId: number | undefined;
  let exchangeMediaListingId: number | undefined;
  let textOnlyListingId: number | undefined;
  let sparkId: number | undefined;
  let hubPostId: number | undefined;
  let hubCommunityMediaId: number | undefined;
  let gratitudePostId: number | undefined;
  const griotStoryIds: number[] = [];
  const mediaAssetIds: number[] = [];
  let authorToken = "";
  let sameCommunityReaderToken = "";
  let readerToken = "";
  let pendingMomentCaption = "";
  let pendingMomentSourceIds: number[] = [];
  let browserFixtureCaptions: string[] = [];
  let browserFixtureNames: string[] = [];
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

  async function withFakeLiveKitConfig<T>(work: () => Promise<T>): Promise<T> {
    const previous = {
      key: process.env.LIVEKIT_API_KEY,
      secret: process.env.LIVEKIT_API_SECRET,
      url: process.env.LIVEKIT_URL,
    };
    process.env.LIVEKIT_API_KEY = "local-test-livekit-key";
    process.env.LIVEKIT_API_SECRET = "local-test-livekit-secret-only";
    process.env.LIVEKIT_URL = "wss://livekit.invalid";
    try {
      return await work();
    } finally {
      if (previous.key === undefined) delete process.env.LIVEKIT_API_KEY;
      else process.env.LIVEKIT_API_KEY = previous.key;
      if (previous.secret === undefined) delete process.env.LIVEKIT_API_SECRET;
      else process.env.LIVEKIT_API_SECRET = previous.secret;
      if (previous.url === undefined) delete process.env.LIVEKIT_URL;
      else process.env.LIVEKIT_URL = previous.url;
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

    const cleanupMediaAssetIds = new Set(mediaAssetIds);
    const cleanupStoryIds = new Set<number>(
      [videoStoryId, momentCompositionStoryId, communityStoryId, legacyMomentStoryId]
        .filter((id): id is number => id !== undefined),
    );
    if (authorId && browserFixtureCaptions.length) {
      try {
        const { rows: browserStories } = await pool.query<{ id: number }>(
          `SELECT id FROM community_stories
           WHERE author_user_id = $1 AND caption = ANY($2::text[])`,
          [authorId, browserFixtureCaptions],
        );
        browserStories.forEach((story) => cleanupStoryIds.add(story.id));
      } catch (error) {
        errors.push(error);
      }
    }
    if (authorId && browserFixtureNames.length) {
      try {
        const { rows: browserAssets } = await pool.query<{ id: number }>(
          `SELECT id FROM media_assets
           WHERE owner_user_id = $1 AND original_name = ANY($2::text[])`,
          [authorId, browserFixtureNames],
        );
        browserAssets.forEach((asset) => cleanupMediaAssetIds.add(asset.id));
      } catch (error) {
        errors.push(error);
      }
    }
    if (videoUploadMarker && authorId) {
      try {
        const { rows } = await pool.query<{ id: number }>(
          "SELECT id FROM media_assets WHERE owner_user_id = $1 AND original_name = $2",
          [authorId, videoUploadMarker],
        );
        for (const row of rows) cleanupMediaAssetIds.add(row.id);
      } catch (error) {
        errors.push(error);
      }
    }
    if (cleanupMediaAssetIds.size && !isCloudStorageConfigured()) {
      try {
        const { rows: storedAssets } = await pool.query<{
          original_key: string | null;
          variant_key: string | null;
          thumbnail_key: string | null;
          cleanup_keys: string[] | null;
        }>(
          `SELECT original_key, variant_key, thumbnail_key, cleanup_keys
           FROM media_assets WHERE id = ANY($1::integer[])`,
          [[...cleanupMediaAssetIds]],
        );
        const keys = new Set<string>();
        for (const asset of storedAssets) {
          for (const key of [
            asset.original_key,
            asset.variant_key,
            asset.thumbnail_key,
            ...(Array.isArray(asset.cleanup_keys) ? asset.cleanup_keys : []),
          ]) {
            if (typeof key === "string" && key.length > 0) keys.add(key);
          }
        }
        for (const key of keys) await deleteAssetStrict(key);
      } catch (error) {
        errors.push(error);
      }
    }
    if (cleanupStoryIds.size) {
      await attempt(
        "DELETE FROM community_stories WHERE author_user_id = $1 AND id = ANY($2::integer[])",
        [authorId, [...cleanupStoryIds]],
      );
    }
    if (cleanupMediaAssetIds.size) {
      await attempt(
        "DELETE FROM media_assets WHERE id = ANY($1::integer[])",
        [[...cleanupMediaAssetIds]],
      );
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
    if (exchangeMediaListingId) {
      await attempt("DELETE FROM exchange_listings WHERE id = $1", [exchangeMediaListingId]);
    }
    if (textOnlyListingId) {
      await attempt("DELETE FROM exchange_listings WHERE id = $1", [textOnlyListingId]);
    }
    if (familyId) {
      await attempt("DELETE FROM families WHERE id = $1", [familyId]);
    }
    if (communityStoryId) {
      await attempt("DELETE FROM community_stories WHERE id = $1", [communityStoryId]);
    }
    if (spiralId) {
      await attempt("DELETE FROM audio_circles WHERE id = $1", [spiralId]);
    }
    const userIds = [authorId, sameCommunityReaderId, readerId]
      .filter((id): id is number => id !== undefined);
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
    expect(isCloudStorageConfigured()).toBe(false);
    expect(process.env.MEDIA_TEST_UPLOADS_DIR?.trim()).toBeTruthy();
    expect(UPLOADS_BASE).toBe(path.resolve(process.env.MEDIA_TEST_UPLOADS_DIR!));
    expect(UPLOADS_BASE).not.toBe(path.resolve(process.cwd(), "uploads"));
    const { rows: databaseRows } = await pool.query<{ database_name: string }>(
      "SELECT current_database() AS database_name",
    );
    // Requiring both an explicit opt-in and a recognizable dev/test database
    // prevents accidentally running destructive fixture cleanup on production.
    expect(databaseRows[0]?.database_name).toMatch(/(^|[-_])(dev|test)([-_]|$)/i);

    const requiredMigrations = [
      "0052_griot_stories.sql",
      "0053_griot_gratitude_diaspora.sql",
      "0064_audio_circles.sql",
      "0074_audio_circle_host_grace_period.sql",
      "0084_audio_circle_follows_blocks_reports.sql",
      "0085_audio_circle_sessions_topic_description.sql",
      "0087_circle_hand_raised_at.sql",
      "0090_circle_session_settings_enrichment.sql",
      "0109_circle_media_publish_policy.sql",
      "0139_diaspora_hub_geography_invariants.sql",
      "0141_hub_memberships.sql",
      "0145_hub_community_and_completion_retries.sql",
      "0150_community_stories.sql",
      "0155_media_assets.sql",
      "0158_community_media_saves.sql",
      "0176_durable_exchange_sparks.sql",
      "0186_family_story_experience.sql",
      "0189_resumable_media_uploads.sql",
      "0196_moment_video_single_clip.sql",
      "0197_exchange_listing_media.sql",
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
            ('audio_circles', 'city_key'),
            ('audio_circles', 'city_display'),
            ('audio_circles', 'community_id'),
            ('audio_circles', 'name'),
            ('audio_circle_sessions', 'circle_id'),
            ('audio_circle_sessions', 'host_id'),
            ('audio_circle_sessions', 'status'),
            ('audio_circle_sessions', 'started_at'),
            ('audio_circle_sessions', 'host_disconnected_at'),
            ('audio_circle_sessions', 'media_publish_policy'),
            ('audio_circle_sessions', 'chat_enabled'),
            ('audio_circle_sessions', 'recording_allowed'),
            ('audio_circle_participants', 'session_id'),
            ('audio_circle_participants', 'user_id'),
            ('audio_circle_participants', 'role'),
            ('audio_circle_participants', 'left_at'),
            ('audio_circle_participants', 'hand_raised_at'),
            ('circle_blocks', 'host_id'),
            ('circle_blocks', 'blocked_user_id'),
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
        "audio_circles.city_key",
        "audio_circles.city_display",
        "audio_circles.community_id",
        "audio_circles.name",
        "audio_circle_sessions.circle_id",
        "audio_circle_sessions.host_id",
        "audio_circle_sessions.status",
        "audio_circle_sessions.started_at",
        "audio_circle_sessions.host_disconnected_at",
        "audio_circle_sessions.media_publish_policy",
        "audio_circle_sessions.chat_enabled",
        "audio_circle_sessions.recording_allowed",
        "audio_circle_participants.session_id",
        "audio_circle_participants.user_id",
        "audio_circle_participants.role",
        "audio_circle_participants.left_at",
        "audio_circle_participants.hand_raised_at",
        "circle_blocks.host_id",
        "circle_blocks.blocked_user_id",
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
    const { rows: sameCommunityReaderRows } = await pool.query<{ id: number }>(
      `INSERT INTO users (name, email, approval_status, community_id)
       VALUES ('Same-community API Story Reader B', $1, 'approved', $2) RETURNING id`,
      [`community-api-reader-b-${unique}@test.invalid`, authorCommunityId],
    );
    sameCommunityReaderId = sameCommunityReaderRows[0].id;
    const { rows: readerRows } = await pool.query<{ id: number }>(
      `INSERT INTO users (name, email, approval_status, community_id)
       VALUES ('Cross-community API Story Reader C', $1, 'approved', $2) RETURNING id`,
      [`community-api-reader-c-${unique}@test.invalid`, readerCommunityId],
    );
    readerId = readerRows[0].id;
    authorToken = signTokenById(authorId, 0);
    sameCommunityReaderToken = signTokenById(sameCommunityReaderId, 0);
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
    const { rows: spiralRows } = await pool.query<{ id: number }>(
      `INSERT INTO audio_circles (city_key, city_display, name, community_id)
       VALUES ($1, 'Runtime Fixture City', 'Runtime Cross-community Spiral', NULL)
       RETURNING id`,
      [`runtime_cross_community_${unique.replaceAll("-", "")}`],
    );
    spiralId = spiralRows[0].id;
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
    const sparkVideoBytes = await createSyntheticVideo();
    const sparkVariantKey = `runtime-fixture/${randomUUID()}.variant.mp4`;
    const sparkVariantPath = path.resolve(UPLOADS_BASE, sparkVariantKey);
    await mkdir(path.dirname(sparkVariantPath), { recursive: true });
    await writeFile(sparkVariantPath, sparkVideoBytes);
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
        sparkVariantKey,
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

    const sameCommunitySparks = await request(app)
      .get("/community/exchange/sparks")
      .set("Authorization", `Bearer ${sameCommunityReaderToken}`);
    expect(sameCommunitySparks.status).toBe(200);
    expect(sameCommunitySparks.body.sparks.some((spark: { spark_id: number }) => spark.spark_id === sparkId)).toBe(true);

    const sparkGrant = await withMediaPlatformEnabled(() => request(app)
      .post(`/media-assets/${sparkMediaAssetId}/playback-grant`)
      .set("Authorization", `Bearer ${sameCommunityReaderToken}`));
    expect(sparkGrant.status).toBe(200);
    const sparkGrantSetCookie = sparkGrant.headers["set-cookie"];
    const sparkPlaybackCookie = (Array.isArray(sparkGrantSetCookie) ? sparkGrantSetCookie[0] : sparkGrantSetCookie)
      ?.split(";")[0];
    expect(sparkPlaybackCookie).toBeTruthy();
    if (!sparkPlaybackCookie) throw new Error("The Exchange Spark playback grant did not set its cookie.");

    const playableBeforeWithdrawal = await withMediaPlatformEnabled(() => request(app)
      .get(`/media-assets/${sparkMediaAssetId}/play`)
      .set("Cookie", sparkPlaybackCookie));
    expect(playableBeforeWithdrawal.status).toBe(200);
    expect(playableBeforeWithdrawal.headers["content-type"]).toMatch(/video\/mp4/i);
    expect(Number(playableBeforeWithdrawal.headers["content-length"])).toBe(sparkVideoBytes.byteLength);

    const withdrawnListing = await request(app)
      .post(`/community/exchange/listings/${exchangeListingId}/withdraw`)
      .set("Authorization", `Bearer ${authorToken}`);
    expect(withdrawnListing.status).toBe(200);
    expect(withdrawnListing.body.listing.status).toBe("withdrawn");

    const [withdrawnAuthorFeed, withdrawnNeighborFeed] = await Promise.all([
      request(app).get("/community/exchange/sparks").set("Authorization", `Bearer ${authorToken}`),
      request(app).get("/community/exchange/sparks").set("Authorization", `Bearer ${sameCommunityReaderToken}`),
    ]);
    for (const feed of [withdrawnAuthorFeed, withdrawnNeighborFeed]) {
      expect(feed.status).toBe(200);
      expect(feed.body.sparks.some((spark: { spark_id: number }) => spark.spark_id === sparkId)).toBe(false);
    }

    const deniedSparkGrant = await withMediaPlatformEnabled(() => request(app)
      .post(`/media-assets/${sparkMediaAssetId}/playback-grant`)
      .set("Authorization", `Bearer ${sameCommunityReaderToken}`));
    expect(deniedSparkGrant.status).toBe(404);

    const revokedPlayUrl = await withMediaPlatformEnabled(() => request(app)
      .get(`/media-assets/${sparkMediaAssetId}/play`)
      .set("Cookie", sparkPlaybackCookie));
    const revokedDirectMediaUrl = await withMediaPlatformEnabled(() => request(app)
      .get(`/media-assets/${sparkMediaAssetId}`)
      .set("Authorization", `Bearer ${sameCommunityReaderToken}`)
      .set("Cookie", sparkPlaybackCookie));
    expect(revokedPlayUrl.status).toBe(404);
    expect(revokedDirectMediaUrl.status).toBe(404);

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

  it("keeps an uploaded video Moment visible after processing for approved A and B, but not cross-community C", async () => {
    expect(sameCommunityReaderId).toBeDefined();
    expect(readerId).toBeDefined();
    expect(sameCommunityReaderId).not.toBe(authorId);
    expect(readerId).not.toBe(authorId);
    expect(authorCommunityId).toBeDefined();
    expect(readerCommunityId).not.toBe(authorCommunityId);
    const video = await createSyntheticVideo();
    videoUploadMarker = `cross-community-video-${randomUUID()}.mp4`;
    const queuedJobs: Array<{ name: string; data: MediaJobData }> = [];
    const fakeQueue = {
      add: async (name: string, data: MediaJobData) => {
        queuedJobs.push({ name, data });
        return undefined;
      },
    } as unknown as Parameters<typeof setMediaProcessingQueueForTest>[0];
    const restoreQueue = setMediaProcessingQueueForTest(fakeQueue);
    let videoAssetId: number | undefined;
    try {
      const uploadSession = await withMediaPlatformEnabled(() => request(app)
        .post("/media-assets/uploads")
        .set("Authorization", `Bearer ${authorToken}`)
        .send({
          contextKind: "community_moment",
          contextId: authorId,
          mediaType: "video",
          mimeType: "video/mp4",
          originalName: videoUploadMarker,
          byteSize: video.length,
        }));
      expect(uploadSession.status).toBe(201);
      const initializedAssetId = uploadSession.body.media_asset_id as number;
      videoAssetId = initializedAssetId;
      expect(Number.isSafeInteger(videoAssetId)).toBe(true);
      if (videoAssetId === undefined || !Number.isSafeInteger(videoAssetId)) {
        throw new Error("The video upload session did not return a valid media asset id.");
      }
      mediaAssetIds.push(videoAssetId);

      const upload = await withMediaPlatformEnabled(() => request(app)
        .put(`/media-assets/${videoAssetId}/upload`)
        .set("Authorization", `Bearer ${authorToken}`)
        .set("Content-Type", "video/mp4")
        .send(video));
      expect(upload.status).toBe(204);

      const completed = await withMediaPlatformEnabled(() => request(app)
        .post(`/media-assets/${videoAssetId}/complete`)
        .set("Authorization", `Bearer ${authorToken}`));
      expect(completed.status).toBe(202);
      expect(completed.body).toMatchObject({ media_asset_id: videoAssetId, status: "processing" });

      const { rows: uploadingAssets } = await pool.query<{ status: string }>(
        "SELECT status FROM media_assets WHERE id = $1",
        [videoAssetId],
      );
      expect(uploadingAssets[0]?.status).toBe("processing");
      const videoJobs = queuedJobs.filter((job) => job.data.mediaAssetId === videoAssetId);
      expect(videoJobs.map((job) => job.data.jobType)).toEqual(["probe", "thumbnail", "transcode"]);
      for (const queued of videoJobs) {
        expect(queued.name).toBe(queued.data.jobType);
        await processMediaJob({
          id: `runtime-video-${videoAssetId}-${queued.data.jobType}`,
          data: queued.data,
          attemptsMade: 0,
        } as unknown as Parameters<typeof processMediaJob>[0]);
      }
    } finally {
      restoreQueue();
    }
    if (videoAssetId === undefined) {
      throw new Error("The video upload did not create a media asset.");
    }

    const { rows: processedAssets } = await pool.query<{
      status: string;
      original_key: string;
      variant_key: string | null;
      thumbnail_key: string | null;
    }>(
      `SELECT status, original_key, variant_key, thumbnail_key
       FROM media_assets WHERE id = $1`,
      [videoAssetId],
    );
    const processedAsset = processedAssets[0];
    expect(processedAsset?.status).toBe("ready");
    expect(processedAsset?.variant_key).toBeTruthy();
    expect(processedAsset?.thumbnail_key).toBeTruthy();
    if (!processedAsset?.variant_key || !processedAsset.thumbnail_key) {
      throw new Error("The video worker did not produce a ready variant and thumbnail.");
    }
    const { rows: completedJobs } = await pool.query<{ job_type: string; status: string }>(
      `SELECT job_type, status FROM media_processing_jobs
       WHERE media_asset_id = $1 ORDER BY job_type`,
      [videoAssetId],
    );
    expect(completedJobs).toEqual([
      { job_type: "probe", status: "completed" },
      { job_type: "thumbnail", status: "completed" },
      { job_type: "transcode", status: "completed" },
    ]);
    const assetStorageKeys = [
      processedAsset?.original_key,
      processedAsset?.variant_key,
      processedAsset?.thumbnail_key,
    ].filter((key): key is string => Boolean(key));
    for (const key of assetStorageKeys) {
      expect(existsSync(path.resolve(UPLOADS_BASE, key))).toBe(true);
    }
    const expectedPlaybackSize = await stat(path.resolve(
      UPLOADS_BASE,
      processedAsset.variant_key,
    )).then((file) => file.size);

    const published = await request(app)
      .post("/community/stories")
      .set("Authorization", `Bearer ${authorToken}`)
      .send({
        caption: `Synthetic approved-account video ${randomUUID()}`,
        audience: "community",
        media_asset_ids: [videoAssetId],
        media_accessibility: [{
          media_asset_id: videoAssetId,
          alt_text: "One-second synthetic blue test video",
        }],
      });
    expect(published.status).toBe(201);
    videoStoryId = published.body.story.id;
    expect(published.body.story.status).toBe("published");

    const [authorFeed, sameCommunityFeed, crossCommunityFeed] = await Promise.all([
      request(app).get("/community/stories").set("Authorization", `Bearer ${authorToken}`),
      request(app).get("/community/stories").set("Authorization", `Bearer ${sameCommunityReaderToken}`),
      request(app).get("/community/stories").set("Authorization", `Bearer ${readerToken}`),
    ]);
    for (const feed of [authorFeed, sameCommunityFeed, crossCommunityFeed]) {
      expect(feed.status).toBe(200);
    }
    const ownerStory = authorFeed.body.stories.find((story: { id: number }) => story.id === videoStoryId);
    const sameCommunityStory = sameCommunityFeed.body.stories
      .find((story: { id: number }) => story.id === videoStoryId);
    expect(ownerStory?.media?.[0]).toMatchObject({ media_type: "video", mime_type: "video/mp4" });
    expect(sameCommunityStory?.media?.[0]).toMatchObject({ media_type: "video", mime_type: "video/mp4" });
    expect(crossCommunityFeed.body.stories.some(
      (story: { id: number }) => story.id === videoStoryId,
    )).toBe(false);

    const videoMediaId = ownerStory?.media?.[0]?.id as number | undefined;
    expect(Number.isSafeInteger(videoMediaId)).toBe(true);
    if (!videoMediaId) throw new Error("The published video Moment did not return a media id.");

    const sameCommunityGrant = await request(app)
      .post(`/community/stories/media/${videoMediaId}/playback-grant`)
      .set("Authorization", `Bearer ${sameCommunityReaderToken}`);
    expect(sameCommunityGrant.status).toBe(200);
    const setCookie = sameCommunityGrant.headers["set-cookie"];
    const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    const playbackCookie = cookieHeader?.split(";")[0];
    expect(playbackCookie).toBeTruthy();
    if (!playbackCookie) throw new Error("The same-community playback grant did not set its cookie.");

    const playback = await request(app)
      .get(`/community/stories/media/${videoMediaId}/play`)
      .set("Cookie", playbackCookie);
    expect(playback.status).toBe(200);
    expect(playback.headers["content-type"]).toMatch(/video\/mp4/i);
    expect(Number(playback.headers["content-length"])).toBe(expectedPlaybackSize);

    const crossCommunityGrant = await request(app)
      .post(`/community/stories/media/${videoMediaId}/playback-grant`)
      .set("Authorization", `Bearer ${readerToken}`);
    expect(crossCommunityGrant.status).toBe(404);

    const remixSetting = await request(app)
      .patch(`/community/stories/${videoStoryId}/settings`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ remix_enabled: true });
    expect(remixSetting.status).toBe(200);
    const captionEdit = await request(app)
      .patch(`/community/stories/${videoStoryId}`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ caption: "A caption edit is not supported after publication." });
    expect(captionEdit.status).toBe(404);

    for (const token of [sameCommunityReaderToken, readerToken]) {
      const nonOwnerDelete = await request(app)
        .delete(`/community/stories/${videoStoryId}`)
        .set("Authorization", `Bearer ${token}`);
      expect(nonOwnerDelete.status).toBe(200);
      expect(nonOwnerDelete.body.deleted).toBe(false);
    }

    const failedStorageKey = assetStorageKeys[0];
    expect(failedStorageKey).toBeTruthy();
    if (!failedStorageKey) throw new Error("The processed Moment has no storage key for cleanup recovery testing.");
    const failedStoragePath = path.resolve(UPLOADS_BASE, failedStorageKey);
    await rm(failedStoragePath, { force: true, recursive: true });
    await mkdir(failedStoragePath);
    try {
      const failedOwnerDelete = await request(app)
        .delete(`/community/stories/${videoStoryId}`)
        .set("Authorization", `Bearer ${authorToken}`);
      expect(failedOwnerDelete.status).toBe(503);
      expect(failedOwnerDelete.body).toMatchObject({
        deleted: false,
        error_code: "STORY_MEDIA_CLEANUP_FAILED",
      });
      const { rows: retainedStory } = await pool.query<{ status: string }>(
        "SELECT status FROM community_stories WHERE id = $1 AND author_user_id = $2",
        [videoStoryId, authorId],
      );
      expect(retainedStory).toEqual([{ status: "deletion_pending" }]);
      expect(existsSync(failedStoragePath)).toBe(true);
    } finally {
      await rm(failedStoragePath, { force: true, recursive: true });
    }

    const ownerDelete = await request(app)
      .delete(`/community/stories/${videoStoryId}`)
      .set("Authorization", `Bearer ${authorToken}`);
    expect(ownerDelete.status).toBe(200);
    expect(ownerDelete.body.deleted).toBe(true);
    for (const key of assetStorageKeys) {
      expect(existsSync(path.resolve(UPLOADS_BASE, key))).toBe(false);
    }

    const [authorFeedAfterDelete, sameCommunityFeedAfterDelete] = await Promise.all([
      request(app).get("/community/stories").set("Authorization", `Bearer ${authorToken}`),
      request(app).get("/community/stories").set("Authorization", `Bearer ${sameCommunityReaderToken}`),
    ]);
    expect(authorFeedAfterDelete.body.stories.some(
      (story: { id: number }) => story.id === videoStoryId,
    )).toBe(false);
    expect(sameCommunityFeedAfterDelete.body.stories.some(
      (story: { id: number }) => story.id === videoStoryId,
    )).toBe(false);
  });

  it("creates, edits, serves, and cleans up approved-ready Exchange listing media", async () => {
    expect(authorId).toBeDefined();
    expect(authorToken).toBeTruthy();
    expect(sameCommunityReaderToken).toBeTruthy();
    const queueJobs: Array<{ name: string; data: MediaJobData }> = [];
    const restoreQueue = setMediaProcessingQueueForTest({
      add: async (name: string, data: MediaJobData) => {
        queueJobs.push({ name, data });
        return undefined;
      },
    } as unknown as Parameters<typeof setMediaProcessingQueueForTest>[0]);

    const uploadAsset = async (mediaType: "photo" | "video", mimeType: string, bytes: Buffer, name: string) => {
      const initialized = await withMediaPlatformEnabled(() => request(app)
        .post("/media-assets/uploads")
        .set("Authorization", `Bearer ${authorToken}`)
        .send({
          contextKind: "exchange_listing_draft",
          contextId: authorId,
          mediaType,
          mimeType,
          originalName: name,
          byteSize: bytes.length,
        }));
      expect(initialized.status).toBe(201);
      const mediaAssetId = Number(initialized.body.media_asset_id);
      expect(Number.isSafeInteger(mediaAssetId)).toBe(true);
      mediaAssetIds.push(mediaAssetId);

      if (mediaType === "photo") {
        const status = await withMediaPlatformEnabled(() => request(app)
          .get(`/media-assets/${mediaAssetId}/upload-session`)
          .set("Authorization", `Bearer ${authorToken}`));
        expect(status.status).toBe(200);
        expect(status.body).toMatchObject({
          media_asset_id: mediaAssetId,
          offset: 0,
          total_bytes: bytes.length,
          finalized: false,
          status: "pending",
        });
        const chunkSize = Number(status.body.chunk_size);
        expect(Number.isSafeInteger(chunkSize)).toBe(true);
        expect(chunkSize).toBeGreaterThan(0);
        const chunkUrl = `/media-assets/${mediaAssetId}/upload/chunks`;
        for (let offset = status.body.offset as number; offset < bytes.length;) {
          const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
          const nextOffset = offset + chunk.length;
          const uploaded = await withMediaPlatformEnabled(() => request(app)
            .put(chunkUrl)
            .set("Authorization", `Bearer ${authorToken}`)
            .set("Content-Type", "application/octet-stream")
            .set("Upload-Offset", String(offset))
            .set("X-Chunk-SHA256", createHash("sha256").update(chunk).digest("hex"))
            .set("X-Media-Mime-Type", mimeType)
            .send(chunk));
          expect(uploaded.status).toBe(204);
          expect(uploaded.headers["upload-offset"]).toBe(String(nextOffset));
          offset = nextOffset;
        }
      } else {
        const uploaded = await withMediaPlatformEnabled(() => request(app)
          .put(`/media-assets/${mediaAssetId}/upload`)
          .set("Authorization", `Bearer ${authorToken}`)
          .set("Content-Type", mimeType)
          .send(bytes));
        expect(uploaded.status).toBe(204);
      }
      const completed = await withMediaPlatformEnabled(() => request(app)
        .post(`/media-assets/${mediaAssetId}/complete`)
        .set("Authorization", `Bearer ${authorToken}`));
      expect(completed.status).toBe(202);
      return mediaAssetId;
    };

    const runQueuedJobs = async (assetIds: number[]) => {
      for (const queued of queueJobs.filter((job) => assetIds.includes(job.data.mediaAssetId))) {
        await withMediaPlatformEnabled(() => processMediaJob({
          id: `runtime-exchange-listing-${queued.data.mediaAssetId}-${queued.data.jobType}`,
          data: queued.data,
          attemptsMade: 0,
        } as unknown as Parameters<typeof processMediaJob>[0]));
      }
    };

    let listingId: number | undefined;
    try {
      const imageId = await uploadAsset("photo", "image/png", await createSyntheticImage(), `listing-${randomUUID()}.png`);
      const videoId = await uploadAsset("video", "video/mp4", await createSyntheticVideo(), `listing-${randomUUID()}.mp4`);
      const createResponse = await withMediaPlatformEnabled(() => request(app)
        .post("/community/exchange/listings")
        .set("Authorization", `Bearer ${authorToken}`)
        .send({
          listing_type: "offer",
          resource_type: "goods",
          title: "Exchange media listing fixture",
          description: "A test listing with one photo and one short video.",
          category: "household",
          condition: "good",
          neighborhood: "Test neighborhood",
          pickup_location_type: "public_place",
          media_asset_ids: [imageId, videoId],
        }));
      if (createResponse.status !== 201) {
        throw new Error(`Exchange media listing create failed (${createResponse.status}): ${JSON.stringify(createResponse.body)}`);
      }
      listingId = createResponse.body.listing.id as number;
      exchangeMediaListingId = listingId;
      expect(createResponse.body.listing.media).toEqual(expect.arrayContaining([
        expect.objectContaining({ media_asset_id: imageId, media_type: "photo", status: "processing" }),
        expect.objectContaining({ media_asset_id: videoId, media_type: "video", status: "processing" }),
      ]));
      const pendingPublicRead = await withMediaPlatformEnabled(() => request(app)
        .get(`/community/exchange/listings/${listingId}`)
        .set("Authorization", `Bearer ${sameCommunityReaderToken}`));
      expect(pendingPublicRead.status).toBe(200);
      expect(pendingPublicRead.body.listing.media).toEqual([]);

      const { rows: reboundAssets } = await pool.query<{
        context_kind: string;
        context_id: number;
        status: string;
      }>(
        "SELECT context_kind, context_id, status FROM media_assets WHERE id = ANY($1::integer[]) ORDER BY id",
        [[imageId, videoId].sort((a, b) => a - b)],
      );
      expect(reboundAssets).toHaveLength(2);
      expect(reboundAssets.every((asset) => asset.context_kind === "exchange_listing" && asset.context_id === listingId)).toBe(true);

      await runQueuedJobs([imageId, videoId]);
      const publicRead = await withMediaPlatformEnabled(() => request(app)
        .get(`/community/exchange/listings/${listingId}`)
        .set("Authorization", `Bearer ${sameCommunityReaderToken}`));
      expect(publicRead.status).toBe(200);
      expect(publicRead.body.listing.media).toHaveLength(2);
      expect(publicRead.body.listing.media.every((item: { status: string }) => item.status === "ready")).toBe(true);
      const publicFeed = await withMediaPlatformEnabled(() => request(app)
        .get("/community/exchange/listings")
        .set("Authorization", `Bearer ${sameCommunityReaderToken}`));
      expect(publicFeed.body.listings.find((item: { id: number }) => item.id === listingId)?.media).toHaveLength(2);

      const imageRead = await withMediaPlatformEnabled(() => request(app)
        .get(`/media-assets/${imageId}`)
        .set("Authorization", `Bearer ${sameCommunityReaderToken}`));
      expect(imageRead.status).toBe(200);
      const videoRead = await withMediaPlatformEnabled(() => request(app)
        .get(`/media-assets/${videoId}`)
        .set("Authorization", `Bearer ${sameCommunityReaderToken}`));
      expect(videoRead.status).toBe(200);

      await pool.query("UPDATE exchange_listings SET moderation_status = 'held' WHERE id = $1", [listingId]);
      const heldListingRead = await request(app)
        .get(`/community/exchange/listings/${listingId}`)
        .set("Authorization", `Bearer ${sameCommunityReaderToken}`);
      const heldMediaRead = await withMediaPlatformEnabled(() => request(app)
        .get(`/media-assets/${imageId}`)
        .set("Authorization", `Bearer ${sameCommunityReaderToken}`));
      expect(heldListingRead.status).toBe(404);
      expect(heldMediaRead.status).toBe(404);
      await pool.query("UPDATE exchange_listings SET moderation_status = 'approved' WHERE id = $1", [listingId]);

      // UUID digit runs can look like phone numbers to the public-text privacy filter.
      const privacySafeSuffix = randomUUID().replace(/[0-9-]/g, "");
      const textEdit = await withMediaPlatformEnabled(() => request(app)
        .patch(`/community/exchange/listings/${listingId}`)
        .set("Authorization", `Bearer ${authorToken}`)
        .send({ title: `Edited media fixture ${privacySafeSuffix}` }));
      expect(textEdit.status).toBe(200);
      expect(textEdit.body.listing.media).toHaveLength(2);

      const removeVideo = await withMediaPlatformEnabled(() => request(app)
        .patch(`/community/exchange/listings/${listingId}`)
        .set("Authorization", `Bearer ${authorToken}`)
        .send({ media_asset_ids: [imageId] }));
      expect(removeVideo.status).toBe(200);
      expect(removeVideo.body.listing.media).toHaveLength(1);
      expect(removeVideo.body.listing.media[0].media_asset_id).toBe(imageId);
      const { rows: removedVideoRows } = await pool.query<{ status: string; original_key: string }>(
        "SELECT status, original_key FROM media_assets WHERE id = $1",
        [videoId],
      );
      expect(removedVideoRows[0]?.status).toBe("deleted");
      expect(existsSync(path.resolve(UPLOADS_BASE, removedVideoRows[0]!.original_key))).toBe(false);

      const newEditImageId = await uploadAsset("photo", "image/png", await createSyntheticImage(), `edit-${randomUUID()}.png`);
      await runQueuedJobs([newEditImageId]);
      const attachDuringEdit = await withMediaPlatformEnabled(() => request(app)
        .patch(`/community/exchange/listings/${listingId}`)
        .set("Authorization", `Bearer ${authorToken}`)
        .send({ media_asset_ids: [imageId, newEditImageId] }));
      expect(attachDuringEdit.status).toBe(200);
      expect(attachDuringEdit.body.listing.media.map((item: { media_asset_id: number }) => item.media_asset_id))
        .toEqual([imageId, newEditImageId]);

      const clearAllMedia = await withMediaPlatformEnabled(() => request(app)
        .patch(`/community/exchange/listings/${listingId}`)
        .set("Authorization", `Bearer ${authorToken}`)
        .send({ media_asset_ids: [] }));
      expect(clearAllMedia.status).toBe(200);
      expect(clearAllMedia.body.listing.media).toEqual([]);
      const { rows: finalAssets } = await pool.query<{ id: number; status: string; original_key: string }>(
        "SELECT id, status, original_key FROM media_assets WHERE id = ANY($1::integer[])",
        [[imageId, newEditImageId]],
      );
      expect(finalAssets).toHaveLength(2);
      expect(finalAssets.every((asset) => asset.status === "deleted")).toBe(true);
      expect(finalAssets.every((asset) => !existsSync(path.resolve(UPLOADS_BASE, asset.original_key)))).toBe(true);

      const textOnly = await request(app)
        .post("/community/exchange/listings")
        .set("Authorization", `Bearer ${authorToken}`)
        .send({
          listing_type: "offer",
          resource_type: "goods",
          title: "No media listing fixture",
          description: "A community listing without attached photos or video.",
          category: "household",
          condition: "good",
          neighborhood: "Test neighborhood",
          pickup_location_type: "public_place",
        });
      expect(textOnly.status).toBe(201);
      textOnlyListingId = textOnly.body.listing.id as number;
      expect(textOnly.body.listing.media).toEqual([]);
    } finally {
      restoreQueue();
    }
  });

  it("allows a different-community member into a public Spiral but gates media tokens on active participation", async () => {
    expect(readerCommunityId).not.toBe(authorCommunityId);
    const started = await request(app)
      .post(`/audio-spirals/${spiralId}/start`)
      .set("Authorization", `Bearer ${authorToken}`)
      .send({
        title: "Synthetic cross-community Spiral",
        video_enabled: true,
        media_publish_policy: "open",
      });
    expect(started.status).toBe(201);
    spiralSessionId = started.body.session.id;
    expect(Number.isSafeInteger(spiralSessionId)).toBe(true);

    const visibleSpiral = await request(app)
      .get(`/audio-spirals/${spiralId}`)
      .set("Authorization", `Bearer ${readerToken}`);
    expect(visibleSpiral.status).toBe(200);
    expect(visibleSpiral.body.circle.community_id).toBeNull();
    expect(visibleSpiral.body.live_session.id).toBe(spiralSessionId);

    const tokenBeforeJoin = await withFakeLiveKitConfig(() => request(app)
      .post(`/audio-spiral-sessions/${spiralSessionId}/media-token`)
      .set("Authorization", `Bearer ${readerToken}`));
    expect(tokenBeforeJoin.status).toBe(403);
    expect(tokenBeforeJoin.body.error).toBe("Join the circle before requesting a media token");

    const joined = await request(app)
      .post(`/audio-spiral-sessions/${spiralSessionId}/join`)
      .set("Authorization", `Bearer ${readerToken}`);
    expect(joined.status).toBe(200);
    expect(joined.body.participant).toMatchObject({ user_id: readerId, role: "listener" });

    const readerSession = await request(app)
      .get(`/audio-spiral-sessions/${spiralSessionId}`)
      .set("Authorization", `Bearer ${readerToken}`);
    expect(readerSession.status).toBe(200);
    expect(readerSession.body.participants).toEqual(
      expect.arrayContaining([expect.objectContaining({ user_id: readerId, role: "listener" })]),
    );

    const tokenAfterJoin = await withFakeLiveKitConfig(() => request(app)
      .post(`/audio-spiral-sessions/${spiralSessionId}/media-token`)
      .set("Authorization", `Bearer ${readerToken}`));
    expect(tokenAfterJoin.status).toBe(200);
    expect(tokenAfterJoin.body).toMatchObject({
      room_name: `niakofa-circle-${spiralSessionId}`,
      can_publish: true,
      refresh_required: false,
    });
    const jwtParts = tokenAfterJoin.body.media_token.split(".");
    expect(jwtParts).toHaveLength(3);
    const claims = JSON.parse(Buffer.from(jwtParts[1], "base64url").toString("utf8"));
    expect(claims.video).toMatchObject({
      room: `niakofa-circle-${spiralSessionId}`,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });
    expect(claims.video.canPublishSources).toEqual(["camera", "microphone", "screen_share"]);

    const ended = await request(app)
      .post(`/audio-spiral-sessions/${spiralSessionId}/end`)
      .set("Authorization", `Bearer ${authorToken}`);
    expect(ended.status).toBe(200);
  });

  it("keeps a review-pending Moment private and resumes its same ordered stitch after failure", async () => {
    pendingMomentCaption = `Pending stitch fixture ${randomUUID()}`;
    const createdStory = await request(app)
      .post("/community/stories")
      .set("Authorization", `Bearer ${authorToken}`)
      .send({ caption: pendingMomentCaption, audience: "community" });
    expect(createdStory.status).toBe(201);
    momentCompositionStoryId = createdStory.body.story.id as number;
    expect(Number.isSafeInteger(momentCompositionStoryId)).toBe(true);
    await pool.query(
      "UPDATE community_stories SET status = 'pending' WHERE id = $1",
      [momentCompositionStoryId],
    );

    const video = await createSyntheticVideo();
    const sourceIds: number[] = [];
    for (let index = 0; index < 2; index += 1) {
      const storageKey = `runtime-fixture/moment-compose/${randomUUID()}.mp4`;
      await putAsset(storageKey, video, "video/mp4");
      const { rows } = await pool.query<{ id: number }>(
        `INSERT INTO media_assets
           (owner_user_id, context_kind, context_id, media_type, mime_type,
            original_key, variant_key, byte_size, width, height, duration_ms, status)
         VALUES ($1, 'story', $2, 'video', 'video/mp4', $3, $3, $4, 320, 180, 1000, 'ready')
         RETURNING id`,
        [authorId, momentCompositionStoryId, storageKey, video.length],
      );
      const sourceId = rows[0].id;
      sourceIds.push(sourceId);
      mediaAssetIds.push(sourceId);
      await pool.query(
        `INSERT INTO community_story_media
           (story_id, storage_key, media_type, mime_type, byte_size, duration_ms, width, height, media_asset_id)
         VALUES ($1, $2, 'video', 'video/mp4', $3, 1000, 320, 180, $4)`,
        [momentCompositionStoryId, storageKey, video.length, sourceId],
      );
    }
    const orderedSourceIds = [sourceIds[1], sourceIds[0]];
    if (orderedSourceIds.some((id) => id === undefined)) {
      throw new Error("The pending stitch fixture did not create two ordered source videos.");
    }
    pendingMomentSourceIds = [...orderedSourceIds];

    const [authorFeed, sameCommunityFeed, crossCommunityFeed] = await Promise.all([
      request(app).get("/community/stories").set("Authorization", `Bearer ${authorToken}`),
      request(app).get("/community/stories").set("Authorization", `Bearer ${sameCommunityReaderToken}`),
      request(app).get("/community/stories").set("Authorization", `Bearer ${readerToken}`),
    ]);
    for (const feed of [authorFeed, sameCommunityFeed, crossCommunityFeed]) {
      expect(feed.status).toBe(200);
    }
    const ownerPendingStory = authorFeed.body.stories.find(
      (story: { id: number }) => story.id === momentCompositionStoryId,
    );
    expect(ownerPendingStory?.status).toBe("pending");
    for (const feed of [sameCommunityFeed, crossCommunityFeed]) {
      expect(feed.body.stories.some(
        (story: { id: number }) => story.id === momentCompositionStoryId,
      )).toBe(false);
    }

    const queuedJobs: Array<{ name: string; data: MediaJobData }> = [];
    const restoreQueue = setMediaProcessingQueueForTest({
      add: async (name: string, data: MediaJobData) => {
        queuedJobs.push({ name, data });
        return undefined;
      },
    } as unknown as Parameters<typeof setMediaProcessingQueueForTest>[0]);
    try {
      const nonOwnerRequest = await withMediaPlatformEnabled(() => request(app)
        .post(`/community/stories/${momentCompositionStoryId}/moment-composition`)
        .set("Authorization", `Bearer ${sameCommunityReaderToken}`)
        .send({ intent: "camera_clip_reel", media_asset_ids: orderedSourceIds }));
      expect(nonOwnerRequest.status).toBe(404);
      expect(queuedJobs).toHaveLength(0);

      const initialRequest = await withMediaPlatformEnabled(() => request(app)
        .post(`/community/stories/${momentCompositionStoryId}/moment-composition`)
        .set("Authorization", `Bearer ${authorToken}`)
        .send({ intent: "camera_clip_reel", media_asset_ids: orderedSourceIds }));
      expect(initialRequest.status).toBe(202);
      expect(initialRequest.body.composition.status).toBe("queued");
      expect(queuedJobs).toHaveLength(1);

      const { rows: initialCompositions } = await pool.query<{
        derived_media_asset_id: number;
        source_media_asset_ids: number[];
        status: string;
      }>(
        `SELECT derived_media_asset_id, source_media_asset_ids, status
         FROM community_story_moment_compositions WHERE story_id = $1`,
        [momentCompositionStoryId],
      );
      expect(initialCompositions).toHaveLength(1);
      const derivedMediaAssetId = initialCompositions[0].derived_media_asset_id;
      mediaAssetIds.push(derivedMediaAssetId);
      expect(initialCompositions[0]).toMatchObject({
        source_media_asset_ids: orderedSourceIds,
        status: "queued",
      });

      const privateStatus = await withMediaPlatformEnabled(() => request(app)
        .get(`/community/stories/${momentCompositionStoryId}/moment-composition`)
        .set("Authorization", `Bearer ${authorToken}`));
      expect(privateStatus.status).toBe(200);
      expect(privateStatus.body.composition).toMatchObject({
        status: "queued",
        source_count: 2,
        source_media_asset_ids: orderedSourceIds,
      });
      const hiddenStatus = await withMediaPlatformEnabled(() => request(app)
        .get(`/community/stories/${momentCompositionStoryId}/moment-composition`)
        .set("Authorization", `Bearer ${sameCommunityReaderToken}`));
      expect(hiddenStatus.status).toBe(404);

      // Simulate a worker failure after the durable request was saved. The
      // exact retry must reuse its derived asset; reordered IDs must conflict.
      await pool.query(
        `UPDATE community_story_moment_compositions
         SET status = 'failed', failure_code = 'TEST_RETRY'
         WHERE story_id = $1`,
        [momentCompositionStoryId],
      );
      await pool.query(
        "UPDATE media_assets SET status = 'failed', failure_reason = 'TEST_RETRY' WHERE id = $1",
        [derivedMediaAssetId],
      );
      await pool.query(
        `UPDATE media_processing_jobs
         SET status = 'failed', attempts = 1, error = 'TEST_RETRY', completed_at = NOW()
         WHERE media_asset_id = $1 AND job_type = 'moment_compose'`,
        [derivedMediaAssetId],
      );

      const reorderedRequest = await withMediaPlatformEnabled(() => request(app)
        .post(`/community/stories/${momentCompositionStoryId}/moment-composition`)
        .set("Authorization", `Bearer ${authorToken}`)
        .send({ intent: "camera_clip_reel", media_asset_ids: [...orderedSourceIds].reverse() }));
      expect(reorderedRequest.status).toBe(409);
      expect(queuedJobs).toHaveLength(1);

      const retryRequest = await withMediaPlatformEnabled(() => request(app)
        .post(`/community/stories/${momentCompositionStoryId}/moment-composition`)
        .set("Authorization", `Bearer ${authorToken}`)
        .send({ intent: "camera_clip_reel", media_asset_ids: orderedSourceIds }));
      expect(retryRequest.status).toBe(202);
      expect(retryRequest.body.composition.status).toBe("queued");
      expect(queuedJobs).toHaveLength(2);

      const latestJob = queuedJobs.at(-1);
      if (!latestJob) throw new Error("The same-source retry did not enqueue its composition job.");
      expect(latestJob.data).toMatchObject({
        jobType: "moment_compose",
        mediaAssetId: derivedMediaAssetId,
      });
      await withMediaPlatformEnabled(() => processMediaJob({
        id: `runtime-moment-compose-${derivedMediaAssetId}`,
        data: latestJob.data,
        attemptsMade: 0,
      } as unknown as Parameters<typeof processMediaJob>[0]));

      const { rows: completedCompositions } = await pool.query<{
        composition_status: string;
        job_status: string;
        attempts: number;
        asset_status: string;
        variant_key: string | null;
        duration_ms: number | null;
        source_media_asset_ids: number[];
      }>(
        `SELECT composition.status AS composition_status,
                job.status AS job_status, job.attempts,
                asset.status AS asset_status, asset.variant_key, asset.duration_ms,
                composition.source_media_asset_ids
         FROM community_story_moment_compositions composition
         JOIN media_processing_jobs job
           ON job.media_asset_id = composition.derived_media_asset_id
          AND job.job_type = 'moment_compose'
         JOIN media_assets asset ON asset.id = composition.derived_media_asset_id
         WHERE composition.story_id = $1`,
        [momentCompositionStoryId],
      );
      expect(completedCompositions).toHaveLength(1);
      const completed = completedCompositions[0];
      expect(completed).toMatchObject({
        composition_status: "ready",
        job_status: "completed",
        attempts: 2,
        asset_status: "ready",
        source_media_asset_ids: orderedSourceIds,
      });
      expect(completed.variant_key).toBeTruthy();
      if (completed.duration_ms === null || completed.duration_ms <= 0) {
        throw new Error("The retried stitch did not record a positive playback duration.");
      }
      if (!completed.variant_key) throw new Error("The retried stitch did not produce a playable variant.");
      expect(existsSync(path.resolve(UPLOADS_BASE, completed.variant_key))).toBe(true);

      const [readyOwnerStatus, finalAuthorFeed, finalReaderFeed, hiddenMedia] = await Promise.all([
        withMediaPlatformEnabled(() => request(app)
          .get(`/community/stories/${momentCompositionStoryId}/moment-composition`)
          .set("Authorization", `Bearer ${authorToken}`)),
        request(app).get("/community/stories").set("Authorization", `Bearer ${authorToken}`),
        request(app).get("/community/stories").set("Authorization", `Bearer ${sameCommunityReaderToken}`),
        withMediaPlatformEnabled(() => request(app)
          .get(`/media-assets/${derivedMediaAssetId}`)
          .set("Authorization", `Bearer ${sameCommunityReaderToken}`)),
      ]);
      expect(readyOwnerStatus.status).toBe(200);
      expect(readyOwnerStatus.body.composition).toMatchObject({
        status: "ready",
        source_count: 2,
        source_media_asset_ids: orderedSourceIds,
      });
      expect(finalAuthorFeed.body.stories.some(
        (story: { id: number; status: string }) => story.id === momentCompositionStoryId && story.status === "pending",
      )).toBe(true);
      expect(finalReaderFeed.body.stories.some(
        (story: { id: number }) => story.id === momentCompositionStoryId,
      )).toBe(false);
      expect(hiddenMedia.status).toBe(404);
    } finally {
      restoreQueue();
    }
  });

  it("runs opt-in browser acceptance with real local media processing", async () => {
    if (process.env.COMMUNITY_MEDIA_BROWSER_ACCEPTANCE !== "1") return;
    if (!authorId || !sameCommunityReaderId || !readerId || !momentCompositionStoryId) {
      throw new Error("The matrix browser check requires the A/B/C and pending stitch fixtures.");
    }
    expect(pendingMomentCaption).toMatch(/^Pending stitch fixture /);

    const stateDirectory = await mkdtemp(path.join(tmpdir(), "niakofa-matrix-browser-"));
    let browserServer: ReturnType<typeof app.listen> | undefined;
    let viteServer: ReturnType<typeof spawn> | undefined;
    let mediaWorker: Awaited<ReturnType<typeof startMediaProcessWorker>> = null;
    let viteOutput = "";
    try {
      const marker = `moments-runtime-${randomUUID()}`;
      const reviewSignal = "https://example.invalid/moments-runtime-review";
      browserFixtureCaptions = [
        `${marker} draft survives invalid selection ${reviewSignal}`,
        `${marker} h264 ${reviewSignal}`,
        `${marker} mediarecorder ${reviewSignal}`,
      ];
      browserFixtureNames = [
        `${marker}-photo.jpg`,
        `${marker}-h264.mp4`,
        `${marker}-mediarecorder.webm`,
      ];
      // These exact captions and source names scope cleanup to this browser
      // run, including partial uploads if the browser exits early.

      const { rows: users } = await pool.query<{
        id: number;
        name: string;
        email: string;
        approval_status: string;
        community_id: number | null;
      }>(
        `SELECT id, name, email, approval_status, community_id
         FROM users WHERE id = ANY($1::integer[])`,
        [[authorId, sameCommunityReaderId, readerId]],
      );
      const usersById = new Map(users.map((user) => [user.id, user]));
      const writeState = async (label: string, id: number, token: string, origin: string) => {
        const fixtureUser = usersById.get(id);
        if (!fixtureUser || fixtureUser.approval_status !== "approved") {
          throw new Error(`Matrix Account ${label} is not an approved fixture.`);
        }
        const user = {
          ...fixtureUser,
          is_helper: false,
          helper_status: null,
          helper_mode_active: false,
          is_suspended: false,
          trust_score: 0,
          help_count: 0,
        };
        const state = {
          cookies: [],
          origins: [{
            origin: new URL(origin).origin,
            localStorage: [
              { name: "niakofa_token", value: token },
              { name: "niakofa_user", value: JSON.stringify(user) },
            ],
          }],
        };
        await writeFile(
          path.join(stateDirectory, `account-${label.toLowerCase()}.json`),
          JSON.stringify(state),
          { encoding: "utf8", mode: 0o600 },
        );
      };

      const jpegPath = path.join(stateDirectory, browserFixtureNames[0]);
      const mp4Path = path.join(stateDirectory, browserFixtureNames[1]);
      await Promise.all([
        writeFile(jpegPath, await createSyntheticJpeg(), { mode: 0o600 }),
        writeFile(mp4Path, await createSyntheticVideo(), { mode: 0o600 }),
      ]);

      const { rows: legacyStories } = await pool.query<{ id: number }>(
        `INSERT INTO community_stories
           (author_user_id, community_id, caption, audience, status, expires_at)
         VALUES ($1, $2, 'Legacy color compatibility check', 'community', 'published', NOW() + INTERVAL '1 day')
         RETURNING id`,
        [authorId, authorCommunityId],
      );
      legacyMomentStoryId = legacyStories[0].id;
      await pool.query(
        `INSERT INTO community_story_elements (story_id, type, payload, z_index)
         VALUES
           ($1, 'background', $2::jsonb, 0),
           ($1, 'text', $3::jsonb, 1)`,
        [
          legacyMomentStoryId,
          JSON.stringify({ color: "#123456" }),
          JSON.stringify({
            text: "Legacy color compatibility check",
            color: "#fefefe",
            font_size: 24,
          }),
        ],
      );

      browserServer = app.listen(0, "127.0.0.1");
      await new Promise<void>((resolve, reject) => {
        browserServer!.once("listening", resolve);
        browserServer!.once("error", reject);
      });
      const address = browserServer.address();
      if (!address || typeof address === "string") {
        throw new Error("The local matrix API fixture server did not bind a TCP port.");
      }

      await waitForRedisReady();
      mediaWorker = await startMediaProcessWorker();
      if (!mediaWorker) {
        throw new Error("The real BullMQ media worker did not start on disposable local Redis.");
      }
      await mediaWorker.waitUntilReady();

      const workspaceRoot = path.resolve(process.cwd(), "../..");
      const playwrightCli = path.join(workspaceRoot, "node_modules/.bin/playwright");
      const viteCli = path.join(workspaceRoot, "artifacts/pay-it-forward/node_modules/.bin/vite");
      if (!existsSync(playwrightCli)) {
        throw new Error("The repository Playwright CLI is unavailable for matrix browser acceptance.");
      }
      if (!existsSync(viteCli)) {
        throw new Error("The repository Vite CLI is unavailable for isolated browser acceptance.");
      }
      const reserveLoopbackPort = async (): Promise<number> => {
        const probe = createTcpServer();
        await new Promise<void>((resolve, reject) => {
          probe.once("error", reject);
          probe.listen(0, "127.0.0.1", resolve);
        });
        const port = (probe.address() as { port: number }).port;
        await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
        return port;
      };
      const startFrontend = async (studioV2: boolean): Promise<string> => {
        const port = await reserveLoopbackPort();
        const url = `http://127.0.0.1:${port}`;
        const viteEnv: NodeJS.ProcessEnv = {
          ...process.env,
          NODE_ENV: "development",
          PORT: String(port),
          VITE_API_PROXY_TARGET: `http://127.0.0.1:${address.port}`,
          VITE_MEDIA_STUDIO_V2: studioV2 ? "true" : "false",
        };
        delete viteEnv.REPL_ID;
        viteServer = spawn(
          viteCli,
          ["--config", "vite.config.ts", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
          { cwd: path.join(workspaceRoot, "artifacts/pay-it-forward"), env: viteEnv, stdio: ["ignore", "pipe", "pipe"] },
        );
        viteServer.stdout?.on("data", (chunk: Buffer) => { viteOutput += chunk.toString(); });
        viteServer.stderr?.on("data", (chunk: Buffer) => { viteOutput += chunk.toString(); });
        for (let attempt = 0; attempt < 90; attempt += 1) {
          if (viteServer.exitCode !== null) {
            throw new Error(`The isolated Vite server exited before ready.\n${viteOutput}`);
          }
          try {
            const response = await fetch(`${url}/community/moments`, {
              signal: AbortSignal.timeout(1_000),
            });
            if (response.ok) return url;
          } catch {
            // Vite may still be compiling its dependency graph.
          }
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        throw new Error(`The isolated Vite server did not become ready.\n${viteOutput}`);
      };
      const stopFrontend = async () => {
        const child = viteServer;
        viteServer = undefined;
        if (!child || child.exitCode !== null) return;
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            child.kill("SIGKILL");
            resolve();
          }, 8_000);
          child.once("close", () => {
            clearTimeout(timeout);
            resolve();
          });
          child.kill("SIGTERM");
        });
      };
      const runBrowserSpec = async (
        specPath: string,
        browserEnv: NodeJS.ProcessEnv,
        timeoutMs: number,
      ) => new Promise<void>((resolve, reject) => {
        let stdout = "";
        let stderr = "";
        let timedOut = false;
        const child = spawn(
          playwrightCli,
          ["test", specPath, "--workers=1", "--reporter=line"],
          { cwd: workspaceRoot, env: browserEnv, stdio: ["ignore", "pipe", "pipe"] },
        );
        const timeout = setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, timeoutMs);
        child.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
        child.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
        child.once("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        child.once("close", (code) => {
          clearTimeout(timeout);
          if (stdout) process.stdout.write(stdout);
          if (stderr) process.stderr.write(stderr);
          if (timedOut) reject(new Error(`Browser acceptance exceeded its ${timeoutMs / 1000}-second timeout.`));
          else if (code !== 0) reject(new Error(`Browser acceptance exited with code ${String(code)}.`));
          else resolve();
        });
      });

      const browserEnvBase: NodeJS.ProcessEnv = {
        PATH: process.env.PATH ?? "/usr/bin:/bin",
        HOME: process.env.HOME ?? tmpdir(),
        CI: "1",
        NODE_ENV: "test",
        PLAYWRIGHT_OUTPUT_DIR: path.join(stateDirectory, "playwright-output"),
        PLAYWRIGHT_EXECUTABLE_PATH: process.env.PLAYWRIGHT_EXECUTABLE_PATH || "/repl/tools/bin/chromium",
        PLAYWRIGHT_FAKE_MEDIA: "1",
        SPARK_CAMERA_BROWSER_E2E: "1",
        MATRIX_TEST_API_URL: `http://127.0.0.1:${address.port}`,
        MATRIX_USER_A_STATE: path.join(stateDirectory, "account-a.json"),
        MATRIX_USER_B_STATE: path.join(stateDirectory, "account-b.json"),
        MATRIX_USER_C_STATE: path.join(stateDirectory, "account-c.json"),
        MATRIX_PENDING_STORY_ID: String(momentCompositionStoryId),
        MATRIX_PENDING_STORY_CAPTION: pendingMomentCaption,
        MATRIX_PENDING_SOURCE_IDS: JSON.stringify(pendingMomentSourceIds),
      };

      await withMediaPlatformEnabled(async () => {
        const matrixBaseUrl = await startFrontend(false);
        try {
          await Promise.all([
            writeState("A", authorId, authorToken, matrixBaseUrl),
            writeState("B", sameCommunityReaderId, sameCommunityReaderToken, matrixBaseUrl),
            writeState("C", readerId, readerToken, matrixBaseUrl),
          ]);
          await runBrowserSpec("e2e/matrix-profile-spark-browser.spec.ts", {
            ...browserEnvBase,
            PLAYWRIGHT_BASE_URL: matrixBaseUrl,
          }, 240_000);
        } finally {
          await stopFrontend();
        }

        const studioBaseUrl = await startFrontend(true);
        try {
          await Promise.all([
            writeState("A", authorId, authorToken, studioBaseUrl),
            writeState("B", sameCommunityReaderId, sameCommunityReaderToken, studioBaseUrl),
            writeState("C", readerId, readerToken, studioBaseUrl),
          ]);
          await runBrowserSpec("e2e/community-moments-media-studio-runtime.spec.ts", {
            ...browserEnvBase,
            NODE_ENV: "test",
            PLAYWRIGHT_BASE_URL: studioBaseUrl,
            PLAYWRIGHT_FAKE_MEDIA: "0",
            MATRIX_STUDIO_RUNTIME_E2E: "1",
            MATRIX_STUDIO_FIXTURE_MARKER: marker,
            MATRIX_STUDIO_JPEG_PATH: jpegPath,
            MATRIX_STUDIO_MP4_PATH: mp4Path,
            MATRIX_LEGACY_STORY_ID: String(legacyMomentStoryId),
          }, 360_000);
        } finally {
          await stopFrontend();
        }

        const { rows: processedAssets } = await pool.query<{
          id: number;
          original_name: string;
          media_type: string;
          status: string;
          variant_key: string | null;
          thumbnail_key: string | null;
          duration_ms: number | null;
        }>(
          `SELECT id, original_name, media_type, status, variant_key, thumbnail_key, duration_ms
           FROM media_assets
           WHERE owner_user_id = $1 AND original_name = ANY($2::text[])
           ORDER BY array_position($2::text[], original_name)`,
          [authorId, browserFixtureNames],
        );
        expect(processedAssets).toHaveLength(3);
        expect(processedAssets.map((asset) => asset.original_name)).toEqual(browserFixtureNames);
        expect(processedAssets.every((asset) => asset.status === "ready")).toBe(true);
        expect(processedAssets[0]?.media_type).toBe("photo");
        expect(processedAssets[0]?.thumbnail_key).toBeTruthy();
        for (const video of processedAssets.slice(1)) {
          expect(video.media_type).toBe("video");
          expect(video.variant_key).toBeTruthy();
          expect(video.duration_ms).toBeGreaterThan(0);
        }
        const { rows: completedJobs } = await pool.query<{
          media_asset_id: number;
          status: string;
        }>(
          `SELECT media_asset_id, status FROM media_processing_jobs
           WHERE media_asset_id = ANY($1::integer[]) AND status = 'completed'`,
          [processedAssets.map((asset) => asset.id)],
        );
        for (const asset of processedAssets) {
          expect(completedJobs.some((job) => job.media_asset_id === asset.id)).toBe(true);
        }
      });
    } finally {
      if (viteServer && viteServer.exitCode === null) {
        viteServer.kill("SIGKILL");
      }
      if (browserServer?.listening) {
        await new Promise<void>((resolve, reject) => {
          browserServer!.close((error) => error ? reject(error) : resolve());
        });
      }
      if (mediaWorker) await mediaWorker.close();
      await closeRedis();
      await rm(stateDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }, 660_000);
});
