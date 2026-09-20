import { Router } from "express";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  communityStoriesTable,
  communityStoryElementsTable,
  communityStoryMediaTable,
  db,
  diasporaHubsTable,
  hubMembershipsTable,
  mediaAssetsTable,
  usersTable,
} from "@workspace/db";
import { requireApproved, requireAuth } from "../middlewares/auth";
import { communityPostLimiter } from "../middlewares/rate-limit";
import { moderatePostText } from "../lib/post-moderation";
import { deleteAsset, putAsset, streamOrRedirectAsset } from "../lib/storage";
import { hasExpectedSignature, inspectMedia } from "../lib/media-validation";
import { broadcast } from "../lib/ws-hub";
import { createMessageNotification } from "../lib/message-notifications";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { isMediaPlatformV21Enabled } from "../lib/media-platform";
import { enqueueMediaAssetProcessing } from "../lib/mediaProcessingQueue";
import { mediaProcessingQueue } from "../lib/queue";
import { logger } from "../lib/logger";

const router = Router();
const MAX_MEDIA_BYTES = 12 * 1024 * 1024;
const MAX_MEDIA_ITEMS = 6;
const MAX_MEDIA_DIMENSION = 10_000;
const ALLOWED_MEDIA = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"]);
const STORY_AUDIENCES = ["community", "hub"] as const;

const storyElementSchema = z.object({
  type: z.string().trim().min(1).max(40),
  payload: z.record(z.string(), z.unknown()).default({}),
  position_x: z.number().min(0).max(100).default(50),
  position_y: z.number().min(0).max(100).default(50),
  scale: z.number().min(0.5).max(3).default(1),
  rotation: z.number().min(-180).max(180).default(0),
  z_index: z.number().int().min(0).max(100).default(0),
});

const createStorySchema = z.object({
  caption: z.string().trim().max(1000).optional().default(""),
  hub_id: z.number().int().positive().nullable().optional(),
  audience: z.enum(STORY_AUDIENCES).default("community"),
  reply_enabled: z.boolean().default(true),
  media: z.array(z.object({
    data_url: z.string().min(1).max(18_000_000),
    media_type: z.enum(["photo", "video"]),
    mime_type: z.string().max(100),
    duration_ms: z.number().int().positive().max(60_000).nullable().optional(),
    width: z.number().int().positive().max(10_000).nullable().optional(),
    height: z.number().int().positive().max(10_000).nullable().optional(),
  })).min(0).max(MAX_MEDIA_ITEMS).default([]),
  elements: z.array(storyElementSchema).max(30).default([]),
});

function positiveId(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, maxLength)
    : "";
}

function serializeDate(value: Date | null | undefined): string | null {
  return value instanceof Date ? value.toISOString() : null;
}

function decodeMediaDataUrl(value: string): { buffer: Buffer; mimeType: string } | null {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match || !ALLOWED_MEDIA.has(match[1])) return null;
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > MAX_MEDIA_BYTES || !hasExpectedSignature(buffer, match[1])) return null;
  return { buffer, mimeType: match[1] };
}

async function approvedHubMember(userId: number, hubId: number): Promise<boolean> {
  const [membership] = await db
    .select({ id: hubMembershipsTable.id })
    .from(hubMembershipsTable)
    .innerJoin(usersTable, eq(usersTable.id, hubMembershipsTable.user_id))
    .where(and(
      eq(hubMembershipsTable.user_id, userId),
      eq(hubMembershipsTable.hub_id, hubId),
      eq(hubMembershipsTable.status, "approved"),
      eq(usersTable.approval_status, "approved"),
      eq(usersTable.is_suspended, false),
    ))
    .limit(1);
  return Boolean(membership);
}

async function approvedCanonicalHub(hubId: number): Promise<boolean> {
  const [hub] = await db
    .select({ id: diasporaHubsTable.id })
    .from(diasporaHubsTable)
    .where(and(
      eq(diasporaHubsTable.id, hubId),
      eq(diasporaHubsTable.status, "approved"),
      isNull(diasporaHubsTable.primary_hub_id),
    ))
    .limit(1);
  return Boolean(hub);
}

export async function viewerCanReadStory(userId: number, story: { author_user_id: number; hub_id: number | null; community_id: number | null; audience: string }): Promise<boolean> {
  if (story.author_user_id === userId || story.audience === "community" && story.community_id === null) return true;
  if (story.audience === "hub") return story.hub_id !== null && await approvedHubMember(userId, story.hub_id);
  const [viewer] = await db.select({ community_id: usersTable.community_id }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  return story.audience === "community" && story.community_id !== null && viewer?.community_id === story.community_id;
}

function publicStory(row: {
  id: number;
  author_user_id: number;
  hub_id: number | null;
  community_id: number | null;
  caption: string | null;
  audience: string;
  reply_enabled: boolean;
  created_at: Date;
  expires_at: Date;
  author_name: string;
  avatar_url: string | null;
}, media: Array<typeof communityStoryMediaTable.$inferSelect>, elements: Array<typeof communityStoryElementsTable.$inferSelect>) {
  return {
    id: row.id,
    author_user_id: row.author_user_id,
    hub_id: row.hub_id,
    community_id: row.community_id,
    caption: row.caption,
    audience: row.audience,
    reply_enabled: row.reply_enabled,
    created_at: serializeDate(row.created_at),
    expires_at: serializeDate(row.expires_at),
    author: { id: row.author_user_id, name: row.author_name, avatar_url: row.avatar_url },
    media: media.map((item) => ({
      id: item.id,
      media_type: item.media_type,
      mime_type: item.mime_type,
      duration_ms: item.duration_ms,
      width: item.width,
      height: item.height,
      media_url: `/api/community/stories/media/${item.id}`,
    })),
    elements: elements.map((item) => ({
      id: item.id,
      type: item.type,
      payload: item.payload,
      position_x: item.position_x,
      position_y: item.position_y,
      scale: item.scale,
      rotation: item.rotation,
      z_index: item.z_index,
    })),
  };
}

router.get("/community/stories", requireAuth, requireApproved, async (req, res) => {
  const userId = req.authenticatedUserId!;
  const requestedHubId = req.query.hubId ? positiveId(req.query.hubId) : null;
  if (req.query.hubId && !requestedHubId) return res.status(400).json({ error: "hubId must be a positive integer." });
  if (requestedHubId && !(await approvedCanonicalHub(requestedHubId))) return res.status(404).json({ error: "Canonical Hub not found." });
  if (requestedHubId && !(await approvedHubMember(userId, requestedHubId))) return res.status(403).json({ error: "Approved Hub membership is required to view this Hub's Stories." });

  const [viewer] = await db.select({ community_id: usersTable.community_id, diaspora_hub_id: usersTable.diaspora_hub_id }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const now = new Date();
  const visibility = requestedHubId
    ? and(eq(communityStoriesTable.hub_id, requestedHubId), eq(communityStoriesTable.audience, "hub"))
    : or(
      and(eq(communityStoriesTable.audience, "community"), viewer?.community_id ? eq(communityStoriesTable.community_id, viewer.community_id) : sql`true`),
      and(eq(communityStoriesTable.audience, "hub"), viewer?.diaspora_hub_id ? eq(communityStoriesTable.hub_id, viewer.diaspora_hub_id) : sql`false`),
      eq(communityStoriesTable.author_user_id, userId),
    );
  const rows = await db.select({
    id: communityStoriesTable.id,
    author_user_id: communityStoriesTable.author_user_id,
    hub_id: communityStoriesTable.hub_id,
    community_id: communityStoriesTable.community_id,
    caption: communityStoriesTable.caption,
    audience: communityStoriesTable.audience,
    reply_enabled: communityStoriesTable.reply_enabled,
    created_at: communityStoriesTable.created_at,
    expires_at: communityStoriesTable.expires_at,
    author_name: usersTable.name,
    avatar_url: usersTable.avatar_url,
  }).from(communityStoriesTable)
    .innerJoin(usersTable, eq(usersTable.id, communityStoriesTable.author_user_id))
    .where(and(
      eq(communityStoriesTable.status, "published"),
      sql`${communityStoriesTable.expires_at} > ${now}`,
      eq(usersTable.approval_status, "approved"),
      eq(usersTable.is_suspended, false),
      visibility,
    ))
    .orderBy(desc(communityStoriesTable.created_at))
    .limit(100);

  const ids = rows.map((row) => row.id);
  const [media, elements] = ids.length ? await Promise.all([
    db.select().from(communityStoryMediaTable).where(inArray(communityStoryMediaTable.story_id, ids)),
    db.select().from(communityStoryElementsTable).where(inArray(communityStoryElementsTable.story_id, ids)).orderBy(communityStoryElementsTable.z_index),
  ]) : [[], []];
  const mediaByStory = new Map<number, Array<typeof communityStoryMediaTable.$inferSelect>>();
  media.forEach((item) => mediaByStory.set(item.story_id, [...(mediaByStory.get(item.story_id) ?? []), item]));
  const elementsByStory = new Map<number, Array<typeof communityStoryElementsTable.$inferSelect>>();
  elements.forEach((item) => elementsByStory.set(item.story_id, [...(elementsByStory.get(item.story_id) ?? []), item]));
  return res.json({
    stories: rows.map((row) => publicStory(row, mediaByStory.get(row.id) ?? [], elementsByStory.get(row.id) ?? [])),
    viewer_user_id: userId,
    expires_after_hours: 24,
  });
});

router.post("/community/stories", requireAuth, requireApproved, communityPostLimiter, async (req, res) => {
  const parsed = createStorySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Story data is invalid. Add a photo, video, or caption and try again." });
  const userId = req.authenticatedUserId!;
  const hubId = parsed.data.hub_id ?? null;
  if (hubId && (!(await approvedCanonicalHub(hubId)) || !(await approvedHubMember(userId, hubId)))) {
    return res.status(403).json({ error: "Approved Hub membership is required to publish a Hub Story." });
  }
  if (parsed.data.audience === "hub" && !hubId) return res.status(400).json({ error: "Choose a Hub before sharing with a Hub audience." });
  if (!parsed.data.caption && parsed.data.media.length === 0 && parsed.data.elements.length === 0) {
    return res.status(400).json({ error: "A Story needs media, text, or a creative element." });
  }
  const [viewer] = await db.select({ community_id: usersTable.community_id }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const caption = cleanText(parsed.data.caption, 1000) || null;
  const moderation = moderatePostText(caption ?? "");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const storedKeys: string[] = [];
  if (isMediaPlatformV21Enabled() && !mediaProcessingQueue) {
    return res.status(503).json({
      error: "Media processing is not available. Please try again shortly.",
      error_code: "MEDIA_PROCESSING_UNAVAILABLE",
    });
  }
  try {
    const decodedMedia = await Promise.all(parsed.data.media.map(async (item) => {
      const decoded = decodeMediaDataUrl(item.data_url);
      if (!decoded || decoded.mimeType !== item.mime_type || (item.media_type === "photo" && !decoded.mimeType.startsWith("image/")) || (item.media_type === "video" && !decoded.mimeType.startsWith("video/"))) {
        return { ...item, decoded: null, metadata: null };
      }
      return { ...item, decoded, metadata: await inspectMedia(decoded.buffer, decoded.mimeType) };
    }));
    if (decodedMedia.some((item) => !item.decoded || item.decoded.mimeType !== item.mime_type)) {
      return res.status(400).json({ error: "Unsupported media type or a file is larger than 12 MB." });
    }
    if (decodedMedia.some((item) => item.media_type === "photo" && !item.metadata)) {
      return res.status(400).json({ error: "The image could not be inspected. Please choose another image." });
    }
    if (decodedMedia.some((item) => (
      !item.metadata ||
      !item.metadata.width ||
      !item.metadata.height ||
      item.metadata.width > MAX_MEDIA_DIMENSION ||
      item.metadata.height > MAX_MEDIA_DIMENSION
    ))) {
      return res.status(400).json({ error: "Story media dimensions must be 10,000 pixels or smaller." });
    }
    if (decodedMedia.some((item) => item.media_type === "video" && (!item.metadata || !item.metadata.duration_ms))) {
      return res.status(503).json({ error: "Video processing is temporarily unavailable. Please try again shortly." });
    }
    if (decodedMedia.some((item) => (item.metadata?.duration_ms ?? 0) > 60_000)) {
      return res.status(400).json({ error: "Story videos must be 60 seconds or shorter." });
    }
    const mentionIds = parsed.data.elements
      .filter((element) => element.type === "mention")
      .map((element) => Number(element.payload.mention_user_id))
      .filter((id) => Number.isSafeInteger(id) && id > 0);
    if (parsed.data.elements.some((element) => element.type === "mention" && !Number.isSafeInteger(Number(element.payload.mention_user_id)))) {
      return res.status(400).json({ error: "Choose a community member from the mention suggestions." });
    }
    const mentionUsers = mentionIds.length ? await db.select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(and(inArray(usersTable.id, mentionIds), eq(usersTable.approval_status, "approved"), eq(usersTable.is_suspended, false))) : [];
    if (mentionUsers.length !== mentionIds.length) return res.status(400).json({ error: "One or more Story mentions are no longer available." });
    const result = await db.transaction(async (tx) => {
      const [story] = await tx.insert(communityStoriesTable).values({
        author_user_id: userId,
        hub_id: hubId,
        community_id: viewer?.community_id ?? null,
        caption,
        audience: parsed.data.audience,
        status: moderation.status,
        reply_enabled: parsed.data.reply_enabled,
        expires_at: expiresAt,
      }).returning();
      if (!story) throw new Error("Story could not be saved.");
      const mediaAssetJobs: Array<{ id: number; mediaType: string }> = [];
      for (const item of decodedMedia) {
        const decoded = item.decoded!;
        const extension = decoded.mimeType.split("/")[1].replace("jpeg", "jpg");
        const storageKey = `community-stories/${story.id}/${randomUUID()}.${extension}`;
        await putAsset(storageKey, decoded.buffer, decoded.mimeType);
        storedKeys.push(storageKey);
        let mediaAssetId: number | null = null;
        if (isMediaPlatformV21Enabled()) {
          const [asset] = await tx.insert(mediaAssetsTable).values({
            owner_user_id: userId,
            context_kind: "story",
            context_id: story.id,
            media_type: item.media_type,
            mime_type: decoded.mimeType,
            original_key: storageKey,
            byte_size: decoded.buffer.length,
            width: item.metadata?.width ?? null,
            height: item.metadata?.height ?? null,
            duration_ms: item.metadata?.duration_ms ?? null,
          }).returning({ id: mediaAssetsTable.id });
          mediaAssetId = asset?.id ?? null;
          if (!mediaAssetId) throw new Error("Media asset could not be created.");
          mediaAssetJobs.push({ id: mediaAssetId, mediaType: item.media_type });
        }
        await tx.insert(communityStoryMediaTable).values({
          story_id: story.id,
          media_asset_id: mediaAssetId,
          storage_key: storageKey,
          media_type: item.media_type,
          mime_type: decoded.mimeType,
          byte_size: decoded.buffer.length,
          duration_ms: item.metadata?.duration_ms ?? null,
          width: item.metadata?.width ?? null,
          height: item.metadata?.height ?? null,
        });
      }
      if (parsed.data.elements.length) {
        await tx.insert(communityStoryElementsTable).values(parsed.data.elements.map((element) => ({
          story_id: story.id,
          type: element.type,
          payload: element.payload,
          position_x: element.position_x,
          position_y: element.position_y,
          scale: element.scale,
          rotation: element.rotation,
          z_index: element.z_index,
        })));
      }
      return { story, mediaAssetJobs };
    });
    if (result.mediaAssetJobs.length) {
      try {
        await Promise.all(result.mediaAssetJobs.map((job) => enqueueMediaAssetProcessing(job.id, job.mediaType)));
      } catch (error) {
        // Keep the original object and durable pending rows. A retry/reconciler
        // can republish deterministic BullMQ job ids without losing the upload.
        logger.error({ err: error, storyId: result.story.id }, "media-processing: Story jobs could not be published");
        return res.status(503).json({
          error: "Story saved, but media processing is temporarily unavailable. Please refresh shortly.",
          error_code: "MEDIA_PROCESSING_UNAVAILABLE",
        });
      }
    }
    if (result.story.status === "published") {
      broadcast({ type: "community_story_created", payload: { story_id: result.story.id, author_user_id: userId, audience: result.story.audience, hub_id: result.story.hub_id } });
      const [author] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      await Promise.all(mentionUsers.filter((user) => user.id !== userId).map((user) => createMessageNotification({
        userId: user.id,
        actorUserId: userId,
        type: "story_mention",
        title: "You were mentioned in a Story",
        body: `${author?.name ?? "A neighbor"} mentioned you in a Community Story.`,
         actionUrl: `/community?storyId=${result.story.id}`,
         metadata: { story_id: result.story.id, mention_user_id: user.id },
      })));
    }
    return res.status(201).json({ story: { id: result.story.id, status: result.story.status, expires_at: result.story.expires_at.toISOString() } });
  } catch (error) {
    await Promise.all(storedKeys.map((key) => deleteAsset(key)));
    throw error;
  }
});

router.get("/community/stories/media/:id", requireAuth, requireApproved, async (req, res) => {
  const mediaId = positiveId(req.params.id);
  if (!mediaId) return res.status(400).json({ error: "Invalid Story media id." });
  const [row] = await db.select({
    storage_key: communityStoryMediaTable.storage_key,
    media_asset_id: communityStoryMediaTable.media_asset_id,
    variant_key: mediaAssetsTable.variant_key,
    author_user_id: communityStoriesTable.author_user_id,
    hub_id: communityStoriesTable.hub_id,
    community_id: communityStoriesTable.community_id,
    audience: communityStoriesTable.audience,
    status: communityStoriesTable.status,
    expires_at: communityStoriesTable.expires_at,
  }).from(communityStoryMediaTable)
    .innerJoin(communityStoriesTable, eq(communityStoriesTable.id, communityStoryMediaTable.story_id))
    .leftJoin(mediaAssetsTable, eq(mediaAssetsTable.id, communityStoryMediaTable.media_asset_id))
    .where(eq(communityStoryMediaTable.id, mediaId))
    .limit(1);
  if (!row || row.status !== "published" || row.expires_at <= new Date() || !(await viewerCanReadStory(req.authenticatedUserId!, row))) {
    return res.status(404).json({ error: "Story media not found." });
  }
  return streamOrRedirectAsset(row.variant_key ?? row.storage_key, res);
});

router.delete("/community/stories/:id", requireAuth, requireApproved, communityPostLimiter, async (req, res) => {
  const storyId = positiveId(req.params.id);
  if (!storyId) return res.status(400).json({ error: "Invalid Story id." });
  const media = await db.select({ storage_key: communityStoryMediaTable.storage_key }).from(communityStoryMediaTable)
    .where(eq(communityStoryMediaTable.story_id, storyId));
  const deleted = await db.delete(communityStoriesTable).where(and(
    eq(communityStoriesTable.id, storyId),
    eq(communityStoriesTable.author_user_id, req.authenticatedUserId!),
  )).returning({ id: communityStoriesTable.id });
  if (deleted.length) await Promise.all(media.map((item) => deleteAsset(item.storage_key)));
  return res.json({ deleted: deleted.length > 0 });
});

export default router;